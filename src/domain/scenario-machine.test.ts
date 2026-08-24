import { describe, expect, test } from "vitest";

import {
  InvalidScenarioTransition,
  transitionScenario,
  type ScenarioEvent,
} from "./scenario-machine";
import type { ScenarioKey, ScenarioStage } from "./types";

describe("scenario transitions", () => {
  test("moves through the explicit issue resolution path", () => {
    const scenario: ScenarioKey = "MISSING_EXIT_DATE";

    const loaded = transitionScenario(scenario, "START", "LOAD_ISSUE");
    const actionRequested = transitionScenario(scenario, loaded, "REQUEST_ACTION");
    const resolved = transitionScenario(scenario, actionRequested, "RESOLVE");

    expect(loaded).toBe("ISSUE_LOADED");
    expect(actionRequested).toBe("ACTION_REQUESTED");
    expect(resolved).toBe("RESOLVED");
  });

  test("throws InvalidScenarioTransition and leaves persisted state untouched for invalid events", () => {
    const persisted: { key: ScenarioKey; stage: ScenarioStage } = {
      key: "MISSING_EXIT_DATE",
      stage: "START",
    };

    expect(() => transitionScenario(persisted.key, persisted.stage, "RESOLVE")).toThrow(
      InvalidScenarioTransition,
    );
    expect(persisted).toEqual({
      key: "MISSING_EXIT_DATE",
      stage: "START",
    });
  });

  test("rejects events that are not declared for a scenario table", () => {
    const unsupportedEvent = "ARCHIVE" as ScenarioEvent;

    expect(() =>
      transitionScenario("MISSING_CONTRIBUTION", "ISSUE_LOADED", unsupportedEvent),
    ).toThrow(InvalidScenarioTransition);
  });

  test("rejects malformed runtime transition inputs with InvalidScenarioTransition", () => {
    expect(() =>
      transitionScenario("UNKNOWN_SCENARIO" as ScenarioKey, "START", "LOAD_ISSUE"),
    ).toThrow(InvalidScenarioTransition);
    expect(() =>
      transitionScenario("MISSING_EXIT_DATE", "UNKNOWN_STAGE" as ScenarioStage, "LOAD_ISSUE"),
    ).toThrow(InvalidScenarioTransition);
    expect(() =>
      transitionScenario("MISSING_EXIT_DATE", "START", "UNKNOWN_EVENT" as ScenarioEvent),
    ).toThrow(InvalidScenarioTransition);
  });
});
