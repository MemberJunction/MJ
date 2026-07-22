import { describe, expect, it } from 'vitest';
import {
    buildThemeManagerAgentContext,
    buildThemeStudioAgentContext,
    resolveThemeByIDOrName,
    THEME_NAME_LIST_CAP,
    ThemeStudioAgentState,
    ThemeSummaryRow,
} from '../ThemeStudio/theme-agent-context';

const row = (n: number, extra: Partial<ThemeSummaryRow> = {}): ThemeSummaryRow => ({
    ID: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    Name: `Theme ${n}`,
    Status: 'Active',
    IsDefault: false,
    BuiltIn: false,
    ...extra,
});

const passingContrast = { light: [], dark: [], passes: true };

const studioState = (overrides: Partial<ThemeStudioAgentState> = {}): ThemeStudioAgentState => ({
    Themes: [row(1), row(2, { IsDefault: true })],
    CurrentThemeID: row(1).ID,
    CurrentThemeName: 'Theme 1',
    IsBuiltInSelected: false,
    PreviewMode: 'light',
    PreviewSurface: 'explorer',
    EditorPanelOpen: true,
    Seeds: { primary: '#0076b6', accent: '#5cc0ed', radius: 8 },
    OverrideTokenCount: 0,
    HasCustomCss: false,
    Contrast: passingContrast,
    ...overrides,
});

describe('buildThemeManagerAgentContext', () => {
    it('reports counts, the default, and the applied theme by name', () => {
        const themes = [row(1), row(2, { IsDefault: true }), row(3, { Status: 'Draft' })];
        const ctx = buildThemeManagerAgentContext({
            Themes: themes,
            AppliedThemeID: row(2).ID.toLowerCase(), // case-insensitive GUID match
            StarredThemeIDs: [row(1).ID],
        });
        expect(ctx['TotalThemeCount']).toBe(3);
        expect(ctx['ActiveThemeCount']).toBe(2);
        expect(ctx['DefaultThemeName']).toBe('Theme 2');
        expect(ctx['AppliedThemeName']).toBe('Theme 2');
        expect(ctx['StarredThemeCount']).toBe(1);
        expect(ctx['VisibleThemeNames']).toEqual(['Theme 1', 'Theme 2', 'Theme 3']);
        expect(ctx['VisibleThemeNamesTruncated']).toBeUndefined();
    });

    it('bounds the published name list at the cap and flags truncation', () => {
        const themes = Array.from({ length: THEME_NAME_LIST_CAP + 5 }, (_, i) => row(i + 1));
        const ctx = buildThemeManagerAgentContext({ Themes: themes, AppliedThemeID: null, StarredThemeIDs: [] });
        expect((ctx['VisibleThemeNames'] as string[]).length).toBe(THEME_NAME_LIST_CAP);
        expect(ctx['VisibleThemeNamesTruncated']).toBe(true);
        expect(ctx['VisibleThemeNamesTotal']).toBe(THEME_NAME_LIST_CAP + 5);
    });

    it('handles an empty list and no applied theme', () => {
        const ctx = buildThemeManagerAgentContext({ Themes: [], AppliedThemeID: null, StarredThemeIDs: [] });
        expect(ctx['TotalThemeCount']).toBe(0);
        expect(ctx['DefaultThemeName']).toBeNull();
        expect(ctx['AppliedThemeName']).toBeNull();
    });
});

describe('buildThemeStudioAgentContext', () => {
    it('reports the draft state, seeds, and advanced-layer shape (never bodies)', () => {
        const ctx = buildThemeStudioAgentContext(studioState({
            CurrentThemeID: null,
            CurrentThemeName: 'New Theme',
            OverrideTokenCount: 2,
            HasCustomCss: true,
        }));
        expect(ctx['IsUnsavedDraft']).toBe(true);
        expect(ctx['OverrideTokenCount']).toBe(2);
        expect(ctx['HasCustomCss']).toBe(true);
        expect((ctx['Seeds'] as Record<string, unknown>)['Primary']).toBe('#0076b6');
        // shape only — the raw override/custom-css bodies must never be published
        expect(JSON.stringify(ctx)).not.toContain('--mj-');
    });

    it('summarizes failing contrast pairs per mode', () => {
        const failing = {
            passes: false,
            light: [{ name: 'text-on-primary', fg: '#fff', bg: '#000', ratio: 2, required: 3, passes: false }],
            dark: [{ name: 'link-on-surface', fg: '#fff', bg: '#000', ratio: 21, required: 4.5, passes: true }],
        };
        const ctx = buildThemeStudioAgentContext(studioState({ Contrast: failing }));
        expect(ctx['ContrastPasses']).toBe(false);
        expect(ctx['ContrastFailingLight']).toEqual(['text-on-primary']);
        expect(ctx['ContrastFailingDark']).toEqual([]);
    });
});

describe('resolveThemeByIDOrName', () => {
    const themes = [row(1), row(2), { ...row(3), Name: 'Acme Brand' }];

    it('resolves by exact ID regardless of GUID case', () => {
        const r = resolveThemeByIDOrName(themes, row(2).ID.toLowerCase());
        expect(r.ok && r.value.Name).toBe('Theme 2');
    });

    it('resolves by exact name (case-insensitive, trimmed)', () => {
        const r = resolveThemeByIDOrName(themes, '  acme brand ');
        expect(r.ok && r.value.Name).toBe('Acme Brand');
    });

    it('resolves a unique partial match', () => {
        const r = resolveThemeByIDOrName(themes, 'acme');
        expect(r.ok && r.value.Name).toBe('Acme Brand');
    });

    it('fails on an ambiguous partial match, listing candidates', () => {
        const r = resolveThemeByIDOrName(themes, 'Theme');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('Theme 1');
            expect(r.error).toContain('Theme 2');
        }
    });

    it('fails helpfully on a miss and on empty/non-string input', () => {
        const miss = resolveThemeByIDOrName(themes, 'nope-nope');
        expect(miss.ok).toBe(false);
        if (!miss.ok) expect(miss.error).toContain('Available themes:');
        const empty = resolveThemeByIDOrName(themes, '   ');
        expect(empty.ok).toBe(false);
        const nonString = resolveThemeByIDOrName(themes, 42);
        expect(nonString.ok).toBe(false);
    });
});
