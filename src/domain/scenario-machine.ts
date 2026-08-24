import type { ScenarioKey, ScenarioStage } from "./types";

export type ScenarioEvent = "LOAD_ISSUE" | "REQUEST_ACTION" | "RESOLVE";

type TransitionTable = Record<
  ScenarioKey,
  Partial<Record<ScenarioStage, Partial<Record<ScenarioEvent, ScenarioStage>>>>
>;

const transitions: TransitionTable = {
  ONBOARDING_NAME_MISMATCH: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: {
      LOAD_ISSUE: "ISSUE_LOADED",
      REQUEST_ACTION: "ACTION_REQUESTED",
    },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
  MISSING_CONTRIBUTION: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: { REQUEST_ACTION: "ACTION_REQUESTED" },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
  MISSING_EXIT_DATE: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: { REQUEST_ACTION: "ACTION_REQUESTED" },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
  CLAIM_BANK_NAME_MISMATCH: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: { REQUEST_ACTION: "ACTION_REQUESTED" },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
  CRYPTIC_CLAIM_STATUS: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: { REQUEST_ACTION: "ACTION_REQUESTED" },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
  PAYMENT_RETURNED: {
    START: { LOAD_ISSUE: "ISSUE_LOADED" },
    ISSUE_LOADED: { REQUEST_ACTION: "ACTION_REQUESTED" },
    ACTION_REQUESTED: { RESOLVE: "RESOLVED" },
  },
};

export class InvalidScenarioTransition extends Error {
  constructor(key: ScenarioKey, stage: ScenarioStage, event: ScenarioEvent) {
    super(`Invalid transition for ${key}: ${stage} + ${event}`);
    this.name = "InvalidScenarioTransition";
  }
}

export function transitionScenario(
  key: ScenarioKey,
  stage: ScenarioStage,
  event: ScenarioEvent,
): ScenarioStage {
  const nextStage = transitions[key]?.[stage]?.[event];

  if (!nextStage) {
    throw new InvalidScenarioTransition(key, stage, event);
  }

  return nextStage;
}
