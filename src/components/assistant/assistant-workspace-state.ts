export type AssistantWorkspaceView = "collapsed" | "docked" | "fullscreen";

const KEY = "epf-sahayak:workspace-view";

type AssistantWorkspaceReader = Pick<Storage, "getItem">;
type AssistantWorkspaceWriter = Pick<Storage, "setItem">;

export function readAssistantWorkspaceView(
  storage: AssistantWorkspaceReader = window.sessionStorage,
): AssistantWorkspaceView {
  return storage.getItem(KEY) === "docked" ? "docked" : "collapsed";
}

export function persistAssistantWorkspaceView(
  view: AssistantWorkspaceView,
  storage: AssistantWorkspaceWriter = window.sessionStorage,
): void {
  storage.setItem(KEY, view === "collapsed" ? "collapsed" : "docked");
}
