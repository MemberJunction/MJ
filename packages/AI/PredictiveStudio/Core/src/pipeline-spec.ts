/**
 * @module pipeline-spec
 *
 * Declarative JSON shapes for a Predictive Studio **training pipeline** — the
 * `MJ: ML Training Pipelines` configuration (plan §4.2) and its supporting
 * correctness primitives (§5/§6): where features come from, point-in-time
 * assembly, leakage protection, validation discipline, and the fitted
 * preprocessing that travels with a trained model.
 *
 * These are the persisted JSON column shapes — they are stored on pipeline /
 * model entity rows and consumed by the FeatureAssembly executor and the
 * training orchestration.
 */

import type { FittedPreprocessing, ProblemType } from './sidecar-contract';

export type { ProblemType };

/**
 * One feed-in source a pipeline draws features from (plan §4.2 `SourceBindings`,
 * §5.5). MJ's existing data substrates all become sources: entities, stored
 * Queries (incl. approved/ground-truth), external entities (#2449), persisted
 * vector sets, and upstream Feature Pipelines.
 */
export interface SourceBinding {
  /** The kind of feed-in this binding resolves to. */
  Kind: 'Entity' | 'Query' | 'ExternalEntity' | 'VectorSet' | 'FeaturePipeline';
  /** Reference to the source — an entity name, Query id/name, vector-set id, or Feature Pipeline id. */
  Ref: string;
  /** Optional alias used to disambiguate columns when joining multiple sources. */
  Alias?: string;
}

/**
 * Point-in-time / "as-of" assembly strategy (plan §6.3) — the single biggest new
 * correctness primitive. For forward prediction, features must be assembled as
 * they were at the decision point, not as they are today, or the model leaks the
 * future.
 */
export interface AsOfStrategy {
  /**
   * - `none`: assemble features as they are now (no point-in-time logic).
   * - `column`: a decision-date column on the training unit defines "as-of".
   * - `offset`: assemble as of N days before the label event.
   */
  Mode: 'none' | 'column' | 'offset';
  /** Decision-date column on the training unit when `Mode` is `column`. */
  Column?: string;
  /** Number of days before the label event when `Mode` is `offset`. */
  OffsetDays?: number;
}

/**
 * Leakage protection configuration (plan §6.4). An automated feature-search
 * agent will relentlessly exploit target leakage; this guard denies known-leaky
 * fields/sources and flags single-feature dominance for human sign-off.
 */
export interface LeakageGuard {
  /** Fields that must never enter the feature matrix. */
  DenyFields: string[];
  /** Sources that must never be drawn from (optional, in addition to `DenyFields`). */
  DenySources?: string[];
  /**
   * Importance threshold (e.g. `0.6`) above which a single feature's dominance
   * flags the run as suspicious → warn loudly + block promotion until a human
   * signs off.
   */
  SingleFeatureDominanceThreshold: number;
}

/**
 * Validation discipline for a pipeline (plan §4.2 / §8.2). Defaults to a single
 * train/test split with overfitting detection; k-fold and holdout are opt-in. A
 * locked final holdout the search never sees is scored exactly once on the
 * promoted model to produce the honest number.
 */
export interface ValidationStrategy {
  /** The validation approach. */
  Strategy: 'train_test_split' | 'kfold' | 'holdout';
  /** Test fraction for `train_test_split`. */
  TestSize?: number;
  /** Number of folds for `kfold`. */
  K?: number;
  /**
   * Fraction reserved as the locked final holdout that the experiment search
   * never sees — scored exactly once on the promoted model (plan §8.2).
   */
  LockedHoldoutFraction: number;
}

/**
 * Serialized fitted preprocessing parameters as persisted on a trained model
 * (`MLModel.FittedPreprocessing`, plan §4.3 / §6.2). Re-exported from the sidecar
 * contract because the same opaque payload is round-tripped between train,
 * storage, and predict unchanged.
 */
export type { FittedPreprocessing };
