import "server-only";
import { z } from "zod";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { ActionError } from "./action-contracts";

function expectedOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured) return new URL(request.url).origin;
  try {
    const url = new URL(configured);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid origin");
    return url.origin;
  } catch {
    throw new ActionError("ORIGIN_CONFIGURATION_INVALID", "The portal public origin is misconfigured. Ask the administrator to correct APP_ORIGIN.");
  }
}

export async function requireAssistantRequest(request: Request) {
  const current = await requireCurrentRun();
  const origin = request.headers.get("origin");
  // Trust an explicit deployment setting, never arbitrary forwarded host headers.
  const allowedOrigin = expectedOrigin(request);
  if ((origin && origin !== allowedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ActionError("ORIGIN_REJECTED", "This portal address is not authorized. Use the configured portal URL or ask the administrator to check APP_ORIGIN.");
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
