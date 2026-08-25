# Realtime Bilingual Voice Final-Fix Report

Date: 2026-08-25
Branch: `feat/realtime-bilingual-voice`

## Outcome

Implemented the consolidated final-review wave for authenticated screen/state grounding, English/Hindi code-switched transcription, item-ordered caption continuity, partial text handoff, and bounded Realtime setup. The persistent fixed voice HUD, interruption controls, text fallback, strict English/Devanagari rendering allowlist, and explicit-confirmation boundary remain intact.

## Files

- `.env.example`
  - Added `OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-transcribe`.
- `src/server/assistant/realtime.ts`
  - Uses the dedicated Realtime transcription override/default and an English-Latin/Hindi-Devanagari code-switch prompt with EPF terms.
  - Continues to build complete instructions from the explicit masked projection.
- `src/server/assistant/realtime.test.ts`
  - Covers the dedicated transcription model/default, prompt, absence of a fixed language, and override.
- `src/app/api/assistant/realtime/route.ts`
  - Adds authenticated `GET /api/assistant/realtime?route=<pathname>` context refresh.
  - Reuses one route parser/validator for both GET context refresh and POST SDP negotiation.
  - Returns only `{ instructions }` with `cache-control: no-store`.
- `src/app/api/assistant/realtime/route.test.ts`
  - Covers authentication, identical unsafe-route rejection, complete instruction response, safe response projection, and no OpenAI call during refresh.
- `src/components/assistant/use-assistant-voice.ts`
  - Fetches complete context on route or snapshot-version changes without reconnecting.
  - Rejects incomplete/route-only payloads, sequences refreshes, aborts superseded requests, ignores stale/failing responses, and closes on refreshed-auth failure.
  - Reconciles captions by Realtime item identity and `previous_item_id` graph order.
  - Hands off completed items plus the graph-latest visible member/assistant partials without duplicates.
  - Uses a neutral `Voice received. आवाज़ मिली।` member caption when an input transcript contains a forbidden script; the raw transcript is neither rendered nor handed off.
  - Adds a 15-second setup timeout with generation-safe, single-owner cleanup.
- `src/components/assistant/assistant-voice-control.tsx`
  - Accepts the snapshot context version and transfers the complete handoff projection to text chat.
- `src/components/assistant/assistant-voice-control.test.tsx`
  - Covers full refresh fetch/send, same-route snapshot refresh, stale/failure safety, neutral forbidden-input behavior, graph ordering, live-HUD ordering, partial handoff, and abort-aware timeout cleanup.
- `src/components/assistant/assistant-panel.tsx`
  - Produces a local-only deterministic snapshot version and passes it to the persistent voice control.
- `src/components/assistant/assistant-panel.test.tsx`
  - Covers same-HUD route changes and same-path snapshot-version changes.
- `.superpowers/sdd/2026-08-25-realtime-bilingual-voice/final-review-findings.md`
  - Records the supplied final-review findings.
- `.superpowers/sdd/2026-08-25-realtime-bilingual-voice/final-fix-report.md`
  - This report.

## Protocol design

Initial SDP negotiation remains `POST /api/assistant/realtime?route=<pathname>` with `application/sdp`. The authenticated server calls `buildRealtimeSessionConfig`, whose instructions combine the complete assistant policy with a JSON serialization of the existing explicit masked projection: route; screen name, purpose, and official term; masked member state; findings; active process; and redacted recent conversation.

Context refresh uses `GET` on the same route handler and the same normalized route validator. It calls the same `buildRealtimeSessionConfig` helper and returns only the resulting instructions. It never invokes `createRealtimeCall`, exposes the API key, returns a server model/config object, or accepts raw member identifiers from the browser.

The client derives a local-only version from the `MemberSnapshot`; only the route is sent in the refresh request. A change to pathname or snapshot version starts a refresh on the existing data channel session. Each refresh has an abort controller plus a monotonic sequence and session generation. Only the newest response for the active resources may send `session.update`. The response must contain the full masked-context, bilingual, no-invention, and explicit-confirmation markers. A 401 closes the session; transient, malformed, incomplete, aborted, or stale responses leave the last complete instructions in place and do not send a route-only downgrade.

## Caption ordering and handoff design

Every observed `conversation.item.created` event creates/updates a graph node keyed by item ID and records `previous_item_id`. Transcript deltas/completions update that same node by `item_id`; duplicate completion events replace the node text rather than append another caption. A stable topological projection orders nodes after their known predecessors, with first-seen order as the deterministic fallback for missing predecessors or malformed cycles.

Both live member/assistant captions and text-chat transfer derive from this conversation-order projection, so late completion of an older item cannot replace a newer visible caption. Handoff contains every completed caption and only the graph-latest visible partial for each role. Forbidden member transcription is replaced at ingestion with the neutral bilingual acknowledgement, so the literal Arabic/Perso-Arabic string never enters a rendered or transferred caption.

## Verification

### Regression red phase

Command:

`bun run test -- src/server/assistant/realtime.test.ts src/app/api/assistant/realtime/route.test.ts src/components/assistant/assistant-voice-control.test.tsx src/components/assistant/assistant-panel.test.tsx --run`

Expected pre-fix result observed: exit 1; 18 new regression failures, 34 existing tests passed. Failures mapped to missing GET handler, old transcription model/prompt, absent context-version propagation, route-only client update, arrival-ordered captions, lost partial handoff, alarming forbidden-input caption, and missing setup timeout.

Additional race red checks:

- Out-of-order live HUD targeted test: exit 1 before deriving the HUD from graph order.
- Abort-aware timeout plus late-completion partial-handoff targeted tests: exit 1 with double cleanup and lost newer partial before the race fixes.

### Focused final tests

Command:

`bun run test -- src/server/assistant/realtime.test.ts src/app/api/assistant/realtime/route.test.ts src/components/assistant/assistant-voice-control.test.tsx src/components/assistant/assistant-panel.test.tsx --run`

Output summary:

```text
Test Files  4 passed (4)
Tests       52 passed (52)
Duration    3.62s
```

Exit: 0.

### Scoped ESLint

Command:

`bunx eslint src/server/assistant/realtime.ts src/server/assistant/realtime.test.ts src/app/api/assistant/realtime/route.ts src/app/api/assistant/realtime/route.test.ts src/components/assistant/use-assistant-voice.ts src/components/assistant/assistant-voice-control.tsx src/components/assistant/assistant-voice-control.test.tsx src/components/assistant/assistant-panel.tsx src/components/assistant/assistant-panel.test.tsx`

Output: no warnings or errors. Exit: 0.

### TypeScript

Command:

`bunx tsc --noEmit`

Output: no diagnostics. Exit: 0.

### Production build

Command:

`bun run build`

Output summary:

```text
Next.js 16.3.2 (Turbopack)
Compiled successfully in 1022ms
Finished TypeScript in 2.5s
Generated static pages (44/44) in 290ms
/api/assistant/realtime emitted as a dynamic route
```

Exit: 0.

### Diff/security checks

- `git diff --check`: exit 0 (Git emitted only the repository's LF-to-CRLF conversion notices).
- Realtime client scan found no `/api/assistant/transcribe`, `/api/assistant/speech`, or normal `/api/assistant` turn calls.
- Realtime client scan found no `OPENAI_API_KEY`, `demoRunId`, unmasked display name, employment key, birth date, or mobile field usage.

## Self-review

- Complete refreshed grounding includes screen semantics, not just pathname.
- Same-path masked state changes trigger refresh through the snapshot version while voice remains mounted.
- Refresh only sends complete instructions; stale, aborted, malformed, and failed responses cannot overwrite the session.
- Server route validation is shared by GET and POST rather than duplicated.
- API key remains confined to server-side Realtime call creation.
- No fixed transcription language is set, preserving English/Hindi code-switching.
- Arabic/Perso-Arabic input never renders or transfers literally; assistant output remains under the existing strict allowlist.
- Caption completion, live caption selection, and handoff all use item identity/conversation order.
- Setup timeout owns cleanup once and leaves Open text chat/Retry available.
- No autonomous voice actions or confirmation bypass was added.

## Concerns

- No live microphone/OpenAI Realtime smoke test was possible in the non-interactive test environment. Browser media, data-channel, abort, reconnect, and ordering behavior are covered with focused fakes, and the authenticated server projection is covered against the isolated database.
