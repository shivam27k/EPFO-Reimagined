import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

export async function GET(_request: Request) {
  void _request;

  try {
    const current = await requireCurrentRun();
    const snapshot = await getMemberSnapshot(current.demoRun.id);

    return Response.json(snapshot);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    return Response.json(
      { error: "Could not load the member snapshot. Please try again." },
      { status: 500 },
    );
  }
}
