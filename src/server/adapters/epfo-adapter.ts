import type { ExternalEventResult } from "./types";

export const epfoAdapter = {
  async execute(): Promise<ExternalEventResult> {
    return {
      actor: "EPFO",
      eventType: "REVIEW_CASE",
      previousState: {},
      newState: {},
      explanation: "EPFO office processing is represented only as a disclosed simulation in this prototype.",
      simulated: true,
    };
  },
};
