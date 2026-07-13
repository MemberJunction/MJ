/**
 * @fileoverview Pure (Angular-free) content + helpers for the Predictive Studio co-pilot experience —
 * the first-run capability intro that introduces what PS can do (shown on the catalog), and the
 * "Improve this" seed for a blocked prediction. The co-pilot itself opens to a clean chat (Sonar-style);
 * guidance lives on the catalog cards, not in the chat.
 *
 * All copy here is deliberately **domain-neutral** (PS is entity-agnostic). Kept framework-free so it's
 * unit-tested without the Angular runtime (see `src/__tests__/predictive-studio-copilot.test.ts`).
 */

// ============================================================================
// First-run capability intro (introduces the features of PS)
// ============================================================================

/** One capability shown on the empty catalog so a first-time user learns what PS is for. */
export interface PSCapabilityCard {
  /** Font Awesome icon class. */
  icon: string;
  /** Short capability title. */
  title: string;
  /** One-line plain-language description. */
  blurb: string;
}

/** The four things PS lets you do — shown as cards on the empty catalog to introduce the product. */
export const PS_CAPABILITY_CARDS: readonly PSCapabilityCard[] = [
  {
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'Build a prediction',
    blurb: 'Describe what you want to know in plain words; the agent assembles the data and trains a model.',
  },
  {
    icon: 'fa-solid fa-list-check',
    title: "See who's at risk",
    blurb: 'Get a ranked list of the records most likely to hit the outcome you care about.',
  },
  {
    icon: 'fa-solid fa-lightbulb',
    title: 'Understand why',
    blurb: 'See the plain-language drivers behind the prediction — and behind each individual record.',
  },
  {
    icon: 'fa-solid fa-paper-plane',
    title: 'Take action',
    blurb: 'Send the at-risk list to a List, export it, or save the scores back onto your records.',
  },
];

// ============================================================================
// "Improve this" seed for a blocked (not-trustworthy-enough) prediction
// ============================================================================

/** Context for {@link buildImprovePrompt} — a blocked prediction the user wants to improve. */
export interface ImprovePromptInput {
  /** The prediction's display name. */
  name: string;
  /** Its trust grade (Poor/Fair/…), when known. */
  trustGrade?: string | null;
  /** The plain-language reason it's blocked (trust gate / leakage), when known. */
  reason?: string | null;
}

const trim = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '');

/** Ensure a fragment ends with sentence punctuation so the composed prompt reads cleanly. */
function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Compose the co-pilot seed for the "Improve this" action on a blocked prediction — turning the trust
 * dead-end into a next step. Names the prediction + why it's held so the agent can propose concrete
 * improvements (more/better data, different target framing, algorithm, more history). Pure + deterministic.
 */
export function buildImprovePrompt(input: ImprovePromptInput): string {
  const name = trim(input.name) || 'this prediction';
  const grade = trim(input.trustGrade);
  const reason = trim(input.reason);
  const why = reason ? ` It's being held back because: ${ensureSentence(reason)}` : '';
  const gradePart = grade ? ` (current trust: ${grade})` : '';
  return (
    `The "${name}" prediction${gradePart} isn't trustworthy enough to use yet.${why} ` +
    'Help me improve it — what would make it reliable? Consider more or cleaner training data, more history, a clearer outcome definition, or a different algorithm, then rebuild it if that helps.'
  );
}
