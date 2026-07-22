import type { ConfirmationKind } from "@pulso/core";

// confirm_incident casts a civic-trust vote, so the realtime bridge only POSTs it when the
// user's CURRENT turn clearly expresses that intent (issue #11). This detects an explicit
// confirm/dispute in free Spanish speech; silence, questions, or an intent that contradicts
// the model-selected `kind` are treated as "no consent" and never mutate anything.

// Whole-word cues (accent-insensitive). Kept deliberately explicit so an incidental word
// cannot be mistaken for a vote.
const CONFIRM_CUES = [
  "si",
  "claro",
  "correcto",
  "confirmo",
  "confirmar",
  "confirmado",
  "afirmativo",
  "exacto",
  "cierto",
  "verdad",
  "efectivamente",
];

const DISPUTE_CUES = [
  "no",
  "falso",
  "mentira",
  "disputo",
  "disputar",
  "incorrecto",
  "niego",
  "dudo",
  "nada",
];

// Multi-word cues checked as substrings after normalization.
const CONFIRM_PHRASES = ["asi es", "de acuerdo", "lo confirmo", "es cierto", "es verdad"];
const DISPUTE_PHRASES = [
  "no es cierto",
  "no es verdad",
  "no es correcto",
  "no es real",
  "no lo veo",
  "no creo",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function hasWord(words: Set<string>, cues: readonly string[]): boolean {
  return cues.some((cue) => words.has(cue));
}

function hasPhrase(normalized: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => normalized.includes(phrase));
}

/**
 * True only when `userText` expresses an unambiguous intent matching `kind` (a confirm cue for
 * "confirm", a dispute cue for "dispute") without also expressing the opposite. Empty or
 * conflicting input returns false so the vote is withheld until the user is explicit.
 */
export function hasExplicitConsent(
  userText: string | null,
  kind: ConfirmationKind,
): boolean {
  if (!userText) return false;
  const normalized = normalize(userText);
  if (!normalized) return false;
  const words = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));

  const confirms =
    hasWord(words, CONFIRM_CUES) || hasPhrase(normalized, CONFIRM_PHRASES);
  const disputes =
    hasWord(words, DISPUTE_CUES) || hasPhrase(normalized, DISPUTE_PHRASES);

  if (kind === "confirm") return confirms && !disputes;
  return disputes && !confirms;
}
