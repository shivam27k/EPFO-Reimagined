import "server-only";
import { createHash } from "node:crypto";
import { ensureDatabaseReady, getDb } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { demoRuns } from "@/db/schema";

export type ActionTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export const PROPOSAL_TTL_MS = 5 * 60_000;
export const expiresIn = (milliseconds = PROPOSAL_TTL_MS) => new Date(Date.now() + milliseconds).toISOString();
export const nowIso = () => new Date().toISOString();
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export class ActionError extends Error {
  constructor(public code: string, message: string, public data?: Record<string, unknown>) { super(message); }
}
export async function assertActiveRun(tx: Pick<ActionTransaction, "select">, runId: string) {
  const [run] = await tx.select().from(demoRuns).where(eq(demoRuns.id, runId));
  if (!run || run.status !== "ACTIVE" || run.expiresAt <= nowIso()) {
    throw new ActionError("RUN_UNAVAILABLE", "This demo run is no longer active.");
  }
  return run;
}
export async function actionTransaction<T>(runId: string, operation: (tx: ActionTransaction) => Promise<T>) {
  await ensureDatabaseReady();
  return getDb().transaction(async (tx) => {
    // First statement takes a database write lock, before any version/consent read.
    // This also serializes concurrent confirmations across server processes.
    await tx.update(demoRuns).set({ id: runId }).where(and(eq(demoRuns.id, runId), eq(demoRuns.status, "ACTIVE")));
    await assertActiveRun(tx, runId);
    return operation(tx);
  });
}
