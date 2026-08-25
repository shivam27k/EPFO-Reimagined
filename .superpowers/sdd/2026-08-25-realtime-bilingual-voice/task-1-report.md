# Task 1 Report: Bilingual Policy and Safe Caption Rendering

## Files changed

- `src/components/assistant/assistant-language.tsx` — adds forbidden-script detection and safe English/Devanagari caption rendering.
- `src/components/assistant/assistant-language.test.tsx` — covers English, Devanagari, mixed Hinglish, and Urdu/Perso-Arabic suppression.
- `src/server/assistant/instructions.ts` — adds English/Hindi-only, language-mirroring, Devanagari, and no-Urdu policy instructions.
- `src/app/fonts.ts` — registers `Noto_Sans_Devanagari` as `--font-devanagari`.
- `src/app/layout.tsx` — applies the Devanagari font variable to the document root.
- `src/app/globals.css` — assigns Source Sans 3 to English spans and Noto Sans Devanagari to Hindi spans.

## Implementation notes

- `containsForbiddenScript` rejects Arabic, Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms-A/B, and Arabic Letter Mark code-point ranges before any text is rendered.
- `SafeBilingualText` returns the exact neutral unsupported-script notice for forbidden input; accepted text is split into contiguous Devanagari and non-Devanagari runs.
- Each accepted run receives either `assistant-text-hindi` or `assistant-text-english`, so mixed captions use the intended font without altering their text.

## Tests and commands

1. `bun run test -- src/components/assistant/assistant-language.test.tsx --run`
   - Initial red run: failed as expected because `assistant-language.tsx` did not exist.
2. `bun run test -- src/components/assistant/assistant-language.test.tsx --run`
   - Final output: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.
3. `bunx tsc --noEmit`
   - Final output: exit code 0 with no diagnostics.
4. `git diff --check`
   - Final output: no whitespace errors.

## Self-review

- Confirmed the forbidden ranges exactly cover the Task 1 requirement.
- Confirmed forbidden text is never included in the rendered result.
- Confirmed English, Devanagari, and mixed-caption tests exercise rendered DOM behavior rather than implementation text.
- Confirmed only Task 1 source, test, typography, policy, and report files are staged for the task commit.

## Concerns

None. This task establishes the shared rendering primitive and policy; the later Realtime integration task must use `SafeBilingualText` at every member and assistant caption rendering point.

## Fix round 1

### Root cause and implementation

- The initial classifier treated every non-Devanagari character as English. That was a denylist gap: it rendered unrelated scripts and missed newer Arabic blocks.
- `containsForbiddenScript` now uses a positive per-code-point allowlist: `Script=Latin`, `Script=Devanagari`, `Script=Common`, and `Script=Inherited`. Every other code point is replaced by the neutral notice.
- `Script=Common` and `Script=Inherited` deliberately preserve ordinary punctuation, digits, whitespace, emoji, variation selectors, and joining characters alongside English/Hindi text.

### Test additions and commands

1. `bun run test -- src/components/assistant/assistant-language.test.tsx --run`
   - Red output: 6 expected failures for Arabic Extended-B, Arabic Extended-C, Arabic Mathematical Alphabetic Symbols, Cyrillic, Bengali, and Chinese input; each was incorrectly rendered as English by the previous classifier.
2. `bun run test -- src/components/assistant/assistant-language.test.tsx --run`
   - Green output: `Test Files 1 passed (1)`, `Tests 11 passed (11)`.
3. `bunx tsc --noEmit`
   - Green output: exit code 0 with no diagnostics.

### Review result

- Tests now directly exercise all Arabic blocks identified in review, three unrelated writing systems, and accepted punctuation/emoji behavior.
- No concerns remain for this fix round.
