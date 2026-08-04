/**
 * Tests for the pure metrics-aggregation helpers in the Realtime management
 * data layer (`AI/components/analytics/realtime/realtime-management-data.ts`):
 * - `BucketSessionBridgesByDay` emits one dense bucket per day (incl. zeros),
 *   counts bridges into the correct local-day bucket, and clamps out-of-window
 *   rows.
 * - `SummarizeBridgesByProvider` / `ByStatus` / `ByAgent` count + sort descending.
 * - `BuildCapabilityChips` prioritizes media → join → signals and skips falsy.
 */
import { describe, it, expect } from 'vitest';

// The helpers under test import only @memberjunction/core-entities for a *type*
// (erased at runtime) and @memberjunction/global / @memberjunction/core for the
// loader path we don't exercise here. Mock them so the module imports cleanly.
import { vi } from 'vitest';
vi.mock('@memberjunction/core', () => ({ RunView: { FromMetadataProvider: () => ({ RunViews: vi.fn() }) } }));
vi.mock('@memberjunction/global', () => ({ NormalizeUUID: (v: string) => v.toLowerCase() }));
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    BucketSessionBridgesByDay,
    SummarizeBridgesByProvider,
    SummarizeBridgesByStatus,
    SummarizeBridgesByAgent,
    BuildCapabilityChips,
    SessionBridgeRollup,
} from '../AI/components/analytics/realtime/realtime-management-data';

/** Minimal rollup factory — only the fields the pure helpers read. */
function rollup(partial: {
    startedAt: Date;
    provider?: string;
    status?: SessionBridgeRollup['Record']['Status'];
    agent?: string;
}): SessionBridgeRollup {
    return {
        Record: {
            ID: 'b-' + Math.random().toString(36).slice(2),
            AgentSessionID: 's1',
            ProviderID: 'p1',
            Provider: partial.provider ?? 'Zoom',
            Direction: 'Outbound',
            JoinMethod: 'OnDemand',
            TurnMode: 'Passive',
            Address: null,
            Status: partial.status ?? 'Connected',
            ScheduledStartTime: null,
            ConnectedAt: null,
            DisconnectedAt: null,
            CloseReason: null,
            HostInstanceID: null,
            __mj_CreatedAt: partial.startedAt.toISOString(),
        },
        Session: null,
        AgentName: partial.agent ?? 'Sage',
        UserName: '—',
        ParticipantCount: 0,
        StartedAt: partial.startedAt,
        DurationMs: 0,
        IsLive: true,
    };
}

describe('BucketSessionBridgesByDay', () => {
    it('emits one dense bucket per day across the window, including zero-count days', () => {
        const now = new Date(2026, 5, 13, 14, 0, 0); // Jun 13 2026 14:00 local
        const windowStart = new Date(2026, 5, 11, 0, 0, 0); // Jun 11
        const buckets = BucketSessionBridgesByDay([], windowStart, now);
        expect(buckets.map(b => b.Label)).toEqual(['2026-06-11', '2026-06-12', '2026-06-13']);
        expect(buckets.every(b => b.Count === 0)).toBe(true);
    });

    it('counts each bridge into its local-day bucket', () => {
        const now = new Date(2026, 5, 13, 14, 0, 0);
        const windowStart = new Date(2026, 5, 11, 0, 0, 0);
        const bridges = [
            rollup({ startedAt: new Date(2026, 5, 11, 9, 0) }),
            rollup({ startedAt: new Date(2026, 5, 11, 23, 30) }),
            rollup({ startedAt: new Date(2026, 5, 13, 1, 0) }),
        ];
        const buckets = BucketSessionBridgesByDay(bridges, windowStart, now);
        const byLabel = Object.fromEntries(buckets.map(b => [b.Label, b.Count]));
        expect(byLabel['2026-06-11']).toBe(2);
        expect(byLabel['2026-06-12']).toBe(0);
        expect(byLabel['2026-06-13']).toBe(1);
    });

    it('clamps bridges outside the window', () => {
        const now = new Date(2026, 5, 13, 14, 0, 0);
        const windowStart = new Date(2026, 5, 12, 0, 0, 0);
        const bridges = [
            rollup({ startedAt: new Date(2026, 5, 10, 9, 0) }), // before window
            rollup({ startedAt: new Date(2026, 5, 14, 9, 0) }), // after window
            rollup({ startedAt: new Date(2026, 5, 12, 9, 0) }), // in window
        ];
        const buckets = BucketSessionBridgesByDay(bridges, windowStart, now);
        const total = buckets.reduce((s, b) => s + b.Count, 0);
        expect(total).toBe(1);
    });

    it('returns empty when now precedes the window start', () => {
        const now = new Date(2026, 5, 10);
        const windowStart = new Date(2026, 5, 13);
        expect(BucketSessionBridgesByDay([], windowStart, now)).toEqual([]);
    });
});

describe('Summarize* helpers', () => {
    const start = new Date(2026, 5, 13, 10, 0);
    const bridges = [
        rollup({ startedAt: start, provider: 'Zoom', status: 'Connected', agent: 'Sage' }),
        rollup({ startedAt: start, provider: 'Zoom', status: 'Connected', agent: 'Sage' }),
        rollup({ startedAt: start, provider: 'Teams', status: 'Failed', agent: 'Demo Loop' }),
    ];

    it('counts by provider, descending', () => {
        expect(SummarizeBridgesByProvider(bridges)).toEqual([
            { Label: 'Zoom', Count: 2 },
            { Label: 'Teams', Count: 1 },
        ]);
    });

    it('counts by status, descending', () => {
        expect(SummarizeBridgesByStatus(bridges)).toEqual([
            { Label: 'Connected', Count: 2 },
            { Label: 'Failed', Count: 1 },
        ]);
    });

    it('counts by agent, descending', () => {
        expect(SummarizeBridgesByAgent(bridges)).toEqual([
            { Label: 'Sage', Count: 2 },
            { Label: 'Demo Loop', Count: 1 },
        ]);
    });

    it('sorts ties alphabetically by label', () => {
        const tie = [
            rollup({ startedAt: start, provider: 'Webex' }),
            rollup({ startedAt: start, provider: 'Discord' }),
        ];
        expect(SummarizeBridgesByProvider(tie).map(s => s.Label)).toEqual(['Discord', 'Webex']);
    });
});

describe('BuildCapabilityChips', () => {
    it('returns empty for null features', () => {
        expect(BuildCapabilityChips(null)).toEqual([]);
    });

    it('prioritizes media → join → signals and skips falsy flags', () => {
        const chips = BuildCapabilityChips({
            AudioIn: true,
            AudioOut: true,
            VideoIn: true,
            InviteJoin: true,
            DTMF: false,
            Recording: true,
        });
        const labels = chips.map(c => c.Label);
        // Audio + Video come before Invite/Calendar before Recording.
        expect(labels).toEqual(['Audio', 'Video', 'Invite/Calendar', 'Recording']);
    });

    it('collapses AudioIn/AudioOut into a single Audio chip', () => {
        expect(BuildCapabilityChips({ AudioIn: true }).map(c => c.Label)).toEqual(['Audio']);
        expect(BuildCapabilityChips({ AudioOut: true }).map(c => c.Label)).toEqual(['Audio']);
    });
});
