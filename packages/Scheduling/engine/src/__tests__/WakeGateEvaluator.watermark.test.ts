import { describe, it, expect, afterEach, vi } from 'vitest';
import { RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { WakeGateEvaluator } from '../WakeGateEvaluator';

/**
 * Covers the default Tier 0 watermark collector (no injected `collectWatermark`).
 * Since #4450 a full `MaxRows: 1` read skips the total count, so the latest-record
 * probe must read more than one row for `totalMatchingCount` to stay the full count (#6000).
 */

const contextUser = { ID: 'user-owner-1', Name: 'Alice', IsActive: true } as UserInfo;
const now = new Date('2026-10-17T12:00:00Z');

function buildRoutine(): MJUserRoutineEntity {
    return {
        ID: 'routine-1',
        Name: 'Task Watch',
        UserID: 'user-owner-1',
        RoutineType: 'AgentWake',
        ScheduleMode: 'Adaptive',
        LastCheckedAt: new Date('2026-10-17T11:00:00Z'),
        LastRunAt: new Date('2026-10-17T10:00:00Z'),
        LastResultHash: null,
        WakeConfiguration: null,
        WakeConfigurationObject: {
            watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
            wakeGate: {},
        },
    } as unknown as MJUserRoutineEntity;
}

function viewResult(rows: Record<string, string>[], total: number): RunViewResult {
    return {
        Success: true,
        Results: rows,
        TotalRowCount: total,
        RowCount: rows.length,
        ExecutionTime: 0,
        UserViewRunID: '',
        ErrorMessage: '',
    };
}

describe('WakeGateEvaluator — default watermark collector', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads more than one row for the latest-record probe and keeps the full total', async () => {
        const runViews = vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([
            viewResult([{ ID: 'a', __mj_UpdatedAt: '2026-10-17T11:30:00Z' }], 1),
            viewResult(
                [
                    { ID: 'a', __mj_UpdatedAt: '2026-10-17T11:30:00Z' },
                    { ID: 'b', __mj_UpdatedAt: '2026-10-16T09:00:00Z' },
                ],
                42
            ),
        ]);

        const result = await new WakeGateEvaluator().Evaluate(buildRoutine(), contextUser, now);

        expect(runViews).toHaveBeenCalledTimes(1);
        const params: RunViewParams[] = runViews.mock.calls[0][0];
        expect(params[1].MaxRows).toBeGreaterThan(1);

        const snapshot = result.watermarks['tasks'];
        expect(snapshot.totalMatchingCount).toBe(42);
        expect(snapshot.changedCount).toBe(1);
        expect(snapshot.maxUpdatedAt).toBe('2026-10-17T11:30:00.000Z');
    });
});
