import { describe, expect, test } from "vitest";

import { buildQuestionBatches } from "./form-copilot";

describe("assistant form copilot", () => {
  test("groups a 32-question process into batches of at most 10 with accurate remaining counts", () => {
    const batches = buildQuestionBatches(Array.from({ length: 32 }, (_, index) => ({
      key: `q${index + 1}`,
      label: `Question ${index + 1}`,
    })));

    expect(batches).toHaveLength(4);
    expect(batches.map((batch) => batch.questions)).toHaveLength(4);
    expect(batches.map((batch) => batch.questions.length)).toEqual([10, 10, 10, 2]);
    expect(batches.map((batch) => batch.remainingAfter)).toEqual([22, 12, 2, 0]);
  });
});
