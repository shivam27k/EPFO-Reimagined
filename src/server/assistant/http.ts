import "server-only";
import { z } from "zod";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { ActionError } from "./action-contracts";

export async function requireAssistantRequest(request: Request) {
  const current = await requireCurrentRun();
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ActionError("ORIGIN_REJECTED", "Use the signed-in portal to perform this action.");
  }
  return current;
}
export function assistantJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function assistantHttpError(error: unknown) {
  if (error instanceof AuthenticationError) return assistantJson({ error: "Authentication required." }, 401);
  if (error instanceof z.ZodError) return assistantJson({
    error: "Invalid request.", fieldErrors: Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message])),
    exclusions: error.issues.flatMap((issue) => issue.code === "unrecognized_keys" ? issue.keys : []),
  }, 422);
  if (error instanceof SyntaxError) return assistantJson({ error: "Request body must be valid JSON." }, 400);
  if (error instanceof ActionError) return assistantJson({ error: error.message, code: error.code, ...error.data }, error.code === "ORIGIN_REJECTED" ? 403 : 409);
  return assistantJson({ error: "The result could not be established. Inspect action status before repeating a mutation.", code: "OUTCOME_UNCERTAIN" }, 503);
}
export const opaqueReference = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
export const payloadHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantRouteSchema = z.string().min(1).max(120).regex(/^\/(?!\/)/);
