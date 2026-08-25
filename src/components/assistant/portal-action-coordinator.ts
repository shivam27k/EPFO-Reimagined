import {
  describePortalAction,
  destinationRoutes,
  workflowRoutes,
  type PortalAction,
  type PortalActionResult,
} from "@/domain/portal-actions";

export type PendingPortalAction = Extract<PortalAction, { name: "propose_demo_action" }>;

type CoordinatorDependencies = {
  pathname: string;
  navigate: (route: string) => void;
  refresh: () => void;
  pendingAction: PendingPortalAction | null;
  setPendingAction: (action: PendingPortalAction | null) => void;
  employmentId?: string;
  request?: typeof fetch;
};

const QUEUED_TARGET_KEY = "epf-sahayak:queued-target";

function revealTarget(target: string): boolean {
  const element = document.querySelector<HTMLElement>(`[data-assistant-target="${target}"]`);
  if (!element) return false;
  const disclosure = element.matches("details") ? element as HTMLDetailsElement : element.closest("details");
  if (disclosure) disclosure.open = true;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = element.matches("button,a,input,select,textarea,summary,[tabindex]")
    ? element
    : element.querySelector<HTMLElement>("button,a,input,select,textarea,summary,[tabindex]");
  focusable?.focus({ preventScroll: true });
  return true;
}

export function consumeQueuedPortalTarget(): boolean {
  const target = sessionStorage.getItem(QUEUED_TARGET_KEY);
  if (!target) return false;
  if (!revealTarget(target)) return false;
  sessionStorage.removeItem(QUEUED_TARGET_KEY);
  return true;
}

const demoRequests: Record<string, { url: string; method: "POST" | "PATCH"; body: Record<string, string> }> = {
  simulate_bank_correction: { url: "/api/scenarios/bank", method: "POST", body: { command: "SIMULATE_BANK_CORRECTION" } },
  load_missing_contribution: { url: "/api/scenarios/contributions", method: "POST", body: { command: "LOAD_MISSING_CONTRIBUTION" } },
  simulate_ecr_posting: { url: "/api/scenarios/contributions", method: "POST", body: { command: "SIMULATE_ECR_POSTING" } },
  simulate_two_month_wait: { url: "/api/claims", method: "PATCH", body: { command: "SIMULATE_TWO_MONTH_WAIT" } },
  simulate_cryptic_claim_status: { url: "/api/claims", method: "PATCH", body: { command: "SIMULATE_CRYPTIC_STATUS" } },
  simulate_epfo_approval: { url: "/api/claims", method: "PATCH", body: { command: "SIMULATE_EPFO_APPROVAL" } },
  simulate_payment_returned: { url: "/api/claims", method: "PATCH", body: { command: "SIMULATE_PAYMENT_RETURNED" } },
  simulate_bank_payment: { url: "/api/claims", method: "PATCH", body: { command: "SIMULATE_BANK_PAYMENT" } },
};

export async function executePortalAction(action: PortalAction, deps: CoordinatorDependencies): Promise<PortalActionResult> {
  if (action.name === "navigate_to") {
    const route = destinationRoutes[action.arguments.destination];
    deps.navigate(route);
    return { status: "completed", message: `Opened ${action.arguments.destination}.`, route };
  }
  if (action.name === "start_workflow") {
    const destination = workflowRoutes[action.arguments.workflow];
    if (destination.target && destination.route === deps.pathname) {
      if (!revealTarget(destination.target)) return { status: "unavailable", message: "That workflow control is not available on this screen." };
    } else {
      if (destination.target) sessionStorage.setItem(QUEUED_TARGET_KEY, destination.target);
      deps.navigate(destination.route);
    }
    return { status: "completed", message: `Opened ${action.arguments.workflow.replaceAll("_", " ")}.`, route: destination.route, target: destination.target };
  }
  if (action.name === "reveal_section" || action.name === "focus_control") {
    const completed = revealTarget(action.arguments.target);
    return completed
      ? { status: "completed", message: `Showing ${action.arguments.target.replaceAll(".", " ")}.`, target: action.arguments.target }
      : { status: "unavailable", message: "That control is not available on the current screen." };
  }
  if (action.name === "propose_demo_action") {
    if (deps.pendingAction) return { status: "confirmation_required", message: "Please confirm or cancel the current pending action first." };
    deps.setPendingAction(action);
    return { status: "confirmation_required", message: `${describePortalAction(action)} is ready. Ask the member to confirm or cancel.` };
  }
  if (action.name === "cancel_pending_action") {
    if (!deps.pendingAction) return { status: "unavailable", message: "There is no pending action to cancel." };
    deps.setPendingAction(null);
    return { status: "cancelled", message: "Cancelled. Nothing changed." };
  }
  if (!deps.pendingAction) return { status: "unavailable", message: "There is no pending action to confirm." };

  const pendingName = deps.pendingAction.arguments.action;
  let request = demoRequests[pendingName];
  if (pendingName === "simulate_employer_exit_date") {
    if (!deps.employmentId) return { status: "unavailable", message: "No employment record is available for this action." };
    request = { url: "/api/scenarios/employment", method: "POST", body: { command: "SIMULATE_EMPLOYER_EXIT_DATE", employmentId: deps.employmentId } };
  }
  if (!request) return { status: "unavailable", message: "That demo action is not available." };
  try {
    const response = await (deps.request ?? fetch)(request.url, {
      method: request.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return { status: "failed", message: body.error || "The confirmed action could not be completed." };
    deps.setPendingAction(null);
    deps.refresh();
    return { status: "completed", message: "Confirmed action completed. The page data has been refreshed." };
  } catch {
    return { status: "failed", message: "The confirmed action could not be completed." };
  }
}
