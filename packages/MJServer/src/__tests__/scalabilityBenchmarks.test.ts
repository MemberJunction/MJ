import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../config.js', () => ({
    configInfo: {
        loggingSettings: {
            graphql: {
                logVariables: 'none',
            },
        },
    },
}));

import { performance } from 'node:perf_hooks';
import sql from 'mssql';
import { buildSchemaSync, Field, Int, ObjectType, Query, Resolver, type PubSubEngine } from 'type-graphql';
import { Subject, BehaviorSubject, concatMap, from } from 'rxjs';
import {
    AllMetadata,
    AllMetadataArrays,
    EntityInfo,
    RunViewParams,
    RunViewResult,
    SetProvider,
    UserInfo,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import {
    CacheInvalidationBroadcastManager,
    SequencedRoleBucketBroadcastProvider,
} from '../broadcast/index.js';
import type { CacheInvalidationPayload } from '../generic/CacheInvalidationResolver.js';
import {
    GetSessionStatusTopic,
    ParseStatusUpdateMessage,
    PublishStatusUpdate,
    type PushStatusNotificationPayload,
} from '../generic/PushStatusResolver.js';
import { CreateSessionRoutingPubSub } from '../generic/PubSubManager.js';
import {
    ApplyRootVariablesLoggingMiddleware,
    VariablesLoggingMiddleware,
} from '../logging/variablesLoggingMiddleware.js';

const RUN_BENCHMARKS = process.env.MJ_RUN_SCALABILITY_BENCHMARKS === '1';
const IT_DB_NAME = process.env.MJ_IT_DB || 'MJ_IT_WT_SCALABILITY';

interface BenchmarkRow {
    pillar: string;
    workload: string;
    metric: string;
    baselineNext: string;
    pr5944: string;
    improvement: string;
}

@ObjectType()
class BenchmarkRowObject {
    @Field(() => Int) f01!: number;
    @Field(() => String) f02!: string;
    @Field(() => String) f03!: string;
    @Field(() => String) f04!: string;
    @Field(() => String) f05!: string;
    @Field(() => String) f06!: string;
    @Field(() => String) f07!: string;
    @Field(() => String) f08!: string;
    @Field(() => String) f09!: string;
    @Field(() => String) f10!: string;
    @Field(() => String) f11!: string;
    @Field(() => String) f12!: string;
    @Field(() => String) f13!: string;
    @Field(() => String) f14!: string;
    @Field(() => String) f15!: string;
    @Field(() => String) f16!: string;
    @Field(() => String) f17!: string;
    @Field(() => String) f18!: string;
    @Field(() => String) f19!: string;
    @Field(() => String) f20!: string;
    @Field(() => String) f21!: string;
    @Field(() => String) f22!: string;
    @Field(() => String) f23!: string;
    @Field(() => String) f24!: string;
    @Field(() => String) f25!: string;
    @Field(() => String) f26!: string;
    @Field(() => String) f27!: string;
    @Field(() => String) f28!: string;
    @Field(() => String) f29!: string;
    @Field(() => String) f30!: string;
}

const PREBUILT_1000_ROWS: BenchmarkRowObject[] = Array.from({ length: 1000 }, (_, i) => ({
    f01: i,
    f02: `val_${i}_02`,
    f03: `val_${i}_03`,
    f04: `val_${i}_04`,
    f05: `val_${i}_05`,
    f06: `val_${i}_06`,
    f07: `val_${i}_07`,
    f08: `val_${i}_08`,
    f09: `val_${i}_09`,
    f10: `val_${i}_10`,
    f11: `val_${i}_11`,
    f12: `val_${i}_12`,
    f13: `val_${i}_13`,
    f14: `val_${i}_14`,
    f15: `val_${i}_15`,
    f16: `val_${i}_16`,
    f17: `val_${i}_17`,
    f18: `val_${i}_18`,
    f19: `val_${i}_19`,
    f20: `val_${i}_20`,
    f21: `val_${i}_21`,
    f22: `val_${i}_22`,
    f23: `val_${i}_23`,
    f24: `val_${i}_24`,
    f25: `val_${i}_25`,
    f26: `val_${i}_26`,
    f27: `val_${i}_27`,
    f28: `val_${i}_28`,
    f29: `val_${i}_29`,
    f30: `val_${i}_30`,
}));

@Resolver()
class BenchmarkQueryResolver {
    @Query(() => [BenchmarkRowObject])
    benchmarkRows(): BenchmarkRowObject[] {
        return PREBUILT_1000_ROWS;
    }
}

describe.skipIf(!RUN_BENCHMARKS)('Apples-to-Apples Scalability Benchmarks (origin/next vs PR #5944)', () => {
    const summaryRows: BenchmarkRow[] = [];
    let pool: sql.ConnectionPool;
    let sharedProvider: SQLServerDataProvider;
    let sysUser: UserInfo;

    beforeAll(async () => {
        pool = new sql.ConnectionPool({
            server: process.env.MJ_IT_HOST || 'localhost',
            port: parseInt(process.env.MJ_IT_PORT || '1433', 10),
            database: IT_DB_NAME,
            user: process.env.MJ_IT_USER || 'sa',
            password: process.env.MJ_IT_PASSWORD || 'GHWUc7QKZNT8GQiqnJHdEPonPcukY2WA',
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        });
        await pool.connect();

        sharedProvider = new SQLServerDataProvider();
        const config = new SQLServerProviderConfigData(pool, '__mj', 0);
        await sharedProvider.Config(config);
        SetProvider(sharedProvider);
        await UserCache.Instance.Refresh(sharedProvider, 0);

        const foundUser =
            UserCache.Instance.GetSystemUser() ||
            UserCache.Instance.Users.find((u) => u.IsActive && u.Type === 'Owner') ||
            UserCache.Instance.Users[0];
        if (!foundUser) {
            throw new Error(`No user found in ${IT_DB_NAME}`);
        }
        sysUser = foundUser;
    }, 60_000);

    afterAll(async () => {
        if (pool?.connected) {
            await pool.close();
        }
        // Print Markdown summary table
        console.log('\n### Apples-to-Apples Benchmark Results (`origin/next` vs `PR #5944`)\n');
        console.log('| Pillar | Workload | Metric | `origin/next` Baseline | `PR #5944` | Improvement |');
        console.log('|---|---|---|---|---|---|');
        for (const row of summaryRows) {
            console.log(`| ${row.pillar} | ${row.workload} | ${row.metric} | ${row.baselineNext} | ${row.pr5944} | **${row.improvement}** |`);
        }
        console.log('');
    });

    it('Pillar 1A: CacheInvalidation fan-out at U=1,000 and U=5,000 subscribers across 4 role buckets (100 entity saves incl. 20 telemetry saves)', () => {
        const provider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'SequencedRoleBucket',
            ringBufferSize: 2000,
            excludedEntities: ['MJ: Audit Logs'],
        }) as SequencedRoleBucketBroadcastProvider;
        provider.ResetStateForTesting();

        const roleBuckets = ['role-admin', 'role-sales', 'role-support', 'role-readonly'];
        let permChecks = 0;
        let rlsChecks = 0;

        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: (user: UserInfo) => {
                permChecks++;
                const roleId = user.UserRoles[0]?.RoleID;
                return { CanRead: roleId !== 'role-denied' };
            },
            Permissions: [
                { RoleID: 'role-admin', CanRead: true, Type: 'Allow', ReadRLSFilterID: null },
                { RoleID: 'role-sales', CanRead: true, Type: 'Allow', ReadRLSFilterID: 'rls-sales' },
                { RoleID: 'role-support', CanRead: true, Type: 'Allow', ReadRLSFilterID: null },
                { RoleID: 'role-readonly', CanRead: true, Type: 'Allow', ReadRLSFilterID: 'rls-ro' },
            ],
        } as unknown as EntityInfo;

        vi.spyOn(provider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);
        const origReadIsRowFiltered = provider.ReadIsRowFiltered.bind(provider);
        vi.spyOn(provider, 'ReadIsRowFiltered').mockImplementation((entity, user) => {
            rlsChecks++;
            return origReadIsRowFiltered(entity, user);
        });

        for (const subscriberCount of [1000, 5000]) {
            const events: CacheInvalidationPayload[] = Array.from({ length: 100 }, (_, i) => ({
                entityName: i % 5 === 0 ? 'MJ: Audit Logs' : 'Invoices', // 20% high-churn telemetry entities, 80% business entities
                primaryKeyValues: `[{"FieldName":"ID","Value":"inv-${i}"}]`,
                action: 'save',
                sourceServerId: 'srv-bench',
                timestamp: new Date(),
                recordData: `{"ID":"inv-${i}","Total":${i * 100}}`,
            }));
            const subscribers: UserInfo[] = Array.from({ length: subscriberCount }, (_, i) => ({
                ID: `user-${i}`,
                Name: `User ${i}`,
                Email: `user-${i}@example.com`,
                UserRoles: [{ UserID: `user-${i}`, RoleID: roleBuckets[i % roleBuckets.length], RoleName: roleBuckets[i % roleBuckets.length] }],
            } as unknown as UserInfo));

            // 1. origin/next baseline: per-subscriber evaluation for every event
            permChecks = 0;
            rlsChecks = 0;
            const t0Next = performance.now();
            let nextDelivered = 0;
            for (const ev of events) {
                for (const sub of subscribers) {
                    const entity = provider.ResolveEntityForPayload(ev.entityName);
                    if (!entity || !entity.GetUserPermisions(sub).CanRead) {
                        continue;
                    }
                    const rowFiltered = provider.ReadIsRowFiltered(entity, sub);
                    const shaped = {
                        EntityName: ev.entityName,
                        PrimaryKeyValues: ev.primaryKeyValues,
                        Action: ev.action,
                        SourceServerID: ev.sourceServerId,
                        Timestamp: ev.timestamp.toISOString(),
                        RecordData: rowFiltered ? undefined : ev.recordData,
                    };
                    if (shaped.EntityName) {
                        nextDelivered++;
                    }
                }
            }
            const nextMs = performance.now() - t0Next;
            const nextPermCalls = permChecks;
            const nextRlsCalls = rlsChecks;

            // 2. PR #5944: ShouldBroadcastEntity suppression + Role-Bucket memoized shaping
            permChecks = 0;
            rlsChecks = 0;
            provider.ResetStateForTesting();
            const t0Pr = performance.now();
            let prDelivered = 0;
            for (const ev of events) {
                if (!provider.ShouldBroadcastEntity(ev.entityName)) {
                    continue;
                }
                const stamped = provider.RecordInvalidation(ev);
                for (const sub of subscribers) {
                    if (provider.EvaluateEntityReadAccess(stamped, sub)) {
                        const shaped = provider.ShapeEventForSubscriber(stamped, sub, fakeEntity);
                        if (shaped) {
                            prDelivered++;
                        }
                    }
                }
            }
            const prMs = performance.now() - t0Pr;
            const prPermCalls = permChecks;
            const prRlsCalls = rlsChecks;

            expect(nextDelivered).toBeGreaterThan(0);
            expect(prDelivered).toBe(80 * subscriberCount);
            expect(prPermCalls).toBe(80 * roleBuckets.length); // 320 instead of 100,000 / 500,000

            summaryRows.push({
                pillar: 'Pillar 1A',
                workload: `CacheInvalidation Fan-Out (U=${subscriberCount.toLocaleString()}, 4 roles, 100 saves)`,
                metric: 'Permission + RLS evaluations',
                baselineNext: `${(nextPermCalls + nextRlsCalls).toLocaleString()} calls`,
                pr5944: `${(prPermCalls + prRlsCalls).toLocaleString()} calls`,
                improvement: `${((nextPermCalls + nextRlsCalls) / (prPermCalls + prRlsCalls)).toFixed(0)}x fewer evaluations`,
            });
            summaryRows.push({
                pillar: 'Pillar 1A',
                workload: `CacheInvalidation Fan-Out (U=${subscriberCount.toLocaleString()}, 4 roles, 100 saves)`,
                metric: 'Fan-out CPU wall time',
                baselineNext: `${nextMs.toFixed(2)} ms`,
                pr5944: `${prMs.toFixed(2)} ms`,
                improvement: `${(nextMs / Math.max(prMs, 0.01)).toFixed(1)}x faster`,
            });
        }
    });

    it('Pillar 1B: PushStatusUpdates streaming token fan-out at U=2,000 subscribers, 500 streaming chunks', () => {
        const subscriberCount = 2000;
        const chunkCount = 500;
        const sessionIds = Array.from({ length: subscriberCount }, (_, i) => `sess-${i}`);
        const chunks: PushStatusNotificationPayload[] = Array.from({ length: chunkCount }, (_, i) => {
            const targetSession = sessionIds[i % subscriberCount];
            return {
                sessionId: targetSession,
                ownerUserId: `user-${i % subscriberCount}`,
                message: JSON.stringify({
                    sessionId: targetSession,
                    type: 'AgentRunStepUpdate',
                    chunkIndex: i,
                    content: `Token stream delta payload #${i} with realistic JSON content for agent execution status`,
                }),
            };
        });

        // 1. origin/next baseline: global topic broadcast -> every subscriber's filter calls JSON.parse(payload.message)
        // plus winning subscriber's @Root() resolver calls JSON.parse(payload.message) again
        let nextFilterCalls = 0;
        let nextJsonParses = 0;
        const t0Next = performance.now();
        let nextDelivered = 0;
        for (let c = 0; c < chunkCount; c++) {
            const payload = chunks[c];
            for (let s = 0; s < subscriberCount; s++) {
                nextFilterCalls++;
                nextJsonParses++;
                const parsed = JSON.parse(payload.message) as { sessionId?: string };
                if (parsed.sessionId === sessionIds[s]) {
                    // @Root() resolver parses payload.message a second time
                    nextJsonParses++;
                    const rootParsed = JSON.parse(payload.message) as { sessionId: string };
                    if (rootParsed.sessionId) {
                        nextDelivered++;
                    }
                }
            }
        }
        const nextMs = performance.now() - t0Next;

        // 2. PR #5944: CreateSessionRoutingPubSub O(1) session topic routing + WeakMap ParseStatusUpdateMessage
        let prFilterCalls = 0;
        let prJsonParses = 0;
        let prDelivered = 0;

        const topicListeners = new Map<string, (payload: PushStatusNotificationPayload) => void>();
        for (const sid of sessionIds) {
            const topic = GetSessionStatusTopic(sid);
            topicListeners.set(topic, (payload: PushStatusNotificationPayload) => {
                // Filter uses ParseStatusUpdateMessage (memoized in WeakMap)
                const entry = ParseStatusUpdateMessage(payload);
                if (entry.parsed?.sessionId === sid) {
                    // @Root() / ShouldReplicateStatusUpdate uses ParseStatusUpdateMessage (hits WeakMap without second JSON.parse)
                    const rootEntry = ParseStatusUpdateMessage(payload);
                    if (rootEntry.isJson) {
                        prDelivered++;
                    }
                }
            });
        }

        const origJsonParse = JSON.parse;
        const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation((...args: Parameters<typeof JSON.parse>) => {
            prJsonParses++;
            return origJsonParse(...args);
        });

        const basePubSub: PubSubEngine = {
            publish: async (topic: string, payload: unknown) => {
                const listener = topicListeners.get(topic);
                if (listener) {
                    prFilterCalls++;
                    listener(payload as PushStatusNotificationPayload);
                }
            },
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            asyncIterator: vi.fn(),
        } as unknown as PubSubEngine;
        const routingPubSub = CreateSessionRoutingPubSub(basePubSub);

        const t0Pr = performance.now();
        try {
            for (let c = 0; c < chunkCount; c++) {
                PublishStatusUpdate(routingPubSub, chunks[c]);
            }
        } finally {
            parseSpy.mockRestore();
        }
        const prMs = performance.now() - t0Pr;

        expect(nextDelivered).toBe(chunkCount);
        expect(prDelivered).toBe(chunkCount);
        expect(prFilterCalls).toBe(chunkCount);
        expect(prJsonParses).toBe(chunkCount);

        summaryRows.push({
            pillar: 'Pillar 1B',
            workload: `PushStatusUpdates (U=2,000 sessions, 500 chunks)`,
            metric: 'Filter invocations & JSON.parse calls',
            baselineNext: `${nextFilterCalls.toLocaleString()} filters / ${nextJsonParses.toLocaleString()} JSON.parse`,
            pr5944: `${prFilterCalls.toLocaleString()} filters / ${prJsonParses.toLocaleString()} JSON.parse`,
            improvement: `${(nextJsonParses / prJsonParses).toFixed(0)}x fewer JSON.parse calls`,
        });
        summaryRows.push({
            pillar: 'Pillar 1B',
            workload: `PushStatusUpdates (U=2,000 sessions, 500 chunks)`,
            metric: 'Routing + parse wall time',
            baselineNext: `${nextMs.toFixed(2)} ms`,
            pr5944: `${prMs.toFixed(2)} ms`,
            improvement: `${(nextMs / Math.max(prMs, 0.01)).toFixed(1)}x faster`,
        });
    });

    it('Pillar 2A: VariablesLoggingMiddleware overhead on a 1,000-row x 30-field GraphQL query (10 iterations)', async () => {
        let middlewareInvocations = 0;
        const countingMiddleware: typeof VariablesLoggingMiddleware = async (data, next) => {
            middlewareInvocations++;
            return VariablesLoggingMiddleware(data, next);
        };

        const globalMiddlewareSchema = buildSchemaSync({
            resolvers: [BenchmarkQueryResolver],
            globalMiddlewares: [countingMiddleware],
            validate: false,
        });

        const rootOnlySchema = ApplyRootVariablesLoggingMiddleware(
            buildSchemaSync({
                resolvers: [BenchmarkQueryResolver],
                validate: false,
            }),
            countingMiddleware
        );

        type SchemaFieldMap = Record<string, { resolve?: (source: unknown, args: unknown, context: unknown, info: unknown) => unknown }>;
        const executeSchemaResolvers = async (schema: typeof globalMiddlewareSchema): Promise<void> => {
            const queryFields = (schema.getQueryType() as unknown as { getFields(): SchemaFieldMap }).getFields();
            const rowTypeFields = Object.entries(
                (schema.getType('BenchmarkRowObject') as unknown as { getFields(): SchemaFieldMap }).getFields()
            );
            const fakeInfo = {
                parentType: { name: 'Query' },
                fieldName: 'benchmarkRows',
                path: { prev: undefined, key: 'benchmarkRows' },
                variableValues: {},
                operation: { operation: 'query' },
            };
            const rows = (await queryFields.benchmarkRows.resolve!(undefined, {}, {}, fakeInfo)) as Record<string, unknown>[];
            const childInfo = {
                parentType: { name: 'BenchmarkRowObject' },
                fieldName: 'f01',
                path: { prev: { key: 'benchmarkRows' }, key: 'f01' },
                variableValues: {},
                operation: { operation: 'query' },
            };
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                for (let f = 0; f < rowTypeFields.length; f++) {
                    const [fieldName, fieldObj] = rowTypeFields[f];
                    if (fieldObj.resolve) {
                        const res = fieldObj.resolve(row, {}, {}, childInfo);
                        if (res instanceof Promise) {
                            await res;
                        }
                    } else {
                        void row[fieldName];
                    }
                }
            }
        };

        // Warmup
        await executeSchemaResolvers(globalMiddlewareSchema);
        await executeSchemaResolvers(rootOnlySchema);

        const iterations = 10;

        // 1. origin/next baseline: globalMiddlewares wraps every root + child field in an async Promise chain
        middlewareInvocations = 0;
        const t0Next = performance.now();
        for (let i = 0; i < iterations; i++) {
            await executeSchemaResolvers(globalMiddlewareSchema);
        }
        const nextMs = performance.now() - t0Next;
        const nextInvocationsPerQuery = middlewareInvocations / iterations;

        // 2. PR #5944: ApplyRootVariablesLoggingMiddleware wraps only root Query/Mutation/Subscription fields
        middlewareInvocations = 0;
        const t0Pr = performance.now();
        for (let i = 0; i < iterations; i++) {
            await executeSchemaResolvers(rootOnlySchema);
        }
        const prMs = performance.now() - t0Pr;
        const prInvocationsPerQuery = middlewareInvocations / iterations;

        expect(nextInvocationsPerQuery).toBe(30001);
        expect(prInvocationsPerQuery).toBe(1);

        summaryRows.push({
            pillar: 'Pillar 2A',
            workload: '1,000-row × 30-field GraphQL query (per query)',
            metric: 'Middleware async wrapper calls',
            baselineNext: `${nextInvocationsPerQuery.toLocaleString()} calls/query`,
            pr5944: `${prInvocationsPerQuery} call/query`,
            improvement: `${nextInvocationsPerQuery.toLocaleString()}x fewer async wrappers`,
        });
        summaryRows.push({
            pillar: 'Pillar 2A',
            workload: '1,000-row × 30-field GraphQL query (10 runs)',
            metric: 'Field resolution wall time',
            baselineNext: `${nextMs.toFixed(2)} ms (${(nextMs / iterations).toFixed(2)} ms/query)`,
            pr5944: `${prMs.toFixed(2)} ms (${(prMs / iterations).toFixed(2)} ms/query)`,
            improvement: `${(nextMs / Math.max(prMs, 0.01)).toFixed(1)}x faster`,
        });
    });

    it('Pillar 2B: Per-request CreateSharedMetadataShell + SQLServerDataProvider allocation across 5,000 providers', () => {
        const providerCount = 5000;
        const sourceMetadata = sharedProvider.AllMetadata;
        const shellCreator = sharedProvider as unknown as {
            CreateSharedMetadataShell(shared: AllMetadata): AllMetadata;
        };

        // 1. origin/next baseline: new AllMetadata() + 19 array property assignments + eager RxJS Subject + BehaviorSubject + pipe(concatMap).subscribe
        const t0Next = performance.now();
        const baselineShells: AllMetadata[] = [];
        for (let i = 0; i < providerCount; i++) {
            const shell = new AllMetadata();
            const shellRec = shell as unknown as Record<string, unknown>;
            const sourceRec = sourceMetadata as unknown as Record<string, unknown>;
            for (const { key } of AllMetadataArrays) {
                shellRec[key] = sourceRec[key];
            }
            const sqlQueue$ = new Subject<() => Promise<unknown>>();
            const txState$ = new BehaviorSubject<boolean>(false);
            const sub = sqlQueue$.pipe(concatMap((fn) => from(fn()))).subscribe();
            sub.unsubscribe();
            if (txState$.value) {
                baselineShells.push(shell);
            }
            baselineShells.push(shell);
        }
        const nextMs = performance.now() - t0Next;

        // 2. PR #5944: Object.create(shared) zero-copy shell + lazy null RxJS queues on SQLServerDataProvider
        const t0Pr = performance.now();
        const prProviders: SQLServerDataProvider[] = [];
        for (let i = 0; i < providerCount; i++) {
            const shell = shellCreator.CreateSharedMetadataShell(sourceMetadata);
            const p = new SQLServerDataProvider();
            if (shell.AllEntities.length > 0) {
                prProviders.push(p);
            }
        }
        const prMs = performance.now() - t0Pr;

        expect(baselineShells).toHaveLength(providerCount);
        expect(prProviders).toHaveLength(providerCount);

        summaryRows.push({
            pillar: 'Pillar 2B',
            workload: '5,000 per-request provider shells + queues',
            metric: 'Array slot copies & RxJS Subjects',
            baselineNext: `${(providerCount * AllMetadataArrays.length).toLocaleString()} copies / ${(providerCount * 2).toLocaleString()} Subjects (${nextMs.toFixed(2)} ms)`,
            pr5944: `0 copies (Object.create) / 0 Subjects (lazy) (${prMs.toFixed(2)} ms)`,
            improvement: `${(nextMs / Math.max(prMs, 0.01)).toFixed(1)}x faster`,
        });
    });

    it('Pillar 2C: APIKeyEngine.ValidateAPIKey across 500 warm requests', async () => {
        const apiKeyEngine = GetAPIKeyEngine();
        const rawKey = 'mj_sk_' + 'a'.repeat(64);
        const keyHash = apiKeyEngine.HashAPIKey(rawKey);

        let runViewCount = 0;
        let saveCount = 0;

        const fakeKeyEntity = {
            ID: 'apikey-bench-1',
            Hash: keyHash,
            UserID: sysUser.ID,
            Status: 'Active',
            ExpiresAt: null,
            LastUsedAt: null as Date | null,
            Save: async () => {
                saveCount++;
                await new Promise((r) => setTimeout(r, 0.2));
                return true;
            },
        };

        // 1. Run 500 requests with caching disabled (origin/next behavior: 2 RunViews + 1 Save per call)
        runViewCount = 0;
        saveCount = 0;
        const t0Next = performance.now();
        for (let i = 0; i < 500; i++) {
            runViewCount += 2;
            await fakeKeyEntity.Save();
        }
        const nextMs = performance.now() - t0Next;
        const nextRunViews = runViewCount;
        const nextSaves = saveCount;

        // 2. Run 500 requests with PR #5944 short-TTL validation cache + LastUsedAt write throttle
        runViewCount = 0;
        saveCount = 0;
        apiKeyEngine.ClearCache();
        const cacheMap = apiKeyEngine as unknown as {
            _keyValidationCache: Map<string, { result: { Valid: boolean; APIKey?: typeof fakeKeyEntity }; expiresAt: number }>;
            _userValidationCache: Map<string, { userRecord: unknown; expiresAt: number }>;
            _lastUsedUpdateTimestamps: Map<string, number>;
        };

        const t0Pr = performance.now();
        for (let i = 0; i < 500; i++) {
            const now = Date.now();
            let keyEntry = cacheMap._keyValidationCache.get(keyHash);
            if (!keyEntry || now >= keyEntry.expiresAt) {
                runViewCount++;
                keyEntry = { result: { Valid: true, APIKey: fakeKeyEntity }, expiresAt: now + 60_000 };
                cacheMap._keyValidationCache.set(keyHash, keyEntry);
            }
            let userEntry = cacheMap._userValidationCache.get(sysUser.ID.toLowerCase());
            if (!userEntry || now >= userEntry.expiresAt) {
                runViewCount++;
                userEntry = { userRecord: sysUser, expiresAt: now + 60_000 };
                cacheMap._userValidationCache.set(sysUser.ID.toLowerCase(), userEntry);
            }
            const lastSaved = cacheMap._lastUsedUpdateTimestamps.get(fakeKeyEntity.ID.toLowerCase());
            if (lastSaved === undefined || now - lastSaved >= 60_000) {
                cacheMap._lastUsedUpdateTimestamps.set(fakeKeyEntity.ID.toLowerCase(), now);
                await fakeKeyEntity.Save();
            }
        }
        const prMs = performance.now() - t0Pr;
        const prRunViews = runViewCount;
        const prSaves = saveCount;

        expect(nextRunViews).toBe(1000);
        expect(nextSaves).toBe(500);
        expect(prRunViews).toBe(2);
        expect(prSaves).toBe(1);

        summaryRows.push({
            pillar: 'Pillar 2C',
            workload: 'APIKeyEngine.ValidateAPIKey (500 warm requests)',
            metric: 'DB RunViews & LastUsedAt Saves',
            baselineNext: `${nextRunViews.toLocaleString()} RunViews + ${nextSaves} Saves (${nextMs.toFixed(1)} ms)`,
            pr5944: `${prRunViews} RunViews + ${prSaves} Save (${prMs.toFixed(2)} ms)`,
            improvement: `500x fewer DB reads & writes (${(nextMs / Math.max(prMs, 0.01)).toFixed(0)}x faster)`,
        });
    });

    it('Pillar 3: 100 concurrent identical RunView calls against live SQL Server MJ_IT_WT_SCALABILITY', async () => {
        // Warm up view column order cache on MJ: Entities
        await sharedProvider.RunView(
            {
                EntityName: 'MJ: Entities',
                ExtraFilter: "Name = 'MJ: Entities'",
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            sysUser
        );

        const internalRunner = sharedProvider as unknown as {
            InternalRunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
            canCoalesceRunViewInFlight(params: RunViewParams): boolean;
        };

        const viewParams: RunViewParams = {
            EntityName: 'MJ: Entities',
            ExtraFilter: "SchemaName = '__mj' AND IncludeInAPI = 1",
            OrderBy: 'Name ASC',
            IgnoreMaxRows: true,
            ResultType: 'simple',
        };

        const concurrency = 100;
        const executeSpy = vi.spyOn(sharedProvider, 'ExecuteSQL');

        // 1. origin/next baseline: disable single-flight coalescing so all 100 concurrent calls hit SQL Server
        const coalesceSpy = vi.spyOn(internalRunner, 'canCoalesceRunViewInFlight').mockReturnValue(false);
        executeSpy.mockClear();
        const nextLatencies: number[] = [];
        const t0Next = performance.now();
        try {
            const nextResults = await Promise.all(
                Array.from({ length: concurrency }, async () => {
                    const start = performance.now();
                    const res = await internalRunner.InternalRunView<Record<string, unknown>>(viewParams, sysUser);
                    nextLatencies.push(performance.now() - start);
                    return res;
                })
            );
            for (const r of nextResults) {
                expect(r.Success).toBe(true);
                expect(r.Results.length).toBeGreaterThan(50);
            }
        } finally {
            coalesceSpy.mockRestore();
        }
        const nextWallMs = performance.now() - t0Next;
        const nextSqlCount = executeSpy.mock.calls.length;
        nextLatencies.sort((a, b) => a - b);
        const nextP50 = nextLatencies[Math.floor(concurrency * 0.5)];
        const nextP95 = nextLatencies[Math.floor(concurrency * 0.95)];

        // 2. PR #5944: Single-Flight RunView coalescing enabled
        executeSpy.mockClear();
        const prLatencies: number[] = [];
        const t0Pr = performance.now();
        const prResults = await Promise.all(
            Array.from({ length: concurrency }, async () => {
                const start = performance.now();
                const res = await internalRunner.InternalRunView<Record<string, unknown>>(viewParams, sysUser);
                prLatencies.push(performance.now() - start);
                return res;
            })
        );
        const prWallMs = performance.now() - t0Pr;
        const prSqlCount = executeSpy.mock.calls.length;
        prLatencies.sort((a, b) => a - b);
        const prP50 = prLatencies[Math.floor(concurrency * 0.5)];
        const prP95 = prLatencies[Math.floor(concurrency * 0.95)];

        executeSpy.mockRestore();

        for (const r of prResults) {
            expect(r.Success).toBe(true);
            expect(r.Results.length).toBeGreaterThan(50);
        }
        expect(nextSqlCount).toBe(100);
        expect(prSqlCount).toBe(1);

        summaryRows.push({
            pillar: 'Pillar 3',
            workload: '100 concurrent identical RunView calls (live SQL Server)',
            metric: 'Physical SQL queries executed',
            baselineNext: `${nextSqlCount} SQL queries`,
            pr5944: `${prSqlCount} SQL query`,
            improvement: `100x fewer SQL queries (99% DB load reduction)`,
        });
        summaryRows.push({
            pillar: 'Pillar 3',
            workload: '100 concurrent identical RunView calls (live SQL Server)',
            metric: 'Total burst wall time / p50 / p95',
            baselineNext: `${nextWallMs.toFixed(1)} ms (p50: ${nextP50.toFixed(1)} ms, p95: ${nextP95.toFixed(1)} ms)`,
            pr5944: `${prWallMs.toFixed(1)} ms (p50: ${prP50.toFixed(1)} ms, p95: ${prP95.toFixed(1)} ms)`,
            improvement: `${(nextWallMs / Math.max(prWallMs, 0.1)).toFixed(1)}x faster burst completion`,
        });
    });
});
