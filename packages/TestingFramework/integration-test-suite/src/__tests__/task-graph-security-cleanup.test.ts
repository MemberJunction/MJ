/**
 * TGS4's cleanup (T10): a graph whose saga ran has compensation rows, and escalations of failed ones, that
 * reference other children through `CompensatesTaskID`. They must be deleted first, and a row left behind
 * must fail the check rather than be swallowed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { DeleteTaskGraph } from '../checks/task-graph-security.checks';

const PARENT = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORWARD = 'bbbbbbbb-0000-4000-8000-000000000002';
const COMPENSATION = 'cccccccc-0000-4000-8000-000000000003';
const ESCALATION = 'dddddddd-0000-4000-8000-000000000004';
const USER = { ID: 'eeeeeeee-0000-4000-8000-000000000005' } as UserInfo;
const FK_MESSAGE = 'The DELETE statement conflicted with the REFERENCE constraint "FK_Task_CompensatesTask"';

type Row = { ID: string; CompensatesTaskID: string | null };

/**
 * The graph's task rows, returned in the order given. A row still referenced by a stored row's
 * `CompensatesTaskID` refuses its delete, as the foreign key does; so does the workflow while children remain.
 */
function fakeGraph(rows: Row[], refuse: string[] = []): { Provider: IMetadataProvider; Deleted: string[] } {
    const stored = new Map(rows.map((r) => [r.ID, r]));
    const deleted: string[] = [];
    const entity = (row: Row) => {
        const latest = { CompleteMessage: '' };
        return {
            ...row,
            LatestResult: latest,
            Delete: async (): Promise<boolean> => {
                const referenced = [...stored.values()].some((r) => r.CompensatesTaskID?.toLowerCase() === row.ID.toLowerCase());
                if (referenced || refuse.includes(row.ID)) {
                    latest.CompleteMessage = FK_MESSAGE;
                    return false;
                }
                stored.delete(row.ID);
                deleted.push(row.ID);
                return true;
            },
        };
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: RunViewParams) => ({
            Success: true,
            Results: params.EntityName === 'MJ: Tasks' ? rows.map(entity) : [],
        })),
    } as unknown as RunView);
    const workflow = {
        LatestResult: { CompleteMessage: 'The workflow still has tasks' },
        Load: async (): Promise<boolean> => true,
        Delete: async (): Promise<boolean> => {
            if (stored.size > 0) return false;
            deleted.push(PARENT);
            return true;
        },
    };
    return { Provider: { GetEntityObject: vi.fn(async () => workflow) } as unknown as IMetadataProvider, Deleted: deleted };
}

/** The rows a CompensateCompleted graph leaves after a failed compensation was escalated, in the order a read returns them. */
const SAGA_ROWS: Row[] = [
    { ID: FORWARD, CompensatesTaskID: null },
    { ID: COMPENSATION, CompensatesTaskID: FORWARD.toUpperCase() },
    { ID: ESCALATION, CompensatesTaskID: COMPENSATION },
];

describe('DeleteTaskGraph (TGS4 cleanup, T10)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('deletes an escalation before its compensation, a compensation before its forward step, then the workflow', async () => {
        const graph = fakeGraph(SAGA_ROWS);
        expect(await DeleteTaskGraph(graph.Provider, USER, PARENT)).toEqual([]);
        expect(graph.Deleted).toEqual([ESCALATION, COMPENSATION, FORWARD, PARENT]);
    });

    it('reports every row it could not delete instead of swallowing the failure', async () => {
        const graph = fakeGraph(SAGA_ROWS, [COMPENSATION]);
        const failures = await DeleteTaskGraph(graph.Provider, USER, PARENT);
        expect(failures.some((f) => f.includes(COMPENSATION) && f.includes('FK_Task_CompensatesTask'))).toBe(true);
        expect(failures.some((f) => f.includes(FORWARD))).toBe(true);
        expect(failures.some((f) => f.includes(PARENT))).toBe(true);
    });
});
