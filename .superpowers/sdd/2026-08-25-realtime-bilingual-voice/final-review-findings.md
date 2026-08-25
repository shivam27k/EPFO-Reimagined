# Final Review Findings

## Important 1: Screen awareness

Current route changes send a one-line `session.update.instructions`, replacing the full policy/context. Add an authenticated server context-refresh contract that reuses the same explicit masked projection and returns complete current instructions: screen name/purpose/official term, refreshed masked member state, findings, active process, recent conversation, and the full bilingual/no-invention/no-action policy.

- Validate the route identically to SDP negotiation without duplicating unsafe validation.
- The client must fetch fresh complete instructions and send `session.update` without reconnecting whenever the pathname changes and whenever the masked `MemberSnapshot` changes on router refresh/state transitions.
- Handle stale/out-of-order refresh responses and failures safely; never downgrade to route-only instructions.
- Tests must assert a context refresh fetch and full returned instructions.
- Keep the API key server-only and never send raw identifiers.

User priority: the agent must understand the opened screen, not merely know a pathname. If the same page state changes via `router.refresh`, the full grounded context must refresh too.

## Important 2: Hindi/Hinglish transcription

A live user test produced Arabic/Urdu-script input transcript and the current UI replaced it with an unsupported-script warning, while the response was correct Hindi.

- Configure input transcription specifically for code-switched English/Hindi with Latin English and Devanagari Hindi.
- Prefer the current official `gpt-transcribe` Realtime input transcription model via a separate `OPENAI_REALTIME_TRANSCRIBE_MODEL` default.
- Include a concise transcription prompt requiring English Latin / Hindi Devanagari only, never Urdu/Arabic script, with EPF keywords.
- Do not set a single fixed language that would break code-switching.
- Keep the strict rendering allowlist.
- If forbidden script still arrives, do not show an alarming error or commit it as a literal member utterance; display a neutral English/Hindi voice-received caption and allow the audio-model conversation to continue.
- Add configuration and client tests for prompt/model/fallback behavior and update `.env.example`.

## Important 3: Caption continuity

Reconcile completion events by `item_id` and conversation order, not arrival order.

- Use `conversation.item.created` and `previous_item_id`/item identity to maintain stable member/assistant chronology, including rapid/interrupted turns.
- When Open text chat is clicked mid-turn, transfer completed captions plus any visible partial transcript/answer without duplicates or loss.
- Add out-of-order completion and partial-handoff tests.

## Minor: bounded setup

Add a reasonable 15-second connection/setup timeout that cleans partial resources and exposes text fallback.

## Preserved constraints

- Persistent fixed HUD and text fallback.
- Interruption support.
- No legacy voice REST pipeline.
- English/Hindi-only rendering.
- Explicit confirmations for state changes; voice performs no autonomous member-state changes.
