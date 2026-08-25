# Docked Assistant Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating assistant and voice HUD with one persistent, collapsible right workspace that also supports full-screen mode without losing state across portal navigation.

**Architecture:** `PortalUtilities` owns a three-state assistant workspace (`collapsed`, `docked`, `fullscreen`) and remains mounted in the shared portal layout. `AssistantPanel` renders one continuous text, voice, attachment, and action surface; CSS turns that surface into a desktop grid column or viewport-level full-screen panel. Page navigation refreshes pathname and masked context without resetting local assistant state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Grid, Vitest, Testing Library, existing OpenAI Realtime integration.

**Spec:** `docs/superpowers/specs/2026-08-26-docked-assistant-workspace-design.md`

## Global Constraints

- Desktop supports exactly `collapsed`, `docked`, and `fullscreen` assistant views.
- Docked mode reflows the center page and never overlays it.
- Below 861px, an open assistant occupies the viewport.
- Route changes preserve conversation, voice, attachments, question progress, and pending actions.
- The latest route and rendered screen context remain authoritative.
- Existing synthetic-data and explicit-confirmation boundaries remain unchanged.
- Full-screen is modal; docked mode is non-modal.

---

### Task 1: Persistent workspace state

**Files:**
- Create: `src/components/assistant/assistant-workspace-state.ts`
- Create: `src/components/assistant/assistant-workspace-state.test.ts`
- Modify: `src/components/portal/portal-utilities.tsx`
- Modify: `src/components/portal/portal-utilities.test.tsx`

**Interfaces:**
- Produces `AssistantWorkspaceView = "collapsed" | "docked" | "fullscreen"`.
- Produces `readAssistantWorkspaceView()` and `persistAssistantWorkspaceView(view)`.
- Passes `view` and `onViewChange` to `AssistantPanel`.
- Keeps the last valid refreshed snapshot and exposes refresh failure as a stale-context flag.

- [ ] **Step 1: Write the failing state tests**

```ts
test("defaults to collapsed and restores docked", () => {
  expect(readAssistantWorkspaceView({ getItem: () => null })).toBe("collapsed");
  expect(readAssistantWorkspaceView({ getItem: () => "docked" })).toBe("docked");
});

test("persists fullscreen as docked", () => {
  let saved = "";
  persistAssistantWorkspaceView("fullscreen", { setItem: (_key, value) => { saved = value; } });
  expect(saved).toBe("docked");
});
```

- [ ] **Step 2: Verify RED**

Run: `bun run test --run src/components/assistant/assistant-workspace-state.test.ts`

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the state helper**

```ts
export type AssistantWorkspaceView = "collapsed" | "docked" | "fullscreen";
const KEY = "epf-sahayak:workspace-view";

export function readAssistantWorkspaceView(storage = window.sessionStorage): AssistantWorkspaceView {
  return storage.getItem(KEY) === "docked" ? "docked" : "collapsed";
}

export function persistAssistantWorkspaceView(view: AssistantWorkspaceView, storage = window.sessionStorage): void {
  storage.setItem(KEY, view === "collapsed" ? "collapsed" : "docked");
}
```

- [ ] **Step 4: Write failing `PortalUtilities` tests**

Assert opening the assistant produces `data-assistant-view="docked"`; rerendering after a pathname change keeps it docked; maximizing produces `fullscreen`; collapsing produces `collapsed`. Also assert journey and scenario drawers still close on route changes, and a failed snapshot refresh retains the prior snapshot while marking context stale.

- [ ] **Step 5: Refactor `PortalUtilities`**

Separate modal utility state (`journey | scenarios | null`) from assistant view state. Route changes may clear the modal utility but must never clear assistant view. Hydrate and persist the assistant view with the helper, add `data-assistant-view` to `.portal-utilities`, and pass the controlled view plus `contextStale` to `AssistantPanel`. On refresh failure, retain `utilitySnapshot` and set `contextStale=true`; clear it only after a successful refresh.

- [ ] **Step 6: Verify GREEN**

Run: `bun run test --run src/components/assistant/assistant-workspace-state.test.ts src/components/portal/portal-utilities.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

Run: `git add src/components/assistant/assistant-workspace-state.ts src/components/assistant/assistant-workspace-state.test.ts src/components/portal/portal-utilities.tsx src/components/portal/portal-utilities.test.tsx && git commit -m "feat: persist assistant workspace view"`

---

### Task 2: Docked and full-screen shell

**Files:**
- Modify: `src/components/assistant/assistant-panel.tsx`
- Modify: `src/components/assistant/assistant-panel.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes `AssistantWorkspaceView` from Task 1.
- `AssistantPanel` accepts `view` and `onViewChange` instead of floating-dialog open callbacks.
- Exposes accessible Collapse, Open full screen, and Exit full screen controls.
- Displays the current page name and a stale-context notice in its context strip.

- [ ] **Step 1: Write failing panel-view tests**

```tsx
expect(workspace).toHaveAttribute("data-view", "docked");
fireEvent.click(screen.getByRole("button", { name: "Open EPF Sahayak full screen" }));
expect(onViewChange).toHaveBeenCalledWith("fullscreen");
fireEvent.click(screen.getByRole("button", { name: "Collapse EPF Sahayak" }));
expect(onViewChange).toHaveBeenCalledWith("collapsed");
```

Rerender from docked to full screen and assert the same conversation node remains mounted.

- [ ] **Step 2: Verify RED**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx`

Expected: FAIL because the workspace API does not exist.

- [ ] **Step 3: Implement the unified workspace shell**

Render a collapsed labelled edge control or one persistent workspace:

```tsx
<section
  aria-label="EPF Sahayak workspace"
  aria-modal={view === "fullscreen" ? true : undefined}
  className="assistant-workspace"
  data-view={view}
  role={view === "fullscreen" ? "dialog" : "complementary"}
>
```

Add header controls using `Maximize2`, `Minimize2`, and `PanelRightClose`. Add a compact route-derived current-page label and masked-context strip; when `contextStale` is true, say `Context refresh failed; showing the last verified demo record.` Escape exits full screen to docked. Focus containment applies only in full screen.

- [ ] **Step 4: Implement grid and full-screen CSS**

```css
.portal-layout:has(.portal-utilities[data-assistant-view="docked"]) {
  grid-template-columns: 256px minmax(0, 1fr) minmax(360px, 420px);
}
.portal-utilities { display: contents; }
.assistant-workspace[data-view="docked"] {
  position: sticky; top: 0; grid-column: 3; grid-row: 1; height: 100vh;
}
.assistant-workspace[data-view="fullscreen"] {
  position: fixed; z-index: 130; inset: 0; width: 100vw; height: 100dvh;
}
```

Remove desktop floating launcher/panel rules. Give the workspace an internal scrolling conversation region and a stationary composer.

- [ ] **Step 5: Verify GREEN**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx src/components/portal/portal-utilities.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/components/assistant/assistant-panel.tsx src/components/assistant/assistant-panel.test.tsx src/app/globals.css && git commit -m "feat: dock and maximize assistant workspace"`

---

### Task 3: Inline voice experience

**Files:**
- Modify: `src/components/assistant/assistant-voice-control.tsx`
- Modify: `src/components/assistant/assistant-voice-control.test.tsx`
- Modify: `src/components/assistant/assistant-panel.tsx`
- Modify: `src/components/assistant/assistant-panel.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- `AssistantVoiceControl` retains its existing Realtime props and tool callbacks.
- It renders inside `.assistant-workspace-body` and never uses viewport positioning.
- Ending voice returns to text without collapsing the workspace.

- [ ] **Step 1: Write failing integration tests**

Assert starting voice keeps `EPF Sahayak workspace` visible, places `EPF Sahayak voice mode` inside it, leaves the composer reachable, and renders no voice control outside it. Rerender with a new pathname and assert the same voice region receives the new route.

- [ ] **Step 2: Verify RED**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx src/components/assistant/assistant-voice-control.test.tsx`

Expected: FAIL because voice currently replaces the panel and floats separately.

- [ ] **Step 3: Integrate voice**

`startVoice()` sets voice active without changing workspace view. Render `AssistantVoiceControl` inside the workspace above the thread. Keep caption handoff, pending confirmations, Stop playback, Retry, and End voice actions. `onExit` changes only voice state.

Realtime connection and tool failures render inside the same workspace. A completed navigation while full screen adds an `Exit full screen to view page` button that calls `onViewChange("docked")`; failed tools render their returned failure message and never display success copy.

- [ ] **Step 4: Restyle voice inline**

Remove fixed positioning, right/bottom coordinates, fixed width, and floating corner treatment. Use full workspace width, a compact microphone/status row, and the existing auto-scrolling caption area.

- [ ] **Step 5: Verify GREEN**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx src/components/assistant/assistant-voice-control.test.tsx src/server/assistant/realtime.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/components/assistant/assistant-voice-control.tsx src/components/assistant/assistant-voice-control.test.tsx src/components/assistant/assistant-panel.tsx src/components/assistant/assistant-panel.test.tsx src/app/globals.css && git commit -m "feat: integrate voice into assistant workspace"`

---

### Task 4: Persistent composer and attachments

**Files:**
- Modify: `src/components/assistant/assistant-panel.tsx`
- Modify: `src/components/assistant/assistant-panel.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Composer always exposes Attach synthetic document, Talk, and Send.
- Existing `/api/assistant/extract` and `/api/assistant/form-patch` contracts remain unchanged.
- Onboarding permits reviewed proposal application; other routes permit review but not applying values to a form.

- [ ] **Step 1: Write failing attachment tests**

On `/claims`, assert the attachment button exists. Open it, rerender on `/profile`, and assert attachment state remains. Assert non-onboarding routes do not offer Apply. On `/onboarding`, retain review-and-apply controls.

- [ ] **Step 2: Verify RED**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx`

Expected: FAIL because attachment UI is currently onboarding-only.

- [ ] **Step 3: Move attachment access into the composer**

Add a paperclip button that toggles the existing document section on every route. Keep `applyPatch()` enabled only on onboarding; elsewhere show: `I can review this synthetic document here. Open new-member setup before applying extracted values to a form.`

- [ ] **Step 4: Preserve state across routes**

Do not clear `documentKind`, `proposals`, `extractionMessage`, `syntheticAccepted`, or expanded state on pathname changes. Clear only on successful apply, explicit cancel, unmount/logout, or demo reset.

- [ ] **Step 5: Verify GREEN**

Run: `bun run test --run src/components/assistant/assistant-panel.test.tsx src/app/api/assistant/extract/route.test.ts src/app/api/assistant/form-patch/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/components/assistant/assistant-panel.tsx src/components/assistant/assistant-panel.test.tsx src/app/globals.css && git commit -m "feat: add persistent assistant attachments"`

---

### Task 5: Responsive and regression verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/portal/portal-utilities.test.tsx`
- Modify: `src/components/assistant/assistant-panel.test.tsx`
- Create: `tests/assistant-workspace.spec.ts`

**Interfaces:**
- At 860px and below, every open assistant view occupies the viewport above the page.
- Reduced-motion preference disables workspace transitions.

- [ ] **Step 1: Write failing accessibility and responsive tests**

Assert role `complementary` in docked mode, role `dialog` plus `aria-modal` in full screen, Escape restoration to docked, labelled 44px controls, full-screen navigation exit action, stale-context notice, and actual tool-result failure text. Add a Playwright scenario that opens the assistant, navigates Overview to Profile, and verifies the workspace and prior conversation remain visible.

- [ ] **Step 2: Complete responsive CSS**

At `max-width: 860px`, retain the existing one-column portal and fix every open assistant view to `inset: 0`. Keep the composer above safe-area padding and mobile navigation. Under `prefers-reduced-motion: reduce`, remove workspace transitions.

- [ ] **Step 3: Run related tests**

Run: `bun run test --run src/components/assistant src/components/portal/portal-utilities.test.tsx src/server/assistant src/app/api/assistant`

Expected: all selected tests pass with zero failures.

- [ ] **Step 4: Run lint and production build**

Run: `bunx eslint src/components/assistant src/components/portal/portal-utilities.tsx src/components/portal/portal-utilities.test.tsx`

Run: `bun run build`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 5: Perform browser verification**

At desktop width, verify reflow, non-modal docked interaction, full-screen entry/exit, internal scrolling, and persistent state after navigation. At mobile width, verify viewport coverage, reachable composer, internal scrolling, and no mobile-navigation overlap.

- [ ] **Step 6: Commit**

Run: `git add src/app/globals.css src/components/portal/portal-utilities.test.tsx src/components/assistant/assistant-panel.test.tsx tests/assistant-workspace.spec.ts && git commit -m "test: verify persistent assistant workspace"`
