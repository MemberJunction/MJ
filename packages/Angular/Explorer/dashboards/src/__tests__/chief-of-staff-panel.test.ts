// Angular decorators in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, beforeAll } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseChiefOfStaffPanel,
    CollectChiefOfStaffPanels,
    IsChiefOfStaffPanelMetadata,
    type ChiefOfStaffPanelContext,
    type ChiefOfStaffPanelRegistrationMetadata,
} from '../ChiefOfStaff/chief-of-staff-panel';
import type { AgentContextRecord } from '../ChiefOfStaff/chief-of-staff-agent-context';

/**
 * The core cockpit knows nothing about Open Apps. An app extends it by registering a
 * BaseChiefOfStaffPanel subclass with placement metadata; the cockpit collects whatever is
 * registered, mounts it, and hands it a context whose RefreshToken drives reloads.
 */

class TestPanel extends BaseChiefOfStaffPanel {
    public Loads = 0;
    public Searches: string[] = [];
    protected async LoadPanelData(): Promise<void> {
        this.Loads++;
    }
    protected override OnSearchTextChanged(searchText: string): void {
        this.Searches.push(searchText);
    }
    public Report(fields: AgentContextRecord): void {
        this.ReportAgentContext(fields);
    }
}

class PrioritiesPanel extends TestPanel {}
class PrioritiesPanelOverride extends TestPanel {}
class TodosPanel extends TestPanel {}
class AlphaTab extends TestPanel {}
class MalformedPanel extends TestPanel {}

function register(subClass: unknown, metadata: Record<string, unknown>): void {
    MJGlobal.Instance.ClassFactory.Register(BaseChiefOfStaffPanel, subClass, `test:${String(metadata['panelKey'])}`, 0, true, false, metadata);
}

function context(overrides: Partial<ChiefOfStaffPanelContext> = {}): ChiefOfStaffPanelContext {
    return {
        RefreshToken: 1,
        SearchText: '',
        AgentID: 'AGENT',
        ReportAgentContext: () => undefined,
        ShowBanner: () => undefined,
        ...overrides,
    };
}

describe('IsChiefOfStaffPanelMetadata', () => {
    it('accepts a tab or overview placement with a panel key and a label', () => {
        expect(IsChiefOfStaffPanelMetadata({ placement: 'tab', panelKey: 'priorities', label: 'Priorities' })).toBe(true);
        expect(IsChiefOfStaffPanelMetadata({ placement: 'overview', panelKey: 'todos', label: 'To-dos' })).toBe(true);
    });

    it('rejects missing metadata, an unknown placement, a blank key or a missing label', () => {
        expect(IsChiefOfStaffPanelMetadata(undefined)).toBe(false);
        expect(IsChiefOfStaffPanelMetadata({ placement: 'sidebar', panelKey: 'x', label: 'X' })).toBe(false);
        expect(IsChiefOfStaffPanelMetadata({ placement: 'tab', panelKey: '  ', label: 'X' })).toBe(false);
        expect(IsChiefOfStaffPanelMetadata({ placement: 'tab', panelKey: 'x' })).toBe(false);
    });
});

describe('CollectChiefOfStaffPanels', () => {
    beforeAll(() => {
        register(PrioritiesPanel, { placement: 'tab', panelKey: 'priorities', label: 'Priorities & OKRs', sortKey: 10 });
        register(TodosPanel, { placement: 'overview', panelKey: 'todos', label: 'To-dos', liveEntities: ['My_App: Tasks'] });
        register(AlphaTab, { placement: 'tab', panelKey: 'alpha', label: 'Alpha' });
        register(MalformedPanel, { placement: 'nowhere', panelKey: 'broken', label: 'Broken' });
        // A later registration for the same key replaces the earlier one.
        register(PrioritiesPanelOverride, { placement: 'tab', panelKey: 'priorities', label: 'Priorities v2', sortKey: 10 });
    });

    it('returns valid registrations, sorted by sortKey then label, with the later duplicate winning', () => {
        const panels = CollectChiefOfStaffPanels();
        expect(panels.map((p) => p.Metadata.panelKey)).toEqual(['priorities', 'alpha', 'todos']);
        expect(panels[0].Component).toBe(PrioritiesPanelOverride);
        expect(panels[0].Metadata.label).toBe('Priorities v2');
    });

    it('keeps each panel\'s placement and declared live entities', () => {
        const todos = CollectChiefOfStaffPanels().find((p) => p.Metadata.panelKey === 'todos');
        expect(todos?.Metadata.placement).toBe('overview');
        expect(todos?.Metadata.liveEntities).toEqual(['My_App: Tasks']);
    });
});

describe('BaseChiefOfStaffPanel', () => {
    const registration: ChiefOfStaffPanelRegistrationMetadata = { placement: 'tab', panelKey: 'priorities', label: 'Priorities' };

    it('loads once on its first context and again only when the refresh token changes', () => {
        const panel = new PrioritiesPanel();
        panel.Context = context({ RefreshToken: 1 });
        panel.Context = context({ RefreshToken: 1 });
        expect(panel.Loads).toBe(1);
        panel.Context = context({ RefreshToken: 2 });
        expect(panel.Loads).toBe(2);
    });

    it('tells the panel when the cockpit search text changes, not on the first context', () => {
        const panel = new PrioritiesPanel();
        panel.Context = context({ SearchText: '' });
        panel.Context = context({ SearchText: 'launch' });
        panel.Context = context({ SearchText: 'launch' });
        expect(panel.Searches).toEqual(['launch']);
    });

    it('reports agent context under its registration key', () => {
        const reports: Array<{ key: string; fields: AgentContextRecord }> = [];
        const panel = new PrioritiesPanel();
        panel.Registration = registration;
        panel.Context = context({ ReportAgentContext: (key, fields) => reports.push({ key, fields }) });
        panel.Report({ PriorityObjectiveCount: 3 });
        expect(reports).toEqual([{ key: 'priorities', fields: { PriorityObjectiveCount: 3 } }]);
    });

    it('does not report before it has a registration and a context', () => {
        const panel = new PrioritiesPanel();
        expect(() => panel.Report({ X: 1 })).not.toThrow();
    });
});
