/**
 * Unit tests for the Integration dashboard's pure agent-context helpers.
 *
 * Covers:
 *   - resolveIntegrationSurface — tolerant surface validation incl. the
 *     "Integrations" → "Connections" metadata alias and case-insensitivity.
 *   - navLabelForSurface — canonical surface → real nav-item label mapping.
 *   - buildIntegrationAgentContext — flat context shaping: always emits the
 *     shared KPI strip + Surface, appends surface-specific fields only when
 *     supplied, and never leaks one surface's fields into another.
 *
 * These helpers are pure (no Angular / DI), so no TestBed is needed.
 * See integration-agent-context.ts for the implementation.
 */

import { describe, it, expect } from 'vitest';
import {
    INTEGRATION_SURFACES,
    resolveIntegrationSurface,
    navLabelForSurface,
    buildIntegrationAgentContext,
    IntegrationContextKPIs,
} from '../Integration/integration-agent-context';

const baseKPIs: IntegrationContextKPIs = {
    TotalIntegrations: 5,
    ActiveSyncs: 1,
    RecordsSyncedToday: 1234,
    SyncErrorRate: 12.5,
    PipelineCount: 8,
    ScheduledSyncCount: 3,
};

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

describe('buildIntegrationAgentContext', () => {
    it('always emits the surface + the shared KPI strip', () => {
        const ctx = buildIntegrationAgentContext({ Surface: 'Overview', KPIs: baseKPIs });
        expect(ctx).toEqual({
            Surface: 'Overview',
            TotalIntegrations: 5,
            ActiveSyncs: 1,
            RecordsSyncedToday: 1234,
            SyncErrorRate: 12.5,
            PipelineCount: 8,
            ScheduledSyncCount: 3,
        });
    });

    it('includes IsLoading only when provided', () => {
        const without = buildIntegrationAgentContext({ Surface: 'Connections', KPIs: baseKPIs });
        expect(without).not.toHaveProperty('IsLoading');

        const withFlag = buildIntegrationAgentContext({ Surface: 'Connections', KPIs: baseKPIs, IsLoading: true });
        expect(withFlag['IsLoading']).toBe(true);
    });

    it('appends Activity-specific fields only on the Activity surface', () => {
        const ctx = buildIntegrationAgentContext({
            Surface: 'Activity',
            KPIs: baseKPIs,
            ActivityStatusFilter: 'Failed',
            ActivitySearchQuery: 'hubspot',
            ActivityFilteredRunCount: 4,
            ActivityTotalRunCount: 20,
        });
        expect(ctx['ActivityStatusFilter']).toBe('Failed');
        expect(ctx['ActivitySearchQuery']).toBe('hubspot');
        expect(ctx['ActivityFilteredRunCount']).toBe(4);
        expect(ctx['ActivityTotalRunCount']).toBe(20);
    });

    it('does not leak Activity fields onto a non-Activity surface', () => {
        const ctx = buildIntegrationAgentContext({
            Surface: 'Overview',
            KPIs: baseKPIs,
            // Supplied but should be ignored because Surface !== 'Activity'.
            ActivityStatusFilter: 'Failed',
            SchedulesEnabledCount: 9,
        });
        expect(ctx).not.toHaveProperty('ActivityStatusFilter');
        expect(ctx).not.toHaveProperty('SchedulesEnabledCount');
    });

    it('appends Schedule-specific fields only on the Schedules surface', () => {
        const ctx = buildIntegrationAgentContext({
            Surface: 'Schedules',
            KPIs: baseKPIs,
            SchedulesEnabledCount: 3,
            SchedulesLockedCount: 1,
        });
        expect(ctx['SchedulesEnabledCount']).toBe(3);
        expect(ctx['SchedulesLockedCount']).toBe(1);
    });

    it('omits surface-specific fields that are not supplied', () => {
        const ctx = buildIntegrationAgentContext({ Surface: 'Activity', KPIs: baseKPIs });
        expect(ctx).not.toHaveProperty('ActivityStatusFilter');
        expect(ctx).not.toHaveProperty('ActivitySearchQuery');
    });
});
