import { describe, it, expect } from 'vitest';
import { BuildAppContextSnapshot, FormatAppContextNote, AppContextSnapshot } from '../app-context';

describe('BuildAppContextSnapshot', () => {
    it('builds from minimal inputs with safe defaults', () => {
        const snap = BuildAppContextSnapshot({ App: { Name: 'Chat' } });
        expect(snap.App).toEqual({ Name: 'Chat', Description: '' });
        expect(snap.ActiveNavItem).toEqual({ Name: '(none)' });
        expect(snap.OtherNavItems).toEqual([]);
        expect(snap.User).toEqual({ Name: '', Roles: [] });
        expect(snap.AdditionalContext).toBeUndefined();
        expect(snap.View).toBeUndefined();
        expect(snap.Capabilities).toBeUndefined();
    });

    it('passes through new View / Capabilities members when provided', () => {
        const snap = BuildAppContextSnapshot({
            App: { Name: 'Knowledge Hub' },
            View: { VisibleEntities: ['Content Items'], FreeText: 'on Analytics tab' },
            Capabilities: {
                Tools: [{ Name: 'ExportCSV', Description: 'export', InputSchema: {} }],
                Agents: [{ AgentID: 'a1', Name: 'Skip', Kind: 'loop' }],
            },
        });
        expect(snap.View?.VisibleEntities).toEqual(['Content Items']);
        expect(snap.Capabilities?.Tools?.[0].Name).toBe('ExportCSV');
        expect(snap.Capabilities?.Agents?.[0].Name).toBe('Skip');
    });
});

describe('FormatAppContextNote', () => {
    it('returns empty string when nothing salient', () => {
        expect(FormatAppContextNote({})).toBe('');
    });

    it('renders a detailed location + view + state + navigable targets + tool signatures', () => {
        const snap: AppContextSnapshot = {
            App: { Name: 'Knowledge Hub', Description: '' },
            ActiveNavItem: { Name: 'Analytics', ResourceType: 'Custom' },
            OtherNavItems: [{ Name: 'Search' }, { Name: 'Clusters' }],
            NavigableApps: [{ Name: 'Data Explorer' }, { Name: 'Admin' }],
            User: { Name: 'Amith', Roles: [] },
            AdditionalContext: { SelectedEntity: 'Content Items', RecordCount: 150, ActiveView: 'All Items' },
            View: {
                VisibleEntities: ['Content Items'],
                Selection: { EntityName: 'Content Items', RecordIDs: ['1', '2'] },
                FreeText: null,
            },
            Capabilities: {
                Tools: [{ Name: 'ExportCSV', Description: 'Export the grid', InputSchema: { properties: { format: {} }, required: ['format'] } }],
                Agents: [{ AgentID: 'a1', Name: 'Skip', Description: 'analytics expert' }],
            },
        };
        const note = FormatAppContextNote(snap);
        expect(note).toContain('[app-context]');
        expect(note).toContain('location: Knowledge Hub › Analytics (Custom)');
        expect(note).toContain('viewing: Content Items');
        expect(note).toContain('selected: Content Items 2 record(s)');
        // rich per-surface AdditionalContext is now rendered
        expect(note).toContain('current screen state:');
        expect(note).toContain('SelectedEntity: Content Items');
        expect(note).toContain('RecordCount: 150');
        // navigable targets so NavigateToApp has valid values
        expect(note).toContain('sections in this app (NavigateToApp NavItemName): Search, Clusters');
        expect(note).toContain('apps you can open (NavigateToApp AppName): Data Explorer, Admin');
        // tool SIGNATURE (params + required marker), not just the name
        expect(note).toContain('ExportCSV(format) — Export the grid');
        expect(note).toContain('Skip — analytics expert');
    });

    it('renders a focused delta when only View present', () => {
        const note = FormatAppContextNote({ View: { FreeText: 'editing form Members, field Email' } });
        expect(note).toBe('[app-context]\nediting form Members, field Email');
    });

    it('marks optional tool params with a trailing ?', () => {
        const note = FormatAppContextNote({
            Capabilities: { Tools: [{ Name: 'NavigateToApp', Description: 'go', InputSchema: { properties: { AppName: {}, NavItemName: {} }, required: ['AppName'] } }] },
        });
        expect(note).toContain('NavigateToApp(AppName, NavItemName?) — go');
    });
});
