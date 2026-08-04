/**
 * Tests for the DevTools inspectors' pure agent-context helpers.
 *
 * 🔒 These tests also pin the SAFETY contract for the two METADATA-ONLY
 * inspectors: the App State and Settings helpers must emit ONLY counts /
 * labels / KEY NAMES / search terms — never an underlying state or setting
 * VALUE.
 */
import { describe, it, expect } from 'vitest';
import {
    buildEventMonitorAgentContext,
    buildClassRegistryAgentContext,
    buildLazyModuleStatusAgentContext,
    buildLayoutInspectorAgentContext,
    buildAppStateInspectorAgentContext,
    buildSettingsExplorerAgentContext,
    boundDevToolsNames,
    DEV_TOOLS_NAME_LIST_CAP,
    EventMonitorAgentContextInput,
} from '../DevTools/dev-tools-agent-context';

/** Build a list of N synthetic, distinct names — for cap/truncation tests. */
function makeNames(n: number, prefix = 'name'): string[] {
    return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

function eventInput(overrides: Partial<EventMonitorAgentContextInput> = {}): EventMonitorAgentContextInput {
    return {
        EventCount: 0,
        BufferedCount: 0,
        EventsPerSecond: 0,
        Paused: false,
        TextFilter: '',
        TypeFilter: '',
        ComponentFilter: '',
        CodeFilter: '',
        SortField: 'time',
        SortDirection: 'desc',
        FilteredCount: 0,
        KnownTypes: [],
        KnownComponents: [],
        KnownCodes: [],
        RecentEvents: [],
        ...overrides,
    };
}

describe('boundDevToolsNames', () => {
    it('caps at DEV_TOOLS_NAME_LIST_CAP and never mutates the input', () => {
        const input = makeNames(DEV_TOOLS_NAME_LIST_CAP + 10);
        const out = boundDevToolsNames(input);
        expect(out).toHaveLength(DEV_TOOLS_NAME_LIST_CAP);
        expect(input).toHaveLength(DEV_TOOLS_NAME_LIST_CAP + 10); // unchanged
        expect(out).not.toBe(input);
    });
    it('returns short lists unchanged', () => {
        expect(boundDevToolsNames(['a', 'b'])).toEqual(['a', 'b']);
    });
});

describe('buildEventMonitorAgentContext', () => {
    it('passes through capture metrics and filter/sort state', () => {
        const ctx = buildEventMonitorAgentContext(eventInput({
            EventCount: 142,
            BufferedCount: 100,
            FilteredCount: 40,
            EventsPerSecond: 7,
            Paused: true,
            SortField: 'type',
            SortDirection: 'asc',
        }));
        expect(ctx['EventCount']).toBe(142);
        expect(ctx['BufferedCount']).toBe(100);
        expect(ctx['FilteredCount']).toBe(40);
        expect(ctx['EventsPerSecond']).toBe(7);
        expect(ctx['Paused']).toBe(true);
        expect(ctx['SortField']).toBe('type');
        expect(ctx['SortDirection']).toBe('asc');
    });

    it('reports HasActiveFilters=false with no filters set', () => {
        expect(buildEventMonitorAgentContext(eventInput())['HasActiveFilters']).toBe(false);
    });

    it('reports HasActiveFilters=true when any filter is non-empty', () => {
        expect(buildEventMonitorAgentContext(eventInput({ TypeFilter: 'Save' }))['HasActiveFilters']).toBe(true);
        expect(buildEventMonitorAgentContext(eventInput({ TextFilter: 'q' }))['HasActiveFilters']).toBe(true);
        expect(buildEventMonitorAgentContext(eventInput({ ComponentFilter: 'X' }))['HasActiveFilters']).toBe(true);
        expect(buildEventMonitorAgentContext(eventInput({ CodeFilter: 'C' }))['HasActiveFilters']).toBe(true);
    });

    it('publishes bounded known-type/component/code lists with companion counts when truncated', () => {
        const ctx = buildEventMonitorAgentContext(eventInput({
            KnownTypes: makeNames(DEV_TOOLS_NAME_LIST_CAP + 3, 'type'),
            KnownComponents: ['CompA', 'CompB'],
            KnownCodes: [],
        }));
        expect(ctx['KnownEventTypes']).toHaveLength(DEV_TOOLS_NAME_LIST_CAP);
        expect(ctx['KnownEventTypeCount']).toBe(DEV_TOOLS_NAME_LIST_CAP + 3);
        expect(ctx['KnownComponents']).toEqual(['CompA', 'CompB']);
        expect(ctx['KnownComponentCount']).toBeUndefined(); // not truncated
        expect(ctx['KnownEventCodes']).toBeUndefined();      // empty → omitted
    });

    it('publishes bounded RecentEvents (secret-free summaries)', () => {
        const ctx = buildEventMonitorAgentContext(eventInput({
            RecentEvents: [
                { Type: 'Save', Component: 'FormX', Summary: '{ id, name }' },
                { Type: 'Nav', Component: '(no component)', Summary: '—' },
            ],
        }));
        expect(ctx['RecentEvents']).toEqual([
            { Type: 'Save', Component: 'FormX', Summary: '{ id, name }' },
            { Type: 'Nav', Component: '(no component)', Summary: '—' },
        ]);
    });

    it('omits RecentEvents when there are none', () => {
        expect(buildEventMonitorAgentContext(eventInput())['RecentEvents']).toBeUndefined();
    });
});

describe('buildClassRegistryAgentContext', () => {
    it('passes through counts and search/filter state + visible base classes', () => {
        const ctx = buildClassRegistryAgentContext({
            TotalClassCount: 500,
            BaseClassCount: 40,
            OverrideCount: 3,
            SearchTerm: 'BaseEntity',
            FilterByBase: 'BaseEntity',
            VisibleGroupCount: 1,
            VisibleBaseClassNames: ['BaseEntity'],
        });
        expect(ctx['TotalClassCount']).toBe(500);
        expect(ctx['BaseClassCount']).toBe(40);
        expect(ctx['OverrideCount']).toBe(3);
        expect(ctx['SearchTerm']).toBe('BaseEntity');
        expect(ctx['FilterByBase']).toBe('BaseEntity');
        expect(ctx['HasActiveSearch']).toBe(true);
        expect(ctx['VisibleGroupCount']).toBe(1);
        expect(ctx['VisibleBaseClasses']).toEqual(['BaseEntity']);
    });

    it('caps VisibleBaseClasses + emits a companion count when truncated', () => {
        const ctx = buildClassRegistryAgentContext({
            TotalClassCount: 9999,
            BaseClassCount: 100,
            OverrideCount: 0,
            SearchTerm: '',
            FilterByBase: '',
            VisibleGroupCount: 100,
            VisibleBaseClassNames: makeNames(DEV_TOOLS_NAME_LIST_CAP + 5, 'Base'),
        });
        expect(ctx['VisibleBaseClasses']).toHaveLength(DEV_TOOLS_NAME_LIST_CAP);
        expect(ctx['VisibleBaseClassCount']).toBe(DEV_TOOLS_NAME_LIST_CAP + 5);
    });

    it('reports HasActiveSearch=false for empty / whitespace-only search', () => {
        const base = { TotalClassCount: 1, BaseClassCount: 1, OverrideCount: 0, FilterByBase: '', VisibleGroupCount: 1, VisibleBaseClassNames: ['X'] };
        expect(buildClassRegistryAgentContext({ ...base, SearchTerm: '' })['HasActiveSearch']).toBe(false);
        expect(buildClassRegistryAgentContext({ ...base, SearchTerm: '   ' })['HasActiveSearch']).toBe(false);
    });
});

describe('buildLazyModuleStatusAgentContext', () => {
    it('derives PendingModules from total minus loaded and surfaces search/visible state', () => {
        const ctx = buildLazyModuleStatusAgentContext({
            Available: true,
            TotalModules: 30,
            LoadedModules: 18,
            Filter: 'all',
            SearchQuery: 'dashboards',
            VisibleModuleCount: 5,
            VisibleModuleNames: ['ng-dashboards/a', 'ng-dashboards/b'],
        });
        expect(ctx['TotalModules']).toBe(30);
        expect(ctx['LoadedModules']).toBe(18);
        expect(ctx['PendingModules']).toBe(12);
        expect(ctx['Available']).toBe(true);
        expect(ctx['Filter']).toBe('all');
        expect(ctx['SearchQuery']).toBe('dashboards');
        expect(ctx['HasActiveSearch']).toBe(true);
        expect(ctx['VisibleModuleCount']).toBe(5);
        expect(ctx['VisibleModules']).toEqual(['ng-dashboards/a', 'ng-dashboards/b']);
    });

    it('never reports negative PendingModules', () => {
        const ctx = buildLazyModuleStatusAgentContext({
            Available: true,
            TotalModules: 5,
            LoadedModules: 9, // defensive: shouldn't happen, but clamp anyway
            Filter: 'loaded',
            SearchQuery: '',
            VisibleModuleCount: 0,
            VisibleModuleNames: [],
        });
        expect(ctx['PendingModules']).toBe(0);
        expect(ctx['HasActiveSearch']).toBe(false);
        expect(ctx['VisibleModules']).toBeUndefined(); // empty → omitted
    });
});

describe('buildLayoutInspectorAgentContext', () => {
    it('maps the selected section + count to the SelectedElement/ElementCount contract and lists sections', () => {
        const ctx = buildLayoutInspectorAgentContext({
            SelectedSection: 'golden',
            SelectedSectionLabel: 'Golden Layout',
            SectionCount: 2,
            SectionIds: ['workspace', 'golden'],
            SnapshotSize: 512,
        });
        expect(ctx['SelectedElement']).toBe('golden');
        expect(ctx['SelectedSectionLabel']).toBe('Golden Layout');
        expect(ctx['ElementCount']).toBe(2);
        expect(ctx['AvailableSections']).toEqual(['workspace', 'golden']);
        expect(ctx['SnapshotSize']).toBe(512);
    });
});

describe('buildAppStateInspectorAgentContext (METADATA-ONLY)', () => {
    it('emits size / key-count / section label+ids / top-level KEY NAMES', () => {
        const ctx = buildAppStateInspectorAgentContext({
            StateSize: 2048,
            KeyCount: 3,
            ActiveSection: 'provider',
            ActiveSectionLabel: 'Provider',
            SectionIds: ['user', 'provider'],
            TopLevelKeys: ['type', 'EntitiesCount', 'URL'],
        });
        expect(ctx['StateSize']).toBe(2048);
        expect(ctx['KeyCount']).toBe(3);
        expect(ctx['ActiveSection']).toBe('provider');
        expect(ctx['ActiveSectionLabel']).toBe('Provider');
        expect(ctx['AvailableSections']).toEqual(['user', 'provider']);
        expect(ctx['TopLevelKeys']).toEqual(['type', 'EntitiesCount', 'URL']);
    });

    it('🔒 exposes only metadata keys (counts/labels/key-names) — NO value-bearing keys', () => {
        const ctx = buildAppStateInspectorAgentContext({
            StateSize: 10,
            KeyCount: 1,
            ActiveSection: 'user',
            ActiveSectionLabel: 'Current User',
            SectionIds: ['user'],
            TopLevelKeys: ['Email'],
        });
        // The published shape is a CLOSED set of metadata keys — no "Value"/state payload.
        expect(Object.keys(ctx).sort()).toEqual(
            ['ActiveSection', 'ActiveSectionLabel', 'AvailableSections', 'KeyCount', 'StateSize', 'TopLevelKeys'],
        );
    });
});

describe('buildSettingsExplorerAgentContext (METADATA-ONLY)', () => {
    it('emits counts, scope, search term, filtered count, and setting KEY NAMES', () => {
        const ctx = buildSettingsExplorerAgentContext({
            SettingCount: 12,
            UserSettingCount: 12,
            InstanceSettingCount: 4,
            Scope: 'user',
            SearchTerm: 'mj.formBuilder',
            FilteredCount: 2,
            SettingKeys: ['mj.formBuilder.cockpitPrefs.v1', 'mj.formBuilder.x'],
        });
        expect(ctx['SettingCount']).toBe(12);
        expect(ctx['UserSettingCount']).toBe(12);
        expect(ctx['InstanceSettingCount']).toBe(4);
        expect(ctx['Scope']).toBe('user');
        expect(ctx['SearchTerm']).toBe('mj.formBuilder');
        expect(ctx['HasActiveSearch']).toBe(true);
        expect(ctx['FilteredCount']).toBe(2);
        expect(ctx['SettingKeys']).toEqual(['mj.formBuilder.cockpitPrefs.v1', 'mj.formBuilder.x']);
    });

    it('caps SettingKeys + emits a companion total when truncated', () => {
        const ctx = buildSettingsExplorerAgentContext({
            SettingCount: 100,
            UserSettingCount: 100,
            InstanceSettingCount: 0,
            Scope: 'user',
            SearchTerm: '',
            FilteredCount: 100,
            SettingKeys: makeNames(DEV_TOOLS_NAME_LIST_CAP + 7, 'key.'),
        });
        expect(ctx['SettingKeys']).toHaveLength(DEV_TOOLS_NAME_LIST_CAP);
        expect(ctx['SettingKeyTotal']).toBe(DEV_TOOLS_NAME_LIST_CAP + 7);
    });

    it('🔒 exposes only metadata keys (counts/scope/search/key-names) — NO setting-value keys', () => {
        const ctx = buildSettingsExplorerAgentContext({
            SettingCount: 0,
            UserSettingCount: 0,
            InstanceSettingCount: 0,
            Scope: 'instance',
            SearchTerm: '',
            FilteredCount: 0,
            SettingKeys: [],
        });
        // Empty key list is omitted; the closed metadata shape carries no value field.
        expect(Object.keys(ctx).sort()).toEqual(
            ['FilteredCount', 'HasActiveSearch', 'InstanceSettingCount', 'Scope', 'SearchTerm', 'SettingCount', 'UserSettingCount'],
        );
    });
});
