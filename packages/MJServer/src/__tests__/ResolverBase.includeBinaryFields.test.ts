// ResolverBase / RunViewResolver transitively pull in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type {
    DatabaseProviderBase,
    EntityInfo,
    IMetadataProvider,
    RunViewParams,
    RunViewResult,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
    UserInfo,
} from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import {
    RunViewResolver,
    type RunDynamicViewInput,
    type RunViewByIDInput,
    type RunViewByNameInput,
    type RunViewResultRow,
    type RunViewWithCacheCheckInput,
} from '../generic/RunViewResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/**
 * Binary DB fields (varbinary / bytea) are base64 strings in JS and on the wire, and RunView
 * omits them unless `IncludeBinaryFields: true`. These tests pin the server half:
 *
 *   1. the GraphQL flag reaches the provider's RunView / RunViews / RunViewsWithCacheCheck params
 *      on every resolver path (single by-ID / by-name / dynamic, batch, and the cache-check batch);
 *   2. any byte array that still reaches a resolver is serialized as base64 — never as the
 *      `{"type":"Buffer","data":[...]}` that `JSON.stringify` produces for a Node Buffer.
 */

const ENTITY_NAME = 'MJ: Vector Things';
const ENTITY_ID = 'ent-1';

/** Bytes whose base64 form is easy to recognise: [1,2,3,4] → "AQIDBA==". */
const BYTES = [1, 2, 3, 4];
const BYTES_BASE64 = 'AQIDBA==';

const fakePayload = () =>
    ({ email: 'tester@example.com', userRecord: { Email: 'tester@example.com' } as UserInfo } as UserPayload);

function entityStub() {
    return {
        ID: ENTITY_ID,
        Name: ENTITY_NAME,
        BaseView: 'vwVectorThings',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', CodeName: 'ID' },
            { Name: 'Embedding', CodeName: 'Embedding' },
        ],
        EncryptedFields: [],
    };
}

/** Provider that records every RunView / RunViews call and returns the given rows. */
function recordingProvider(rows: Record<string, unknown>[] = []) {
    const runViewCalls: RunViewParams[] = [];
    const runViewsCalls: RunViewParams[][] = [];
    const viewInfo = { ID: 'view-1', Name: 'Saved View', Entity: ENTITY_NAME, EntityID: ENTITY_ID };
    const provider = {
        Entities: [entityStub()],
        EntityByName: (name: string) => (name === ENTITY_NAME ? entityStub() : undefined),
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            // RunViewByNameGeneric looks the saved view up first — answer that lookup with the view row.
            if (params.EntityName === 'MJ: User Views') {
                return { Success: true, Results: [viewInfo], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' } as RunViewResult;
            }
            runViewCalls.push(params);
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' } as RunViewResult;
        },
        RunViews: async (params: RunViewParams[]): Promise<RunViewResult[]> => {
            runViewsCalls.push(params);
            return params.map(() => ({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' } as RunViewResult));
        },
        GetEntityObject: async () => ({ ...viewInfo, Load: async () => true }),
    } as unknown as DatabaseProviderBase;
    return { provider, runViewCalls, runViewsCalls };
}

/** Skips the encrypted-field filter (it needs live Metadata) — irrelevant to these assertions. */
class Probe extends ResolverBase {
    protected override async ArrayFilterEncryptedFieldsForAPI(
        _entityName: string,
        dataObjectArray: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
        return dataObjectArray;
    }

    public MapOne(entityName: string, row: unknown, provider: IMetadataProvider) {
        return this.MapFieldNamesToCodeNames(entityName, row, undefined, provider);
    }
}

describe('IncludeBinaryFields forwarding — single-view resolver paths', () => {
    it('RunDynamicViewGeneric forwards IncludeBinaryFields: true to provider.RunView', async () => {
        const { provider, runViewCalls } = recordingProvider();
        await new Probe().RunDynamicViewGeneric(
            { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '', IncludeBinaryFields: true } as RunDynamicViewInput,
            provider, fakePayload(), undefined as never,
        );

        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].IncludeBinaryFields).toBe(true);
    });

    it('RunDynamicViewGeneric leaves IncludeBinaryFields undefined when the caller did not set it', async () => {
        const { provider, runViewCalls } = recordingProvider();
        await new Probe().RunDynamicViewGeneric(
            { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '' } as RunDynamicViewInput,
            provider, fakePayload(), undefined as never,
        );

        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].IncludeBinaryFields).toBeUndefined();
    });

    it('RunViewByNameGeneric forwards IncludeBinaryFields to provider.RunView', async () => {
        const { provider, runViewCalls } = recordingProvider();
        await new Probe().RunViewByNameGeneric(
            { ViewName: 'Saved View', ExtraFilter: '', OrderBy: '', IncludeBinaryFields: true } as RunViewByNameInput,
            provider, fakePayload(), undefined as never,
        );

        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].EntityName).toBe(ENTITY_NAME);
        expect(runViewCalls[0].IncludeBinaryFields).toBe(true);
    });

    it('RunViewByIDGeneric forwards IncludeBinaryFields to provider.RunView', async () => {
        const { provider, runViewCalls } = recordingProvider();
        await new Probe().RunViewByIDGeneric(
            { ViewID: 'view-1', ExtraFilter: '', OrderBy: '', IncludeBinaryFields: false } as RunViewByIDInput,
            provider, fakePayload(), undefined as never,
        );

        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].IncludeBinaryFields).toBe(false);
    });

    it('RunViewGenericInternal passes binary values through as the provider returned them (base64 strings)', async () => {
        const { provider } = recordingProvider([{ ID: 'r1', Embedding: BYTES_BASE64 }]);
        const result = await new Probe().RunDynamicViewGeneric(
            { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '', IncludeBinaryFields: true } as RunDynamicViewInput,
            provider, fakePayload(), undefined as never,
        );

        expect((result?.Results as Record<string, unknown>[])[0].Embedding).toBe(BYTES_BASE64);
    });
});

describe('IncludeBinaryFields forwarding — batch resolver path', () => {
    it('RunViewsGeneric → RunViewsGenericInternal forwards the per-view flag to provider.RunViews', async () => {
        const { provider, runViewsCalls } = recordingProvider();
        const inputs = [
            { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '', IncludeBinaryFields: true },
            { EntityName: ENTITY_NAME, ExtraFilter: '', OrderBy: '' },
        ] as (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[];

        await new Probe().RunViewsGeneric(inputs, provider, fakePayload());

        expect(runViewsCalls).toHaveLength(1);
        expect(runViewsCalls[0]).toHaveLength(2);
        expect(runViewsCalls[0][0].IncludeBinaryFields).toBe(true);
        expect(runViewsCalls[0][1].IncludeBinaryFields).toBeUndefined();
    });
});

describe('MapFieldNamesToCodeNames — byte arrays become base64', () => {
    const provider = {
        EntityByName: (name: string) => (name === ENTITY_NAME ? (entityStub() as unknown as EntityInfo) : undefined),
    } as unknown as IMetadataProvider;

    it('converts a Buffer value to its base64 string', async () => {
        const mapped = (await new Probe().MapOne(ENTITY_NAME, { ID: 'r1', Embedding: Buffer.from(BYTES) }, provider)) as Record<string, unknown>;

        expect(mapped.Embedding).toBe(BYTES_BASE64);
        expect(mapped.ID).toBe('r1');
    });

    it('converts a plain Uint8Array value too', async () => {
        const mapped = (await new Probe().MapOne(ENTITY_NAME, { ID: 'r1', Embedding: new Uint8Array(BYTES) }, provider)) as Record<string, unknown>;

        expect(mapped.Embedding).toBe(BYTES_BASE64);
    });

    it('leaves an already-base64 string untouched', async () => {
        const mapped = (await new Probe().MapOne(ENTITY_NAME, { ID: 'r1', Embedding: BYTES_BASE64 }, provider)) as Record<string, unknown>;

        expect(mapped.Embedding).toBe(BYTES_BASE64);
    });

    it('does not mutate the caller\'s row (it may be a frozen cache entry)', async () => {
        const buffer = Buffer.from(BYTES);
        const source = Object.freeze({ ID: 'r1', Embedding: buffer }) as Record<string, unknown>;

        const mapped = (await new Probe().MapOne(ENTITY_NAME, source, provider)) as Record<string, unknown>;

        expect(mapped.Embedding).toBe(BYTES_BASE64);
        expect(source.Embedding).toBe(buffer);
    });
});

/** Exposes the protected serializer. */
class ResolverProbe extends RunViewResolver {
    public Process(rows: Record<string, unknown>[]): RunViewResultRow[] {
        return this.processRawData(rows, ENTITY_ID, entityStub() as unknown as EntityInfo);
    }
}

describe('RunViewResolver.processRawData — Buffer → base64 in the Data JSON', () => {
    it('serializes a Buffer value as base64, not {type:"Buffer",data:[...]}', () => {
        const [row] = new ResolverProbe().Process([{ ID: 'r1', Embedding: Buffer.from(BYTES) }]);
        const data = JSON.parse(row.Data) as Record<string, unknown>;

        expect(data.Embedding).toBe(BYTES_BASE64);
        expect(row.Data).not.toContain('"type":"Buffer"');
        expect(row.PrimaryKey).toEqual([{ FieldName: 'ID', Value: 'r1' }]);
        expect(row.EntityID).toBe(ENTITY_ID);
    });

    it('serializes a Uint8Array value as base64 (not an index-keyed object)', () => {
        const [row] = new ResolverProbe().Process([{ ID: 'r1', Embedding: new Uint8Array(BYTES) }]);

        expect((JSON.parse(row.Data) as Record<string, unknown>).Embedding).toBe(BYTES_BASE64);
    });

    it('leaves rows without byte arrays serialized exactly as before', () => {
        const source = { ID: 'r1', Name: 'Plain', Embedding: BYTES_BASE64, Count: 3 };
        const [row] = new ResolverProbe().Process([source]);

        expect(row.Data).toBe(JSON.stringify(source));
    });

    it('does not mutate the source row', () => {
        const buffer = Buffer.from(BYTES);
        const source: Record<string, unknown> = { ID: 'r1', Embedding: buffer };

        new ResolverProbe().Process([source]);

        expect(source.Embedding).toBe(buffer);
    });
});

describe('RunViewResolver.RunViewsWithCacheCheck — IncludeBinaryFields + Buffer serialization', () => {
    function cacheCheckContext(rows: Record<string, unknown>[]) {
        const received: RunViewWithCacheCheckParams[][] = [];
        const provider = {
            EntityByName: (name: string) => (name === ENTITY_NAME ? entityStub() : undefined),
            RunViewsWithCacheCheck: async (params: RunViewWithCacheCheckParams[]): Promise<RunViewsWithCacheCheckResponse> => {
                received.push(params);
                return {
                    success: true,
                    results: params.map((_p, i) => ({ viewIndex: i, status: 'stale', results: rows, maxUpdatedAt: 'T', rowCount: rows.length })),
                } as RunViewsWithCacheCheckResponse;
            },
        };
        const ctx = { providers: [{ type: 'Read-Only', provider }], userPayload: fakePayload() } as unknown as AppContext;
        return { ctx, received };
    }

    it('forwards IncludeBinaryFields into the core params (true, false and unset)', async () => {
        const { ctx, received } = cacheCheckContext([]);
        const input = [
            { params: { EntityName: ENTITY_NAME, IncludeBinaryFields: true } },
            { params: { EntityName: ENTITY_NAME, IncludeBinaryFields: false } },
            { params: { EntityName: ENTITY_NAME } },
        ] as RunViewWithCacheCheckInput[];

        const out = await new RunViewResolver().RunViewsWithCacheCheck(input, ctx);

        expect(out.success).toBe(true);
        expect(received).toHaveLength(1);
        expect(received[0].map(p => p.params.IncludeBinaryFields)).toEqual([true, false, undefined]);
    });

    it('serializes Buffers in stale results as base64', async () => {
        const { ctx } = cacheCheckContext([{ ID: 'r1', Embedding: Buffer.from(BYTES) }]);
        const input = [{ params: { EntityName: ENTITY_NAME, IncludeBinaryFields: true } }] as RunViewWithCacheCheckInput[];

        const out = await new RunViewResolver().RunViewsWithCacheCheck(input, ctx);
        const rows = out.results[0].Results as RunViewResultRow[];

        expect((JSON.parse(rows[0].Data) as Record<string, unknown>).Embedding).toBe(BYTES_BASE64);
    });
});
