import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { EntityInfo, IMetadataProvider, Metadata, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { WakeGateEvaluator } from '../WakeGateEvaluator';

/**
 * A watched entity's `extraFilter` is caller text, so the evaluator screens it with the data
 * provider's client clause screen, as the routine owner, before any query runs.
 */

const contextUser = { ID: 'user-owner-1', Name: 'Alice', IsActive: true } as UserInfo;
const now = new Date('2026-10-17T12:00:00Z');
const WATCHED_FILTER = "EXISTS(SELECT 1 FROM __mj.SomeTable)";

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
            watchedEntities: [{ entityName: 'MJ: AI Agent Requests', alias: 'requests', extraFilter: WATCHED_FILTER }],
            wakeGate: {},
        },
    } as unknown as MJUserRoutineEntity;
}

function viewResult(): RunViewResult {
    return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, ExecutionTime: 0, UserViewRunID: '', ErrorMessage: '' };
}

/** A data provider whose client clause screen refuses every clause. */
class RefusingProvider {
    public readonly screened: Array<{ clause: string; user?: UserInfo }> = [];
    public EntityByName(name: string): EntityInfo | undefined {
        return { Name: name } as EntityInfo;
    }
    public ScreenClientClause(clause: string, _label: string, user?: UserInfo): void {
        this.screened.push({ clause, user });
        throw new Error('clause refused');
    }
}

/** A data provider that cannot screen client clauses. */
class NonScreeningProvider {
    public EntityByName(name: string): EntityInfo | undefined {
        return { Name: name } as EntityInfo;
    }
}

function filtersSent(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.flatMap((call) => (call[0] as RunViewParams[]).map((p) => String(p.ExtraFilter ?? '')));
}

describe('WakeGateEvaluator — watched entity filter screen', () => {
    let previous: IMetadataProvider;

    beforeEach(() => {
        previous = Metadata.Provider;
    });

    afterEach(() => {
        Metadata.Provider = previous;
        vi.restoreAllMocks();
    });

    it('does not run a watched filter that the client clause screen refuses for the routine owner', async () => {
        const provider = new RefusingProvider();
        Metadata.Provider = provider as unknown as IMetadataProvider;
        const runViews = vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([viewResult(), viewResult()]);

        await new WakeGateEvaluator().Evaluate(buildRoutine(), contextUser, now);

        expect(filtersSent(runViews).filter((f) => f.includes(WATCHED_FILTER))).toEqual([]);
        expect(provider.screened).toEqual([{ clause: WATCHED_FILTER, user: contextUser }]);
    });

    it('does not run a watched filter when the data provider cannot screen it', async () => {
        Metadata.Provider = new NonScreeningProvider() as unknown as IMetadataProvider;
        const runViews = vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([viewResult(), viewResult()]);

        await new WakeGateEvaluator().Evaluate(buildRoutine(), contextUser, now);

        expect(filtersSent(runViews).filter((f) => f.includes(WATCHED_FILTER))).toEqual([]);
    });

    it('names the refused watched rule in the evaluation result without the filter text', async () => {
        Metadata.Provider = new RefusingProvider() as unknown as IMetadataProvider;
        vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([viewResult(), viewResult()]);

        const result = await new WakeGateEvaluator().Evaluate(buildRoutine(), contextUser, now);

        expect(result.reason).toContain('requests');
        expect(result.reason).not.toContain(WATCHED_FILTER);
    });
});
