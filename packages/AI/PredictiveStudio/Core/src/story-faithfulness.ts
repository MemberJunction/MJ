/**
 * @module story-faithfulness
 *
 * The deterministic core of the story-layer eval (Doc 5 §3/§4) — the production form
 * of the phase-0 `rd_story` faithfulness check. A Story Tagger's narrative is
 * FAITHFUL only when it actually names the features the model relies on (its top
 * feature importances); a narrative that cites features the model does not use is
 * post-hoc rationalization and fails.
 *
 * This is the deterministic substrate of the `LLMJudgeOracle`'s core concern: the
 * LLM judge asks "does the story ring true?", but the hard, non-flaky check is
 * "does the narrative name ≥N of the model's real top-K drivers?" — computed here,
 * so the eval has a merge-blocking deterministic floor beneath the judge's opinion.
 *
 * Matching is paraphrase-tolerant: each top feature is matched against its own name
 * (underscores → spaces) PLUS any caller-supplied synonyms, case-insensitively.
 */

/** A map from a feature name to human paraphrases the narrative might use instead. */
export type FeatureSynonyms = Record<string, string[]>;

/** Options for {@link checkStoryFaithfulness}. */
export interface StoryFaithfulnessOptions {
  /** How many top-importance features must be checkable (default 3). */
  topK?: number;
  /** How many of the top-K the narrative must name to be faithful (default 2). */
  minNamed?: number;
  /** Paraphrase synonyms per feature (e.g. `tenure_days → ['tenure','membership length']`). */
  synonyms?: FeatureSynonyms;
}

/** The result of a faithfulness check. */
export interface StoryFaithfulnessResult {
  /** True when at least `minNamed` of the top-K features are named in the narrative. */
  faithful: boolean;
  /** The top-K features by |importance| that were checked. */
  topFeatures: string[];
  /** The subset of `topFeatures` the narrative actually names. */
  namedFeatures: string[];
  /** The top-K features the narrative FAILS to name (the post-hoc gap). */
  missedFeatures: string[];
}

/** Build the case-insensitive match patterns for a feature: its own name + synonyms. */
function patternsFor(feature: string, synonyms: FeatureSynonyms): string[] {
  const base = feature.replace(/_/g, ' ').toLowerCase();
  const extra = (synonyms[feature] ?? []).map((s) => s.toLowerCase());
  return [base, ...extra];
}

/**
 * Check whether a story narrative faithfully names the model's real top drivers.
 *
 * @param narrative The tagger's story text (nominal name + narrative concatenated is fine).
 * @param featureImportances The model's feature importances, `{ featureName: importance }`.
 * @param options topK / minNamed thresholds + optional synonym map.
 * @returns Which top features were named, and whether the faithful threshold was met.
 */
export function checkStoryFaithfulness(
  narrative: string,
  featureImportances: Record<string, number>,
  options: StoryFaithfulnessOptions = {},
): StoryFaithfulnessResult {
  const topK = options.topK ?? 3;
  const minNamed = options.minNamed ?? 2;
  const synonyms = options.synonyms ?? {};

  const topFeatures = Object.entries(featureImportances)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, topK)
    .map(([name]) => name);

  const text = narrative.toLowerCase();
  const namedFeatures = topFeatures.filter((f) => patternsFor(f, synonyms).some((p) => text.includes(p)));
  const missedFeatures = topFeatures.filter((f) => !namedFeatures.includes(f));

  return {
    faithful: namedFeatures.length >= minNamed,
    topFeatures,
    namedFeatures,
    missedFeatures,
  };
}
