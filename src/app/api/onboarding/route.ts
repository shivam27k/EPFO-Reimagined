import { ZodError } from "zod";

import { getOnboardingPreflight } from "@/domain/process-definitions";
import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import {
  getOnboardingDraft,
  saveOnboarding,
  saveOnboardingDraft,
} from "@/server/services/onboarding-service";
import { PersonaForbiddenError } from "@/server/services/persona-guard";

function validationResponse(error: ZodError) {
  return Response.json(
    {
      error: "Check the highlighted demo fields.",
      fieldErrors: error.flatten().fieldErrors,
    },
    { status: 422 },
  );
}

export async function GET() {
  try {
    const current = await requireCurrentRun();
    return Response.json({
      ...getOnboardingPreflight(),
      draft: await getOnboardingDraft(current.demoRun.id),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    throw error;
  }
}

function forbiddenResponse(error: unknown) {
  if (error instanceof PersonaForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = await request.json();
    const snapshot = await saveOnboarding(current.demoRun.id, input);
    return Response.json(snapshot);
  } catch (error) {
    const forbidden = forbiddenResponse(error);
    if (forbidden) return forbidden;
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return validationResponse(error);
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}


export async function PATCH(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = await request.json();
    return Response.json(await saveOnboardingDraft(current.demoRun.id, input));
  } catch (error) {
    const forbidden = forbiddenResponse(error);
    if (forbidden) return forbidden;
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return validationResponse(error);
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}
