export interface AssistantIntent {
  intent: "EXPLAIN_STATUS" | "START_CLAIM" | "APPLY_CORRECTION" | "NAVIGATE" | "UNKNOWN";
  confidence: number;
  processKey?: "ONBOARDING" | "FINAL_CLAIM";
}

export function detectIntent(message: string, route: string): AssistantIntent {
  // Compatibility metadata only: never gate provider access or authorize an action.
  const normalized = message.toLowerCase();
  if (/\b(explain|why|status|what|how)\b|क्यों|स्थिति|समझा/u.test(normalized)) {
    return { intent: "EXPLAIN_STATUS", confidence: 0.82 };
  }
  if (/\b(start|submit|file)\b.*\bclaim\b/u.test(normalized)) {
    return { intent: "START_CLAIM", confidence: 0.86, processKey: "FINAL_CLAIM" };
  }
  if (["fix", "correct", "resolve", "update"].some((word) => normalized.includes(word))) {
    return { intent: "APPLY_CORRECTION", confidence: 0.8 };
  }
  if (normalized.includes("why") || normalized.includes("blocked") || normalized.includes("status")) {
    return { intent: "EXPLAIN_STATUS", confidence: 0.82 };
  }
  if (route.includes("onboarding")) {
    return { intent: "UNKNOWN", confidence: 0.52, processKey: "ONBOARDING" };
  }
  return { intent: "UNKNOWN", confidence: 0.52 };
}
