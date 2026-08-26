import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ScenarioDrawer } from "./scenario-drawer";

describe("ScenarioDrawer", () => {
  test("groups scenarios by journey area with links, status, and reset", () => {
    render(<ScenarioDrawer open />);

    expect(screen.getByRole("heading", { name: "Onboarding" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Contributions" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Employment" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Claims" })).toBeVisible();
    expect(screen.getByRole("link", { name: /bank-name mismatch during onboarding/i })).toHaveAttribute("href", "/onboarding");
    expect(screen.getByRole("link", { name: /missing employer exit date/i })).toHaveAttribute("href", "/employment");
    expect(screen.getByText(/issue loaded/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /reset demo/i })).toBeVisible();
  });
});
