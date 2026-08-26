"use client";

import { FlaskConical, MapPinned, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import {
  persistAssistantWorkspaceView,
  readAssistantWorkspaceView,
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

export function PortalUtilities({ snapshot }: { snapshot: MemberSnapshot }) {
  const pathname = usePathname();
  const [utilityState, setUtilityState] = useState<{ pathname: string; active: ActiveUtility | null }>({
    pathname,
    active: null,
  });
  const [assistantView, setAssistantView] = useState<AssistantWorkspaceView>(() => (
    typeof window === "undefined" ? "collapsed" : readAssistantWorkspaceView()
  ));
  const [voiceActive, setVoiceActive] = useState(false);
  const responsiveAssistant = useSyncExternalStore(
    subscribeToResponsiveAssistant,
    readResponsiveAssistant,
    readServerResponsiveAssistant,
  );
  const [refreshedContext, setRefreshedContext] = useState<{
    source: MemberSnapshot;
    snapshot: MemberSnapshot;
    stale: boolean;
  } | null>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const active = utilityState.pathname === pathname ? utilityState.active : null;
  const currentContext = refreshedContext?.source === snapshot
    ? refreshedContext
    : { source: snapshot, snapshot, stale: false };
  const utilitySnapshot = currentContext.snapshot;
  const contextStale = currentContext.stale;
  const responsiveAssistantModal = responsiveAssistant && assistantView !== "collapsed";
  const assistantModal = assistantView === "fullscreen" || responsiveAssistantModal;

  useEffect(() => {
    refreshController.current?.abort();
  }, [pathname]);

  useEffect(() => {
    if (!assistantModal) return;

    const background = document.querySelectorAll<HTMLElement>(
      ".portal-sidebar, .portal-stage, .mobile-navigation",
    );
    background.forEach((element) => { element.inert = true; });

    return () => {
      background.forEach((element) => { element.inert = false; });
    };
  }, [assistantModal]);

  useEffect(() => {
    if (!active) return;

    const background = document.querySelectorAll<HTMLElement>(
      ".portal-sidebar, .portal-stage, .mobile-navigation",
    );
    background.forEach((element) => { element.inert = true; });

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
      background.forEach((element) => { element.inert = false; });
    };
  }, [active, pathname]);

  useEffect(() => {
    if (!active) {
      lastTrigger.current?.focus();
      return;
    }

    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-utility-panel="${active}"] [data-utility-close]`)
        ?.focus();
    });
  }, [active]);

  async function refreshUtilitySnapshot() {
    const controller = new AbortController();
    refreshController.current?.abort();
    refreshController.current = controller;

    try {
      const response = await fetch("/api/member/snapshot", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setRefreshedContext((current) => ({
          source: snapshot,
          snapshot: current?.source === snapshot ? current.snapshot : snapshot,
          stale: true,
        }));
        return;
      }
      const refreshedSnapshot = await response.json() as MemberSnapshot;
      if (controller.signal.aborted) return;
      setRefreshedContext({ source: snapshot, snapshot: refreshedSnapshot, stale: false });
    } catch {
      if (!controller.signal.aborted) {
        setRefreshedContext((current) => ({
          source: snapshot,
          snapshot: current?.source === snapshot ? current.snapshot : snapshot,
          stale: true,
        }));
      }
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  }

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

  function changeAssistantView(view: AssistantWorkspaceView) {
    if (view === "docked" && assistantView === "collapsed") void refreshUtilitySnapshot();
    setAssistantView(view);
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

      <AssistantPanel
        contextStale={contextStale}
        modal={responsiveAssistantModal}
        onViewChange={changeAssistantView}
        onVoiceActiveChange={setVoiceActive}
        snapshot={utilitySnapshot}
        suppressPrompt={active !== null}
        view={assistantView}
      />

    </div>
  );
}
