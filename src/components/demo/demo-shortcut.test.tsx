import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DemoShortcut } from "./demo-shortcut";

describe("DemoShortcut", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("does not apply issue data when the scenario request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "Scenario conflict" }),
      { status: 409, headers: { "content-type": "application/json" } },
    )));
    const onIssueLoaded = vi.fn();
    const onIssueError = vi.fn();
    render(<DemoShortcut onFill={vi.fn()} onIssueError={onIssueError} onIssueLoaded={onIssueLoaded} showIssue />);

    fireEvent.click(screen.getByRole("button", { name: /load bank-name mismatch/i }));

    await waitFor(() => expect(onIssueError).toHaveBeenCalledWith("Scenario conflict"));
    expect(onIssueLoaded).not.toHaveBeenCalled();
  });

  test("applies issue data only after a successful snapshot response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      profile: { bankName: "Priya R Sharma", onboardingComplete: false },
      findings: [{ code: "BANK_NAME_MISMATCH" }],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const onIssueLoaded = vi.fn();
    render(<DemoShortcut onFill={vi.fn()} onIssueError={vi.fn()} onIssueLoaded={onIssueLoaded} showIssue />);

    fireEvent.click(screen.getByRole("button", { name: /load bank-name mismatch/i }));

    await waitFor(() => expect(onIssueLoaded).toHaveBeenCalledOnce());
  });
});
