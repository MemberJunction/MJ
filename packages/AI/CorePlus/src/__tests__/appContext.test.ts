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

    it('renders a compact location + view + capabilities note', () => {
        const snap: AppContextSnapshot = {
            App: { Name: 'Knowledge Hub', Description: '' },
            ActiveNavItem: { Name: 'Analytics' },
            OtherNavItems: [],
            User: { Name: 'Amith', Roles: [] },
            View: {
                VisibleEntities: ['Content Items'],
                Selection: { EntityName: 'Content Items', RecordIDs: ['1', '2'] },
                FreeText: null,
            },
            Capabilities: {
                Tools: [{ Name: 'ExportCSV', Description: 'd', InputSchema: {} }],
                Agents: [{ AgentID: 'a1', Name: 'Skip' }],
            },
        };
        const note = FormatAppContextNote(snap);
        expect(note).toContain('[app-context]');
        expect(note).toContain('location: Knowledge Hub › Analytics');
        expect(note).toContain('viewing: Content Items');
        expect(note).toContain('selected: Content Items 2 record(s)');
        expect(note).toContain('available tools: ExportCSV');
        expect(note).toContain('available agents: Skip');
    });

    it('renders a focused delta when only View/Capabilities present', () => {
        const note = FormatAppContextNote({ View: { FreeText: 'editing form Members, field Email' } });
        expect(note).toBe('[app-context] editing form Members, field Email');
    });
});
