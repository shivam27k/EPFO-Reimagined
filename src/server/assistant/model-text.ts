import { sanitizeMemberMessage } from "./assistant-store";

/** Redact free text, not repository objects. Callers still explicitly project rows. */
export function redactModelText(value: string, demoRunId?: string): string {
  const text = demoRunId ? value.split(demoRunId).join("[masked session identifier]") : value;
  const withoutRecordReferences = text
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?::[\w:-]+)?\b/gi, "[masked record reference]");
  return sanitizeMemberMessage(withoutRecordReferences)
    .replace(/\b\d{4}[\s-]+\d{4}[\s-]+\d{4}\b/g, "[masked identity]")
    .replace(/\b[A-Z]{5}\d{10,22}\b/gi, "[masked member identifier]")
    .replace(/(?<!\d)\d{8,18}(?!\d)/g, "[masked account or identity number]");
}
