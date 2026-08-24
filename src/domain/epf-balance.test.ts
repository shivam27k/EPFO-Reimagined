import { describe, expect, it } from "vitest";

import { calculateFinalSettlementAmount, calculatePostedEpfBalance } from "./epf-balance";

describe("calculatePostedEpfBalance", () => {
  it("uses only posted employee and employer EPF amounts", () => {
    expect(calculatePostedEpfBalance([
      { employeeEpf: 180000, employerEpf: 55100, employerEps: 125000, postingStatus: "POSTED" },
      { employeeEpf: 180000, employerEpf: 55100, employerEps: 125000, postingStatus: "MISSING" },
    ])).toBe(235100);
  });
});

describe("calculateFinalSettlementAmount", () => {
  const contributions = [
    { employeeEpf: 180000, employerEpf: 55100, employerEps: 125000, postingStatus: "POSTED" as const },
  ];

  it("recalculates a draft from the current posted EPF balance", () => {
    expect(calculateFinalSettlementAmount(contributions, {
      amount: 12845000,
      status: "DRAFT",
    })).toBe(235100);
  });

  it("keeps the amount locked after submission", () => {
    expect(calculateFinalSettlementAmount(contributions, {
      amount: 12845000,
      status: "SUBMITTED",
    })).toBe(12845000);
  });
});
