/**
 * @module port-types
 *
 * The typed **port vocabulary** of the Model Component Framework — the data-product
 * kinds that flow between ML components. A component declares typed input/output
 * ports; wiring one component's output into another's input is legal ONLY when the
 * port types match or a declared adapter bridges them. This single legality rule is
 * what makes agent/user-designed composite architectures sensible by construction.
 *
 * Port type names describe the DATA SHAPE they carry, never an algorithm
 * ("transition-matrix", not "markov-output"). The canonical vocabulary is refined by
 * the Phase-2 cross-model study (SAME | ADAPTER-RELATED | DISTINCT verdicts decided
 * by wiring consequences); this module is the compile-time mirror of the seeded
 * `MJ: ML Port Types` rows, and the two are held in lockstep by contract tests.
 */

import { z } from 'zod';

/**
 * Single source of truth for the port-type name union. Mirrors the seeded
 * `MJ: ML Port Types` metadata rows (metadata/ml-port-types/).
 *
 * Grouped by role:
 * - Data shapes (source/feature side): `features:tabular`, `features:sequence`,
 *   `series`, `event-log`, `interaction-matrix`
 * - Predictions: `score`, `probability`, `class-label`, `forecast-series`,
 *   `anomaly-score`
 * - Unsupervised structure: `cluster-id`, `soft-assignment`, `embedding`
 * - Sequence/state structure: `latent-state`, `state-sequence`
 * - Survival: `survival-curve`, `hazard`
 * - Parameters-as-outputs (fitted knowledge, consumable downstream):
 *   `transition-matrix`, `coefficients`, `topic-mixture`, `rules`
 * - Explainability: `attributions`
 * - Model references (explainers/calibrators consume a fitted model):
 *   `trained-model`
 */
export const ALL_PORT_TYPES = [
  'features:tabular',
  'features:sequence',
  'series',
  'event-log',
  'interaction-matrix',
  'score',
  'probability',
  'class-label',
  'forecast-series',
  'anomaly-score',
  'cluster-id',
  'soft-assignment',
  'embedding',
  'latent-state',
  'state-sequence',
  'survival-curve',
  'hazard',
  'transition-matrix',
  'coefficients',
  'topic-mixture',
  'rules',
  'attributions',
  'trained-model',
  // --- U2 additions (2026-07-16 study reconciliation) ---
  'dynamics-matrix',        // VAR/companion lag operator — DISTINCT from row-stochastic transition-matrix
  'topic-word-dists',       // K×vocab topic-word distributions — DISTINCT from per-row topic-mixture
  'transactions',           // unordered baskets/itemsets — ADAPTER-RELATED to event-log (lossy groupby-collapse)
  'predictive-distribution',// per-row predictive mean+std (GP native uncertainty)
  'ranked-list',            // variable-length top-N (item, score) recommendations
  'quantile-band',          // multi-quantile / prediction-interval band
] as const;

/** A member of the typed port vocabulary. */
export type PortTypeName = (typeof ALL_PORT_TYPES)[number];

/** zod enum for {@link PortTypeName} — runtime validation at trust boundaries. */
export const PortTypeNameSchema = z.enum(ALL_PORT_TYPES);

/** Direction of a component port. */
export type PortDirection = 'Input' | 'Output';

/**
 * A single typed port on a component — the plain-data mirror of an
 * `MJ: ML Component Ports` row, used by the pure composition helpers so Core
 * stays entity-free (engines map entity rows into this shape).
 */
export interface ComponentPort {
  /** Local port name on the component (e.g. `X`, `y`, `states`). */
  Name: string;
  /** Consumes (Input) or produces (Output). */
  Direction: PortDirection;
  /** The typed kind of data flowing through this port. */
  PortType: PortTypeName;
  /** Inputs only: must be bound for the component to run. Defaults true. */
  IsRequired?: boolean;
}

/**
 * A declared cross-type coercion — the plain-data mirror of an
 * `MJ: ML Port Adapters` row. An edge whose endpoint types differ is legal only
 * when an Active adapter exists for (From → To).
 */
export interface PortAdapterDef {
  /** Adapter display name (e.g. `Cluster ID One-Hot`). */
  Name: string;
  /** Port type consumed. */
  FromPortType: PortTypeName;
  /** Port type produced. */
  ToPortType: PortTypeName;
  /** Coercion technique key (e.g. `onehot`, `identity`, `argmax`, `last-state`). */
  Strategy: string;
  /** True when the coercion discards information — UIs surface a warning. */
  IsLossy?: boolean;
}
