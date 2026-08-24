import { describe, expect, it } from "vitest";

import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { buildDemoRunSeed } from "./seed-data";

describe("demo seed consistency", () => {
  it("keeps the new-member UAN stable through onboarding", () => {
    const seed = buildDemoRunSeed("NEW_MEMBER", "new-run");
    expect(seed.profile.uan.replaceAll(" ", "")).toBe("100000004321");
  });

  it("gives the existing member a continuous ledger and matching draft amount", () => {
    const seed = buildDemoRunSeed("EXISTING_MEMBER", "existing-run");
    const wageMonths = seed.contributions.map((row) => row.wageMonth);

    expect(wageMonths).toHaveLength(62);
    expect(wageMonths[0]).toBe("2021-04");
    expect(wageMonths.at(-1)).toBe("2026-05");
    expect(seed.contributions.filter((row) => row.postingStatus === "MISSING").map((row) => row.wageMonth)).toEqual(["2026-05"]);
    expect(seed.claims[0]?.amount).toBe(calculatePostedEpfBalance(seed.contributions));
  });
});
