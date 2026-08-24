import type { Finding } from "./types";

type FindingInput = Omit<Finding, "allowedActions"> & {
  allowedActions?: string[];
};

export function finding(input: FindingInput): Finding {
  return {
    ...input,
    allowedActions: input.allowedActions ?? [],
  };
}
