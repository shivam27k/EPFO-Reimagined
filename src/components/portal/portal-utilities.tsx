"use client";

import { FlaskConical, MapPinned, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { ScenarioDrawer } from "@/components/demo/scenario-drawer";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import { JourneyCard } from "./journey-card";

type ActiveUtility = "journey" | "scenarios" | "assistant";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PortalUtilities({ snapshot }: { snapshot: MemberSnapshot }) {
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveUtility | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [utilitySnapshot, setUtilitySnapshot] = useState(snapshot);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setUtilitySnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    setActive(null);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;

    const background = document.querySelectorAll<HTMLElement>(
      ".portal-sidebar, .portal-stage, .mobile-navigation",
    );
    background.forEach((element) => { element.inert = true; });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setActive(null);
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
  }, [active]);

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
    try {
      const response = await fetch("/api/member/snapshot", { cache: "no-store" });
      if (!response.ok) return;
      setUtilitySnapshot(await response.json() as MemberSnapshot);
    } catch {
      // Keep the last usable snapshot; the page remains fully functional without the utility refresh.
    }
  }

  function toggle(next: ActiveUtility, trigger?: HTMLButtonElement) {
    if (trigger) lastTrigger.current = trigger;
    if (active !== next) void refreshUtilitySnapshot();
    setActive((current) => (current === next ? null : next));
  }

  function closeAll() {
    setActive(null);
  }

  return (
    <div className="portal-utilities" data-active={active ?? "none"} data-voice-active={voiceActive}>
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
        onClose={closeAll}
        onVoiceActiveChange={setVoiceActive}
        onOpen={(trigger) => {
          if (trigger) toggle("assistant", trigger);
          else setActive("assistant");
        }}
        open={active === "assistant"}
        snapshot={utilitySnapshot}
        suppressPrompt={active !== null && active !== "assistant"}
      />

    </div>
  );
}
