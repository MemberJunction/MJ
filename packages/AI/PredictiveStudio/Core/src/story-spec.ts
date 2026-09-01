/**
 * @module story-spec
 *
 * A model's **story** — its second identity.
 *
 * A trained model already has a formal identity: an algorithm, a feature schema, a set of
 * coefficients, a holdout AUC. That identity is complete and almost useless for the two things
 * people actually do with models — deciding whether to trust one, and finding a part of one worth
 * reusing somewhere else. Neither question is answerable from a coefficient vector.
 *
 * So every model and every component gets a **prose identity** alongside the formal one: what this
 * thing measures, why it belongs in the model, what it contributes, and when someone else would
 * want it. Written once at promotion, embedded into `StoryVector`, and searchable by meaning — so
 * "find me something that already measures engagement recency" is a query, not an archaeology
 * project.
 *
 * The story is authored by an LLM behind a seam and is the ONLY LLM output in the promotion path.
 * Everything it describes was computed deterministically; it may narrate, never decide. It is also
 * strictly best-effort — a model that trains and promotes must never fail because its story could
 * not be written.
 */

import type { TrustGrade } from './trust';

/** What role a component plays in the model's story. */
export type StoryContributionRole =
  /** Carries most of the signal — the model largely IS this. */
  | 'primary-driver'
  /** Meaningfully moves the answer, but is not the story on its own. */
  | 'supporting'
  /** Adjusts or conditions another component's contribution. */
  | 'modifier'
  /** Present for correctness (a control, a normalization, a presence mask) rather than for signal. */
  | 'structural'
  /** Measured, kept, and doing almost nothing — worth saying so plainly. */
  | 'marginal';

/** How likely this component is to be useful in a DIFFERENT model. */
export type ReusePotential = 'high' | 'medium' | 'low';

/**
 * One component's contribution to the model's story — the judgment half of its dual identity. The
 * formal half (its type, spec, bindings, fitted state) lives on the `MJ: ML Components` row itself.
 */
export interface ComponentStoryContribution {
  Role: StoryContributionRole;
  /**
   * Relative share of the model's explanation, 0–1. Derived from feature importance or coefficient
   * magnitude — a number the tagger is GIVEN, never one it invents.
   */
  Weight?: number;
  /** The measured fact behind the role, quoted so a reader can check it (e.g. "0.31 of total importance"). */
  Evidence: string;
  ReusePotential: ReusePotential;
  /**
   * The situation in which someone else would want this component — the sentence that makes reuse
   * findable. "Any model scoring member engagement where activity dates are available."
   */
  ReuseWhen: string;
}

/** One component's story: a headline, the prose, and its contribution. */
export interface ComponentStory {
  /** The `MJ: ML Components` row this describes. */
  InstanceID: string;
  /** A few words naming what this component measures. */
  Headline: string;
  /** One or two sentences: what it measures, and why it is in this model. */
  Story: string;
  Contribution: ComponentStoryContribution;
}

/**
 * The whole model's story. Persisted on the ROOT `MJ: ML Components` row (`Story` +
 * `StoryVector`), with each component's own story on its own row — so a component found by a
 * similarity search carries its meaning with it, independent of the model it was born in.
 */
export interface ModelStory {
  /** One line a business user would recognize: what this model decides. */
  Headline: string;
  /** The model's story: what it predicts, how it decides, in plain language. */
  Story: string;
  /** What the data itself says — the shape, the balance, the notable inputs. */
  DataStory: string;
  /** Why this matters to the business, and what someone would do differently because of it. */
  BusinessConnection: string;
  /** Per-component stories, one per materialized component. */
  Components: ComponentStory[];
  /**
   * What NOT to conclude from this model — the honest limits. Never empty in practice: every model
   * has them, and a story that omits them is marketing.
   */
  Caveats: string[];
  /** The deterministic trust grade the story was written against (given to the tagger, not chosen by it). */
  TrustGrade: TrustGrade;
}

/**
 * A candidate returned by reuse-by-meaning search: a component whose story is semantically close to
 * what the caller described, and which is structurally legal in the position they want to fill.
 */
export interface ReusableComponentMatch {
  /** The `MJ: ML Components` row. */
  InstanceID: string;
  Name: string;
  /** Its component type, for the structural filter and for display. */
  ComponentTypeID: string;
  ComponentTypeName: string;
  /** Cosine similarity of its `StoryVector` to the query, 0–1. */
  Similarity: number;
  /** Its own story text, so the caller can judge the match rather than trusting the number. */
  Story: string | null;
  /** Whether it is currently approved for use. */
  PromotionState: string;
}
