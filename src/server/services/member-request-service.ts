import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { serviceRequests } from "@/db/schema";

export const memberRequestTypes = [
  "CONTACT_MOBILE_UPDATE",
  "BASIC_DETAILS_CORRECTION_NAME",
  "BASIC_DETAILS_CORRECTION_DOB",
  "SECURITY_REVIEW",
] as const;

export type MemberRequestType = (typeof memberRequestTypes)[number];
export type MemberRequestCommand = "OPEN" | "ADVANCE" | "RESOLVE";
export type MemberRequestStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export interface MemberRequestSummary {
  type: MemberRequestType;
  status: MemberRequestStatus;
  owner: "EPFO";
  createdAt: string;
  resolvedAt: string | null;
}

function requestId(demoRunId: string, type: MemberRequestType) {
  return `${demoRunId}:member-request:${type.toLowerCase()}`;
}

function isMemberRequestType(value: string): value is MemberRequestType {
  return memberRequestTypes.includes(value as MemberRequestType);
}

export async function getMemberRequests(demoRunId: string): Promise<MemberRequestSummary[]> {
  await ensureDatabaseReady();
  const rows = await getDb().select().from(serviceRequests).where(eq(serviceRequests.demoRunId, demoRunId));
  return rows.filter((row) => isMemberRequestType(row.type)).map((row) => ({
    type: row.type as MemberRequestType,
    status: row.status,
    owner: "EPFO",
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }));
}

export async function updateMemberRequest(demoRunId: string, type: MemberRequestType, command: MemberRequestCommand) {
  await ensureDatabaseReady();
  const id = requestId(demoRunId, type);
  const timestamp = new Date().toISOString();

  await getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(serviceRequests).where(and(eq(serviceRequests.demoRunId, demoRunId), eq(serviceRequests.id, id)));

    if (!existing) {
      if (command !== "OPEN") throw new Error("Start the simulated request before changing its status.");
      await tx.insert(serviceRequests).values({ id, demoRunId, type, owner: "EPFO", status: "OPEN", createdAt: timestamp, resolvedAt: null });
      return;
    }

    const status: MemberRequestStatus = command === "OPEN" ? "OPEN" : command === "ADVANCE" ? "IN_PROGRESS" : "RESOLVED";
    await tx.update(serviceRequests).set({ status, resolvedAt: status === "RESOLVED" ? timestamp : null }).where(eq(serviceRequests.id, id));
  });

  return (await getMemberRequests(demoRunId)).find((request) => request.type === type);
}
