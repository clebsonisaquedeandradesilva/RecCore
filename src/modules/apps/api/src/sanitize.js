// Ported from apps/api/src/sanitize.ts; TypeScript types erased; native runtime imports.
import { CensorType, Profanity } from "../../../../../vendor/profanity.js";
const EXTRA_WORDS = ["kys", "molest"];
const ALLOWED_WORDS = [];
const MARKER = "\0";
const filter = new Profanity({ wholeWord: true, grawlixChar: MARKER });
filter.addWords(EXTRA_WORDS);
filter.whitelist.addWords(ALLOWED_WORDS);
function containsSwears(value) {
  return value !== "" && filter.exists(value);
}
const NAME_WORD_BOUNDARIES = [
  [/([a-z0-9])([A-Z])/g, "$1 $2"],
  [/([A-Z]+)([A-Z][a-z])/g, "$1 $2"],
  [/([A-Za-z])([0-9])/g, "$1 $2"]
];
function nameContainsSwears(value) {
  const spaced = NAME_WORD_BOUNDARIES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
  return containsSwears(spaced);
}
const DEFAULT_REPLACEMENT_CHAR = "*";
const MAX_SPAN = 40;
const BLOCKED_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
function removeBlockedCharacters(value) {
  return value.replaceAll(BLOCKED_CHARACTERS, "");
}
function spanEnd(text, start) {
  let end = start + 1;
  for (let k = 1; k <= MAX_SPAN && start + k <= text.length; k++) {
    if (containsSwears(text.slice(start, start + k))) {
      end = start + k;
      break;
    }
  }
  while (end < text.length && !/\s/.test(text[end] ?? "")) end++;
  return end;
}
function censorSwears(value, replacementChar = DEFAULT_REPLACEMENT_CHAR) {
  const text = value.replaceAll(MARKER, "");
  if (!containsSwears(text)) return text;
  const mask = [...replacementChar][0] ?? DEFAULT_REPLACEMENT_CHAR;
  const marked = filter.censor(text, CensorType.FirstChar);
  let censored = "";
  let copied = 0;
  for (let i = 0; i < marked.length; i++) {
    if (marked[i] !== MARKER) continue;
    const end = spanEnd(text, i);
    censored += text.slice(copied, i) + mask.repeat(end - i);
    copied = end;
    i = end - 1;
  }
  return censored + text.slice(copied);
}
export {
  DEFAULT_REPLACEMENT_CHAR,
  censorSwears,
  containsSwears,
  nameContainsSwears,
  removeBlockedCharacters
};
