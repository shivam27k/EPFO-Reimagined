const MAX_VISIBLE_SCREEN_CHARACTERS = 6000;

function fallbackVisibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(
    "[hidden], [aria-hidden='true'], [inert], script, style, template, details:not([open]) > :not(summary)",
  ).forEach((element) => element.remove());
  clone.querySelectorAll("input, textarea").forEach((element) => {
    element.removeAttribute("value");
    element.textContent = "";
  });
  return clone.textContent ?? "";
}

export function captureVisibleScreenText(): string {
  const root = document.getElementById("portal-content");
  if (!root) return "";
  const renderedText = typeof root.innerText === "string" ? root.innerText : fallbackVisibleText(root);
  return renderedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_VISIBLE_SCREEN_CHARACTERS);
}

export function visibleScreenFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}
