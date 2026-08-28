import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { buildRealtimeSessionConfig, createRealtimeCall, RealtimeSetupError } from "@/server/assistant/realtime";
import { z, ZodError } from "zod";

const SDP_MEDIA_TYPE = "application/sdp";
const MAX_SDP_BYTES = 64 * 1024;
const MAX_ROUTE_LENGTH = 120;
const ROUTE_BASE_URL = "http://realtime-route.local";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const contextRefreshSchema = z.object({
  route: z.string().min(1).max(MAX_ROUTE_LENGTH),
  visibleScreenText: z.string().max(6000),
});

function mediaType(request: Request): string {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isSameOriginPathname(route: string): boolean {
  if (
    !route.startsWith("/")
    || route.startsWith("//")
    || route.includes("\\")
    || route.includes("://")
    || CONTROL_CHARACTER_PATTERN.test(route)
  ) return false;

  let decodedRoute: string;
  try {
    decodedRoute = decodeURIComponent(route);
  } catch {
    return false;
  }
  if (
    decodedRoute.startsWith("//")
    || decodedRoute.includes("\\")
    || decodedRoute.includes("://")
    || CONTROL_CHARACTER_PATTERN.test(decodedRoute)
  ) return false;

  const parsed = new URL(route, ROUTE_BASE_URL);
  return parsed.origin === ROUTE_BASE_URL
    && parsed.pathname === route
    && !parsed.search
    && !parsed.hash;
}

function readRealtimeRoute(request: Request): string | null {
  const route = new URL(request.url).searchParams.get("route")?.trim();
  if (!route || route.length > MAX_ROUTE_LENGTH || !isSameOriginPathname(route)) return null;
  return route;
}

function routeValidationError() {
  return Response.json({ error: "Use a valid portal route." }, { status: 422 });
}

function routeFailure(error: unknown) {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const code = error instanceof RealtimeSetupError ? error.code : "VOICE_SETUP_FAILED";
  return Response.json(
    { error: "Realtime voice is temporarily unavailable. Text chat remains available.", code },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentRun();
    const route = readRealtimeRoute(request);
    if (!route) return routeValidationError();

    const config = await buildRealtimeSessionConfig({ demoRunId: current.demoRun.id, route });
    if (typeof config.instructions !== "string" || !config.instructions.trim()) {
      throw new Error("Realtime instructions are unavailable.");
    }
    return Response.json(
      { instructions: config.instructions, contextSchemaVersion: 1 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return routeFailure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = contextRefreshSchema.parse(await request.json());
    if (!isSameOriginPathname(input.route)) return routeValidationError();

    const config = await buildRealtimeSessionConfig({
      demoRunId: current.demoRun.id,
      route: input.route,
      visibleScreenText: input.visibleScreenText,
    });
    if (typeof config.instructions !== "string" || !config.instructions.trim()) {
      throw new Error("Realtime instructions are unavailable.");
    }
    return Response.json(
      { instructions: config.instructions, contextSchemaVersion: 1 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Use valid rendered-screen context." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return routeFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    if (mediaType(request) !== SDP_MEDIA_TYPE) {
      return Response.json({ error: "Send the WebRTC offer as application/sdp." }, { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SDP_BYTES) {
      return Response.json({ error: "The WebRTC offer is too large." }, { status: 413 });
    }

    const route = readRealtimeRoute(request);
    if (!route) return routeValidationError();

    const sdp = await request.text();
    if (!sdp.trim()) {
      return Response.json({ error: "The WebRTC offer is empty." }, { status: 422 });
    }
    if (new TextEncoder().encode(sdp).byteLength > MAX_SDP_BYTES) {
      return Response.json({ error: "The WebRTC offer is too large." }, { status: 413 });
    }

    const config = await buildRealtimeSessionConfig({ demoRunId: current.demoRun.id, route });
    const answer = await createRealtimeCall({ sdp, config });
    return new Response(answer.sdp, {
      headers: {
        "content-type": SDP_MEDIA_TYPE,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return routeFailure(error);
  }
}
