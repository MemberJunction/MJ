import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RecordCloneEngine } from '../RecordCloneEngine';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';

const user = { ID: 'u-1', Name: 'Cloner' } as UserInfo;
const plan = (blocked = false) => ({ Blocked: blocked, Counts: { ByEntity: {}, Create: 2, Total: 2 }, Warnings: [], Nodes: [], Edges: [] });

describe('RecordCloneEngine.Clone', () => {
    afterEach(() => vi.restoreAllMocks());

    it('stops after planning on a dry run', async () => {
        vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(plan() as never);
        const exec = vi.spyOn(CloneExecutor.prototype, 'Execute');

        const res = await new RecordCloneEngine({} as IMetadataProvider).Clone({ EntityName: 'X', SourceRecordKey: 'x-1', Options: { DryRun: true } }, user);

        expect(exec).not.toHaveBeenCalled();
        expect(res).toMatchObject({ Success: true, ResultCode: 'SUCCESS', Created: [] });
        expect(res.Counts?.Create).toBe(2);
    });

    it('reports a blocked dry run as BLOCKED', async () => {
        vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(plan(true) as never);
        const res = await new RecordCloneEngine({} as IMetadataProvider).Clone({ EntityName: 'X', SourceRecordKey: 'x-1', Options: { DryRun: true } }, user);
        expect(res).toMatchObject({ Success: false, ResultCode: 'BLOCKED' });
    });

    it('executes when not a dry run', async () => {
        vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(plan() as never);
        const exec = vi.spyOn(CloneExecutor.prototype, 'Execute').mockResolvedValue({ Success: true, Warnings: [] });
        await new RecordCloneEngine({} as IMetadataProvider).Clone({ EntityName: 'X', SourceRecordKey: 'x-1' }, user);
        expect(exec).toHaveBeenCalledOnce();
    });
});
