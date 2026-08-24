import { disposeDemoRun } from "@/db/demo-runs";
import {
  AuthenticationError,
  destroySession,
  requireCurrentRun,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const current = await requireCurrentRun();

    await disposeDemoRun(current.demoRun.id);
    await destroySession(current.session.id);

    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    return Response.json({ reset: true, redirectTo: "/login" });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    return Response.json(
      { error: "Could not reset the current demo run. Please try again." },
      { status: 500 },
    );
  }
}
