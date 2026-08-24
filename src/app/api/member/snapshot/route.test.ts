import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const authState = vi.hoisted(() => ({
  reject: false,
  getMemberSnapshot: vi.fn(),
}));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/session")>();

  return {
    ...original,
    requireCurrentRun: vi.fn(async () => {
      if (authState.reject) {
        throw new original.AuthenticationError();
      }

      return {
        identity: {
          id: "user-1",
          username: "member@example.test",
          persona: "NEW_MEMBER",
          displayName: "Rohan Mehta",
        },
        session: {
          id: "opaque-session",
          userId: "user-1",
          demoRunId: "session-run",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        demoRun: {
          id: "session-run",
          userId: "user-1",
          persona: "NEW_MEMBER",
          status: "ACTIVE",
          createdAt: "2026-08-21T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      };
    }),
  };
});

vi.mock("@/server/repositories/member-repository", () => ({
  getMemberSnapshot: authState.getMemberSnapshot,
}));

describe("GET /api/member/snapshot", () => {
  beforeEach(() => {
    authState.reject = false;
    authState.getMemberSnapshot.mockReset();
    authState.getMemberSnapshot.mockResolvedValue({
      persona: "NEW_MEMBER",
      profile: { displayName: "Rohan Mehta", uanMasked: "XXXX XXXX 0000" },
      nextAction: { label: "Complete bank verification", href: "/profile" },
    });
  });

  test("uses the session run and ignores a client-supplied run id", async () => {
    const response = await GET(
      new Request("http://localhost/api/member/snapshot?demoRunId=client-forged"),
    );

    expect(response.status).toBe(200);
    expect(authState.getMemberSnapshot).toHaveBeenCalledWith("session-run");
    expect(JSON.stringify(await response.json())).not.toContain("opaque-session");
  });

  test("returns 401 when the canonical session guard rejects the request", async () => {
    authState.reject = true;

    const response = await GET(new Request("http://localhost/api/member/snapshot"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(authState.getMemberSnapshot).not.toHaveBeenCalled();
  });
});
