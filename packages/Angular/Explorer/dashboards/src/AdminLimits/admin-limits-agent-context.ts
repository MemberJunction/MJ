/**
 * @fileoverview Pure helpers for the Admin Limits dashboard's AI-agent context and
 * read-only navigational client tools.
 *
 * 🚨 SAFETY BOUNDARY — READ-ONLY DIAGNOSTIC & NAVIGATIONAL TOOLS ONLY 🚨
 * Admin surfaces expose ONLY navigational, filter, search, and read-only inspection
 * tools to the AI agent. `Limits.ResumePausedRun` and `Limits.PauseRun` are state-changing
 * governance mutations and are DELIBERATELY NOT exposed as agent client tools; human
 * operators confirm pause/resume and budget extensions explicitly in the UI.
 *
 * @module @memberjunction/ng-dashboards
 */

import type { LimitsConfigCategory } from '@memberjunction/ai-core-plus';
import { BoundNameList } from '../shared/agent-tool-validation';

/** Valid top-level tabs inside `AdminLimitsResourceComponent`. */
export const ADMIN_LIMITS_TABS = ['overview', 'provenance', 'budgets', 'runs'] as const;

/** Tab union for `AdminLimitsResourceComponent`. */
export type AdminLimitsTab = (typeof ADMIN_LIMITS_TABS)[number];

/** Valid category filter values for provenance inspection. */
export const ADMIN_LIMITS_CATEGORIES = [
    'All',
    'Backstops',
    'Briefing',
    'Budgets',
    'ProgressDetector',
    'ResourceGuards',
    'Tuning',
] as const;

/** Category filter union for `AdminLimitsResourceComponent`. */
export type AdminLimitsCategoryFilter = (typeof ADMIN_LIMITS_CATEGORIES)[number];

/** Valid run status filter values for the active/paused runs tab. */
export const ADMIN_LIMITS_RUN_STATUS_FILTERS = ['All', 'Running', 'Paused', 'Completed', 'Failed'] as const;

/** Run status filter union for `AdminLimitsResourceComponent`. */
export type AdminLimitsRunStatusFilter = (typeof ADMIN_LIMITS_RUN_STATUS_FILTERS)[number];

/** Validates whether an unknown value is a valid {@link AdminLimitsTab}. */
export function IsValidAdminLimitsTab(value: unknown): value is AdminLimitsTab {
    return typeof value === 'string' && (ADMIN_LIMITS_TABS as readonly string[]).includes(value);
}

/** Validates whether an unknown value is a valid {@link AdminLimitsCategoryFilter}. */
export function IsValidAdminLimitsCategory(value: unknown): value is AdminLimitsCategoryFilter {
    return typeof value === 'string' && (ADMIN_LIMITS_CATEGORIES as readonly string[]).includes(value);
}

/** Validates whether an unknown value is a valid {@link AdminLimitsRunStatusFilter}. */
export function IsValidAdminLimitsRunStatusFilter(value: unknown): value is AdminLimitsRunStatusFilter {
    return typeof value === 'string' && (ADMIN_LIMITS_RUN_STATUS_FILTERS as readonly string[]).includes(value);
}

/** Input snapshot used to build the agent-visible Admin Limits context. */
export interface AdminLimitsAgentContextInput {
    ActiveTab: AdminLimitsTab;
    SelectedCategory: AdminLimitsCategoryFilter;
    RunStatusFilter: AdminLimitsRunStatusFilter;
    SearchQuery: string;
    ShowOverriddenOnly: boolean;
    ShowClampedOnly: boolean;
    IsLoading: boolean;
    TotalKeysCount: number;
    OverriddenKeysCount: number;
    ClampedKeysCount: number;
    ActiveRunCount: number;
    PausedRunCount: number;
    PausedRunAgents: readonly string[];
    SelectedRunID: string | null;
}

/** Read-only diagnostic context published to the active AI agent. */
export type AdminLimitsAgentContext = {
    Surface: 'AdminLimitsResource';
    ActiveTab: AdminLimitsTab;
    SelectedCategory: AdminLimitsCategoryFilter;
    RunStatusFilter: AdminLimitsRunStatusFilter;
    SearchQuery: string;
    ShowOverriddenOnly: boolean;
    ShowClampedOnly: boolean;
    IsLoading: boolean;
    TotalKeysCount: number;
    OverriddenKeysCount: number;
    ClampedKeysCount: number;
    ActiveRunCount: number;
    PausedRunCount: number;
    PausedRunAgents: string[];
    PausedRunAgentsTruncated: boolean;
    SelectedRunID: string | null;
};

/** Maps a canonical `LimitsKeyPath` to its logical display category. */
export function ClassifyLimitsKeyCategory(keyPath: string): LimitsConfigCategory {
    if (keyPath.startsWith('Briefing')) {
        return 'Briefing';
    }
    if (keyPath.startsWith('Budgets.')) {
        return 'Budgets';
    }
    if (keyPath.startsWith('ProgressDetector.')) {
        return 'ProgressDetector';
    }
    if (keyPath.startsWith('ResourceGuards.')) {
        return 'ResourceGuards';
    }
    if (keyPath.startsWith('Tuning.')) {
        return 'Tuning';
    }
    return 'Backstops';
}

/** Builds a bounded, read-only agent context object for `AdminLimitsResourceComponent`. */
export function BuildAdminLimitsAgentContext(
    input: AdminLimitsAgentContextInput,
): AdminLimitsAgentContext {
    const boundedAgents = BoundNameList(input.PausedRunAgents);
    return {
        Surface: 'AdminLimitsResource',
        ActiveTab: input.ActiveTab,
        SelectedCategory: input.SelectedCategory,
        RunStatusFilter: input.RunStatusFilter,
        SearchQuery: input.SearchQuery,
        ShowOverriddenOnly: input.ShowOverriddenOnly,
        ShowClampedOnly: input.ShowClampedOnly,
        IsLoading: input.IsLoading,
        TotalKeysCount: input.TotalKeysCount,
        OverriddenKeysCount: input.OverriddenKeysCount,
        ClampedKeysCount: input.ClampedKeysCount,
        ActiveRunCount: input.ActiveRunCount,
        PausedRunCount: input.PausedRunCount,
        PausedRunAgents: boundedAgents,
        PausedRunAgentsTruncated: boundedAgents.length < input.PausedRunAgents.length,
        SelectedRunID: input.SelectedRunID,
    };
}
