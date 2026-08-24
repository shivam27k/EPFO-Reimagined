import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SideNavigation } from "./side-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

test("routes contribution history through the planned passbook destination", () => {
  render(<SideNavigation />);

  expect(screen.getByRole("link", { name: "Contributions" })).toHaveAttribute(
    "href",
    "/passbook",
  );
});
