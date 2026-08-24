import { describe, expect, it } from "vitest";

import { addCalendarMonthsClamped, endOfWageMonth } from "./demo-timeline";

describe("demo timeline dates", () => {
  it("uses the final calendar day of a wage month", () => {
    expect(endOfWageMonth("2026-05")).toBe("2026-05-31");
  });

  it("clamps a two-month advance to the target month's final day", () => {
    expect(addCalendarMonthsClamped("2026-12-31", 2)).toBe("2027-02-28");
  });
});
