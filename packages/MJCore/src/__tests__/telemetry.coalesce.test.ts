import { describe, it, expect, beforeEach } from 'vitest';
import {
    TelemetryManager,
    TelemetryCoalesceParams,
    TelemetryEvent
} from '../generic/telemetryManager';

describe('TelemetryManager — Coalesce category', () => {
    let tm: TelemetryManager;

    beforeEach(() => {
        tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    const sampleParams: TelemetryCoalesceParams = {
        CallerCount: 3,
        TotalEntityCount: 7,
        Entities: ['Users', 'Roles', 'Permissions', 'Actions', 'Entities', 'Apps', 'Settings'],
        CallerBoundaries: [
            { start: 0, count: 2 },
            { start: 2, count: 3 },
            { start: 5, count: 2 }
        ]
    };

    describe('StartEvent', () => {
        it('should accept Coalesce category and return an event ID', () => {
            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );

            expect(eventId).not.toBeNull();
            expect(typeof eventId).toBe('string');
        });

        it('should return null when telemetry is disabled', () => {
            tm.SetEnabled(false);

            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );

            expect(eventId).toBeNull();
        });

        it('should return null when Coalesce category is disabled', () => {
            tm.UpdateSettings({
                categoryOverrides: { Coalesce: { enabled: false } }
            });

            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );

            expect(eventId).toBeNull();
        });
    });

    describe('EndEvent', () => {
        it('should complete a Coalesce event and record elapsed time', () => {
            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );

            const completed = tm.EndEvent(eventId);

            expect(completed).not.toBeNull();
            expect(completed!.category).toBe('Coalesce');
            expect(completed!.operation).toBe('ProviderBase.flushCoalesceQueue');
            expect(typeof completed!.elapsedMs).toBe('number');
            expect(completed!.elapsedMs!).toBeGreaterThanOrEqual(0);
        });

        it('should merge additional params on EndEvent', () => {
            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );

            const completed = tm.EndEvent(eventId, { success: false, error: 'timeout' });

            expect(completed).not.toBeNull();
            const params = completed!.params as TelemetryCoalesceParams & Record<string, unknown>;
            expect(params.success).toBe(false);
            expect(params.error).toBe('timeout');
        });
    });

    describe('RecordEvent', () => {
        it('should record a completed Coalesce event directly', () => {
            tm.RecordEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams,
                42
            );

            const events = tm.GetEvents({ category: 'Coalesce' });
            expect(events).toHaveLength(1);
            expect(events[0].elapsedMs).toBe(42);
        });
    });

    describe('GetEvents', () => {
        it('should filter events by Coalesce category', () => {
            // Record a Coalesce event and a Cache event
            tm.RecordEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams,
                10
            );
            tm.RecordEvent(
                'Cache',
                'CacheManager.get',
                { cacheType: 'local', operation: 'get', status: 'hit' },
                2
            );

            const coalesceEvents = tm.GetEvents({ category: 'Coalesce' });
            expect(coalesceEvents).toHaveLength(1);
            expect(coalesceEvents[0].category).toBe('Coalesce');
        });
    });

    describe('params preservation', () => {
        it('should store CallerCount, TotalEntityCount, Entities, and CallerBoundaries', () => {
            tm.RecordEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams,
                25
            );

            const events = tm.GetEvents({ category: 'Coalesce' });
            expect(events).toHaveLength(1);

            const params = events[0].params as TelemetryCoalesceParams;
            expect(params.CallerCount).toBe(3);
            expect(params.TotalEntityCount).toBe(7);
            expect(params.Entities).toEqual([
                'Users', 'Roles', 'Permissions', 'Actions', 'Entities', 'Apps', 'Settings'
            ]);
            expect(params.CallerBoundaries).toEqual([
                { start: 0, count: 2 },
                { start: 2, count: 3 },
                { start: 5, count: 2 }
            ]);
        });
    });

    describe('GetStats', () => {
        it('should include Coalesce in byCategory stats', () => {
            tm.RecordEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams,
                50
            );
            tm.RecordEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                { ...sampleParams, CallerCount: 2 },
                30
            );

            const stats = tm.GetStats();
            expect(stats.byCategory.Coalesce.events).toBe(2);
            expect(stats.byCategory.Coalesce.avgMs).toBe(40);
        });
    });

    describe('Start/End lifecycle', () => {
        it('should track the full lifecycle of a coalesce flush', () => {
            const eventId = tm.StartEvent(
                'Coalesce',
                'ProviderBase.flushCoalesceQueue',
                sampleParams
            );
            expect(eventId).not.toBeNull();

            // Before EndEvent, nothing in completed events
            expect(tm.GetEvents({ category: 'Coalesce' })).toHaveLength(0);

            // Complete the event
            const completed = tm.EndEvent(eventId);
            expect(completed).not.toBeNull();

            // Now it should appear in completed events
            const events = tm.GetEvents({ category: 'Coalesce' });
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe(eventId);
            expect(events[0].endTime).toBeDefined();
            expect(events[0].startTime).toBeLessThanOrEqual(events[0].endTime!);
        });
    });
});
