import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { ClaimActions } from "./claim-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

test("offers the two-month wait before a new member has created a claim", () => {
  render(
    <ClaimActions
      blockerCodes={["TWO_MONTH_UNEMPLOYMENT_NOT_MET"]}
      canSubmit={false}
      status={undefined}
    />,
  );

  expect(
    screen.getByRole("button", { name: "Simulate two-month eligibility wait" }),
  ).toBeInTheDocument();
});

test("requires claim details to be reviewed before they can be confirmed", () => {
  render(
    <ClaimActions
      blockerCodes={[]}
      canSubmit
      reviewDetails={{
        bankAccountConfirmed: {
          facts: [{ label: "Payment account", value: "BANK ****1188" }],
          editHref: "/profile",
          editLabel: "Update bank details",
        },
      }}
      status={undefined}
    />,
  );

  const checkbox = screen.getByRole("checkbox", { name: /confirm the verified bank account/i });
  expect(checkbox).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: /review bank account details/i }));

  expect(screen.getByText("BANK ****1188")).toBeVisible();
  expect(screen.getByRole("link", { name: "Update bank details" })).toHaveAttribute("href", "/profile");
  expect(checkbox).toBeEnabled();
});
