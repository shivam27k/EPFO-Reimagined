import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createDemoRun } from "@/db/demo-runs";
import { getDb } from "@/db/client";
import { conversationMessages, demoUsers, simulationEvents } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";
import { buildRealtimeSessionConfig, createRealtimeCall } from "./realtime";

describe("Realtime assistant session configuration", () => {
  let testDatabase: IsolatedTestDatabase;
  let demoRunId: string;
  let previousRealtimeModel: string | undefined;
  let previousRealtimeTranscribeModel: string | undefined;

  beforeEach(async () => {
    previousRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
    previousRealtimeTranscribeModel = process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL;
    delete process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL;
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
    if (previousRealtimeTranscribeModel === undefined) delete process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL;
    else process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL = previousRealtimeTranscribeModel;
    await testDatabase.cleanup();
  });

  it("enables bidirectional audio with server VAD on the instruction-following default model", async () => {
    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/claims" });

    expect(config).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: {
            model: "gpt-transcribe",
            prompt: expect.stringMatching(/English.*Latin.*Hindi.*Devanagari/i),
          },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "coral" },
      },
    });

    const transcription = (config.audio as {
      input: { transcription: Record<string, unknown> };
    }).input.transcription;
    expect(transcription).not.toHaveProperty("language");
    expect(transcription.prompt).toMatch(/never.*(?:Urdu|Arabic)/i);
    expect(transcription.prompt).toMatch(/EPF|UAN|KYC|passbook|claim/i);
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
    expect(instructions).toMatch(/latest (?:user|member) (?:request|question).*primary/i);
    expect(instructions).toMatch(/different from the current page.*answer/i);
    expect(instructions).toMatch(/any Hindi.*entire response.*Hindi.*Devanagari/i);
    expect(instructions).toMatch(/do not begin.*English/i);
    expect(instructions).toMatch(/minimum sufficient answer/i);
    expect(instructions).toMatch(/expand.*question.*requires/i);
    expect(instructions).toMatch(/do not add.*UMANG.*background/i);
    expect(instructions).not.toMatch(/maximum|hard limit|never exceed/i);
  });

  it("treats sanitized currently rendered page text as authoritative over stale metadata", async () => {
    const config = await buildRealtimeSessionConfig({
      demoRunId,
      route: "/employment",
      visibleScreenText: "Employment record complete\nDate of exit\n2027-01-31\nAccount 123456789012",
    });
    const instructions = String(config.instructions);

    expect(instructions).toContain("authoritative current rendering");
    expect(instructions).toContain("Employment record complete");
    expect(instructions).toContain("2027-01-31");
    expect(instructions).toContain("[masked account or identity number]");
    expect(instructions).not.toContain("123456789012");
  });

  it("projects simulation context without structural database identifiers", async () => {
    const simulationId = `${demoRunId}:realtime-time-advance`;
    await getDb().insert(simulationEvents).values({
      id: simulationId,
      demoRunId,
      kind: "TIME_ADVANCE",
      intervalStart: "2026-08",
      intervalEnd: "2027-01",
      intervalLabel: "August 2026 to January 2027",
      months: 6,
      recordedAt: "2027-02-01T09:00:00.000Z",
    });

    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/claims" });
    const instructions = String(config.instructions);

    expect(instructions).toContain("August 2026 to January 2027");
    expect(instructions).not.toContain(simulationId);
    expect(instructions).not.toContain(demoRunId);
    expect(instructions).not.toMatch(/"(?:id|demoRunId)"\s*:/);
  });

  it("redacts spaced Aadhaar and EPF member IDs from recent conversation", async () => {
    await getDb().insert(conversationMessages).values({
      id: "realtime-sensitive-message",
      demoRunId,
      role: "member",
      content: "My Aadhaar is 1012 3456 7890 and member ID is PYBOM00424890000012345.",
      createdAt: "2026-08-25T08:00:00.000Z",
    });

    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/overview" });
    const instructions = String(config.instructions);

    expect(instructions).not.toContain("1012 3456 7890");
    expect(instructions).not.toContain("PYBOM00424890000012345");
    expect(instructions).toContain("[masked Aadhaar-format value]");
    expect(instructions).toContain("[masked EPF member ID]");
  });

  it("uses the configured Realtime model override", async () => {
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";

    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/overview" });

    expect(config.model).toBe("gpt-realtime-2.1");
  });

  it("uses the dedicated Realtime transcription model override", async () => {
    process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL = "custom-realtime-transcribe";

    const config = await buildRealtimeSessionConfig({ demoRunId, route: "/overview" });
    const transcription = (config.audio as {
      input: { transcription: Record<string, unknown> };
    }).input.transcription;

    expect(transcription.model).toBe("custom-realtime-transcribe");
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
