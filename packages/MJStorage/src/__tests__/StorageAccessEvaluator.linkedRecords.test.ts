/**
 * The tracked-file rule for files linked to records: a file with `MJ: File Entity Record Links` rows is readable only
 * by a caller who can read at least one of the linked records. The evaluator's real code runs; only the data layer
 * behind RunView/RunViews and the system-user lookup are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, WellKnownUserSource, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { StorageAccessEvaluator } from '../StorageAccessEvaluator';

const PROVIDER_S3 = 'FFFFFFFF-0000-4000-8000-00000000000F';
const SESSIONS_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-00000000000A';
const RECORDING_FILE_ID = 'F0000000-0000-4000-8000-000000000001';
const SESSION_OF_ALICE = '50000000-0000-4000-8000-000000000001';
const RECORDING_KEY = `realtime-recordings/${SESSION_OF_ALICE}/recording.wav`;

function makeUser(id: string): UserInfo {
    return { ID: id, Name: id, UserRoles: [] } as unknown as UserInfo;
}
const bob = makeUser('22222222-0000-4000-8000-000000000002');
const systemUser = makeUser('33333333-0000-4000-8000-000000000003');

/** A sessions entity the caller may read only through a row filter (only their own sessions). */
function makeSessionsEntity(): EntityInfo {
    const info = new EntityInfo({
        ID: SESSIONS_ENTITY_ID,
        Name: 'MJ: AI Agent Sessions',
        SchemaName: '__mj',
        BaseTable: 'AIAgentSession',
        BaseView: 'vwAIAgentSessions',
        Fields: [{ ID: 'f1', EntityID: SESSIONS_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
    });
    vi.spyOn(info, 'GetUserPermisions').mockReturnValue({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: false });
    vi.spyOn(info, 'UserExemptFromRowLevelSecurity').mockReturnValue(false);
    return info;
}

function ok(Results: object[]): RunViewResult<object> {
    return { Success: true, Results } as RunViewResult<object>;
}

/** The fake database: bob may read the MJ: Files row, but the linked session belongs to someone else. */
function answer(params: RunViewParams, user: UserInfo | undefined): RunViewResult<object> {
    const named = (v: string) => (params.ExtraFilter ?? '').toLowerCase().includes(v.toLowerCase());
    switch (params.EntityName) {
        case 'MJ: Files':
            if (user?.ID === systemUser.ID) {
                return ok(named(RECORDING_KEY) ? [{ ID: RECORDING_FILE_ID, Name: 'recording.wav', ProviderKey: RECORDING_KEY }] : []);
            }
            return ok(named(RECORDING_FILE_ID) ? [{ ID: RECORDING_FILE_ID }] : []);
        case 'MJ: File Entity Record Links':
            return ok(named(RECORDING_FILE_ID) ? [{ FileID: RECORDING_FILE_ID, EntityID: SESSIONS_ENTITY_ID, RecordID: SESSION_OF_ALICE }] : []);
        case 'MJ: AI Agent Sessions':
            return ok([]); // the session's row filter hides another user's session from bob
        default:
            return { Success: false, Results: [], ErrorMessage: 'unknown entity' } as RunViewResult<object>;
    }
}

describe('StorageAccessEvaluator — files linked to records', () => {
    const evaluator = StorageAccessEvaluator.Instance;
    let provider: IMetadataProvider;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        const sessions = makeSessionsEntity();
        provider = {
            Entities: [sessions],
            EntityByID: (id: string) => (id.toUpperCase() === SESSIONS_ENTITY_ID ? sessions : undefined),
            EntityByName: (name: string) => (name === sessions.Name ? sessions : undefined),
            RunView: vi.fn(async (p: RunViewParams, u?: UserInfo) => answer(p, u)),
            RunViews: vi.fn(async (ps: RunViewParams[], u?: UserInfo) => ps.map(p => answer(p, u))),
        } as unknown as IMetadataProvider;
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
    });

    afterEach(() => {
        systemUserSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it('refuses a file linked only to a record the caller cannot read', async () => {
        const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, [RECORDING_KEY], bob, provider);
        expect([...unreadable]).toEqual([RECORDING_KEY]);
    });
});
