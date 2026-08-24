export interface AssistantIntent {
  intent: "EXPLAIN_STATUS" | "START_CLAIM" | "APPLY_CORRECTION" | "NAVIGATE" | "UNKNOWN";
  confidence: number;
  processKey?: "ONBOARDING" | "FINAL_CLAIM";
}

export function detectIntent(message: string, route: string): AssistantIntent {
  const normalized = message.toLowerCase();
  if (normalized.trim().length < 5) {
    return { intent: "UNKNOWN", confidence: 0.35 };
  }
  if (normalized.includes("submit") || normalized.includes("claim")) {
    return { intent: "START_CLAIM", confidence: 0.86, processKey: "FINAL_CLAIM" };
  }
  if (["fix", "correct", "resolve", "update"].some((word) => normalized.includes(word))) {
    return { intent: "APPLY_CORRECTION", confidence: 0.8 };
  }
  if (normalized.includes("why") || normalized.includes("blocked") || normalized.includes("status")) {
    return { intent: "EXPLAIN_STATUS", confidence: 0.82 };
  }
  if (route.includes("onboarding")) {
    return { intent: "NAVIGATE", confidence: 0.74, processKey: "ONBOARDING" };
  }
  return { intent: "UNKNOWN", confidence: 0.52 };
}
