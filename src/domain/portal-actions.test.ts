import { describe, expect, test } from "vitest";
import { destinationRoutes, parsePortalToolCall, portalToolDefinitions, realtimePortalToolDefinitions, workflowRoutes } from "./portal-actions";

describe("portal action catalog", () => {
  test("parses only allowlisted destinations", () => {
    expect(parsePortalToolCall("navigate_to", '{"destination":"profile"}')).toEqual({ name: "navigate_to", arguments: { destination: "profile" } });
    expect(parsePortalToolCall("scroll_page", '{"destination":"top"}')).toEqual({ name: "scroll_page", arguments: { destination: "top" } });
    expect(destinationRoutes.profile).toBe("/profile");
    expect(() => parsePortalToolCall("navigate_to", '{"destination":"https://example.com"}')).toThrow();
  });

  test("rejects arbitrary tool names and extra selector arguments", () => {
    expect(() => parsePortalToolCall("click", '{"selector":"button"}')).toThrow("Unsupported");
    expect(() => parsePortalToolCall("reveal_section", '{"target":"profile.account_tools","selector":"*"}')).toThrow();
  });

  test("maps correction and nomination workflows to safe entries", () => {
    expect(workflowRoutes.profile_correction).toEqual({ route: "/profile", target: "profile.account_tools" });
    expect(workflowRoutes.nomination_guidance.route).toBe("/nomination");
  });

  test("publishes closed function schemas", () => {
    expect(portalToolDefinitions).toHaveLength(8);
    expect(portalToolDefinitions.every((entry) => entry.parameters.additionalProperties === false)).toBe(true);
  });

  test("keeps Responses strict schemas out of the Realtime session payload", () => {
    expect(portalToolDefinitions.every((entry) => entry.strict === true)).toBe(true);
    expect(realtimePortalToolDefinitions).toHaveLength(portalToolDefinitions.length);
    expect(realtimePortalToolDefinitions.every((entry) => !("strict" in entry))).toBe(true);
  });
});
