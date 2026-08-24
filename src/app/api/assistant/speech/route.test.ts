import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCurrentRun, synthesizeAssistantSpeech } = vi.hoisted(() => ({
  requireCurrentRun: vi.fn(),
  synthesizeAssistantSpeech: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  requireCurrentRun,
}));
vi.mock("@/server/assistant/voice", () => ({ synthesizeAssistantSpeech }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireCurrentRun.mockResolvedValue({ demoRun: { id: "run-1" } });
  synthesizeAssistantSpeech.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
});

describe("POST /api/assistant/speech", () => {
  it("authenticates and returns MP3 bytes with download-safe headers", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ text: "Your claim is ready." }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(/inline/);
    expect(synthesizeAssistantSpeech).toHaveBeenCalledWith("Your claim is ready.");
  });

  it("rejects malformed, blank, and overlong speech requests", async () => {
    const malformed = await POST(new Request("http://localhost", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const blank = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "  " }) }));
    expect(blank.status).toBe(422);
    const long = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "x".repeat(1001) }) }));
    expect(long.status).toBe(422);
  });

  it("returns 401 when authentication fails", async () => {
    const { AuthenticationError } = await import("@/server/auth/session");
    requireCurrentRun.mockRejectedValue(new AuthenticationError());
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "hello" }) }));
    expect(response.status).toBe(401);
    expect(synthesizeAssistantSpeech).not.toHaveBeenCalled();
  });

  it("hides provider failures behind a 503 guidance response", async () => {
    synthesizeAssistantSpeech.mockRejectedValue(new Error("provider secret details"));
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "hello" }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.stringMatching(/text chat remains available/i) }));
  });
});
