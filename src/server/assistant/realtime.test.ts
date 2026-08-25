import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createDemoRun } from "@/db/demo-runs";
import { getDb } from "@/db/client";
import { demoUsers } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";
import { buildRealtimeSessionConfig, createRealtimeCall } from "./realtime";

describe("Realtime assistant session configuration", () => {
  let testDatabase: IsolatedTestDatabase;
  let demoRunId: string;
  let previousRealtimeModel: string | undefined;

  beforeEach(async () => {
    previousRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_REALTIME_MODEL;
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    demoRunId = await createDemoRun(user.id);
  });

  afterEach(async () => {
    if (previousRealtimeModel === undefined) delete process.env.OPENAI_REALTIME_MODEL;
    else process.env.OPENAI_REALTIME_MODEL = previousRealtimeModel;
    await testDatabase.cleanup();
  });

  it("enables bidirectional audio with server VAD on the low-cost default model", async () => {
    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/claims" });

    expect(config).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "coral" },
      },
    });
  });

  it("grounds bilingual instructions in masked screen context only", async () => {
    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/claims" });
    const instructions = String(config.instructions);

    expect(instructions).toContain("Final settlement");
    expect(instructions).toContain("XXXX XXXX 7890");
    expect(instructions).toMatch(/English or Hindi/i);
    expect(instructions).toMatch(/Devanagari/i);
    expect(instructions).not.toContain("1012 3456 7890");
    expect(instructions).not.toContain("PYBOM00424890000012345");
    expect(instructions).not.toContain(demoRunId);
  });

  it("uses the configured Realtime model override", async () => {
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";

    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/overview" });

    expect(config.model).toBe("gpt-realtime-2.1");
  });
});

describe("createRealtimeCall", () => {
  const apiKey = "test-server-only-key";
  let previousApiKey: string | undefined;

  beforeEach(() => {
    previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = apiKey;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  });

  it("posts multipart SDP and session JSON with server authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("v=0\r\na=answer\r\n", {
      status: 200,
      headers: { location: "/v1/realtime/calls/call_123" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = { type: "realtime", model: "gpt-realtime-2.1-mini" };

    const result = await createRealtimeCall({ sdp: "v=0\r\na=offer\r\n", config });

    expect(result).toEqual({ sdp: "v=0\r\na=answer\r\n", callId: "call_123" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
    expect(new Headers(init.headers).has("content-type")).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("sdp")).toBe("v=0\r\na=offer\r\n");
    expect(JSON.parse(String(body.get("session")))).toEqual(config);
  });

  it("rejects provider failures without exposing the API key or response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive upstream diagnostic", { status: 429 })));

    let failure: unknown;
    try {
      await createRealtimeCall({ sdp: "v=0", config: { type: "realtime" } });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("Realtime call negotiation failed");
    expect(String(failure)).not.toContain(apiKey);
    expect(String(failure)).not.toContain("sensitive upstream diagnostic");
  });

  it("fails closed before making a request when the server API key is absent", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRealtimeCall({ sdp: "v=0", config: { type: "realtime" } }))
      .rejects.toThrow("Realtime voice service is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
