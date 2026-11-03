// type-graphql decorators call `Reflect.getMetadata`; the polyfill must load before the resolvers.
import 'reflect-metadata';

/**
 * - #3361: the dependency, merge-dependency and duplicate-record reads ran on
 *   `GetReadOnlyProvider(providers)` with no fallback, which is `null` on a host with only a
 *   read-write datasource, so each read crashed.
 * - #3093: a merge field map could not set a field to NULL.
 * - #4340: autotag progress saves were not awaited, so one could land after the completion save
 *   and revert Status / EndTime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Config: vi.fn(async () => undefined), Actions: [], RunAction: vi.fn() } },
    EntityActionEngineServer: { Instance: { Config: vi.fn(async () => undefined), EntityActions: [], RunEntityAction: vi.fn() } },
}));

import type { PubSubEngine } from 'type-graphql';
import type { MJContentProcessRunEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EntityDependencyResolver, RecordDependencyResolver, RecordMergeResolver, type RecordMergeRequest } from '../resolvers/MergeRecordsResolver.js';
import { DuplicateRecordResolver, type PotentialDuplicateRequestType } from '../resolvers/PotentialDuplicateRecordResolver.js';
import { AutotagPipelineResolver } from '../resolvers/AutotagPipelineResolver.js';
import type { AppContext } from '../types.js';

const user = new UserInfo(null, { ID: 'u-1', Name: 'Probe', Email: 'probe@example.test', IsActive: true, UserRoles: [] });
const pubSub = {} as PubSubEngine;

const provider = {
    GetEntityDependencies: vi.fn(async () => [{ EntityName: 'A', RelatedEntityName: 'B', FieldName: 'AID' }]),
    GetRecordDependencies: vi.fn(async () => []),
    GetRecordDuplicates: vi.fn(async () => ({ Status: 'Success', PotentialDuplicateResult: [] })),
    MergeRecords: vi.fn(async () => ({ Success: true })),
};

/** A host with one datasource: the read-write login, no read-only login. */
function readWriteOnlyContext(): AppContext {
    return {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { userRecord: user, email: 'probe@example.test' },
    } as unknown as AppContext;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('read resolvers on a host with only a read-write datasource (#3361)', () => {
    it('GetEntityDependencies falls back to the read-write provider', async () => {
        const result = await new EntityDependencyResolver().GetEntityDependencies('A', readWriteOnlyContext(), pubSub);
        expect(provider.GetEntityDependencies).toHaveBeenCalledWith('A');
        expect(result).toHaveLength(1);
    });

    it('GetRecordDependencies falls back to the read-write provider', async () => {
        const ck = { KeyValuePairs: [{ FieldName: 'ID', Value: 'r-1' }] };
        await new RecordDependencyResolver().GetRecordDependencies('A', ck, readWriteOnlyContext(), pubSub);
        expect(provider.GetRecordDependencies).toHaveBeenCalledTimes(1);
    });

    it('GetRecordDuplicates falls back to the read-write provider', async () => {
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([user]);
        const params = { EntityID: 'e-1' } as PotentialDuplicateRequestType;
        const result = await new DuplicateRecordResolver().GetRecordDuplicates(readWriteOnlyContext(), params);
        expect(provider.GetRecordDuplicates).toHaveBeenCalledWith(params, user);
        expect(result.Status).toBe('Success');
    });
});

describe('MergeRecords field map (#3093)', () => {
    it('passes a null field-map value through to the provider', async () => {
        const request = {
            EntityName: 'A',
            SurvivingRecordCompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'r-1' }] },
            RecordsToMerge: [{ KeyValuePairs: [{ FieldName: 'ID', Value: 'r-2' }] }],
            FieldMap: [{ FieldName: 'Notes', Value: null }, { FieldName: 'Name', Value: 'Kept' }],
        } as unknown as RecordMergeRequest;

        await new RecordMergeResolver().MergeRecords(request, readWriteOnlyContext(), pubSub);

        const sent = provider.MergeRecords.mock.calls[0][0] as { FieldMap: Array<{ FieldName: string; Value: string | null }> };
        expect(sent.FieldMap).toEqual([{ FieldName: 'Notes', Value: null }, { FieldName: 'Name', Value: 'Kept' }]);
    });
});

/** The private progress and completion steps of the autotag resolver. */
interface AutotagRunSteps {
    updateProcessRunProgress(processRun: MJContentProcessRunEntity, processed: number, total: number): void;
    completeProcessRun(processRun: MJContentProcessRunEntity, status: string, errorMessage: string | undefined, currentUser: UserInfo): Promise<void>;
}

describe('autotag progress saves (#4340)', () => {
    it('completion fields survive a slow progress save', async () => {
        const stored: Array<{ Status: string; EndTime: Date | null; ProcessedItems: number }> = [];
        let inFlight = 0;
        let overlapped = false;
        const run = {
            Status: 'Running',
            EndTime: null as Date | null,
            ProcessedItems: 0,
            TotalItemCount: 0,
            LastProcessedOffset: 0,
            ErrorCount: 0,
            LatestResult: null,
            // The first save is the slowest, so an unordered save would land last.
            Save: vi.fn(async function (this: { Status: string; EndTime: Date | null; ProcessedItems: number }) {
                const snapshot = { Status: this.Status, EndTime: this.EndTime, ProcessedItems: this.ProcessedItems };
                inFlight++;
                if (inFlight > 1) overlapped = true;
                await new Promise((resolve) => setTimeout(resolve, stored.length === 0 ? 30 : 1));
                inFlight--;
                stored.push(snapshot);
                return true;
            }),
        };
        const processRun = run as unknown as MJContentProcessRunEntity;
        const steps = new AutotagPipelineResolver() as unknown as AutotagRunSteps;

        steps.updateProcessRunProgress(processRun, 1, 3);
        steps.updateProcessRunProgress(processRun, 2, 3);
        await steps.completeProcessRun(processRun, 'Completed', undefined, user);

        expect(overlapped).toBe(false);
        const last = stored[stored.length - 1];
        expect(last.Status).toBe('Completed');
        expect(last.EndTime).toBeInstanceOf(Date);
        expect(run.Save).toHaveBeenCalledTimes(3);
    });

    it('a failed progress save does not block the completion save', async () => {
        const saves: string[] = [];
        const run = {
            Status: 'Running', EndTime: null, ProcessedItems: 0, TotalItemCount: 0, LastProcessedOffset: 0, ErrorCount: 0, LatestResult: null,
            Save: vi.fn(async function (this: { Status: string }) {
                saves.push(this.Status);
                if (saves.length === 1) throw new Error('transient');
                return true;
            }),
        };
        const processRun = run as unknown as MJContentProcessRunEntity;
        const steps = new AutotagPipelineResolver() as unknown as AutotagRunSteps;

        steps.updateProcessRunProgress(processRun, 1, 2);
        await steps.completeProcessRun(processRun, 'Completed', undefined, user);

        expect(saves).toEqual(['Running', 'Completed']);
    });
});
