import { describe, expect, test } from "vitest";
import {
  assistantToolCallSchema, assistantToolDefinitions, assistantToolRegistry,
  isReadTool, parseAssistantToolCall, toolResultSchema,
} from "./assistant-tools";
import { parsePortalToolCall, portalToolDefinitions } from "./portal-actions";

describe("shared assistant tool contracts", () => {
  test.each([
    ["get_member_summary", {}],
    ["check_workflow_readiness", { workflow: "final_settlement" }],
    ["inspect_contributions", { fromMonth: "2026-01", toMonth: null }],
    ["get_claim_history", {}],
    ["explain_blocker", { code: "MISSING_EXIT_DATE" }],
    ["compare_claim_options", { workflows: ["final_settlement", "advance_claim"] }],
    ["open_utility_panel", { panel: "journey" }],
    ["open_document_review", {}],
    ["prepare_onboarding_patch", { patch: { aadhaarName: "Demo Member" }, documentProposalId: null, demoDisclosureAccepted: true }],
    ["validate_onboarding_patch", { patch: { epsMember: false } }],
    ["get_pending_action", {}],
    ["get_action_status", { callId: "earlier-call" }],
  ])("parses the fixed %s contract from an object or JSON", (name, args) => {
    expect(parseAssistantToolCall(name as string, args)).toEqual({ name, arguments: args });
    expect(parseAssistantToolCall(name as string, JSON.stringify(args))).toEqual({ name, arguments: args });
  });

  test.each([
    ["get_member_summary", { demoRunId: "other-run" }],
    ["get_claim_history", { claimId: "other-claim" }],
    ["inspect_contributions", { fromMonth: "2026-99", toMonth: null }],
    ["inspect_contributions", { fromMonth: "2026-00", toMonth: null }],
    ["inspect_contributions", { fromMonth: "2026-1", toMonth: null }],
    ["inspect_contributions", { fromMonth: "2026-02", toMonth: "2026-01" }],
    ["inspect_contributions", {}],
    ["check_workflow_readiness", { workflow: "instant_payout" }],
    ["compare_claim_options", { workflows: ["final_settlement", "profile_correction"] }],
    ["compare_claim_options", { workflows: ["final_settlement", "final_settlement"] }],
    ["compare_claim_options", { workflows: [] }],
    ["explain_blocker", { code: "https://example.com" }],
    ["navigate_to", { destination: "https://example.com" }],
    ["reveal_section", { target: "claims.history", selector: "*" }],
    ["open_utility_panel", { panel: "settings" }],
    ["open_document_review", { url: "https://example.com/file.pdf" }],
    ["prepare_onboarding_patch", { patch: { admin: true }, documentProposalId: null, demoDisclosureAccepted: true }],
    ["prepare_onboarding_patch", { patch: { bankName: "Demo" }, documentProposalId: null, demoDisclosureAccepted: false }],
    ["prepare_onboarding_patch", { patch: null, documentProposalId: null, demoDisclosureAccepted: true }],
    ["prepare_onboarding_patch", { patch: { bankName: "Demo" }, documentProposalId: "document-1", demoDisclosureAccepted: true }],
    ["validate_onboarding_patch", { patch: { bankAccountNumber: "invalid" } }],
    ["validate_onboarding_patch", { patch: {} }],
    ["get_action_status", { callId: "", demoRunId: "other-run" }],
    ["submit_final_claim", {}], ["__proto__", {}], ["constructor", {}],
    ["get_member_summary", null], ["get_member_summary", "{broken"],
  ])("rejects unsafe %s arguments %j", (name, args) => {
    expect(() => parseAssistantToolCall(name as string, args)).toThrow();
  });

  test("uses a strict discriminated union and preserves legacy contracts", () => {
    expect(assistantToolCallSchema.def.type).toBe("union");
    expect(assistantToolCallSchema.def.discriminator).toBe("name");
    expect(() => assistantToolCallSchema.parse({ name: "get_member_summary", arguments: {}, demoRunId: "other" })).toThrow();
    expect(parseAssistantToolCall("start_workflow", { workflow: "mark_exit" }))
      .toEqual(parsePortalToolCall("start_workflow", { workflow: "mark_exit" }));
    expect(portalToolDefinitions).toHaveLength(8);
  });

  test("advertises only implemented read handlers, with closed schemas and metadata", () => {
    expect(assistantToolDefinitions.map((tool) => tool.name).sort()).toEqual([
      "check_workflow_readiness", "compare_claim_options", "explain_blocker",
      "get_claim_history", "get_member_summary", "inspect_contributions",
    ]);
    for (const tool of assistantToolDefinitions) {
      expect(isReadTool(tool.name)).toBe(true);
      expect(tool.strict).toBe(true);
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.parameters.required ?? []).toEqual(Object.keys(tool.parameters.properties ?? {}));
      expect(assistantToolRegistry[tool.name]).toMatchObject({
        implemented: true, executionLocation: "server", effectClass: "read_only",
      });
      expect(assistantToolRegistry[tool.name].preconditions.length).toBeGreaterThan(0);
      expect(assistantToolRegistry[tool.name].resultSchema).toBe(toolResultSchema);
    }
    for (const name of ["open_document_review", "get_pending_action", "get_action_status", "constructor"]) {
      expect(isReadTool(name)).toBe(false);
    }
  });

  test("validates result status, version, error and evidence envelopes", () => {
    const result = { callId: "call", status: "completed", message: "Recorded data", contextVersion: "version" };
    expect(toolResultSchema.parse(result)).toEqual(result);
    for (const bad of [
      { ...result, status: "ready" }, { ...result, contextVersion: "" },
      { ...result, demoRunId: "other" }, { ...result, error: { code: "DB", retryable: "yes" } },
      { ...result, evidence: [{ kind: "provider", value: "unverified" }] },
    ]) expect(() => toolResultSchema.parse(bad)).toThrow();
  });

  test("future definitions have strict provider JSON contracts but are never advertised", () => {
    function checkObjects(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(checkObjects); return; }
      const node = value as Record<string, unknown>;
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(node.required ?? []).toEqual(Object.keys(node.properties ?? {}));
      }
      Object.values(node).forEach(checkObjects);
    }
    for (const entry of Object.values(assistantToolRegistry)) {
      expect(entry.definition.strict).toBe(true);
      checkObjects(entry.definition.parameters);
      if (!entry.implemented) expect(assistantToolDefinitions.map((tool) => tool.name)).not.toContain(entry.name);
    }
    expect(parseAssistantToolCall("validate_onboarding_patch", { patch: { bankName: "Demo Member", epsMember: null } }))
      .toEqual({ name: "validate_onboarding_patch", arguments: { patch: { bankName: "Demo Member", epsMember: null } } });
    expect(() => parseAssistantToolCall("validate_onboarding_patch", { patch: { bankName: null } })).toThrow();
  });
});
