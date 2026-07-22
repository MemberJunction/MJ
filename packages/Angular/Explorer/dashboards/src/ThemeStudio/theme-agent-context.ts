/**
 * Pure, unit-testable helpers for the Theme Studio + Theme Manager agent context
 * and tools (context builders + tolerant id→name→contains resolver).
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * The theming surfaces expose ONLY read / navigate / preview-state / user-scoped
 * tools to the agent: list + select themes, apply presets and seed edits to the
 * IN-MEMORY editor draft (nothing persists until the user saves), flip preview
 * mode/surface, apply a theme to the CURRENT USER's workspace, and star/unstar
 * (both per-user preferences). DELIBERATELY NOT exposed (org-wide or destructive
 * writes stay human-driven in the UI): SAVE a theme, RENAME, SET ORG DEFAULT,
 * DUPLICATE (creates records), and DELETE. Context exposes only theme display
 * names, statuses, seed values, and contrast pass/fail summaries — never the
 * Overrides / CustomCSS bodies.
 */

import { UUIDsEqual } from '@memberjunction/global';
import type { ContrastReport, ThemeSeeds } from '@memberjunction/theme-engine';

/** Cap applied to every published name list. */
export const THEME_NAME_LIST_CAP = 25;

/** Minimal theme shape the pure helpers operate on. */
export interface ThemeSummaryRow {
    ID: string;
    Name: string;
    Status: string;
    IsDefault: boolean;
    BuiltIn: boolean;
}

/** State snapshot the Theme Manager passes to its context builder. */
export interface ThemeManagerAgentState {
    Themes: ThemeSummaryRow[];
    AppliedThemeID: string | null;
    StarredThemeIDs: string[];
}

/** State snapshot the Theme Studio passes to its context builder. */
export interface ThemeStudioAgentState {
    Themes: ThemeSummaryRow[];
    CurrentThemeID: string | null;
    CurrentThemeName: string;
    IsBuiltInSelected: boolean;
    PreviewMode: 'light' | 'dark';
    PreviewSurface: string;
    EditorPanelOpen: boolean;
    Seeds: ThemeSeeds;
    /** Advanced-layer shape only — never the bodies. */
    OverrideTokenCount: number;
    HasCustomCss: boolean;
    Contrast: ContrastReport;
}

/** Bound a name list to the cap, reporting truncation via the returned tuple. */
function boundNames(names: string[]): { names: string[]; truncated: boolean; total: number } {
    const filtered = names.filter((n) => !!n);
    return {
        names: filtered.slice(0, THEME_NAME_LIST_CAP),
        truncated: filtered.length > THEME_NAME_LIST_CAP,
        total: filtered.length,
    };
}

/** Bounded, secret-free context published by the Theme Manager via SetAgentContext. */
export function buildThemeManagerAgentContext(state: ThemeManagerAgentState): Record<string, unknown> {
    const applied = state.AppliedThemeID
        ? state.Themes.find((t) => UUIDsEqual(t.ID, state.AppliedThemeID as string)) ?? null
        : null;
    const bounded = boundNames(state.Themes.map((t) => t.Name));
    const context: Record<string, unknown> = {
        TotalThemeCount: state.Themes.length,
        ActiveThemeCount: state.Themes.filter((t) => t.Status === 'Active').length,
        DefaultThemeName: state.Themes.find((t) => t.IsDefault)?.Name ?? null,
        AppliedThemeID: state.AppliedThemeID,
        AppliedThemeName: applied?.Name ?? null,
        StarredThemeCount: state.StarredThemeIDs.length,
        VisibleThemeNames: bounded.names,
    };
    if (bounded.truncated) {
        context['VisibleThemeNamesTruncated'] = true;
        context['VisibleThemeNamesTotal'] = bounded.total;
    }
    return context;
}

/** Bounded, secret-free context published by the Theme Studio via SetAgentContext. */
export function buildThemeStudioAgentContext(state: ThemeStudioAgentState): Record<string, unknown> {
    const bounded = boundNames(state.Themes.map((t) => t.Name));
    const failingPairs = (checks: ContrastReport['light']) =>
        checks.filter((c) => !c.passes).map((c) => c.name).slice(0, THEME_NAME_LIST_CAP);
    const context: Record<string, unknown> = {
        CurrentThemeID: state.CurrentThemeID,
        CurrentThemeName: state.CurrentThemeName,
        IsUnsavedDraft: state.CurrentThemeID === null,
        IsBuiltInReadOnly: state.IsBuiltInSelected,
        PreviewMode: state.PreviewMode,
        PreviewSurface: state.PreviewSurface,
        EditorPanelOpen: state.EditorPanelOpen,
        Seeds: {
            Primary: state.Seeds.primary,
            Accent: state.Seeds.accent ?? null,
            Tertiary: state.Seeds.tertiary ?? null,
            NeutralChroma: state.Seeds.neutralChroma ?? null,
            Vibrancy: state.Seeds.vibrancy ?? null,
            Radius: state.Seeds.radius ?? null,
            Depth: state.Seeds.depth ?? null,
            FontFamily: state.Seeds.fontFamily ?? null,
        },
        VizPaletteOverridden: !!state.Seeds.vizPalette && state.Seeds.vizPalette.length > 0,
        OverrideTokenCount: state.OverrideTokenCount,
        HasCustomCss: state.HasCustomCss,
        ContrastPasses: state.Contrast.passes,
        ContrastFailingLight: failingPairs(state.Contrast.light),
        ContrastFailingDark: failingPairs(state.Contrast.dark),
        AvailableThemeNames: bounded.names,
    };
    if (bounded.truncated) {
        context['AvailableThemeNamesTruncated'] = true;
        context['AvailableThemeNamesTotal'] = bounded.total;
    }
    return context;
}

/**
 * Tolerant theme resolver: exact ID (case-insensitive GUID) → exact name →
 * partial name contains (all case-insensitive). Returns a structured failure
 * listing available names (bounded) on a miss.
 */
export function resolveThemeByIDOrName(
    themes: ThemeSummaryRow[],
    rawRef: unknown
): { ok: true; value: ThemeSummaryRow } | { ok: false; error: string } {
    if (typeof rawRef !== 'string' || rawRef.trim().length === 0) {
        return { ok: false, error: `Provide the theme's ID or name. ${availableNames(themes)}` };
    }
    const ref = rawRef.trim();
    const byId = themes.find((t) => UUIDsEqual(t.ID, ref));
    if (byId) {
        return { ok: true, value: byId };
    }
    const byName = themes.find((t) => equalsIgnoreCase(t.Name, ref));
    if (byName) {
        return { ok: true, value: byName };
    }
    const contains = themes.filter((t) => t.Name.toLowerCase().includes(ref.toLowerCase()));
    if (contains.length === 1) {
        return { ok: true, value: contains[0] };
    }
    if (contains.length > 1) {
        return {
            ok: false,
            error: `'${ref}' matches multiple themes: ${contains
                .slice(0, THEME_NAME_LIST_CAP)
                .map((t) => t.Name)
                .join(', ')}. Be more specific.`,
        };
    }
    return { ok: false, error: `No theme matches '${ref}'. ${availableNames(themes)}` };
}

function availableNames(themes: ThemeSummaryRow[]): string {
    if (themes.length === 0) {
        return 'There are no saved themes yet.';
    }
    const names = themes.slice(0, THEME_NAME_LIST_CAP).map((t) => t.Name);
    const suffix = themes.length > THEME_NAME_LIST_CAP ? ', …' : '';
    return `Available themes: ${names.join(', ')}${suffix}`;
}

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
