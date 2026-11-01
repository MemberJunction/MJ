/**
 * Pause and resume, driven through the resolver with a Save() that returns false.
 *
 * Save() reports a logical failure by returning false rather than throwing, so the only way to
 * prove a failed save is handled is to run the mutation against one. ConnectionPauseResolver.test.ts
 * pins the shape of the code; these pin what happens.
 */
// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {}, registerEnumType: () => undefined,
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

const state = vi.hoisted(() => ({
    /** Every Save() result in order; anything past the end saves. */
    saves: [] as boolean[],
    /** The order things happened in, across the connection row and the jobs. */
    events: [] as string[],
    ci: null as null | Record<string, unknown>,
}));

vi.mock('../util.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../util.js')>()),
    GetReadWriteProvider: () => ({
        GetEntityObject: async () => state.ci,
    }),
}));

const { IntegrationDiscoveryResolver } = await import('../resolvers/IntegrationDiscoveryResolver.js');
const { IntegrationEngine } = await import('@memberjunction/integration-engine');
const { ReadPausedSchedules, WritePausedSchedules } = await import('../integration/ConnectionPause.js');

type Job = { ID: string; Status: string; Kind: 'sync' | 'discovery' };

function connection(configuration: string | null): Record<string, unknown> {
    const ci: Record<string, unknown> = {
        IsActive: true,
        ScheduleEnabled: true,
        Configuration: configuration,
        LatestResult: { Message: 'the database said no' },
        InnerLoad: async () => true,
        Save: async () => {
            const ok = state.saves.length > 0 ? state.saves.shift()! : true;
            state.events.push(`save:${ok ? 'ok' : 'failed'}:${ReadPausedSchedules(ci.Configuration as string).map(r => r.ID).join(',')}`);
            return ok;
        },
    };
    return ci;
}

function resolverWith(jobs: Job[]) {
    return {
        getAuthenticatedUser: () => ({ ID: 'user-1' }),
        findScheduledJobsForConnection: async () => jobs,
        setScheduledJobStatus: async (id: string, status: string) => {
            state.events.push(`job:${id}:${status}`);
            return true;
        },
        formatError: (e: unknown) => String(e),
        startSchemaRefreshPipelineDetached: () => undefined,
    };
}

const ctx = { providers: [] } as never;

beforeEach(() => {
    state.saves = [];
    state.events = [];
    vi.spyOn(IntegrationEngine, 'GetSyncProgressAsync').mockResolvedValue(null as never);
});

describe('IntegrationDeactivateConnection with a failing Save()', () => {
    const jobs: Job[] = [
        { ID: 'job-sync', Status: 'Active', Kind: 'sync' },
        { ID: 'job-disc', Status: 'Active', Kind: 'discovery' },
    ];

    it('saves the record of what it will pause before it pauses anything', async () => {
        state.ci = connection(null);
        const out = await IntegrationDiscoveryResolver.prototype.IntegrationDeactivateConnection.call(resolverWith(jobs), 'ci-1', ctx);
        expect(out.Success).toBe(true);
        expect(out.SchedulesPaused).toBe(2);
        expect(state.events.slice(0, 4)).toEqual([
            'save:ok:',                      // IsActive = false
            'save:ok:job-sync,job-disc',     // the record, before any job moves
            'job:job-sync:Paused',
            'job:job-disc:Paused',
        ]);
    });

    it('pauses nothing, and says so, when the record will not save', async () => {
        state.ci = connection(null);
        state.saves = [true, false];
        const out = await IntegrationDiscoveryResolver.prototype.IntegrationDeactivateConnection.call(resolverWith(jobs), 'ci-1', ctx);
        expect(out.Success).toBe(true);
        expect(out.SchedulesPaused).toBe(0);
        expect(state.events.filter(e => e.startsWith('job:'))).toEqual([]);
        expect(out.Message).toContain('Could not pause the schedules');
    });

    it('stops at the flag when IsActive will not save', async () => {
        state.ci = connection(null);
        state.saves = [false];
        const out = await IntegrationDiscoveryResolver.prototype.IntegrationDeactivateConnection.call(resolverWith(jobs), 'ci-1', ctx);
        expect(out.Success).toBe(false);
        expect(state.events).toEqual(['save:failed:']);
    });
});

describe('IntegrationReactivateConnection with a failing Save()', () => {
    const paused: Job[] = [{ ID: 'job-sync', Status: 'Paused', Kind: 'sync' }];
    const record = WritePausedSchedules(null, [{ ID: 'job-sync', Kind: 'sync' }]);

    it('restores the recorded jobs and clears the record', async () => {
        state.ci = connection(record);
        const out = await IntegrationDiscoveryResolver.prototype.IntegrationReactivateConnection.call(resolverWith(paused), 'ci-1', false, false, ctx);
        expect(out).toEqual({ Success: true, Message: 'Reactivated' });
        expect(state.events).toEqual(['save:ok:job-sync', 'job:job-sync:Active', 'save:ok:']);
    });

    it('says so when the record will not clear, instead of reporting a clean resume', async () => {
        state.ci = connection(record);
        state.saves = [true, false];
        const out = await IntegrationDiscoveryResolver.prototype.IntegrationReactivateConnection.call(resolverWith(paused), 'ci-1', false, false, ctx);
        expect(out.Success).toBe(true);
        expect(out.Message).toContain('could not be cleared');
    });
});
