/**
 * Shared view-model types for the Predictive Studio dashboard panels.
 *
 * The panels bind to live RunView-backed data from {@link PredictiveStudioEngine}, mapped into these
 * presentation shapes by the pure derivations in `predictive-studio.view-models.ts` (which are unit
 * tested). These interfaces are the contract between those derivations and the Angular templates.
 */

export type PSPanelKey = 'home' | 'catalog' | 'pipelines' | 'experiments' | 'registry' | 'production' | 'compare';

/** A kanban iteration card on the Experiments panel. */
export interface PSIterationCard {
  Algorithm: string;
  AlgorithmIcon: string;
  AlgorithmColor: string;
  Iteration: string;
  Features: string[];
  Status: 'Running' | 'Best' | 'Completed' | 'AwaitingApproval' | 'Pruned';
  /** For running cards: 0..100 progress; for completed/pruned: the holdout score. */
  Progress?: number;
  ProgressDetail?: string;
  score?: number;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  ScoreDelta?: string;
  Rationale: string;
}

/** A leaderboard pill on the Experiments panel. */
export interface PSLeaderboardEntry {
  rank: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  algorithm: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  algorithmIcon: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  algorithmColor: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  features: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  auc: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  best?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  pruned?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** A feature-importance bar (registry / compare panels). */
export interface PSFeatureBar {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  pct: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  value: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  warning?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** Lifecycle steps shared by the registry detail stepper. */
export const PS_LIFECYCLE_STEPS = ['Draft', 'Validated', 'Published', 'Archived'] as const;
export type PSLifecycleStep = (typeof PS_LIFECYCLE_STEPS)[number];
