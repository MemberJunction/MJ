/**
 * @fileoverview Pure helpers for the Tour Studio dashboard's AI-agent integration.
 *
 * Intentionally Angular-free so Vitest tests run directly under Node without TestBed.
 *
 * 🔒 SAFETY BOUNDARY: Tour Studio exposes ONLY navigational / filter / search /
 * selection / preview / graph-validation tools to the agent. Destructive or
 * org-impacting mutations (`PublishTour`, `SaveTour`, `SaveStep`, `SaveStepPath`,
 * `SaveTourOverride`, `DeleteTour`, `SaveLearningPath`) are deliberately NOT exposed.
 */

import { BoundNameList } from '../shared/agent-tool-validation';
import type { TourStudioTab } from './tour-studio.types';

export const TOUR_STUDIO_TABS: readonly TourStudioTab[] = ['catalog', 'builder', 'governance', 'analytics'];

export const TOUR_STUDIO_TAB_LABELS: Readonly<Record<TourStudioTab, string>> = {
  catalog: 'Catalog',
  builder: 'Builder',
  governance: 'Learning Paths & Overrides',
  analytics: 'Analytics & Holdouts',
};

export interface TourCandidate {
  ID: string;
  TourKey: string;
  Name: string;
  Status: 'Draft' | 'Active' | 'Retired';
}

export interface TourStudioAgentContextInput {
  ActiveTab: TourStudioTab;
  TotalTourCount: number;
  FilteredTourCount: number;
  DraftCount: number;
  ActiveCount: number;
  RetiredCount: number;
  SearchQuery: string;
  StatusFilter: string;
  ApplicationFilter: string;
  GuideModeFilter: string;
  SurfaceFilter: string;
  VisibleTourNames: readonly string[];
  SelectedTour: TourCandidate | null;
  SelectedTourStepCount: number;
  SelectedTourCapabilityWarningCount: number;
  SelectedStepKey: string | null;
  SelectedStepTitle: string | null;
  GraphValid: boolean;
  GraphHasCycle: boolean;
  LearningPathCount: number;
  OverrideCount: number;
  TotalRunCount: number;
  IsLoading: boolean;
}

/** Validates whether an arbitrary string is a valid {@link TourStudioTab} key. */
export function IsValidTourStudioTab(value: string): value is TourStudioTab {
  return (TOUR_STUDIO_TABS as readonly string[]).includes(value);
}

/**
 * Resolves a tab key or human label (case-insensitive) into a {@link TourStudioTab}.
 */
export function ResolveTourStudioTab(input: string): TourStudioTab | null {
  const needle = input.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  for (const tab of TOUR_STUDIO_TABS) {
    if (tab === needle || TOUR_STUDIO_TAB_LABELS[tab].toLowerCase() === needle) {
      return tab;
    }
  }
  const partial = TOUR_STUDIO_TABS.find(
    (tab) => tab.includes(needle) || TOUR_STUDIO_TAB_LABELS[tab].toLowerCase().includes(needle),
  );
  return partial ?? null;
}

/**
 * Tolerant ID -> TourKey -> exact Name -> partial Name resolver for Tour Studio tools.
 */
export function ResolveTourByIdOrKeyOrName<T extends TourCandidate>(
  input: string,
  candidates: readonly T[],
): T | null {
  const needle = input.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  const byId = candidates.find((c) => c.ID.trim().toLowerCase() === needle);
  if (byId) return byId;

  const byKey = candidates.find((c) => c.TourKey.trim().toLowerCase() === needle);
  if (byKey) return byKey;

  const byExactName = candidates.find((c) => c.Name.trim().toLowerCase() === needle);
  if (byExactName) return byExactName;

  const byPartial = candidates.find(
    (c) => c.Name.toLowerCase().includes(needle) || c.TourKey.toLowerCase().includes(needle),
  );
  return byPartial ?? null;
}

/**
 * Builds an informative miss message listing up to 25 available tour names/keys.
 */
export function BuildTourNotFoundError(input: string, candidates: readonly TourCandidate[]): string {
  const all = candidates.map((c) => `${c.Name} (${c.TourKey})`);
  const bounded = BoundNameList(all);
  const suffix = all.length > bounded.length ? `, ... (+${all.length - bounded.length} more)` : '';
  return `No tour matching "${input}". Available tours: ${bounded.join(', ') || '(none)'}${suffix}.`;
}

/**
 * Shapes the current Tour Studio state into a bounded agent context object.
 */
export function BuildTourStudioAgentContext(input: TourStudioAgentContextInput): Record<string, unknown> {
  const boundedVisible = BoundNameList(input.VisibleTourNames);

  const context: Record<string, unknown> = {
    ActiveTab: input.ActiveTab,
    ActiveTabLabel: TOUR_STUDIO_TAB_LABELS[input.ActiveTab],
    IsLoading: input.IsLoading,
    TotalTourCount: input.TotalTourCount,
    FilteredTourCount: input.FilteredTourCount,
    StatusCounts: {
      Draft: input.DraftCount,
      Active: input.ActiveCount,
      Retired: input.RetiredCount,
    },
    VisibleTourNames: boundedVisible,
    LearningPathCount: input.LearningPathCount,
    OverrideCount: input.OverrideCount,
    TotalRunCount: input.TotalRunCount,
  };

  if (input.VisibleTourNames.length > boundedVisible.length) {
    context['VisibleTourCount'] = input.VisibleTourNames.length;
  }
  if (input.SearchQuery.trim()) {
    context['SearchQuery'] = input.SearchQuery.trim();
  }
  if (input.StatusFilter) {
    context['StatusFilter'] = input.StatusFilter;
  }
  if (input.ApplicationFilter) {
    context['ApplicationFilter'] = input.ApplicationFilter;
  }
  if (input.GuideModeFilter) {
    context['GuideModeFilter'] = input.GuideModeFilter;
  }
  if (input.SurfaceFilter) {
    context['SurfaceFilter'] = input.SurfaceFilter;
  }

  if (input.SelectedTour) {
    context['SelectedTourId'] = input.SelectedTour.ID;
    context['SelectedTourKey'] = input.SelectedTour.TourKey;
    context['SelectedTourName'] = input.SelectedTour.Name;
    context['SelectedTourStatus'] = input.SelectedTour.Status;
    context['SelectedTourStepCount'] = input.SelectedTourStepCount;
    context['SelectedTourCapabilityWarningCount'] = input.SelectedTourCapabilityWarningCount;
    context['GraphValid'] = input.GraphValid;
    context['GraphHasCycle'] = input.GraphHasCycle;
  }

  if (input.SelectedStepKey) {
    context['SelectedStepKey'] = input.SelectedStepKey;
    context['SelectedStepTitle'] = input.SelectedStepTitle ?? input.SelectedStepKey;
  }

  return context;
}
