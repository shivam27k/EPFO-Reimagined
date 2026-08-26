import { describe, expect, test } from "vitest";

import {
  persistAssistantWorkspaceView,
  readAssistantWorkspaceView,
} from "./assistant-workspace-state";

describe("assistant workspace state", () => {
  test("defaults to collapsed and restores docked", () => {
    expect(readAssistantWorkspaceView({ getItem: () => null })).toBe("collapsed");
    expect(readAssistantWorkspaceView({ getItem: () => "docked" })).toBe("docked");
  });

  test("persists fullscreen as docked", () => {
    let saved = "";
    persistAssistantWorkspaceView("fullscreen", {
      setItem: (_key, value) => {
        saved = value;
      },
    });
    expect(saved).toBe("docked");
  });
});
