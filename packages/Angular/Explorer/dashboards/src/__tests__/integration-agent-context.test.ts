/**
 * Unit tests for the Integration dashboard's pure agent-context helpers.
 *
 * Covers:
 *   - resolveIntegrationSurface — tolerant surface validation incl. the
 *     "Integrations" → "Connections" metadata alias and case-insensitivity.
 *   - navLabelForSurface — canonical surface → real nav-item label mapping.
 *   - capIntegrationNames — bounded name-list helper.
 *   - resolveIntegrationRecord — id → exact-name → contains resolution.
 *   - buildIntegrationNotFoundError — tolerant "available names" message.
 *   - buildOverviewAgentContext / buildConnectionsAgentContext /
 *     buildActivityAgentContext / buildSchedulesAgentContext — deep per-surface
 *     context shaping (KPI strip + surface-specific deep fields, bounded lists
 *     with companion counts, never leaking one surface's fields into another).
 *
 * These helpers are pure (no Angular / DI), so no TestBed is needed.
 * See integration-agent-context.ts for the implementation.
 */

import { describe, it, expect } from 'vitest';
import {
    INTEGRATION_SURFACES,
    INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP,
    resolveIntegrationSurface,
    navLabelForSurface,
    capIntegrationNames,
    resolveIntegrationRecord,
    buildIntegrationNotFoundError,
    buildOverviewAgentContext,
    buildConnectionsAgentContext,
    buildActivityAgentContext,
    buildSchedulesAgentContext,
    IntegrationContextKPIs,
    NamedIntegrationRecord,
} from '../Integration/integration-agent-context';

const baseKPIs: IntegrationContextKPIs = {
    TotalIntegrations: 5,
    ActiveSyncs: 1,
    RecordsSyncedToday: 1234,
    SyncErrorRate: 12.5,
    PipelineCount: 8,
    ScheduledSyncCount: 3,
};

function expectKPIs(ctx: Record<string, unknown>): void {
    expect(ctx['TotalIntegrations']).toBe(5);
    expect(ctx['ActiveSyncs']).toBe(1);
    expect(ctx['RecordsSyncedToday']).toBe(1234);
    expect(ctx['SyncErrorRate']).toBe(12.5);
    expect(ctx['PipelineCount']).toBe(8);
    expect(ctx['ScheduledSyncCount']).toBe(3);
}

describe('resolveIntegrationSurface', () => {
    it('resolves each canonical surface name (exact case)', () => {
        for (const s of INTEGRATION_SURFACES) {
            expect(resolveIntegrationSurface(s)).toBe(s);
        }
    });

    it('is case-insensitive and trims whitespace', () => {
        expect(resolveIntegrationSurface('  overview ')).toBe('Overview');
        expect(resolveIntegrationSurface('ACTIVITY')).toBe('Activity');
        expect(resolveIntegrationSurface('Schedules')).toBe('Schedules');
    });

    it('maps the metadata alias "Integrations" to "Connections"', () => {
        expect(resolveIntegrationSurface('Integrations')).toBe('Connections');
        expect(resolveIntegrationSurface('integrations')).toBe('Connections');
    });

    it('returns null for unknown or non-string input', () => {
        expect(resolveIntegrationSurface('Pipelines')).toBeNull();
        expect(resolveIntegrationSurface('')).toBeNull();
        expect(resolveIntegrationSurface(undefined)).toBeNull();
        expect(resolveIntegrationSurface(42)).toBeNull();
        expect(resolveIntegrationSurface(null)).toBeNull();
    });
});

describe('navLabelForSurface', () => {
    it('returns the metadata nav label for each surface', () => {
        expect(navLabelForSurface('Overview')).toBe('Overview');
        // Connections is exposed to the agent under that name but its real
        // nav-item label in metadata is "Integrations".
        expect(navLabelForSurface('Connections')).toBe('Integrations');
        expect(navLabelForSurface('Activity')).toBe('Activity');
        expect(navLabelForSurface('Schedules')).toBe('Schedules');
    });
});

describe('capIntegrationNames', () => {
    it('returns the list unchanged when under the cap', () => {
        const names = ['a', 'b', 'c'];
        expect(capIntegrationNames(names)).toEqual(names);
    });

    it('caps at INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP and never mutates the input', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        const capped = capIntegrationNames(names);
        expect(capped).toHaveLength(INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names).toHaveLength(40); // input untouched
        expect(capped[0]).toBe('n0');
    });
});

describe('resolveIntegrationRecord', () => {
    const candidates: NamedIntegrationRecord[] = [
        { ID: 'ABCD-1111', Name: 'HubSpot Production' },
        { ID: 'ABCD-2222', Name: 'Salesforce Sandbox' },
        { ID: 'ABCD-3333', Name: 'Stripe Billing' },
    ];

    it('matches by exact ID (case-insensitive)', () => {
        expect(resolveIntegrationRecord('abcd-2222', candidates)?.Name).toBe('Salesforce Sandbox');
    });

    it('matches by exact name (case-insensitive, trimmed)', () => {
        expect(resolveIntegrationRecord('  stripe billing ', candidates)?.ID).toBe('ABCD-3333');
    });

    it('falls back to first contains match on the name', () => {
        expect(resolveIntegrationRecord('hub', candidates)?.ID).toBe('ABCD-1111');
        expect(resolveIntegrationRecord('sand', candidates)?.Name).toBe('Salesforce Sandbox');
    });

    it('returns null for an empty needle or no match', () => {
        expect(resolveIntegrationRecord('', candidates)).toBeNull();
        expect(resolveIntegrationRecord('   ', candidates)).toBeNull();
        expect(resolveIntegrationRecord('nonexistent', candidates)).toBeNull();
    });

    it('prefers an exact ID over a name-contains match', () => {
        const recs: NamedIntegrationRecord[] = [
            { ID: 'stripe', Name: 'Salesforce' },
            { ID: 'other', Name: 'Stripe contains needle' },
        ];
        // "stripe" is an exact ID on the first record AND a contains on the second.
        expect(resolveIntegrationRecord('stripe', recs)?.ID).toBe('stripe');
    });
});

describe('buildIntegrationNotFoundError', () => {
    it('lists up to six available names with the noun', () => {
        const candidates: NamedIntegrationRecord[] = Array.from({ length: 10 }, (_, i) => ({
            ID: `${i}`,
            Name: `Conn${i}`,
        }));
        const msg = buildIntegrationNotFoundError('zzz', candidates, 'connection');
        expect(msg).toContain('No connection matching "zzz"');
        expect(msg).toContain('Conn0');
        expect(msg).toContain('Conn5');
        expect(msg).not.toContain('Conn6');
    });

    it('handles an empty candidate list gracefully', () => {
        expect(buildIntegrationNotFoundError('x', [], 'run')).toContain('(none)');
    });
});

describe('buildOverviewAgentContext', () => {
    it('emits the surface, KPI strip, and deep overview fields', () => {
        const ctx = buildOverviewAgentContext({
            KPIs: baseKPIs,
            IsLoading: false,
            SuccessRate: 87.5,
            HealthyCount: 3,
            WarningCount: 1,
            ErrorCount: 1,
            InactiveCount: 0,
            AverageSyncDurationMs: 4200,
            VisibleIntegrationNames: ['HubSpot', 'Salesforce'],
            ActivityFeedCount: 2,
            RecentActivity: [{ Integration: 'HubSpot', Status: 'Success', When: '2m ago' }],
        });
        expect(ctx['Surface']).toBe('Overview');
        expect(ctx['IsLoading']).toBe(false);
        expectKPIs(ctx);
        expect(ctx['SuccessRate']).toBe(87.5);
        expect(ctx['HealthyCount']).toBe(3);
        expect(ctx['WarningCount']).toBe(1);
        expect(ctx['ErrorCount']).toBe(1);
        expect(ctx['InactiveCount']).toBe(0);
        expect(ctx['AverageSyncDurationMs']).toBe(4200);
        expect(ctx['VisibleIntegrationNames']).toEqual(['HubSpot', 'Salesforce']);
        expect(ctx['ActivityFeedCount']).toBe(2);
        expect(ctx['RecentActivity']).toHaveLength(1);
    });

    it('bounds the visible-name list and surfaces a companion count when truncated', () => {
        const names = Array.from({ length: 30 }, (_, i) => `i${i}`);
        const ctx = buildOverviewAgentContext({
            KPIs: baseKPIs, IsLoading: false, SuccessRate: 100,
            HealthyCount: 30, WarningCount: 0, ErrorCount: 0, InactiveCount: 0,
            AverageSyncDurationMs: null,
            VisibleIntegrationNames: names, ActivityFeedCount: 0, RecentActivity: [],
        });
        expect((ctx['VisibleIntegrationNames'] as string[]).length).toBe(INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleIntegrationNameCount']).toBe(30);
        expect(ctx['AverageSyncDurationMs']).toBeNull();
        expect(ctx).not.toHaveProperty('RecentActivity'); // empty → omitted
    });
});

describe('buildConnectionsAgentContext', () => {
    it('emits counts + visible names and omits detail fields when nothing is selected', () => {
        const ctx = buildConnectionsAgentContext({
            KPIs: baseKPIs, IsLoading: false,
            ConnectionCount: 5, ActiveConnectionCount: 4,
            VisibleConnectionNames: ['HubSpot', 'Stripe'],
            SelectedConnectionId: null, SelectedConnectionName: null,
            SelectedEntityMapCount: 9, DetailSearchTerm: 'foo',
        });
        expect(ctx['Surface']).toBe('Connections');
        expectKPIs(ctx);
        expect(ctx['ConnectionCount']).toBe(5);
        expect(ctx['ActiveConnectionCount']).toBe(4);
        expect(ctx['VisibleConnectionNames']).toEqual(['HubSpot', 'Stripe']);
        expect(ctx['SelectedConnectionId']).toBeNull();
        // Detail fields suppressed because no connection is selected.
        expect(ctx).not.toHaveProperty('SelectedEntityMapCount');
        expect(ctx).not.toHaveProperty('DetailSearchTerm');
    });

    it('includes detail fields when a connection is selected', () => {
        const ctx = buildConnectionsAgentContext({
            KPIs: baseKPIs, IsLoading: false,
            ConnectionCount: 5, ActiveConnectionCount: 4,
            VisibleConnectionNames: [],
            SelectedConnectionId: 'X1', SelectedConnectionName: 'HubSpot',
            SelectedEntityMapCount: 9, DetailSearchTerm: 'contacts',
        });
        expect(ctx['SelectedConnectionId']).toBe('X1');
        expect(ctx['SelectedConnectionName']).toBe('HubSpot');
        expect(ctx['SelectedEntityMapCount']).toBe(9);
        expect(ctx['DetailSearchTerm']).toBe('contacts');
        expect(ctx).not.toHaveProperty('VisibleConnectionNames'); // empty → omitted
    });
});

describe('buildActivityAgentContext', () => {
    it('emits filters, run counts, status breakdown, selection, and bounded run list', () => {
        const ctx = buildActivityAgentContext({
            KPIs: baseKPIs, IsLoading: false,
            StatusFilter: 'Failed', DateFilter: '7d',
            IntegrationFilterName: 'HubSpot (Acme)', SearchQuery: 'hub',
            FilteredRunCount: 4, TotalRunCount: 20,
            SuccessfulRunCount: 2, FailedRunCount: 1,
            TotalRecordsProcessed: 555,
            VisibleRuns: [
                { ID: 'R1', Name: 'HubSpot · Success', Status: 'Success', TotalRecords: 10, When: '1m ago' },
            ],
            SelectedRunId: 'R1', SelectedRunName: 'HubSpot · Success',
            AvailableIntegrationNames: ['HubSpot (Acme)', 'Stripe (Acme)'],
        });
        expect(ctx['Surface']).toBe('Activity');
        expectKPIs(ctx);
        expect(ctx['ActivityStatusFilter']).toBe('Failed');
        expect(ctx['ActivityDateFilter']).toBe('7d');
        expect(ctx['ActivityIntegrationFilter']).toBe('HubSpot (Acme)');
        expect(ctx['ActivitySearchQuery']).toBe('hub');
        expect(ctx['ActivityFilteredRunCount']).toBe(4);
        expect(ctx['ActivityTotalRunCount']).toBe(20);
        expect(ctx['ActivitySuccessfulRunCount']).toBe(2);
        expect(ctx['ActivityFailedRunCount']).toBe(1);
        expect(ctx['ActivityTotalRecordsProcessed']).toBe(555);
        expect(ctx['SelectedRunId']).toBe('R1');
        expect(ctx['SelectedRunName']).toBe('HubSpot · Success');
        expect(ctx['VisibleRuns']).toHaveLength(1);
        expect(ctx['AvailableIntegrationNames']).toHaveLength(2);
    });

    it('bounds the visible run list and emits a companion count when truncated', () => {
        const runs = Array.from({ length: 30 }, (_, i) => ({
            ID: `R${i}`, Name: `Run ${i}`, Status: 'Success', TotalRecords: i, When: 'now',
        }));
        const ctx = buildActivityAgentContext({
            KPIs: baseKPIs, IsLoading: false,
            StatusFilter: 'All', DateFilter: 'all', IntegrationFilterName: null, SearchQuery: '',
            FilteredRunCount: 30, TotalRunCount: 30, SuccessfulRunCount: 30, FailedRunCount: 0,
            TotalRecordsProcessed: 100, VisibleRuns: runs,
            SelectedRunId: null, SelectedRunName: null, AvailableIntegrationNames: [],
        });
        expect((ctx['VisibleRuns'] as unknown[]).length).toBe(INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleRunCount']).toBe(30);
        expect(ctx['ActivityIntegrationFilter']).toBeNull();
    });
});

describe('buildSchedulesAgentContext', () => {
    it('emits the schedule counts, cadence breakdown, and bounded schedule list', () => {
        const ctx = buildSchedulesAgentContext({
            KPIs: baseKPIs, IsLoading: false,
            ScheduleCount: 4, EnabledCount: 3, LockedCount: 1,
            IntervalCount: 2, CronCount: 1, ManualCount: 1,
            VisibleSchedules: [
                { Name: 'HubSpot · in 5m', Type: 'Interval', Enabled: true, Locked: false, NextRun: 'in 5m' },
            ],
        });
        expect(ctx['Surface']).toBe('Schedules');
        expectKPIs(ctx);
        expect(ctx['ScheduleCount']).toBe(4);
        expect(ctx['SchedulesEnabledCount']).toBe(3);
        expect(ctx['SchedulesLockedCount']).toBe(1);
        expect(ctx['SchedulesIntervalCount']).toBe(2);
        expect(ctx['SchedulesCronCount']).toBe(1);
        expect(ctx['SchedulesManualCount']).toBe(1);
        expect(ctx['VisibleSchedules']).toHaveLength(1);
    });

    it('omits the schedule list when empty', () => {
        const ctx = buildSchedulesAgentContext({
            KPIs: baseKPIs, IsLoading: true,
            ScheduleCount: 0, EnabledCount: 0, LockedCount: 0,
            IntervalCount: 0, CronCount: 0, ManualCount: 0,
            VisibleSchedules: [],
        });
        expect(ctx).not.toHaveProperty('VisibleSchedules');
        expect(ctx['IsLoading']).toBe(true);
    });
});
