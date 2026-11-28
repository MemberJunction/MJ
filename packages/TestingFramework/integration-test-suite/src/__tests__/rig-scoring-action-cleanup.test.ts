/**
 * rig-scoring-action-cleanup.test.ts — a rig's cleanup deletes the scoring Action that promoting its model to Published
 * generated, params first, and keeps the Action row when one of its params could not be deleted (the row is still
 * referenced). The harness cleanup does not know about these Actions, so `DeleteRecordedRows` runs this first.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { DeleteModelScoringActions } from '../../rigs/lib/ps-rig-lifecycle';

const MODEL_ID = 'A1B2C3D4-0000-4000-8000-0000000000AA';
const ACTION_ID = 'A1B2C3D4-0000-4000-8000-0000000000BB';

/** A row cleanup can delete: its ID, a Delete() that answers `deletes`, and the order deletes happened in. */
interface FakeRow {
    readonly ID: string;
    readonly ActionID: string;
    readonly LatestResult: { readonly CompleteMessage: string } | null;
    Delete(): Promise<boolean>;
}

function fakeRow(id: string, actionId: string, deletes: boolean, log: string[]): FakeRow {
    return {
        ID: id,
        ActionID: actionId,
        LatestResult: deletes ? null : { CompleteMessage: 'refused' },
        Delete: async () => {
            log.push(id);
            return deletes;
        },
    };
}

/** Answers the reads by entity: the baked ModelID param, the generated Action, and the Action's params. */
function answer(action: FakeRow, params: FakeRow[]): void {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (p: RunViewParams) => {
        const rows: FakeRow[] = p.EntityName === 'MJ: Actions' ? [action] : p.ResultType === 'simple' ? [params[0]] : params;
        const result: RunViewResult<FakeRow> = { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
        return result;
    });
}

afterEach(() => vi.restoreAllMocks());

describe('DeleteModelScoringActions', () => {
    it('deletes the params, then the Action', async () => {
        const log: string[] = [];
        answer(fakeRow(ACTION_ID, ACTION_ID, true, log), [fakeRow('P1', ACTION_ID, true, log), fakeRow('P2', ACTION_ID.toLowerCase(), true, log)]);
        const failures = await DeleteModelScoringActions({} as IMetadataProvider, {} as UserInfo, [MODEL_ID]);
        expect(failures).toEqual([]);
        expect(log).toEqual(['P1', 'P2', ACTION_ID]);
    });

    it('keeps the Action when a param could not be deleted, and reports the param', async () => {
        const log: string[] = [];
        answer(fakeRow(ACTION_ID, ACTION_ID, true, log), [fakeRow('P1', ACTION_ID, false, log), fakeRow('P2', ACTION_ID, true, log)]);
        const failures = await DeleteModelScoringActions({} as IMetadataProvider, {} as UserInfo, [MODEL_ID]);
        expect(failures).toEqual(['MJ: Action Params P1: refused']);
        expect(log).toEqual(['P1', 'P2']);
    });

    it('reads nothing for no models', async () => {
        const spy = vi.spyOn(RunView.prototype, 'RunView');
        expect(await DeleteModelScoringActions({} as IMetadataProvider, {} as UserInfo, [])).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });
});
