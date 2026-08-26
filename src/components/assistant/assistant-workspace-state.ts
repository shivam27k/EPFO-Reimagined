export type AssistantWorkspaceView = "collapsed" | "docked" | "fullscreen";

const KEY = "epf-sahayak:workspace-view";
const CHANGE_EVENT = "epf-sahayak:workspace-view-change";

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
  if (typeof window !== "undefined" && storage === window.sessionStorage) {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function subscribeAssistantWorkspaceView(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.sessionStorage && event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function readServerAssistantWorkspaceView(): AssistantWorkspaceView {
  return "collapsed";
}
