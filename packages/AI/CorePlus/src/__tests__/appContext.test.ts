import { describe, it, expect } from 'vitest';
import { BuildAppContextSnapshot, DiffAppContextSnapshot, FormatAppContextNote, AppContextSnapshot } from '../app-context';

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

describe('DiffAppContextSnapshot', () => {
    const globalTools = [
        { Name: 'NavigateToApp', Description: 'Navigate to an app or section', InputSchema: { properties: { AppName: {}, NavItemName: {} }, required: ['AppName'] } },
        { Name: 'OpenEntityRecord', Description: 'Open an entity record by ID', InputSchema: { properties: { EntityName: {}, RecordID: {} }, required: ['EntityName', 'RecordID'] } },
        { Name: 'SearchGlobal', Description: 'Global workspace search', InputSchema: { properties: { Query: {} }, required: ['Query'] } },
    ];

    function makeExplorerSnapshot(overrides: Partial<AppContextSnapshot> = {}): AppContextSnapshot {
        return {
            App: { Name: 'Data Explorer', Description: 'Browse and manage records' },
            ActiveNavItem: { Name: 'Home', ResourceType: 'Custom' },
            OtherNavItems: [
                { Name: 'Accounts' },
                { Name: 'Contacts' },
                { Name: 'Opportunities' },
                { Name: 'Queries' },
                { Name: 'Reports' },
            ],
            NavigableApps: [
                { Name: 'Knowledge Hub' },
                { Name: 'Admin' },
                { Name: 'Chat' },
            ],
            User: { Name: 'Amith', Roles: ['Developer'] },
            AdditionalContext: { ActiveDashboard: 'Overview', OpenWidgetCount: 4 },
            Capabilities: { Tools: globalTools },
            ...overrides,
        };
    }

    it('returns the full snapshot when previous is null or undefined', () => {
        const snap = makeExplorerSnapshot();
        expect(DiffAppContextSnapshot(null, snap)).toBe(snap);
        expect(DiffAppContextSnapshot(undefined, snap)).toBe(snap);
    });

    it('returns null when nothing visible to FormatAppContextNote changed (including cloned objects)', () => {
        const prev = makeExplorerSnapshot();
        const next = makeExplorerSnapshot({
            AdditionalContext: { ActiveDashboard: 'Overview', OpenWidgetCount: 4, IgnoredEmpty: null },
        });
        expect(DiffAppContextSnapshot(prev, next)).toBeNull();
    });

    it('emits a compact location + screen-state delta on intra-app tab navigation without repeating OtherNavItems, NavigableApps, or unchanged Tools', () => {
        const home = makeExplorerSnapshot();
        // Switching from Home -> Accounts inside Data Explorer swaps Home & Accounts between ActiveNavItem and OtherNavItems
        const accounts = makeExplorerSnapshot({
            ActiveNavItem: { Name: 'Accounts', ResourceType: 'Records' },
            OtherNavItems: [
                { Name: 'Home' },
                { Name: 'Contacts' },
                { Name: 'Opportunities' },
                { Name: 'Queries' },
                { Name: 'Reports' },
            ],
            AdditionalContext: { EntityName: 'Accounts', TotalRowCount: 412, ActiveFilter: 'Active' },
        });

        const delta = DiffAppContextSnapshot(home, accounts);
        expect(delta).not.toBeNull();
        expect(delta?.OtherNavItems).toBeUndefined();
        expect(delta?.NavigableApps).toBeUndefined();
        expect(delta?.Capabilities).toBeUndefined();

        const wireNote = FormatAppContextNote(delta!);
        const fullNote = FormatAppContextNote(accounts);
        expect(wireNote).toContain('location: Data Explorer › Accounts (Records)');
        expect(wireNote).toContain('EntityName: Accounts');
        expect(wireNote).not.toContain('sections in this app');
        expect(wireNote).not.toContain('apps you can open');
        expect(wireNote).not.toContain('NavigateToApp(');
        expect(wireNote.length).toBeLessThan(fullNote.length * 0.4);
    });

    it('includes the new app OtherNavItems when switching applications while omitting unchanged NavigableApps catalog', () => {
        const explorer = makeExplorerSnapshot();
        const knowledgeHub = makeExplorerSnapshot({
            App: { Name: 'Knowledge Hub', Description: 'Search & analytics' },
            ActiveNavItem: { Name: 'Search', ResourceType: 'Custom' },
            OtherNavItems: [{ Name: 'Clusters' }, { Name: 'Analytics' }],
            NavigableApps: [{ Name: 'Data Explorer' }, { Name: 'Admin' }, { Name: 'Chat' }],
            AdditionalContext: { Query: 'AIDP' },
        });

        const delta = DiffAppContextSnapshot(explorer, knowledgeHub);
        const wireNote = FormatAppContextNote(delta!);
        expect(wireNote).toContain('location: Knowledge Hub › Search (Custom)');
        expect(wireNote).toContain('sections in this app (NavigateToApp NavItemName): Clusters, Analytics');
        expect(wireNote).not.toContain('apps you can open');
    });

    it('includes Capabilities.Tools when a surface registers or removes custom client tools', () => {
        const before = makeExplorerSnapshot();
        const withSurfaceTool = makeExplorerSnapshot({
            Capabilities: {
                Tools: [
                    ...globalTools,
                    { Name: 'ExportCSV', Description: 'Export grid rows', InputSchema: { properties: { Format: {} }, required: ['Format'] } },
                ],
            },
        });

        const delta = DiffAppContextSnapshot(before, withSurfaceTool);
        expect(delta?.Capabilities?.Tools).toHaveLength(4);
        expect(FormatAppContextNote(delta!)).toContain('ExportCSV(Format) — Export grid rows');
    });

    it('re-emits location when View or AdditionalContext is cleared on the current screen so clearing state is observable', () => {
        const withSelection = makeExplorerSnapshot({
            View: {
                VisibleEntities: ['Accounts'],
                Selection: { EntityName: 'Accounts', RecordIDs: ['1', '2'] },
            },
        });
        const clearedSelection = makeExplorerSnapshot({
            View: undefined,
        });

        const delta = DiffAppContextSnapshot(withSelection, clearedSelection);
        expect(delta).not.toBeNull();
        expect(FormatAppContextNote(delta!)).toBe('[app-context]\nlocation: Data Explorer › Home (Custom)');
    });
});
