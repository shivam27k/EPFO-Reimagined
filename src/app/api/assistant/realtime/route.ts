import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { buildRealtimeSessionConfig, createRealtimeCall } from "@/server/assistant/realtime";

const SDP_MEDIA_TYPE = "application/sdp";
const MAX_SDP_BYTES = 64 * 1024;
const MAX_ROUTE_LENGTH = 120;

function mediaType(request: Request): string {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
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

    const route = new URL(request.url).searchParams.get("route")?.trim();
    if (!route || route.length > MAX_ROUTE_LENGTH) {
      return Response.json({ error: "Use a valid portal route." }, { status: 422 });
    }

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
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    return Response.json(
      { error: "Realtime voice is temporarily unavailable. Text chat remains available." },
      { status: 503 },
    );
  }
}
