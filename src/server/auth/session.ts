import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { demoRuns, demoUsers, sessions } from "@/db/schema";

export const SESSION_COOKIE_NAME = "epf_sahayak_session";

const SESSION_TTL_HOURS = 8;

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

function nowIso() {
  return new Date().toISOString();
}

function addHoursIso(isoDate: string, hours: number) {
  const date = new Date(isoDate);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function isExpired(isoDate: string, currentIso = nowIso()) {
  return new Date(isoDate).getTime() <= new Date(currentIso).getTime();
}

function createOpaqueSessionId() {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  };
}

export async function createSession(userId: string, demoRunId: string) {
  await ensureDatabaseReady();
  const db = getDb();
  const expiresAt = addHoursIso(nowIso(), SESSION_TTL_HOURS);
  const session = {
    id: createOpaqueSessionId(),
    userId,
    demoRunId,
    expiresAt,
  };

  await db.insert(sessions).values(session);

  return session;
}

export async function destroySession(sessionId: string) {
  await ensureDatabaseReady();
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  await ensureDatabaseReady();
  const [session] = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) {
    return null;
  }

  if (isExpired(session.expiresAt)) {
    await destroySession(session.id);
    return null;
  }

  return session;
}

export async function requireCurrentRun() {
  const session = await getCurrentSession();

  if (!session) {
    throw new AuthenticationError();
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: demoUsers.id,
      username: demoUsers.username,
      persona: demoUsers.persona,
      displayName: demoUsers.displayName,
    })
    .from(demoUsers)
    .where(eq(demoUsers.id, session.userId));
  const [demoRun] = await db
    .select()
    .from(demoRuns)
    .where(and(eq(demoRuns.id, session.demoRunId), eq(demoRuns.userId, session.userId)));

  if (!user || !demoRun || demoRun.status !== "ACTIVE" || isExpired(demoRun.expiresAt)) {
    await destroySession(session.id);
    throw new AuthenticationError();
  }

  return {
    identity: user,
    session,
    demoRun,
  };
}
