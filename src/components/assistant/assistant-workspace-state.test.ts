import { describe, expect, test } from "vitest";

import {
  persistAssistantWorkspaceView,
  readAssistantWorkspaceView,
  readServerAssistantWorkspaceView,
} from "./assistant-workspace-state";

describe("assistant workspace state", () => {
  test("defaults to collapsed and restores docked", () => {
    expect(readAssistantWorkspaceView({ getItem: () => null })).toBe("collapsed");
    expect(readAssistantWorkspaceView({ getItem: () => "docked" })).toBe("docked");
  });

  test("persists the docked sidebar state", () => {
    let saved = "";
    persistAssistantWorkspaceView("docked", {
      setItem: (_key, value) => {
        saved = value;
      },
    });
    expect(saved).toBe("docked");
  });

  test("uses a stable collapsed snapshot for server rendering", () => {
    expect(readServerAssistantWorkspaceView()).toBe("collapsed");
  });
});
