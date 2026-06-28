/**
 * Tests for the DevTools inspectors' pure agent-context helpers.
 *
 * 🔒 These tests also pin the SAFETY contract for the two METADATA-ONLY
 * inspectors: the App State and Settings helpers must emit ONLY counts /
 * labels / search terms — never an underlying state or setting VALUE.
 */
import { describe, it, expect } from 'vitest';
import {
    buildEventMonitorAgentContext,
    buildClassRegistryAgentContext,
    buildLazyModuleStatusAgentContext,
    buildLayoutInspectorAgentContext,
    buildAppStateInspectorAgentContext,
    buildSettingsExplorerAgentContext,
    EventMonitorAgentContextInput,
} from '../DevTools/dev-tools-agent-context';

function eventInput(overrides: Partial<EventMonitorAgentContextInput> = {}): EventMonitorAgentContextInput {
    return {
        EventCount: 0,
        EventsPerSecond: 0,
        Paused: false,
        TextFilter: '',
        TypeFilter: '',
        ComponentFilter: '',
        CodeFilter: '',
        SortField: 'time',
        SortDirection: 'desc',
        ...overrides,
    };
}

describe('buildEventMonitorAgentContext', () => {
    it('passes through capture metrics and filter/sort state', () => {
        const ctx = buildEventMonitorAgentContext(eventInput({
            EventCount: 142,
            EventsPerSecond: 7,
            Paused: true,
            SortField: 'type',
            SortDirection: 'asc',
        }));
        expect(ctx['EventCount']).toBe(142);
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
});

describe('buildClassRegistryAgentContext', () => {
    it('passes through counts and search/filter state', () => {
        const ctx = buildClassRegistryAgentContext({
            TotalClassCount: 500,
            BaseClassCount: 40,
            OverrideCount: 3,
            SearchTerm: 'BaseEntity',
            FilterByBase: 'BaseEntity',
        });
        expect(ctx['TotalClassCount']).toBe(500);
        expect(ctx['BaseClassCount']).toBe(40);
        expect(ctx['OverrideCount']).toBe(3);
        expect(ctx['SearchTerm']).toBe('BaseEntity');
        expect(ctx['FilterByBase']).toBe('BaseEntity');
        expect(ctx['HasActiveSearch']).toBe(true);
    });

    it('reports HasActiveSearch=false for empty / whitespace-only search', () => {
        const base = { TotalClassCount: 1, BaseClassCount: 1, OverrideCount: 0, FilterByBase: '' };
        expect(buildClassRegistryAgentContext({ ...base, SearchTerm: '' })['HasActiveSearch']).toBe(false);
        expect(buildClassRegistryAgentContext({ ...base, SearchTerm: '   ' })['HasActiveSearch']).toBe(false);
    });
});

describe('buildLazyModuleStatusAgentContext', () => {
    it('derives PendingModules from total minus loaded', () => {
        const ctx = buildLazyModuleStatusAgentContext({
            Available: true,
            TotalModules: 30,
            LoadedModules: 18,
            Filter: 'all',
        });
        expect(ctx['TotalModules']).toBe(30);
        expect(ctx['LoadedModules']).toBe(18);
        expect(ctx['PendingModules']).toBe(12);
        expect(ctx['Available']).toBe(true);
        expect(ctx['Filter']).toBe('all');
    });

    it('never reports negative PendingModules', () => {
        const ctx = buildLazyModuleStatusAgentContext({
            Available: true,
            TotalModules: 5,
            LoadedModules: 9, // defensive: shouldn't happen, but clamp anyway
            Filter: 'loaded',
        });
        expect(ctx['PendingModules']).toBe(0);
    });
});

describe('buildLayoutInspectorAgentContext', () => {
    it('maps the selected section + count to the SelectedElement/ElementCount contract', () => {
        const ctx = buildLayoutInspectorAgentContext({
            SelectedSection: 'golden',
            SelectedSectionLabel: 'Golden Layout',
            SectionCount: 2,
        });
        expect(ctx['SelectedElement']).toBe('golden');
        expect(ctx['SelectedSectionLabel']).toBe('Golden Layout');
        expect(ctx['ElementCount']).toBe(2);
    });
});

describe('buildAppStateInspectorAgentContext (METADATA-ONLY)', () => {
    it('emits only size / key-count / section label', () => {
        const ctx = buildAppStateInspectorAgentContext({
            StateSize: 2048,
            KeyCount: 6,
            ActiveSection: 'provider',
        });
        expect(ctx['StateSize']).toBe(2048);
        expect(ctx['KeyCount']).toBe(6);
        expect(ctx['ActiveSection']).toBe('provider');
    });

    it('🔒 exposes NO value-bearing keys (only metadata)', () => {
        const ctx = buildAppStateInspectorAgentContext({ StateSize: 10, KeyCount: 1, ActiveSection: 'user' });
        expect(Object.keys(ctx).sort()).toEqual(['ActiveSection', 'KeyCount', 'StateSize']);
    });
});

describe('buildSettingsExplorerAgentContext (METADATA-ONLY)', () => {
    it('emits only counts, scope, and the search term', () => {
        const ctx = buildSettingsExplorerAgentContext({
            SettingCount: 12,
            UserSettingCount: 12,
            InstanceSettingCount: 4,
            Scope: 'user',
            SearchTerm: 'mj.formBuilder',
        });
        expect(ctx['SettingCount']).toBe(12);
        expect(ctx['UserSettingCount']).toBe(12);
        expect(ctx['InstanceSettingCount']).toBe(4);
        expect(ctx['Scope']).toBe('user');
        expect(ctx['SearchTerm']).toBe('mj.formBuilder');
    });

    it('🔒 exposes NO setting-value keys (only metadata)', () => {
        const ctx = buildSettingsExplorerAgentContext({
            SettingCount: 0,
            UserSettingCount: 0,
            InstanceSettingCount: 0,
            Scope: 'instance',
            SearchTerm: '',
        });
        expect(Object.keys(ctx).sort()).toEqual(
            ['InstanceSettingCount', 'Scope', 'SearchTerm', 'SettingCount', 'UserSettingCount'],
        );
    });
});
