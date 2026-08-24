import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { createDemoRun, disposeDemoRun } from "@/db/demo-runs";
import { demoUsers } from "@/db/schema";
import { verifyPassword } from "@/server/auth/password";
import {
  createSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/server/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Username and password are required." }, { status: 400 });
  }

  await ensureDatabaseReady();
  const [user] = await getDb()
    .select()
    .from(demoUsers)
    .where(eq(demoUsers.username, parsed.data.username));

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const demoRunId = await createDemoRun(user.id);

  try {
    const session = await createSession(user.id, demoRunId);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.id, sessionCookieOptions());

    return Response.json({
      persona: user.persona,
      redirectTo: "/overview",
    });
  } catch {
    await disposeDemoRun(demoRunId);
    return Response.json(
      { error: "Could not start a demo session. Please try again." },
      { status: 500 },
    );
  }
}
