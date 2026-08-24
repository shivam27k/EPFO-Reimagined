import { describe, expect, test } from "vitest";

import { processDefinitions } from "./process-definitions";

describe("process definition registry", () => {
  test("final claim exposes four user confirmations and excludes derived context", () => {
    expect(processDefinitions.FINAL_CLAIM.questions.map((question) => question.key)).toEqual([
      "bankAccountConfirmed",
      "exitDateConfirmed",
      "unemploymentDeclared",
      "claimDeclarationAccepted",
    ]);
  });

  test("onboarding rendering metadata covers every question without a second field map", () => {
    expect(processDefinitions.ONBOARDING.questions).toHaveLength(14);
    for (const question of processDefinitions.ONBOARDING.questions) {
      expect(question).toMatchObject({
        control: expect.stringMatching(/^(text|date|checkbox)$/),
        example: expect.any(String),
      });
    }
    expect(processDefinitions.ONBOARDING.questions.at(-1)).toMatchObject({
      key: "bankIfsc",
      officialTerm: "Indian Financial System Code (IFSC)",
    });
  });
});
