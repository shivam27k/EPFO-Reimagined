import { externalAdapterEvents } from "@/db/schema";
import { getDb } from "@/db/client";
import type { ExternalEventResult } from "./types";

type AdapterTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export async function recordExternalEvent(
  tx: AdapterTransaction,
  demoRunId: string,
  result: ExternalEventResult,
  recordedAt: string,
) {
  await tx.insert(externalAdapterEvents).values({
    id: `${demoRunId}:external:${result.actor.toLowerCase()}:${result.eventType.toLowerCase()}`,
    demoRunId,
    actor: result.actor,
    eventType: result.eventType,
    previousStateJson: JSON.stringify(result.previousState),
    newStateJson: JSON.stringify(result.newState),
    explanation: result.explanation,
    simulated: result.simulated,
    recordedAt,
  }).onConflictDoUpdate({
    target: externalAdapterEvents.id,
    set: {
      previousStateJson: JSON.stringify(result.previousState),
      newStateJson: JSON.stringify(result.newState),
      explanation: result.explanation,
      simulated: result.simulated,
      recordedAt,
    },
  });
}
