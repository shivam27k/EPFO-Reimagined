import { beforeEach, describe, expect, test, vi } from "vitest";
import { consumeQueuedPortalTarget, executePortalAction, type PendingPortalAction } from "./portal-action-coordinator";

describe("portal action coordinator", () => {
  beforeEach(() => {
    sessionStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = "";
  });

  test("navigates only through catalog destinations", async () => {
    const navigate = vi.fn();
    const result = await executePortalAction({ name: "navigate_to", arguments: { destination: "profile" } }, {
      pathname: "/overview", navigate, refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });
    expect(navigate).toHaveBeenCalledWith("/profile");
    expect(result.status).toBe("completed");
  });

  test("scrolls to the requested page boundary and verifies the browser position", async () => {
    let scrollTop = 640;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollTop });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation((options) => {
      scrollTop = Number((options as ScrollToOptions).top ?? scrollTop);
    });

    const result = await executePortalAction({ name: "scroll_page", arguments: { destination: "top" } }, {
      pathname: "/services", navigate: vi.fn(), refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 0 });
    expect(result).toMatchObject({ status: "completed", message: "Scrolled to the top of the page." });
  });

  test("does not claim scrolling succeeded when the browser position did not change", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    const result = await executePortalAction({ name: "scroll_page", arguments: { destination: "top" } }, {
      pathname: "/services", navigate: vi.fn(), refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });

    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/could not verify/i);
  });

  test("reveals and focuses a semantic disclosure", async () => {
    document.body.innerHTML = '<details data-assistant-target="profile.account_tools"><summary>Tools</summary><a href="/basic-details">Basic details</a></details>';
    const result = await executePortalAction({ name: "reveal_section", arguments: { target: "profile.account_tools" } }, {
      pathname: "/profile", navigate: vi.fn(), refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });
    expect(document.querySelector("details")?.open).toBe(true);
    expect(result.status).toBe("completed");
  });

  test("queues a cross-route workflow target", async () => {
    const navigate = vi.fn();
    await executePortalAction({ name: "start_workflow", arguments: { workflow: "profile_correction" } }, {
      pathname: "/overview", navigate, refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });
    expect(navigate).toHaveBeenCalledWith("/profile");
    document.body.innerHTML = '<details data-assistant-target="profile.account_tools"><summary>Tools</summary></details>';
    expect(consumeQueuedPortalTarget()).toBe(true);
    expect(document.querySelector("details")?.open).toBe(true);
  });

  test("reveals a workflow target immediately when already on its route", async () => {
    const navigate = vi.fn();
    document.body.innerHTML = '<details data-assistant-target="profile.account_tools"><summary>Tools</summary></details>';
    const result = await executePortalAction({ name: "start_workflow", arguments: { workflow: "profile_correction" } }, {
      pathname: "/profile", navigate, refresh: vi.fn(), pendingAction: null, setPendingAction: vi.fn(),
    });
    expect(result.status).toBe("completed");
    expect(document.querySelector("details")?.open).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("does not mutate until the pending action is confirmed", async () => {
    let pending: PendingPortalAction | null = null;
    const setPendingAction = (value: PendingPortalAction | null) => { pending = value; };
    const request = vi.fn(async () => Response.json({ ok: true }));
    const proposal = { name: "propose_demo_action", arguments: { action: "simulate_bank_correction" } } as const;
    const proposed = await executePortalAction(proposal, { pathname: "/profile", navigate: vi.fn(), refresh: vi.fn(), pendingAction: pending, setPendingAction, request });
    expect(proposed.status).toBe("confirmation_required");
    expect(request).not.toHaveBeenCalled();
    const refresh = vi.fn();
    const confirmed = await executePortalAction({ name: "confirm_pending_action", arguments: {} }, { pathname: "/profile", navigate: vi.fn(), refresh, pendingAction: pending, setPendingAction, request });
    expect(confirmed.status).toBe("completed");
    expect(request).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
