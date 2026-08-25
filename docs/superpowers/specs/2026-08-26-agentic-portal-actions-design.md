# Agentic Portal Actions Design

## Objective

Extend EPF Sahayak from a screen-aware guide into a controlled portal operator. A member can state an outcome in English, Hindi, or Hinglish, and the assistant can navigate to the correct screen, reveal or focus the relevant interface, and carry out supported demo workflows without requiring the member to know the portal structure.

The assistant remains bounded by the portal. It does not gain arbitrary browser control, access external systems, or bypass normal validation and confirmation.

## Experience

- The member can say or type requests such as “Open my profile,” “Show where I can correct my name,” or “Help me add a nomination.”
- Read-only interface actions happen immediately: navigation, scrolling, opening a disclosure, and focusing a visible control.
- Before any action that changes persisted demo state or submits a workflow, the assistant explains the exact proposed action and asks for confirmation.
- Confirmation can be given through the visible action card or an unambiguous voice response while that proposal is pending.
- After execution, the assistant reports the result briefly and refreshes its screen context before continuing.
- When a requested capability is not implemented by the portal, the assistant navigates to the closest relevant screen and explains the boundary instead of pretending that the action succeeded.
- Voice mode stays connected across navigation and continues using the same English/Hindi response policy.

## Recommended Architecture

Use OpenAI Realtime function calling with a portal-owned semantic action layer. Realtime exposes a small set of typed functions to the model. The browser receives a function call, validates it against the current authenticated portal capabilities, executes the corresponding portal command, returns a `function_call_output`, and asks the model for a short result response.

This is preferred over DOM-selector automation or screenshot-based computer use:

- Semantic commands remain stable when layout and styling change.
- Every callable action has an explicit authorization and confirmation policy.
- The model cannot invent routes, selectors, API calls, or arbitrary JavaScript.
- The same action definitions can serve voice and text chat.

## Components

### Portal action catalog

A shared catalog defines every action the assistant may request. Each definition contains:

- a stable action name;
- a plain-language description for the model;
- a strict argument schema;
- whether the action is read-only or state-changing;
- allowed routes or member states;
- the semantic target or server command;
- the result shape returned to the assistant.

Initial semantic actions:

1. `navigate_to`
   - Opens an allowlisted portal destination.
   - Read-only and executes immediately.
2. `reveal_section`
   - Opens an allowlisted disclosure, tab, or panel on the current page and scrolls it into view.
   - Read-only and executes immediately.
3. `focus_control`
   - Scrolls to and focuses an allowlisted button, link, or form field.
   - Read-only and executes immediately.
4. `start_workflow`
   - Navigates to the entry point for a supported workflow such as profile correction, nomination guidance, employment exit, contribution review, or a claim.
   - Navigation is immediate; any later mutation follows its own confirmation rule.
5. `propose_demo_action`
   - Creates a visible pending proposal for an allowlisted state-changing demo command.
   - Never executes until explicitly confirmed.

The model is not given a generic `click`, `type`, `fetch`, or `run_javascript` tool.

### Semantic target registry

Interactive pages register stable semantic targets rather than exposing CSS selectors to the model. Examples include `profile.account_tools`, `profile.basic_details`, `nomination.requirements`, `employment.mark_exit`, and `claims.confirmations`.

The registry maps these names to portal-owned behavior such as opening a `<details>` element, focusing a control, or navigating to a route. A missing or unavailable target returns a structured failure and does not fall back to guessed DOM interaction.

### Action coordinator

One client coordinator receives validated action requests from either Realtime voice or text chat. It:

1. validates the tool name and arguments;
2. checks the current route, member snapshot, and action policy;
3. executes read-only actions immediately;
4. creates a pending proposal for state-changing actions;
5. returns a structured success, unavailable, confirmation-required, cancelled, or failed result;
6. refreshes the member snapshot and rendered-screen context after navigation or mutation.

This keeps action semantics outside the voice hook and avoids duplicating behavior between voice and text.

### Confirmation controller

Only one state-changing proposal may be pending at a time. The confirmation surface shows:

- what will change;
- which synthetic record or workflow is affected;
- that the action is simulated;
- Confirm and Keep unchanged controls.

Voice confirmation is accepted only while a specific proposal is pending and only for an unambiguous confirmation or cancellation. A new unrelated request cancels neither the proposal nor executes it implicitly. Submission, declarations, OTP consent, and irreversible-looking workflow acknowledgements remain explicit portal controls unless a dedicated confirmed command is defined for them.

## Action Policy

### Immediate read-only actions

- Navigate between allowlisted portal routes.
- Open or close named disclosures and panels.
- Scroll to and focus named content or controls.
- Open a workflow entry screen.
- Read the refreshed screen state and explain it.

### Confirmation-required actions

- Load or resolve a demo scenario.
- Apply a synthetic profile or bank correction.
- Record an employment exit date.
- Simulate contributions, elapsed time, employer response, EPFO review, approval, or payment.
- Apply extracted form values.
- Submit a claim or any other supported persisted workflow.

Confirmation authorizes exactly one proposal. It does not grant ongoing autonomy for later steps.

### Prohibited actions

- Arbitrary DOM clicking, selector generation, or coordinate-based interaction.
- Bypassing disabled controls or client/server validation.
- Sending real data to EPFO, Aadhaar, UMANG, an employer, or a bank.
- Reading or persisting raw sensitive identifiers.
- Executing an action absent from the current portal implementation.
- Treating ambiguous speech as approval.

## Realtime Data Flow

1. The authenticated server builds masked screen context and the currently available tool definitions.
2. The Realtime session receives the shared assistant instructions plus the function catalog.
3. The member speaks a goal.
4. The model either answers normally or emits a function call.
5. The client action coordinator validates the call against the local catalog and current context.
6. A read-only action executes immediately, or a state-changing action becomes a pending confirmation.
7. The client sends a structured `function_call_output` using the original call ID.
8. The client sends `response.create` so the assistant can acknowledge the result.
9. Navigation or state changes refresh the authoritative rendered-screen context before another action is accepted.

Tool calls are processed serially. Parallel action execution is disabled because portal navigation and mutations alter the context needed to validate subsequent actions.

## Text Chat Integration

Text chat uses the same catalog, coordinator, and confirmation controller. The existing action-card pattern becomes the common confirmation surface. Model-generated tool arguments never directly become router calls or API payloads without catalog validation.

## Unsupported and Ambiguous Requests

- If the destination exists but the requested operation does not, navigate to the destination and explain what is available.
- If multiple targets plausibly match, ask one short clarifying question rather than choosing silently.
- If the current member state makes an action unavailable, state the prerequisite and offer the closest valid action.
- For nomination, the current explanatory screen may be opened and its requirements revealed; the assistant must not claim that a nomination was saved until a persisted nomination workflow exists.

## Failure Handling

- Invalid tool name or arguments: reject locally and return a safe structured error to the model.
- Stale route or snapshot: refresh context and require the model to retry once against the new state.
- Navigation failure: remain on the current screen and explain that the destination could not be opened.
- Missing semantic target: report that the control is unavailable on the current screen; never guess a selector.
- Mutation API failure: keep the proposal visible with an error and make no success claim.
- Realtime disconnection: preserve any pending confirmation in the shared assistant UI and allow completion through text chat.
- Authentication loss: stop action execution and direct the member to sign in again.

## Security and Privacy

- The API key remains server-only.
- Tool schemas contain semantic names and masked identifiers only.
- Every server mutation re-authenticates the demo run and validates the command independently of the model.
- Client validation improves UX but is not treated as authorization.
- Action results contain the minimum masked state needed for the next response.
- Actions and confirmation decisions are recorded in the isolated demo run for replay and debugging, then discarded with the run.

## Scope

### Included

- Agentic navigation across all main member-facing routes.
- Semantic opening, scrolling, and focusing on priority screens.
- Workflow entry for profile, nomination guidance, employment, contributions, claims, transfers, and services.
- Confirmation-gated execution for existing demo commands that already have validated APIs.
- Shared behavior for Realtime voice and text chat.

### Not included

- Creating new portal workflows solely to satisfy an assistant request.
- Arbitrary browser or computer-use automation.
- External EPFO, Aadhaar, UMANG, employer, or bank integration.
- Autonomous multi-step submission without per-action confirmation.
- Real document uploads or sensitive member data.

## Testing

- Unit-test every action schema, route/state policy, and result type.
- Test that read-only commands execute immediately and mutations never do.
- Test one-pending-proposal behavior, explicit confirmation, cancellation, and ambiguous voice responses.
- Test Realtime function-call parsing, `function_call_output`, and follow-up `response.create` events.
- Test navigation persistence and refreshed screen context across the active voice session.
- Test that unavailable targets and unsupported workflows produce honest explanations.
- Test that malformed, stale, or invented tool calls cannot navigate or mutate state.
- Run focused integration checks for profile navigation, nomination guidance, employment exit, contribution simulation, and claim submission boundaries.

## Acceptance Criteria

- “Open my profile” navigates to Profile during the active voice session and the assistant acknowledges the actual destination.
- “Show me where to correct my name” opens or focuses the Basic details entry point without changing member data.
- “Help me add a nomination” opens Nomination and reveals the available requirements without claiming a save that the portal does not support.
- Every supported state change displays one exact proposal and requires explicit confirmation before its existing API is called.
- A cancelled or ambiguous proposal performs no mutation.
- The model cannot invoke an unknown route, target, selector, or API endpoint.
- Voice and text use the same action rules and return consistent results.
- Context refresh after an action prevents the assistant from describing the pre-action screen or stale member state.
