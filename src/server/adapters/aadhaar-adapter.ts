import type { ExternalEventResult } from "./types";

export const aadhaarAdapter = {
  async execute(): Promise<ExternalEventResult> {
    return {
      actor: "AADHAAR",
      eventType: "VERIFY_IDENTITY",
      previousState: {},
      newState: {},
      explanation: "Aadhaar verification is represented only as a disclosed simulation in this prototype.",
      simulated: true,
    };
  },
};
