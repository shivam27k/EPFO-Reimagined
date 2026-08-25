# Agentic Portal Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Let the EPF Sahayak text and voice assistants perform safe, real portal navigation and UI actions, while requiring explicit confirmation before any state-changing demo action.

**Architecture:** A shared domain catalog defines every action the model may request. The server exposes this catalog as OpenAI function tools; a client coordinator validates each tool call and performs only allowlisted router, disclosure, focus, and API operations. Voice function calls return results through the Realtime data channel, while text responses return the same structured calls to the same coordinator. Mutations enter one shared pending-confirmation state and are never executed directly by the model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, OpenAI Responses API, OpenAI Realtime WebRTC, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-agentic-portal-actions-design.md`

## Global Constraints

- Never expose arbitrary click, CSS-selector, URL, fetch, JavaScript, or free-form API tools.
- Validate every model tool call against a local Zod schema and allowlist.
- Navigation, reveal, focus, and workflow-start actions may execute immediately.
- Demo mutations must create one visible pending proposal and require an explicit confirm or cancel.
- Do not automate final claim submission, OTP confirmation, logout, reset, or irreversible-looking member declarations.
- Keep all user-visible action results short and truthful.
- Both voice and text must use the same action coordinator and policy.

## Task 1: Build the shared portal action catalog

**Files:**

- Create: `src/domain/portal-actions.ts`
- Create: `src/domain/portal-actions.test.ts`
- Modify: `src/server/assistant/tools.ts`

**Steps:**

1. Add failing tests for exact parsing of valid and invalid calls, destination-to-route resolution, mutation classification, and rejection of arbitrary routes/selectors.
2. Define these discriminated action schemas:
   - `navigate_to({ destination })`
   - `reveal_section({ target })`
   - `focus_control({ target })`
   - `start_workflow({ workflow })`
   - `propose_demo_action({ action })`
   - `confirm_pending_action({})`
   - `cancel_pending_action({})`
3. Define closed destination, workflow, semantic-target, and demo-action enums. Include the complete member-facing route catalog and only safe existing demo mutations.
4. Export:
   - `parsePortalToolCall(name, rawArguments)`
   - `portalToolDefinitions`
   - `resolvePortalDestination(destination)`
   - `resolvePortalWorkflow(workflow)`
   - `describePortalAction(action)`
   - `isMutatingPortalAction(action)`
5. Replace the old broad `AssistantActionProposal` union with types derived from this catalog while retaining a compatibility shape only where existing saved assistant-message records require it.
6. Run `bun test src/domain/portal-actions.test.ts`.
7. Commit: `feat: define safe portal action catalog`.

## Task 2: Implement the client action coordinator

**Files:**

- Create: `src/components/assistant/portal-action-coordinator.ts`
- Create: `src/components/assistant/portal-action-coordinator.test.ts`
- Modify: `src/components/assistant/assistant-panel.tsx`

**Steps:**

1. Add failing tests proving immediate navigation, semantic disclosure opening, focus/scroll behavior, unsupported-target reporting, mutation proposal creation, confirmation, cancellation, and single-pending-action enforcement.
2. Implement a coordinator that accepts a validated `PortalAction` and returns:
   ```ts
   type PortalActionResult = {
     status: "completed" | "confirmation_required" | "cancelled" | "unavailable" | "failed";
     message: string;
     route?: string;
     target?: string;
   };
   ```
3. Use `router.push` only with catalog-resolved routes.
4. For semantic targets, query only exact allowlisted `data-assistant-target` values, open the containing `<details>`, call `scrollIntoView`, and focus a focusable element.
5. Support cross-route targets with one queued target stored in component state and fulfilled after `pathname` changes.
6. Map allowed demo actions to their existing same-origin API endpoints and exact HTTP methods/bodies. Reject reset, logout, claim submission, mark-exit submission, and unknown commands.
7. Store one `pendingAction`; `confirm_pending_action` executes it and clears it, while `cancel_pending_action` clears it without a request.
8. Expose the same `executeAction`, `pendingAction`, `confirm`, and `cancel` capabilities to both assistant modes through `AssistantPanel`.
9. Run `bun test src/components/assistant/portal-action-coordinator.test.ts src/components/assistant/assistant-panel.test.tsx`.
10. Commit: `feat: execute allowlisted portal actions`.

## Task 3: Add stable semantic targets to the portal UI

**Files:**

- Modify: `src/components/ui/task-first.tsx`
- Modify: `src/app/(portal)/profile/page.tsx`
- Modify: `src/app/(portal)/employment/page.tsx`
- Modify: `src/app/(portal)/passbook/page.tsx`
- Modify: `src/app/(portal)/claims/page.tsx`
- Modify: `src/app/(portal)/services/page.tsx`
- Modify: `src/app/(portal)/transfers/page.tsx`
- Modify: `src/app/(portal)/nomination/page.tsx`
- Modify: `src/components/portal/sidebar-navigation.tsx`

**Steps:**

1. Add a typed optional `assistantTarget` prop to shared disclosures and render it as `data-assistant-target`.
2. Mark high-value targets: profile tools, KYC records, employment records, monthly contributions, claim eligibility, claim history, service choices, transfer records, nomination guidance, and main navigation links.
3. Add workflow-entry targets for profile correction, contact update, mark exit, full settlement, advance claim, transfer, and nomination guidance.
4. Preserve existing layout and labels; semantic attributes must not create visual changes.
5. Run focused component tests plus `bun run lint` on the changed files.
6. Commit: `feat: expose semantic portal targets`.

## Task 4: Expose portal tools to OpenAI Realtime

**Files:**

- Modify: `src/server/assistant/realtime.ts`
- Modify: `src/app/api/assistant/realtime/route.test.ts`

**Steps:**

1. Add failing tests that the session configuration contains the exact function tools and disables parallel tool calls.
2. Add `tools: portalToolDefinitions` and `tool_choice: "auto"` to the Realtime configuration.
3. Set `parallel_tool_calls: false` so the confirmation boundary cannot be raced.
4. Extend instructions to state that navigation/action requests must use tools, never be refused when an allowlisted tool applies, and never be claimed complete before receiving tool output.
5. Run `bun test src/app/api/assistant/realtime/route.test.ts`.
6. Commit: `feat: expose portal actions to realtime assistant`.

## Task 5: Execute Realtime function calls through the data channel

**Files:**

- Modify: `src/components/assistant/use-assistant-voice.ts`
- Modify: `src/components/assistant/assistant-voice-control.tsx`
- Modify: `src/components/assistant/assistant-voice-control.test.tsx`

**Steps:**

1. Add failing tests for parsing `response.done` function-call output, deduplicating `call_id`, invoking the coordinator, returning `function_call_output`, requesting the follow-up response, malformed-argument handling, and pending confirmation.
2. Extend Realtime event types with `response.output` function-call items.
3. Add an `onToolCall` callback to the voice hook/control contract.
4. On each unseen function call:
   - validate through `parsePortalToolCall`;
   - await the shared coordinator;
   - send `conversation.item.create` with `type: "function_call_output"`, the original `call_id`, and JSON-stringified result;
   - send `response.create`.
5. Keep microphone/voice state active across navigation and tool execution.
6. Show a compact pending-action card in the voice HUD with Confirm and Cancel controls. Do not cover the page content or open the full text drawer automatically.
7. After an action completes, refresh the assistant screen context so the model sees the new route/rendered state.
8. Run `bun test src/components/assistant/assistant-voice-control.test.tsx`.
9. Commit: `feat: run realtime portal tool calls`.

## Task 6: Add the same structured actions to text chat

**Files:**

- Modify: `src/server/assistant/respond.ts`
- Modify: `src/server/assistant/respond.test.ts`
- Modify: `src/app/api/assistant/route.ts`
- Modify: `src/components/assistant/assistant-panel.tsx`
- Modify: `src/components/assistant/assistant-panel.test.tsx`

**Steps:**

1. Add failing tests that “open my profile,” “show where to correct my name,” and “help me add a nomination” return valid structured portal actions instead of capability denials.
2. Configure the Responses API with the same function definitions and disable parallel tool calls.
3. Parse function-call output into `portalActions` on the assistant API response. Do not execute server-side.
4. In `AssistantPanel`, pass each returned action to the shared coordinator and append the short returned result to the conversation.
5. Render the same pending confirmation card for a text-requested demo mutation.
6. Keep existing explanatory responses unchanged when no action is requested.
7. Run `bun test src/server/assistant/respond.test.ts src/components/assistant/assistant-panel.test.tsx`.
8. Commit: `feat: enable portal actions in text assistant`.

## Task 7: Tighten action-aware assistant instructions and UI feedback

**Files:**

- Modify: `src/server/assistant/instructions.ts`
- Modify: `src/components/assistant/assistant-panel.tsx`
- Modify: `src/components/assistant/assistant-voice-control.tsx`
- Modify: `src/app/globals.css`

**Steps:**

1. Add explicit concise behavior for supported, unsupported, completed, and confirmation-required actions in both English and Hindi.
2. Ensure the assistant says what it did using the actual action result, not an assumption.
3. Add subtle progress states: “Opening…”, “Ready to confirm”, “Done”, and “Couldn’t complete”.
4. Keep confirmation buttons keyboard-accessible, visible in both modes, and non-overlapping with the right-side journey/scenario chips.
5. Run assistant component tests and targeted lint.
6. Commit: `fix: make assistant action feedback explicit`.

## Task 8: Verify end-to-end behavior

**Files:**

- Modify: `docs/NEW_MEMBER_MANUAL_TEST_SUITE.md`

**Steps:**

1. Add concise manual cases for text and voice:
   - “Open my profile” navigates to `/profile`.
   - “Show where I can correct my name” navigates to `/profile` and reveals/focuses account tools.
   - Hindi “मुझे nomination जोड़ने में मदद करो” navigates to `/nomination`, reveals guidance, and does not claim a nomination was saved.
   - A supported demo mutation shows confirmation and makes no request before confirmation.
   - Cancel makes no request.
   - Confirm makes one request and refreshes context.
   - Unsupported destructive/free-form instructions are declined honestly.
2. Run focused tests:
   `bun test src/domain/portal-actions.test.ts src/components/assistant/portal-action-coordinator.test.ts src/components/assistant/assistant-panel.test.tsx src/components/assistant/assistant-voice-control.test.tsx src/server/assistant/respond.test.ts src/app/api/assistant/realtime/route.test.ts`
3. Run `bun run lint`.
4. Run `bun run build`.
5. Perform one browser smoke pass for text navigation, voice navigation, a reveal/focus action, mutation cancellation, and mutation confirmation.
6. Review `git diff --check` and confirm no API key or member secret appears in the diff.
7. Commit: `docs: add agentic assistant verification flow`.

## Completion Criteria

- Voice and text can navigate and reveal supported portal destinations without denying capability.
- Tool calls can never escape the catalog allowlist.
- The model cannot directly execute a mutation.
- Confirmation/cancellation works identically in voice and text.
- The assistant observes route/context changes after each action.
- Unsupported actions are clearly explained without fabricated success.
- Focused tests, lint, and production build pass.
