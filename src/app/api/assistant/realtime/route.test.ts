import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildRealtimeSessionConfig, createRealtimeCall, requireCurrentRun } = vi.hoisted(() => ({
  buildRealtimeSessionConfig: vi.fn(),
  createRealtimeCall: vi.fn(),
  requireCurrentRun: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  requireCurrentRun,
}));
vi.mock("@/server/assistant/realtime", () => ({
  buildRealtimeSessionConfig,
  createRealtimeCall,
}));

import { GET, POST, PUT } from "./route";

function realtimeRequest({
  body = "v=0\r\na=offer\r\n",
  contentType = "application/sdp",
  route = "/claims",
}: {
  body?: string;
  contentType?: string | null;
  route?: string;
} = {}) {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return new Request(`http://localhost/api/assistant/realtime?route=${encodeURIComponent(route)}`, {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCurrentRun.mockResolvedValue({ demoRun: { id: "run-1" } });
  buildRealtimeSessionConfig.mockResolvedValue({ type: "realtime", model: "gpt-realtime-2.1-mini" });
  createRealtimeCall.mockResolvedValue({ sdp: "v=0\r\na=answer\r\n", callId: "call_123" });
});

describe("POST /api/assistant/realtime", () => {
  it("authenticates before reading or forwarding the offer", async () => {
    const { AuthenticationError } = await import("@/server/auth/session");
    requireCurrentRun.mockRejectedValue(new AuthenticationError());
    const text = vi.fn();
    const response = await POST({
      headers: new Headers({ "content-type": "application/sdp" }),
      text,
      url: "http://localhost/api/assistant/realtime?route=%2Fclaims",
    } as unknown as Request);

    expect(response.status).toBe(401);
    expect(text).not.toHaveBeenCalled();
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });

  it("rejects missing and invalid SDP content types", async () => {
    const missing = await POST(realtimeRequest({ contentType: null }));
    const invalid = await POST(realtimeRequest({ contentType: "application/json" }));

    expect(missing.status).toBe(415);
    expect(invalid.status).toBe(415);
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized SDP offers before calling OpenAI", async () => {
    const empty = await POST(realtimeRequest({ body: "   " }));
    const oversized = await POST(realtimeRequest({ body: "x".repeat(65_537) }));

    expect(empty.status).toBe(422);
    expect(oversized.status).toBe(413);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });

  it("rejects missing and overlong route context", async () => {
    const missing = await POST(new Request("http://localhost/api/assistant/realtime", {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: "v=0",
    }));
    const overlong = await POST(realtimeRequest({ route: `/${"x".repeat(120)}` }));

    expect(missing.status).toBe(422);
    expect(overlong.status).toBe(422);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
  });

  it.each([
    "claims",
    "https://evil.example/claims",
    "//evil.example/claims",
    "/\\evil.example/claims",
    "/claims\nnext",
    "/claims%0Anext",
  ])("rejects non-pathname route context %j", async (route) => {
    const response = await POST(realtimeRequest({ route }));

    expect(response.status).toBe(422);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });

  it("builds authenticated context and forwards answer SDP with safe headers", async () => {
    const offer = "v=0\r\na=offer\r\n";
    const response = await POST(realtimeRequest({ body: offer, contentType: "application/sdp; charset=utf-8" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/sdp");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("v=0\r\na=answer\r\n");
    expect(buildRealtimeSessionConfig).toHaveBeenCalledWith({ demoRunId: "run-1", route: "/claims" });
    expect(createRealtimeCall).toHaveBeenCalledWith({
      sdp: offer,
      config: { type: "realtime", model: "gpt-realtime-2.1-mini" },
    });
  });

  it("hides upstream failures and server secrets behind a generic 503", async () => {
    createRealtimeCall.mockRejectedValue(new Error("sensitive upstream response using route-secret-token"));

    const response = await POST(realtimeRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: "Realtime voice is temporarily unavailable. Text chat remains available." });
    expect(JSON.stringify(payload)).not.toContain("route-secret-token");
    expect(JSON.stringify(payload)).not.toContain("sensitive upstream");
  });
});

describe("GET /api/assistant/realtime", () => {
  it("authenticates before refreshing grounded instructions", async () => {
    const { AuthenticationError } = await import("@/server/auth/session");
    requireCurrentRun.mockRejectedValue(new AuthenticationError());

    const response = await GET(new Request("http://localhost/api/assistant/realtime?route=%2Fclaims"));

    expect(response.status).toBe(401);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });

  it.each([
    "claims",
    "https://evil.example/claims",
    "//evil.example/claims",
    "/\\evil.example/claims",
    "/claims%0Anext",
  ])("applies the SDP route validation contract to context refreshes for %j", async (route) => {
    const response = await GET(new Request(
      `http://localhost/api/assistant/realtime?route=${encodeURIComponent(route)}`,
    ));

    expect(response.status).toBe(422);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
  });

  it("returns only fresh complete instructions from the shared masked projection", async () => {
    const instructions = [
      "You are EPF Sahayak. Never invent member facts or perform actions without explicit confirmation.",
      "Respond only in English or Hindi and write Hindi in Devanagari.",
      "Current masked portal context (synthetic data only):",
      JSON.stringify({
        route: "/claims",
        screen: { name: "Final settlement", purpose: "Check claim readiness", officialTerm: "Form 19" },
        member: { profile: { uanMasked: "XXXX XXXX 7890" } },
        findings: [{ code: "MISSING_EXIT_DATE" }],
        activeProcess: { key: "FINAL_CLAIM" },
        recentConversation: [{ role: "member", text: "Can I claim?" }],
      }),
    ].join("\n\n");
    buildRealtimeSessionConfig.mockResolvedValue({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      instructions,
      serverSecret: "must-not-cross-boundary",
    });

    const response = await GET(new Request("http://localhost/api/assistant/realtime?route=%2Fclaims"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({ instructions });
    expect(JSON.stringify(payload)).not.toContain("serverSecret");
    expect(JSON.stringify(payload)).not.toContain("must-not-cross-boundary");
    expect(buildRealtimeSessionConfig).toHaveBeenCalledWith({ demoRunId: "run-1", route: "/claims" });
    expect(createRealtimeCall).not.toHaveBeenCalled();
  });
});

describe("PUT /api/assistant/realtime", () => {
  it("refreshes instructions using the authenticated rendered-screen digest", async () => {
    const instructions = "Current masked portal context (synthetic data only): rendered screen";
    buildRealtimeSessionConfig.mockResolvedValue({ instructions });

    const response = await PUT(new Request("http://localhost/api/assistant/realtime", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        route: "/employment",
        visibleScreenText: "Employment record complete\nDate of exit 2027-01-31",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ instructions });
    expect(buildRealtimeSessionConfig).toHaveBeenCalledWith({
      demoRunId: "run-1",
      route: "/employment",
      visibleScreenText: "Employment record complete\nDate of exit 2027-01-31",
    });
  });

  it("rejects oversized rendered-screen context", async () => {
    const response = await PUT(new Request("http://localhost/api/assistant/realtime", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "/employment", visibleScreenText: "x".repeat(6001) }),
    }));

    expect(response.status).toBe(422);
    expect(buildRealtimeSessionConfig).not.toHaveBeenCalled();
  });
});
