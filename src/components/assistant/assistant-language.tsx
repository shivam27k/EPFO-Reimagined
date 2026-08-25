import type { ReactNode } from "react";

const devanagariPattern = /[\u0900-\u097f]/u;
const forbiddenScriptPattern = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const unsupportedScriptNotice = "Speech received in an unsupported script. Please speak in English or Hindi.";

export function containsForbiddenScript(text: string): boolean {
  return forbiddenScriptPattern.test(text);
}

export function SafeBilingualText({ text }: { text: string }): ReactNode {
  if (containsForbiddenScript(text)) return unsupportedScriptNotice;

  const runs: Array<{ text: string; language: "english" | "hindi" }> = [];

  for (const character of Array.from(text)) {
    const language = devanagariPattern.test(character) ? "hindi" : "english";
    const previousRun = runs.at(-1);

    if (previousRun?.language === language) previousRun.text += character;
    else runs.push({ text: character, language });
  }

  return runs.map((run, index) => (
    <span className={`assistant-text-${run.language}`} key={`${run.language}-${index}`}>
      {run.text}
    </span>
  ));
}
