import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ContributionTable } from "./contribution-table";

const baseContribution = {
  establishmentName: "Sahyadri Demo Components Pvt Ltd",
  employeeEpf: 10_000,
  employerEpf: 5_000,
  employerEps: 8_000,
  postingStatus: "POSTED" as const,
};

describe("ContributionTable", () => {
  test("shows chronological running balances while keeping newest month first", () => {
    render(<ContributionTable contributions={[
      { ...baseContribution, wageMonth: "2027-01" },
      { ...baseContribution, wageMonth: "2026-12" },
    ]} />);

    const januaryRow = screen.getByText("2027-01").closest("tr");
    const decemberRow = screen.getByText("2026-12").closest("tr");

    expect(januaryRow).not.toBeNull();
    expect(decemberRow).not.toBeNull();
    expect(within(januaryRow as HTMLTableRowElement).getByText("₹300")).toBeVisible();
    expect(within(decemberRow as HTMLTableRowElement).getByText("₹150")).toBeVisible();
  });

  test("shows ten rows by default and can expand the page size to fifty", () => {
    const contributions = Array.from({ length: 12 }, (_, index) => ({
      ...baseContribution,
      wageMonth: `2026-${String(12 - index).padStart(2, "0")}`,
    }));
    render(<ContributionTable contributions={contributions} />);

    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Showing 1–10 of 12")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "50" },
    });

    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("Showing 1–12 of 12")).toBeVisible();
  });
});
