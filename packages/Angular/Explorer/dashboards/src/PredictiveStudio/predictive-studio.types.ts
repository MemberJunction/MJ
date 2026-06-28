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
  algorithm: string;
  algorithmIcon: string;
  algorithmColor: string;
  iteration: string;
  features: string[];
  status: 'Running' | 'Best' | 'Completed' | 'AwaitingApproval' | 'Pruned';
  /** For running cards: 0..100 progress; for completed/pruned: the holdout score. */
  progress?: number;
  progressDetail?: string;
  score?: number;
  scoreDelta?: string;
  rationale: string;
}

/** A leaderboard pill on the Experiments panel. */
export interface PSLeaderboardEntry {
  rank: number;
  algorithm: string;
  algorithmIcon: string;
  algorithmColor: string;
  features: string;
  auc: number;
  best?: boolean;
  pruned?: boolean;
}

/** A feature-importance bar (registry / compare panels). */
export interface PSFeatureBar {
  name: string;
  pct: number;
  value: string;
  warning?: boolean;
}

/** Lifecycle steps shared by the registry detail stepper. */
export const PS_LIFECYCLE_STEPS = ['Draft', 'Validated', 'Published', 'Archived'] as const;
export type PSLifecycleStep = (typeof PS_LIFECYCLE_STEPS)[number];
