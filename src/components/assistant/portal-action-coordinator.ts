import { uiDestination, type UiObservation, type UiRequest } from "@/domain/assistant-ui";

export type BrowserActionState = {
  pathname: string; modal: boolean; voiceActive: boolean;
  utilityPanel: "journey" | "demo" | null; documentOpen: boolean;
};
type Dependencies = {
  current: () => BrowserActionState;
  navigate: (route: string) => void;
  openUtility: (panel: "journey" | "demo") => boolean;
  openDocument: () => void;
  signal: AbortSignal;
};
function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  const bounds = element.getBoundingClientRect();
  return element.getClientRects().length > 0 && bounds.width > 0 && bounds.height > 0;
}
function inViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}
function frame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 50);
    signal.addEventListener("abort", abort, { once: true });
  });
}
const scrollTop = () => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);

/** Only server-issued allowlisted requests enter here. Completion is observed,
 * not inferred from router.push/setState. There is no mutation coordinator. */
export async function executePortalAction(request: UiRequest, deps: Dependencies): Promise<UiObservation> {
  const action = request.action;
  const expected = uiDestination(action);
  const deadline = Math.min(Date.parse(request.expiresAt), Date.now() + 8_000);
  const initial = deps.current();
  const blocked = (): UiObservation => ({ status: "unavailable", reason: "focus_blocked" });
  if (deps.signal.aborted) return { status: "cancelled", reason: "cancelled" };
  if (Date.now() >= deadline) return { status: "failed", reason: "timeout" };
  // Utility drawers make the assistant inert. Never put active voice controls
  // behind them, or open them beneath the mobile assistant focus trap.
  if (action.name === "open_utility_panel" && (initial.voiceActive || initial.modal)) return blocked();
  if (action.name === "open_document_review" && initial.voiceActive) return blocked();
  if ((action.name === "focus_control" || action.name === "reveal_section" ||
      action.name === "scroll_page" || expected.target) && (initial.modal || initial.utilityPanel)) return blocked();
  if (action.name === "open_utility_panel" && !deps.openUtility(action.arguments.panel)) return blocked();
  if (action.name === "open_document_review") deps.openDocument();
  if (expected.route && initial.pathname !== expected.route) deps.navigate(expected.route);
  let target: HTMLElement | null = null;
  let expectedScrollTop: number | undefined;
  if (action.name === "scroll_page") {
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const destination = action.arguments.destination;
    expectedScrollTop = destination === "top" ? 0 : destination === "bottom" ? maximum
      : destination === "up" ? Math.max(0, scrollTop() - window.innerHeight * 0.8)
      : Math.min(maximum, scrollTop() + window.innerHeight * 0.8);
    window.scrollTo({ top: expectedScrollTop, left: 0, behavior: "instant" });
  }
  try {
    while (Date.now() < deadline) {
      if (deps.signal.aborted) return { status: "cancelled", reason: "cancelled" };
      const current = deps.current();
      const routeReady = !expected.route || (current.pathname === expected.route &&
        window.location.pathname === expected.route && !!document.getElementById("portal-content"));
      if (routeReady && expected.target) {
        // The target originates in the domain enum, never an arbitrary selector.
        target = document.querySelector<HTMLElement>('[data-assistant-target="' + expected.target + '"]');
        const disclosure = target?.matches("details") ? target as HTMLDetailsElement : target?.closest("details");
        if (disclosure) disclosure.open = true;
        if (visible(target)) {
          target.scrollIntoView({ behavior: "instant", block: "center" });
          if (action.name === "focus_control") {
            const focusable = target.matches("button,a,input,select,textarea,summary,[tabindex]") ? target
              : target.querySelector<HTMLElement>("button:not([disabled]),a,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]");
            if (visible(focusable)) focusable.focus({ preventScroll: true });
          }
          const focused = target === document.activeElement || target.contains(document.activeElement);
          if (inViewport(target) && (action.name !== "focus_control" || focused)) {
            return { status: "completed", route: current.pathname, target: expected.target, focused };
          }
        }
      } else if (routeReady && action.name === "open_utility_panel") {
        const panel = action.arguments.panel;
        const element = document.getElementById(panel === "journey" ? "journey-utility-panel" : "scenario-utility-panel");
        if (current.utilityPanel === panel && visible(element) && element.getAttribute("aria-hidden") !== "true") {
          return { status: "completed", panel, route: current.pathname };
        }
      } else if (routeReady && action.name === "open_document_review") {
        const element = document.getElementById("assistant-document-review");
        if (current.documentOpen && visible(element)) {
          // Keep the active voice control in view; do not move focus or the scroll
          // container away from it just to expose the review form.
          element.scrollIntoView({ behavior: "instant", block: "nearest" });
          if (inViewport(element)) return { status: "completed", panel: "document", route: current.pathname };
        }
      } else if (routeReady && expectedScrollTop !== undefined) {
        if (Math.abs(scrollTop() - expectedScrollTop) <= 2) {
          return { status: "completed", route: current.pathname, scrollTop: scrollTop(), expectedScrollTop };
        }
      } else if (routeReady && document.getElementById("portal-content")) return { status: "completed", route: current.pathname };
      await frame(deps.signal);
    }
    return { status: "failed", reason: expected.target && !target ? "missing_target" : "timeout" };
  } catch {
    return { status: deps.signal.aborted ? "cancelled" : "failed", reason: deps.signal.aborted ? "cancelled" : "timeout" };
  }
}
