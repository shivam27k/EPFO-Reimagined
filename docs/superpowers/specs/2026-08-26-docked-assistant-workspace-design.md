# Docked Assistant Workspace Design

## Goal

Replace the floating assistant and separate voice HUD with a persistent VS Code-style assistant workspace on the right side of the member portal. The assistant must remain usable while the member reads and navigates the portal, preserve its state across page changes, and support collapsed, docked, and full-screen views.

## User experience

### Desktop

The portal has three visual regions:

1. The existing member navigation on the left.
2. The current portal page in the center.
3. A collapsible EPF Sahayak workspace on the right.

The assistant starts collapsed as a narrow labelled edge control. Opening it docks a 420px workspace beside the page; the portal content reflows into the remaining width and is never covered. The workspace header provides Collapse and Full screen controls. Full screen expands the same assistant instance over the viewport. Exiting full screen returns it to its previous docked state without clearing conversation, voice, attachments, or pending confirmations.

### Mobile and narrow screens

Docked mode is not used below the desktop breakpoint. Opening the assistant presents a full-screen workspace above the mobile navigation. Closing it returns to the current page. The same state is retained.

## Workspace structure

The workspace is one continuous surface rather than separate text and voice widgets:

- Header: EPF Sahayak identity, current-page label, connection/voice status, Collapse, and Full screen controls.
- Context strip: a concise statement of which portal page and masked demo record the assistant is currently using.
- Conversation: persistent member and assistant messages, proactive guidance, tool results, and confirmation cards.
- Attachment area: synthetic-document selection, disclosure, extraction progress, and review proposals. It remains inside the workspace instead of expanding the page.
- Composer: Attach, text input, microphone, and Send controls in one row.
- Voice state: listening, thinking, speaking, retry, and stop controls render inside the conversation workspace. Voice captions become ordinary conversation entries rather than appearing in a separate floating HUD.

Only synthetic documents are accepted. Existing route-aware document extraction and explicit review-before-apply boundaries remain in force. Unsupported document workflows show a clear explanation and do not pretend to have filled a form.

## State and navigation

`PortalUtilities` remains mounted by the shared portal layout and owns the assistant view state. Assistant state includes:

- view: collapsed, docked, or full screen;
- whether voice mode is active;
- local conversation entries not yet reloaded from persistence;
- current attachment/extraction proposals;
- question-guidance position;
- pending allowlisted portal action.

Route changes must not close or remount the assistant. Journey and demo-scenario drawers may continue to close on navigation. The assistant receives the new pathname, refreshed member snapshot, and newly captured visible-screen context after navigation, while retaining the ongoing conversation.

The open/collapsed preference is stored in session storage so a page reload in the same demo session restores the workspace layout. Full-screen is intentionally transient and restores as docked after a reload.

## Layout implementation

The desktop portal grid gains an optional right column when the assistant is docked. The center stage uses `minmax(0, 1fr)` and the assistant uses a bounded width so horizontal overflow is not introduced. The right workspace uses the viewport height and its conversation region owns internal scrolling.

Full-screen mode uses a viewport-level layer with no backdrop-dependent interaction with the portal beneath it. Focus is contained while full-screen is active, Escape exits full-screen first, and a second close action collapses the workspace. Docked mode is non-modal: members can interact with both the portal and assistant.

The existing journey and demo-scenario edge tabs remain separate. When one of those modal drawers opens, the docked assistant stays in place but is non-interactive behind the drawer. No floating assistant button or floating voice card remains on desktop.

## Agent actions and feedback

Existing allowlisted tools remain unchanged in authority. Navigation, scrolling, section reveal, focus, workflow entry, and confirmed demo actions display compact result entries in the conversation. The assistant must use the tool result as the source of truth and cannot announce success from its own inference.

When the assistant navigates, the docked or full-screen workspace stays open. This lets the member watch both the action and its explanation. Full-screen mode may temporarily hide the page, so successful navigation displays an `Exit full screen to view page` action.

## Accessibility

- Docked mode is a complementary region, not a modal dialog.
- Full-screen and mobile modes are dialogs with focus containment.
- Every icon control has an accessible name and a minimum 44px target.
- Voice state and tool results use restrained live-region announcements.
- Keyboard users can collapse, expand, attach, speak, submit, and review actions.
- Reduced-motion preferences disable workspace and full-screen transitions.

## Error handling

- Realtime connection errors stay inside the workspace and preserve typed chat access.
- Attachment errors remain beside the affected attachment.
- Failed tool calls render the actual failure message and do not close or navigate the workspace.
- If a route refresh cannot update the snapshot, the last valid masked snapshot remains visible with a stale-context notice.

## Verification

Automated coverage must verify:

- opening, collapsing, docking, full-screen entry, and full-screen exit;
- assistant state survives client-side route navigation;
- route changes refresh screen context without clearing messages;
- docked mode does not overlay or horizontally overflow portal content;
- mobile uses full-screen mode;
- voice controls and captions remain inside the workspace;
- attachment proposal state survives page navigation;
- existing tool confirmation and page-action tests continue to pass;
- keyboard focus and Escape behavior differ correctly between docked and full-screen modes.

A production build and targeted responsive browser review are required before completion.
