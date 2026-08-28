"use client";

import { FlaskConical, MapPinned, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import {
  persistAssistantWorkspaceView,
  readAssistantWorkspaceView,
  readServerAssistantWorkspaceView,
  subscribeAssistantWorkspaceView,
  type AssistantWorkspaceView,
} from "@/components/assistant/assistant-workspace-state";
import { ScenarioDrawer } from "@/components/demo/scenario-drawer";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import { JourneyCard } from "./journey-card";

type ActiveUtility = "journey" | "scenarios";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const responsiveAssistantQuery = "(max-width: 860px)";

function subscribeToResponsiveAssistant(listener: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia(responsiveAssistantQuery);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}

function readResponsiveAssistant() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(responsiveAssistantQuery).matches;
}

function readServerResponsiveAssistant() {
  return false;
}

export function PortalUtilities({ snapshot, assistantWelcomeKey }: { snapshot: MemberSnapshot; assistantWelcomeKey?: string }) {
  const pathname = usePathname();
  const [utilityState, setUtilityState] = useState<{ pathname: string; active: ActiveUtility | null }>({
    pathname,
    active: null,
  });
  const persistedAssistantView = useSyncExternalStore(
    subscribeAssistantWorkspaceView,
    readAssistantWorkspaceView,
    readServerAssistantWorkspaceView,
  );
  const [assistantViewOverride, setAssistantViewOverride] = useState<AssistantWorkspaceView | null>(null);
  const assistantView = assistantViewOverride ?? persistedAssistantView;
  const [voiceActive, setVoiceActive] = useState(false);
  const responsiveAssistant = useSyncExternalStore(
    subscribeToResponsiveAssistant,
    readResponsiveAssistant,
    readServerResponsiveAssistant,
  );
  const [refreshedContext, setRefreshedContext] = useState<{
    pathname: string;
    source: MemberSnapshot;
    snapshot: MemberSnapshot;
    stale: boolean;
  } | null>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const refreshGeneration = useRef(0);
  const previousPathname = useRef(pathname);
  const active = utilityState.pathname === pathname ? utilityState.active : null;
  const currentContext = refreshedContext?.pathname === pathname && refreshedContext.source === snapshot
    ? refreshedContext
    : { pathname, source: snapshot, snapshot, stale: false };
  const utilitySnapshot = currentContext.snapshot;
  const contextStale = currentContext.stale;
  const responsiveAssistantModal = responsiveAssistant && assistantView !== "collapsed";
  const assistantModal = responsiveAssistantModal;

  useEffect(() => {
    const background = Array.from(document.querySelectorAll<HTMLElement>(
      ".portal-sidebar, .portal-stage, .mobile-navigation",
    ));
    const rail = document.querySelector<HTMLElement>(".utility-edge-rail");
    const backdrop = document.querySelector<HTMLElement>(".utility-backdrop");
    const assistant = document.querySelector<HTMLElement>(".assistant-area");
    const drawers = Array.from(document.querySelectorAll<HTMLElement>(".utility-drawer"));
    const portalBlocked = assistantModal || active !== null;

    background.forEach((element) => { element.inert = portalBlocked; });
    if (rail) rail.inert = portalBlocked;
    if (backdrop) backdrop.inert = assistantModal;
    if (assistant) assistant.inert = active !== null && !assistantModal;
    drawers.forEach((drawer) => {
      const drawerIsActive = active !== null && drawer.dataset.utilityPanel === active;
      drawer.inert = assistantModal || !drawerIsActive;
    });

    return () => {
      background.forEach((element) => { element.inert = false; });
      if (rail) rail.inert = false;
      if (backdrop) backdrop.inert = false;
      if (assistant) assistant.inert = false;
      drawers.forEach((drawer) => { drawer.inert = false; });
    };
  }, [active, assistantModal]);

  useEffect(() => {
    if (!active || assistantModal) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setUtilityState({ pathname, active: null });
        return;
      }
      if (event.key !== "Tab") return;

      const panel = document.querySelector<HTMLElement>(`[data-utility-panel="${active}"]`);
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !panel.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !panel.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, assistantModal, pathname]);

  useEffect(() => {
    if (assistantModal) return;
    if (!active) {
      lastTrigger.current?.focus();
      return;
    }

    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-utility-panel="${active}"] [data-utility-close]`)
        ?.focus();
    });
  }, [active, assistantModal]);

  const refreshUtilitySnapshot = useCallback(async () => {
    const controller = new AbortController();
    const generation = ++refreshGeneration.current;
    refreshController.current?.abort();
    refreshController.current = controller;

    try {
      const response = await fetch("/api/member/snapshot", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted || generation !== refreshGeneration.current) return false;
      if (!response.ok) {
        setRefreshedContext((current) => ({
          pathname,
          source: snapshot,
          snapshot: current?.pathname === pathname && current.source === snapshot ? current.snapshot : snapshot,
          stale: true,
        }));
        return false;
      }
      const refreshedSnapshot = await response.json() as MemberSnapshot;
      if (controller.signal.aborted || generation !== refreshGeneration.current) return false;
      setRefreshedContext({ pathname, source: snapshot, snapshot: refreshedSnapshot, stale: false });
      return true;
    } catch {
      if (!controller.signal.aborted && generation === refreshGeneration.current) {
        setRefreshedContext((current) => ({
          pathname,
          source: snapshot,
          snapshot: current?.pathname === pathname && current.source === snapshot ? current.snapshot : snapshot,
          stale: true,
        }));
      }
      return false;
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [pathname, snapshot]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    void refreshUtilitySnapshot();
  }, [pathname, refreshUtilitySnapshot]);

  useEffect(() => () => {
    refreshGeneration.current += 1;
    refreshController.current?.abort();
  }, []);

  function toggle(next: ActiveUtility, trigger?: HTMLButtonElement) {
    if (trigger) lastTrigger.current = trigger;
    if (active !== next) void refreshUtilitySnapshot();
    setUtilityState((current) => {
      const currentActive = current.pathname === pathname ? current.active : null;
      return { pathname, active: currentActive === next ? null : next };
    });
  }

  function closeAll() {
    setUtilityState({ pathname, active: null });
  }

  function openAssistantUtility(panel: "journey" | "demo") {
    if (voiceActive || assistantModal) return false;
    const next: ActiveUtility = panel === "demo" ? "scenarios" : "journey";
    setUtilityState({ pathname, active: next });
    void refreshUtilitySnapshot();
    return true;
  }

  function changeAssistantView(view: AssistantWorkspaceView) {
    if (view === "docked" && assistantView === "collapsed") void refreshUtilitySnapshot();
    setAssistantViewOverride(view);
    persistAssistantWorkspaceView(view);
  }

  return (
    <div
      className="portal-utilities"
      data-active={active ?? "none"}
      data-assistant-view={assistantView}
      data-voice-active={voiceActive}
    >
      {active ? (
        <button
          aria-label="Close open utility panel"
          className="utility-backdrop"
          onClick={closeAll}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      <aside
        aria-hidden={active !== "journey"}
        aria-label="Your EPF journey"
        aria-modal={active === "journey" ? true : undefined}
        className="utility-drawer journey-utility-drawer"
        data-open={active === "journey"}
        data-utility-panel="journey"
        id="journey-utility-panel"
        inert={active !== "journey" ? true : undefined}
        role="dialog"
        tabIndex={-1}
      >
        <header className="utility-drawer-header">
          <div>
            <span className="utility-label">Your EPF journey</span>
            <h2>Know where you are</h2>
          </div>
          <button
            aria-label="Close EPF journey"
            className="icon-action"
            data-utility-close
            onClick={closeAll}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="utility-drawer-scroll">
          <JourneyCard onNavigate={closeAll} snapshot={utilitySnapshot} />
        </div>
      </aside>

      <ScenarioDrawer
        onClose={closeAll}
        open={active === "scenarios"}
        snapshot={utilitySnapshot}
      />

      <div className="assistant-dock">
        <AssistantPanel
          welcomeKey={assistantWelcomeKey}
          contextStale={contextStale}
          utilityPanel={active === "scenarios" ? "demo" : active}
          onOpenUtility={openAssistantUtility}
          onRefreshContext={refreshUtilitySnapshot}
          modal={responsiveAssistantModal}
          onViewChange={changeAssistantView}
          onVoiceActiveChange={setVoiceActive}
          snapshot={utilitySnapshot}
          suppressPrompt={active !== null}
          view={assistantView}
        />

        <nav className="utility-edge-rail" aria-label="Page utilities">
          <button
            aria-controls="journey-utility-panel"
            aria-expanded={active === "journey"}
            className="utility-edge-tab"
            data-selected={active === "journey"}
            onClick={(event) => toggle("journey", event.currentTarget)}
            type="button"
          >
            <MapPinned aria-hidden="true" size={18} />
            <span>Your EPF journey</span>
          </button>
          <button
            aria-controls="scenario-utility-panel"
            aria-expanded={active === "scenarios"}
            className="utility-edge-tab utility-edge-tab-demo"
            data-selected={active === "scenarios"}
            onClick={(event) => toggle("scenarios", event.currentTarget)}
            type="button"
          >
            <FlaskConical aria-hidden="true" size={18} />
            <span>Demo scenarios</span>
          </button>
        </nav>
      </div>

    </div>
  );
}
