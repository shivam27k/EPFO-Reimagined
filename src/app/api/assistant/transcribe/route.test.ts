import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCurrentRun, transcribeAssistantAudio } = vi.hoisted(() => ({
  requireCurrentRun: vi.fn(),
  transcribeAssistantAudio: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  requireCurrentRun,
}));
vi.mock("@/server/assistant/voice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/assistant/voice")>()),
  transcribeAssistantAudio,
}));

import { POST } from "./route";

const activeRun = { demoRun: { id: "run-1" } };

function requestWithForm(form: FormData): Request {
  return { formData: vi.fn().mockResolvedValue(form) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCurrentRun.mockResolvedValue(activeRun);
  transcribeAssistantAudio.mockResolvedValue("Where is my claim?");
});

describe("POST /api/assistant/transcribe", () => {
  it("authenticates before sending multipart audio to the adapter", async () => {
    const file = new File([new Uint8Array([1, 2])], "voice.webm", { type: "audio/webm" });
    const form = new FormData();
    form.set("audio", file);
    const request = requestWithForm(form);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transcript: "Where is my claim?" });
    expect(requireCurrentRun).toHaveBeenCalledBefore(transcribeAssistantAudio);
    expect(transcribeAssistantAudio).toHaveBeenCalledWith(expect.any(File));
  });

  it("rejects missing audio and blank transcripts", async () => {
    const missing = await POST(requestWithForm(new FormData()));
    expect(missing.status).toBe(422);

    transcribeAssistantAudio.mockResolvedValue("  ");
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }));
    const blank = await POST(requestWithForm(form));
    expect(blank.status).toBe(422);
  });

  it("returns 401 when authentication fails", async () => {
    const { AuthenticationError } = await import("@/server/auth/session");
    requireCurrentRun.mockRejectedValue(new AuthenticationError());
    const formData = vi.fn();
    const response = await POST({ formData } as unknown as Request);
    expect(response.status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
    expect(transcribeAssistantAudio).not.toHaveBeenCalled();
  });

  it("rejects unsupported media before calling the provider", async () => {
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1])], "voice.ogg", { type: "audio/ogg" }));
    const response = await POST(requestWithForm(form));
    expect(response.status).toBe(422);
    expect(transcribeAssistantAudio).not.toHaveBeenCalled();
  });

  it("rejects oversized audio before calling the provider", async () => {
    const form = new FormData();
    form.set("audio", new File([new Uint8Array(8_000_001)], "voice.webm", { type: "audio/webm" }));
    const response = await POST(requestWithForm(form));
    expect(response.status).toBe(422);
    expect(transcribeAssistantAudio).not.toHaveBeenCalled();
  });

  it("accepts supported audio at exactly the maximum size", async () => {
    const form = new FormData();
    form.set("audio", new File([new Uint8Array(8_000_000)], "voice.webm", { type: "audio/webm" }));
    const response = await POST(requestWithForm(form));
    expect(response.status).toBe(200);
    expect(transcribeAssistantAudio).toHaveBeenCalledWith(expect.any(File));
  });

  it("hides provider failures behind a 503 guidance response", async () => {
    transcribeAssistantAudio.mockRejectedValue(new Error("provider secret details"));
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }));
    const response = await POST(requestWithForm(form));
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ error: expect.stringMatching(/text chat remains available/i) }));
    expect(JSON.stringify(payload)).not.toContain("provider secret");
  });
});
