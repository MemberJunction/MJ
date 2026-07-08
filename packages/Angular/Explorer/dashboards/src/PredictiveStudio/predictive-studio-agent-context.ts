/**
 * @fileoverview Pure, framework-agnostic helpers for Predictive Studio's AI-agent integration across its
 * three doors — **Predictions** (business front door), **Studio** (analyst workbench), and **Models**
 * (registry + production). Each door component supplies a plain snapshot of its current state and these
 * helpers shape it into the key-value context object that flows to the async chat agent AND the realtime
 * co-agent via `NavigationService.SetAgentContext`, plus resolve an agent-supplied id/name/partial to a
 * concrete record for the doors' client tools.
 *
 * Kept Angular-free so it's unit-testable in isolation (see `src/__tests__/predictive-studio-agent-context.test.ts`).
 * The shared validation/cap helpers (`validateStringParam`, `boundNameList`) come from
 * `src/shared/agent-tool-validation.ts`; the PS-specific resolver + builders live LOCAL here (same
 * convention as every other MJ surface — e.g. Lists' `lists-agent-context.ts`).
 *
 * 🔒 SAFETY BOUNDARY: every function here is read-only and side-effect-free — it only shapes context and
 * matches strings. Predictive Studio surfaces are **read / navigate-only to the agent**: the doors expose
 * ONLY section-switch / open-prediction / review / export / open-copilot tools. Model **training,
 * promotion/publish, deletion, scoring-run, "save scores to records", and "send to a list" (which creates
 * `MJ: Lists` + `MJ: List Details` rows) are DELIBERATELY NOT exposed** — those write/irreversible actions
 * stay behind the user's own clicks and the Model Development Agent's approve-gated builder. The
 * read-only boundary is restated on each door component; this module never mutates anything.
 */

import { boundNameList } from '../shared/agent-tool-validation';

/** Upper bound on names published in any PS context list field; a companion `*Count` is surfaced when truncated. */
export const PS_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** Cap a name list to {@link PS_AGENT_CONTEXT_NAME_LIST_CAP}. Pure; never mutates the input. */
export function capPSNames(names: readonly string[]): string[] {
  return boundNameList(names, PS_AGENT_CONTEXT_NAME_LIST_CAP);
}

/** Minimal id+name descriptor the doors hand the resolver so it can match an agent reference. */
export interface PSNamedRecord {
  ID: string;
  Name: string;
}

/**
 * Resolve an agent-supplied reference the way a user names things: exact ID (case-insensitive, to tolerate
 * SQL-Server-upper vs PG-lower UUID casing) → exact name (trimmed, case-insensitive) → first case-insensitive
 * *contains* match on the name. Pure + deterministic over the candidate list. Returns the match or null.
 */
export function resolvePSRecord<T extends PSNamedRecord>(input: string, candidates: readonly T[]): T | null {
  const needle = (input ?? '').trim().toLowerCase();
  if (!needle) return null;
  const byId = candidates.find((c) => c.ID.toLowerCase() === needle);
  if (byId) return byId;
  const byName = candidates.find((c) => c.Name.trim().toLowerCase() === needle);
  if (byName) return byName;
  return candidates.find((c) => c.Name.toLowerCase().includes(needle)) ?? null;
}

/** Tolerant "not found" message that samples a few available names so the agent can self-correct. Pure. */
export function buildPSNotFoundError(input: string, candidates: readonly PSNamedRecord[], noun: string): string {
  const sample = candidates.slice(0, 6).map((c) => c.Name).join(', ');
  return `No ${noun} matching "${input}" is available. Available ${noun}s include: ${sample || '(none)'}.`;
}

// ============================================================================
// PREDICTIONS door context (catalog ↔ trust-gated workspace)
// ============================================================================

/** The open prediction's salient slice, published when the workspace is showing a selection. */
export interface SelectedPredictionSummary {
  Name: string;
  /** Trust grade (Poor/Fair/Good/Excellent). */
  TrustGrade: string;
  /** Whether the trust gate lets the user act on this prediction. */
  CanOpen: boolean;
}

/** Component-supplied snapshot for the Predictions door. */
export interface PredictionsAgentContextInput {
  /** catalog (the home grid) ↔ workspace (a selected prediction). */
  View: 'catalog' | 'workspace';
  /** Total published predictions in the catalog. */
  PredictionCount: number;
  /** How many clear the trust gate (openable). */
  ReadyPredictionCount: number;
  /** Names of the catalog predictions, in display order (bounded). */
  VisiblePredictionNames: string[];
  /** Whether the "+ New prediction" co-pilot is open. */
  ChatOpen: boolean;
  /** The open prediction (workspace view only), else null. */
  Selected?: SelectedPredictionSummary | null;
  /** Whether the at-risk list has finished loading for the selection. */
  AtRiskLoaded?: boolean;
  /** Ranked at-risk row count (when loaded). */
  AtRiskCount?: number;
  /** Band breakdown of the at-risk rows (when loaded). */
  HighRiskCount?: number;
  MediumRiskCount?: number;
  LowRiskCount?: number;
  /** Plain-language "what's driving this" drivers for the selection (bounded). */
  Drivers?: string[];
}

/** Build the Predictions door context: catalog counts + bounded names, and (in workspace) the selection + at-risk breakdown. */
export function buildPredictionsAgentContext(input: PredictionsAgentContextInput): Record<string, unknown> {
  const context: Record<string, unknown> = {
    View: input.View,
    PredictionCount: input.PredictionCount,
    ReadyPredictionCount: input.ReadyPredictionCount,
    ChatOpen: input.ChatOpen,
    VisiblePredictionNames: capPSNames(input.VisiblePredictionNames),
  };
  if (input.VisiblePredictionNames.length > PS_AGENT_CONTEXT_NAME_LIST_CAP) {
    context['VisiblePredictionNameCount'] = input.VisiblePredictionNames.length;
  }
  if (input.View === 'workspace' && input.Selected) {
    context['SelectedPredictionName'] = input.Selected.Name;
    context['SelectedPredictionTrust'] = input.Selected.TrustGrade;
    context['SelectedPredictionCanAct'] = input.Selected.CanOpen;
    // Only surface the at-risk breakdown once loaded — never fabricate zeros before the fetch resolves.
    if (input.AtRiskLoaded) {
      context['AtRiskCount'] = input.AtRiskCount ?? 0;
      context['HighRiskCount'] = input.HighRiskCount ?? 0;
      context['MediumRiskCount'] = input.MediumRiskCount ?? 0;
      context['LowRiskCount'] = input.LowRiskCount ?? 0;
    }
    if (input.Drivers && input.Drivers.length > 0) {
      context['Drivers'] = capPSNames(input.Drivers);
    }
  }
  return context;
}

// ============================================================================
// STUDIO door context (build/run workbench)
// ============================================================================

/** Component-supplied snapshot for the Studio door. */
export interface StudioAgentContextInput {
  /** Active section key (home/pipelines/catalog/experiments/compare). */
  ActiveSection: string;
  /** Active section display label. */
  ActiveSectionLabel: string;
  /** Labels of the door's sections, in nav order. */
  SectionLabels: string[];
  PublishedModelCount: number;
  RunningSessionCount: number;
  PipelineCount: number;
  AlgorithmCount: number;
  ExperimentCount: number;
  TrainingRunCount: number;
  /** Whether the docked Model Dev Agent co-pilot is open. */
  ChatOpen: boolean;
}

/** Build the Studio door context: active section + section labels + the workbench's headline counts. */
export function buildStudioAgentContext(input: StudioAgentContextInput): Record<string, unknown> {
  return {
    ActiveSection: input.ActiveSection,
    ActiveSectionLabel: input.ActiveSectionLabel,
    SectionLabels: capPSNames(input.SectionLabels),
    PublishedModelCount: input.PublishedModelCount,
    RunningSessionCount: input.RunningSessionCount,
    PipelineCount: input.PipelineCount,
    AlgorithmCount: input.AlgorithmCount,
    ExperimentCount: input.ExperimentCount,
    TrainingRunCount: input.TrainingRunCount,
    ChatOpen: input.ChatOpen,
  };
}

// ============================================================================
// MODELS door context (registry + production)
// ============================================================================

/** Component-supplied snapshot for the Models door. */
export interface ModelsAgentContextInput {
  /** Active section key (registry/production). */
  ActiveSection: string;
  /** Active section display label. */
  ActiveSectionLabel: string;
  /** Labels of the door's sections, in nav order. */
  SectionLabels: string[];
  TotalModelCount: number;
  PublishedModelCount: number;
  DraftModelCount: number;
  /** Models with at least one scoring Record Process (live in production). */
  ProductionModelCount: number;
}

/** Build the Models door context: active section + section labels + the lifecycle counts. */
export function buildModelsAgentContext(input: ModelsAgentContextInput): Record<string, unknown> {
  return {
    ActiveSection: input.ActiveSection,
    ActiveSectionLabel: input.ActiveSectionLabel,
    SectionLabels: capPSNames(input.SectionLabels),
    TotalModelCount: input.TotalModelCount,
    PublishedModelCount: input.PublishedModelCount,
    DraftModelCount: input.DraftModelCount,
    ProductionModelCount: input.ProductionModelCount,
  };
}
