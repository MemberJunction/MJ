// ResolverBase / RunViewResolver / RunQueryResolver pull in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

// QueryResolver's GraphQL types lean on emitted decorator metadata, which vitest's transform does not
// produce. The decorators are irrelevant to what the resolvers pass on, so they become no-ops.
vi.mock('type-graphql', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const noopDecorator = () => () => undefined;
    return {
        ...actual,
        Resolver: noopDecorator, Query: noopDecorator, Mutation: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, Root: noopDecorator, PubSub: noopDecorator,
    };
});
import type {
    DatabaseProviderBase,
    RunQueryParams,
    RunQueryResult,
    RunQueryWithCacheCheckParams,
    RunQueriesWithCacheCheckResponse,
    RunViewParams,
    RunViewResult,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
    UserInfo,
} from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import {
    RunViewResolver,
    type RunDynamicViewInput,
    type RunViewByIDInput,
    type RunViewByNameInput,
    type RunViewWithCacheCheckInput,
} from '../generic/RunViewResolver.js';
import { RunQueryResolver, type RunQueryInput, type RunQueryWithCacheCheckInput } from '../resolvers/QueryResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/**
 * The view and query resolvers pass the caller's time zone (UserPayload.TimeZone, read from the
 * x-mj-timezone header) on to the provider as RunViewParams.TimeZone / RunQueryParams.TimeZone,
 * and leave it unset when the request carried none.
 */

const ENTITY_NAME = 'MJ: Things';

function payload(timeZone?: string): UserPayload {
    const p = { email: 'tester@example.com', userRecord: { Email: 'tester@example.com' } as UserInfo } as UserPayload;
    if (timeZone) p.TimeZone = timeZone;
    return p;
}

function entityStub() {
    return { ID: 'ent-1', Name: ENTITY_NAME, BaseView: 'vwThings', PrimaryKeys: [{ Name: 'ID' }], Fields: [{ Name: 'ID', CodeName: 'ID' }], EncryptedFields: [] };
}

const okView = (): RunViewResult => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as RunViewResult);
const okQuery = (): RunQueryResult => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunQueryResult);

/** Provider that records the run params every resolver path hands it. */
function recordingProvider() {
    const views: RunViewParams[] = [];
    const queries: RunQueryParams[] = [];
    const provider = {
        Entities: [entityStub()],
        EntityByName: (name: string) => (name === ENTITY_NAME ? entityStub() : undefined),
        RunView: async (params: RunViewParams) => { views.push(params); return okView(); },
        RunViews: async (params: RunViewParams[]) => { views.push(...params); return params.map(okView); },
        RunViewsWithCacheCheck: async (params: RunViewWithCacheCheckParams[]) => {
            views.push(...params.map((p) => p.params));
            return { success: true, results: [] } as RunViewsWithCacheCheckResponse;
        },
        RunQuery: async (params: RunQueryParams) => { queries.push(params); return okQuery(); },
        RunQueries: async (params: RunQueryParams[]) => { queries.push(...params); return params.map(okQuery); },
        RunQueriesWithCacheCheck: async (params: RunQueryWithCacheCheckParams[]) => {
            queries.push(...params.map((p) => p.params));
            return { success: true, results: [] } as RunQueriesWithCacheCheckResponse;
        },
    } as unknown as DatabaseProviderBase;
    return { provider, views, queries };
}

function appContext(provider: DatabaseProviderBase, userPayload: UserPayload): AppContext {
    return { providers: [{ provider, type: 'Read-Write' }], userPayload } as unknown as AppContext;
}

/** Skips the encrypted-field filter (it needs live Metadata) — irrelevant here. */
class Probe extends ResolverBase {
    protected override async ArrayFilterEncryptedFieldsForAPI(_entityName: string, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        return rows;
    }
}

describe('RunViewParams.TimeZone from the request', () => {
    const dynamic = { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '' } as RunDynamicViewInput;

    it('a single view run carries the caller zone', async () => {
        const { provider, views } = recordingProvider();
        await new Probe().RunDynamicViewGeneric(dynamic, provider, payload('Europe/Paris'), undefined as never);
        expect(views[0].TimeZone).toBe('Europe/Paris');
    });

    it('a single view run without the header leaves it unset (UTC)', async () => {
        const { provider, views } = recordingProvider();
        await new Probe().RunDynamicViewGeneric(dynamic, provider, payload(), undefined as never);
        expect(views[0].TimeZone).toBeUndefined();
    });

    it('a batch carries it on every view', async () => {
        const { provider, views } = recordingProvider();
        const inputs = [dynamic, dynamic] as (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[];
        await new Probe().RunViewsGeneric(inputs, provider, payload('Asia/Tokyo'));
        expect(views.map((v) => v.TimeZone)).toEqual(['Asia/Tokyo', 'Asia/Tokyo']);
    });

    it('the cache-check batch carries it', async () => {
        const { provider, views } = recordingProvider();
        const input = [{ params: { EntityName: ENTITY_NAME } }] as unknown as RunViewWithCacheCheckInput[];
        await new RunViewResolver().RunViewsWithCacheCheck(input, appContext(provider, payload('America/Chicago')));
        expect(views[0].TimeZone).toBe('America/Chicago');
    });
});

describe('RunQueryParams.TimeZone from the request', () => {
    it('a single query run carries the caller zone, or none', async () => {
        const withZone = recordingProvider();
        await new RunQueryResolver().GetQueryDataByName('Active Members', appContext(withZone.provider, payload('Europe/Paris')));
        expect(withZone.queries[0].TimeZone).toBe('Europe/Paris');

        const without = recordingProvider();
        await new RunQueryResolver().GetQueryDataByName('Active Members', appContext(without.provider, payload()));
        expect(without.queries[0].TimeZone).toBeUndefined();
    });

    it('a batch carries it on every query', async () => {
        const { provider, queries } = recordingProvider();
        const input = [{ QueryName: 'A' }, { QueryName: 'B' }] as RunQueryInput[];
        await new RunQueryResolver().RunQueries(input, appContext(provider, payload('Asia/Tokyo')));
        expect(queries.map((q) => q.TimeZone)).toEqual(['Asia/Tokyo', 'Asia/Tokyo']);
    });

    it('the cache-check batch carries it', async () => {
        const { provider, queries } = recordingProvider();
        const input = [{ params: { QueryName: 'A' } }] as unknown as RunQueryWithCacheCheckInput[];
        await new RunQueryResolver().RunQueriesWithCacheCheck(input, appContext(provider, payload('America/Chicago')));
        expect(queries[0].TimeZone).toBe('America/Chicago');
    });
});

/**
 * #4789 A17: ServerParameters (values for server-set query parameters) and RequireApproved are
 * server-only. No GraphQL run input declares them, and the RunQuery* resolvers build the run params
 * field by field, so a value a client smuggles into an input object never reaches the provider. A
 * client's only channel for a value is `Parameters`, where a server-set parameter is refused.
 */
describe('RunQueryParams.ServerParameters and RequireApproved never come from a request', () => {
    const smuggled = { ServerParameters: { ChapterID: 'someone-elses-chapter' }, RequireApproved: false, TimeZone: 'Pacific/Fiji' };

    it('a batch drops them from each input', async () => {
        const { provider, queries } = recordingProvider();
        const input = [{ QueryName: 'A', Parameters: { Region: 'West' }, ...smuggled }] as unknown as RunQueryInput[];
        await new RunQueryResolver().RunQueries(input, appContext(provider, payload('Asia/Tokyo')));
        expect(queries[0].ServerParameters).toBeUndefined();
        expect(queries[0].RequireApproved).toBeUndefined();
        expect(queries[0].TimeZone).toBe('Asia/Tokyo'); // from the header, not the input
        expect(queries[0].Parameters).toEqual({ Region: 'West' });
    });

    it('the cache-check batch drops them too', async () => {
        const { provider, queries } = recordingProvider();
        const input = [{ params: { QueryName: 'A', ...smuggled } }] as unknown as RunQueryWithCacheCheckInput[];
        await new RunQueryResolver().RunQueriesWithCacheCheck(input, appContext(provider, payload()));
        expect(queries[0].ServerParameters).toBeUndefined();
        expect(queries[0].RequireApproved).toBeUndefined();
        expect(queries[0].TimeZone).toBeUndefined();
    });
});
