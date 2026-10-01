/**
 * The record-map and run-detail saves travel in the active write group, like the entity saves.
 *
 * A batched apply defers each entity's `Save()` into its batch's write group so N writes reach the
 * database in one submit. Two other writes the engine makes per record and per map — the record
 * map in `SaveRecordMap` and the run detail in `CreateRunDetail` — never enrolled, so whenever
 * either ran while a group was active it still paid its own round trip and its own commit.
 *
 * Both keys are client-generated (`NewRecord()` mints the uuid), so the "primary key exists before
 * Submit" rule `enrolInWriteGroup` enforces holds for them. Outside a group — which is where every
 * current caller runs: the pull path queues its maps into RecordMapBatch and writes them after the
 * batch's group has committed — nothing changes and the save is immediate, exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type BaseEntity, type UserInfo } from '@memberjunction/core';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { SyncResult } from '../types.js';

/** A stand-in write group — identity is all the assertions need. */
const GROUP = { marker: 'the-batch-group' } as unknown as NonNullable<BaseEntity['TransactionGroup']>;
const USER = { ID: 'user-1' } as UserInfo;

type FakeEntity = {
    TransactionGroup: unknown;
    /** The group the entity carried at the moment Save() was called; 'never' until it is. */
    GroupAtSave: unknown;
    EntityInfo: { Name: string; PrimaryKeys: Array<{ Name: string; AutoIncrement: boolean }> };
    LatestResult: null;
    NewRecord: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
};

function fakeEntity(): FakeEntity {
    const e: FakeEntity = {
        TransactionGroup: undefined,
        GroupAtSave: 'never',
        EntityInfo: { Name: 'Fixture', PrimaryKeys: [{ Name: 'ID', AutoIncrement: false }] },
        LatestResult: null,
        NewRecord: vi.fn(),
        Load: vi.fn(async () => true),
        Save: vi.fn(async () => { e.GroupAtSave = e.TransactionGroup; return true; }),
    };
    return e;
}

type Host = {
    SaveRecordMap: (ciID: string, externalID: string, entityID: string, entityRecordID: string, user: UserInfo) => Promise<void>;
    CreateRunDetail: (run: unknown, entityMap: unknown, result: SyncResult, user: UserInfo) => Promise<void>;
};

/** Runs `fn` on an engine built from its prototype, inside a run context — with or without a group. */
async function inRun(writeGroup: unknown, entity: FakeEntity, fn: (host: Host) => Promise<void>): Promise<void> {
    const host = Object.create(IntegrationEngine.prototype) as unknown as Host;
    const provider = { GetEntityObject: async () => entity };
    const als = (IntegrationEngine as unknown as {
        runContext: { run: (ctx: unknown, f: () => Promise<void>) => Promise<void> };
    }).runContext;
    await als.run({ provider, writeGroup }, () => fn(host));
}

const RESULT = { RecordsProcessed: 3, RecordsCreated: 1, RecordsErrored: 0 } as unknown as SyncResult;
const RUN = { ID: 'run-1' };
const MAP = { ID: 'em-1', EntityID: 'entity-1' };

describe('SaveRecordMap and CreateRunDetail enrol in the active write group', () => {
    beforeEach(() => {
        // SaveRecordMap's existence check: no mapping yet, so it inserts a new row.
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(
            { Success: true, Results: [] } as unknown as Awaited<ReturnType<RunView['RunView']>>,
        );
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('a record map saved inside a batch travels in that batch\'s group', async () => {
        const recordMap = fakeEntity();
        await inRun(GROUP, recordMap, host => host.SaveRecordMap('ci-1', 'ext-1', 'entity-1', 'rec-1', USER));
        expect(recordMap.Save).toHaveBeenCalledTimes(1);
        expect(recordMap.GroupAtSave).toBe(GROUP);
    });

    it('a record map saved outside any group saves immediately, exactly as before', async () => {
        const recordMap = fakeEntity();
        await inRun(undefined, recordMap, host => host.SaveRecordMap('ci-1', 'ext-1', 'entity-1', 'rec-1', USER));
        expect(recordMap.Save).toHaveBeenCalledTimes(1);
        expect(recordMap.GroupAtSave).toBeUndefined();
    });

    it('a run detail saved inside a batch travels in that batch\'s group', async () => {
        const detail = fakeEntity();
        await inRun(GROUP, detail, host => host.CreateRunDetail(RUN, MAP, RESULT, USER));
        expect(detail.Save).toHaveBeenCalledTimes(1);
        expect(detail.GroupAtSave).toBe(GROUP);
    });

    it('a run detail saved outside any group saves immediately, exactly as before', async () => {
        const detail = fakeEntity();
        await inRun(undefined, detail, host => host.CreateRunDetail(RUN, MAP, RESULT, USER));
        expect(detail.Save).toHaveBeenCalledTimes(1);
        expect(detail.GroupAtSave).toBeUndefined();
    });
});
