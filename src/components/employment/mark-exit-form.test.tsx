import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { MarkExitForm } from "./mark-exit-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

test("prominently identifies an exit-date submission error and its related fields", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    error: "The exit date cannot be before the latest contribution month (2027-01).",
  }), {
    status: 422,
    headers: { "content-type": "application/json" },
  })));

  render(<MarkExitForm employments={[{
    employmentKey: "employment:onboarding",
    memberIdMasked: "******************4321",
    establishmentName: "Sahyadri Demo Components Pvt Ltd",
    joinedAt: "2026-07-01",
    latestContributionMonth: "2027-01",
  }]} />);

  fireEvent.click(screen.getByRole("button", { name: "Fill valid demo details" }));
  fireEvent.click(screen.getByRole("button", { name: "Record date of exit" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("The exit date cannot be before the latest contribution month (2027-01).");
  expect(alert).toHaveClass("form-error-alert");
  expect(screen.getByLabelText("Exit date")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Confirm exit date")).toHaveAttribute("aria-invalid", "true");

  vi.unstubAllGlobals();
});
