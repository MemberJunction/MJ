/**
 * Tests for the Realtime Voice analytics shared data layer
 * (`AI/components/analytics/realtime/realtime-session-data.ts`):
 * - the sessions query requests the persisted `CloseReason` column
 * - rollups carry the real close cause (no more ClosedAt−LastActiveAt heuristic)
 * - NULL CloseReason (legacy rows) maps to "unknown", never to janitor
 * - `BuildSessionStatusDisplay` label / title / icon mapping per close cause
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const runViewsMock = vi.fn();
vi.mock('@memberjunction/core', () => ({
    RunView: {
        FromMetadataProvider: () => ({ RunViews: runViewsMock }),
    },
}));

vi.mock('@memberjunction/global', () => ({
    NormalizeUUID: (value: string) => value.toLowerCase(),
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Agents: [{ ID: 'agent-target-1', Name: 'Target Agent One' }],
        },
    },
}));

import type { IMetadataProvider } from '@memberjunction/core';
import {
    LoadRealtimeSessionsDataset,
    BuildSessionStatusDisplay,
    RealtimeSessionRecord,
    RealtimeSessionCloseReason,
} from '../AI/components/analytics/realtime/realtime-session-data';

// ── Helpers ──

const provider = {} as IMetadataProvider;

function makeSessionRecord(overrides: Partial<RealtimeSessionRecord> = {}): RealtimeSessionRecord {
    const now = Date.now();
    return {
        ID: 'session-1',
        AgentID: 'agent-co-1',
        Agent: 'Voice Co-Agent',
        UserID: 'user-1',
        User: 'Tester',
        Status: 'Closed',
        ConversationID: null,
        LastSessionID: null,
        HostInstanceID: 'host:123:boot',
        Config: null,
        LastActiveAt: new Date(now - 60_000).toISOString(),
        ClosedAt: new Date(now).toISOString(),
        CloseReason: 'Explicit',
        __mj_CreatedAt: new Date(now - 300_000).toISOString(),
        ...overrides,
    };
}

/** Queues the three RunViews result sets: sessions, channels, runs. */
function queueDataset(sessions: RealtimeSessionRecord[]): void {
    runViewsMock.mockResolvedValue([
        { Success: true, Results: sessions },
        { Success: true, Results: [] },
        { Success: true, Results: [] },
    ]);
}

beforeEach(() => {
    runViewsMock.mockReset();
    queueDataset([]);
});

// ── Query shape ──

describe('LoadRealtimeSessionsDataset — query shape', () => {
    it('requests the persisted CloseReason column on the sessions view', async () => {
        await LoadRealtimeSessionsDataset(provider, '7d');

        expect(runViewsMock).toHaveBeenCalledTimes(1);
        const batch = runViewsMock.mock.calls[0][0] as Array<{ EntityName: string; Fields: string[] }>;
        const sessionParams = batch.find(p => p.EntityName === 'MJ: AI Agent Sessions');
        expect(sessionParams).toBeDefined();
        expect(sessionParams!.Fields).toContain('CloseReason');
    });
});

// ── Rollup mapping ──

describe('LoadRealtimeSessionsDataset — CloseReason rollup mapping', () => {
    it.each(['Explicit', 'Janitor', 'Shutdown', 'Error'] as const)(
        'carries CloseReason %s through to the rollup',
        async (reason) => {
            queueDataset([makeSessionRecord({ ID: `s-${reason}`, CloseReason: reason })]);

            const ds = await LoadRealtimeSessionsDataset(provider, '7d');

            expect(ds.AllSessions).toHaveLength(1);
            expect(ds.AllSessions[0].CloseReason).toBe(reason);
            expect(ds.AllSessions[0].IsJanitorClosed).toBe(reason === 'Janitor');
        },
    );

    it('maps NULL CloseReason on a Closed row to null (legacy/unknown), not janitor — even with a large ClosedAt−LastActiveAt gap', async () => {
        const now = Date.now();
        // 20-minute gap would have tripped the retired ≥10-minute janitor heuristic.
        queueDataset([makeSessionRecord({
            CloseReason: null,
            LastActiveAt: new Date(now - 20 * 60_000).toISOString(),
            ClosedAt: new Date(now).toISOString(),
        })]);

        const ds = await LoadRealtimeSessionsDataset(provider, '7d');

        expect(ds.AllSessions[0].CloseReason).toBeNull();
        expect(ds.AllSessions[0].IsJanitorClosed).toBe(false);
    });

    it('reports no close reason for a still-open session, even if the row carries a stray value', async () => {
        queueDataset([makeSessionRecord({ Status: 'Active', ClosedAt: null, CloseReason: 'Explicit' })]);

        const ds = await LoadRealtimeSessionsDataset(provider, '7d');

        expect(ds.AllSessions[0].CloseReason).toBeNull();
        expect(ds.AllSessions[0].IsJanitorClosed).toBe(false);
    });
});

// ── Status-pill display ──

describe('BuildSessionStatusDisplay', () => {
    it('renders Active with the live dot (no icon)', () => {
        const d = BuildSessionStatusDisplay('Active', null);
        expect(d.Label).toBe('Active');
        expect(d.Icon).toBe('');
    });

    it('renders Idle with the pause icon', () => {
        const d = BuildSessionStatusDisplay('Idle', null);
        expect(d.Label).toBe('Idle');
        expect(d.Icon).toContain('fa-pause');
    });

    const closedCases: Array<[RealtimeSessionCloseReason | null, string, string]> = [
        ['Explicit', 'Closed', 'fa-circle-stop'],
        ['Janitor', 'Closed · janitor', 'fa-broom'],
        ['Shutdown', 'Closed · shutdown', 'fa-power-off'],
        ['Error', 'Closed · error', 'fa-triangle-exclamation'],
        [null, 'Closed · unknown', 'fa-circle-question'],
    ];

    it.each(closedCases)(
        'renders a Closed session with reason %s as "%s"',
        (reason, expectedLabel, expectedIcon) => {
            const d = BuildSessionStatusDisplay('Closed', reason);
            expect(d.Label).toBe(expectedLabel);
            expect(d.Icon).toContain(expectedIcon);
            expect(d.Title.length).toBeGreaterThan(0);
        },
    );

    it('explains the legacy NULL case in the hover title', () => {
        const d = BuildSessionStatusDisplay('Closed', null);
        expect(d.Title.toLowerCase()).toContain('legacy');
    });
});
