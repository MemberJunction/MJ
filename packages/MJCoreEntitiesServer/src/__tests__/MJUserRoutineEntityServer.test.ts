/**
 * Unit tests for `MJUserRoutineEntityServer` — the server-side UserRoutine gate:
 *   - Validate(): rejects invalid cron expressions, cron/timezone combos that cannot compute
 *     a next occurrence, and a TargetType without a TargetID; enforces the ownership defense
 *     (non-Owner-type users may only save routines they own, compared against the PRE-save owner).
 *   - Save(): defaults UserID to the context user on first save; recomputes NextRunAt when the
 *     schedule inputs changed or NextRunAt was never computed — but ALWAYS respects an
 *     explicitly-set (dirty) NextRunAt (the dispatcher's claim path).
 *
 * The heavy generated base (`MJUserRoutineEntity`) is mocked to a settable stub with
 * configurable per-field Dirty/OldValue state; `@memberjunction/scheduling-engine` is mocked
 * with lightweight fakes that emulate the cron helper CONTRACT (sentinel 'BAD CRON' /
 * 'Bad/Zone' inputs fail) — real cron behavior is covered by the scheduling-engine package's
 * own UserRoutineProcessor tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';

// Neutralize the class-factory registration decorator; keep UUIDsEqual real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual };
});

// Contract-level fakes for the cron helper — sentinel inputs fail, everything else computes
// a deterministic next occurrence that respects the StartAt floor.
vi.mock('@memberjunction/scheduling-engine', () => ({
    CronExpressionHelper: {
        ValidateExpression: (expr: string): ValidationResult => {
            const r = new ValidationResult();
            if (expr === 'BAD CRON' || !expr) {
                r.Success = false;
                r.Errors.push({
                    Source: 'CronExpression',
                    Message: 'Invalid cron expression',
                    Value: expr,
                    Type: 'Failure',
                } as ValidationResult['Errors'][number]);
            } else {
                r.Success = true;
            }
            return r;
        },
    },
    ComputeRoutineNextRunAt: (expr: string, tz: string, from: Date, startAt?: Date | null): Date => {
        if (expr === 'BAD CRON') throw new Error('Invalid cron expression');
        if (tz === 'Bad/Zone') throw new Error('Invalid timezone');
        const base = startAt != null && startAt.getTime() > from.getTime() ? startAt : from;
        return new Date(base.getTime() + 3_600_000); // "next hour" — deterministic stand-in
    },
}));

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

// Settable base standing in for the generated `MJUserRoutineEntity`, with configurable
// per-field Dirty/OldValue state so the subclass's GetFieldByName-driven logic is testable.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJUserRoutineEntity {
        public UserID: string | null = null;
        public CronExpression = '0 0 * * * *';
        public Timezone = 'UTC';
        public StartAt: Date | null = null;
        public EndAt: Date | null = null;
        public TargetType: string | null = 'Action';
        public TargetID: string | null = 'AAAAAAAA-0000-0000-0000-000000000001';
        public NextRunAt: Date | null = null;
        public ID = 'RRRRRRRR-0000-0000-0000-00000000000R';
        public IsSaved = false;
        public ContextCurrentUser: { ID: string; Type: string | null } | null = null;
        public SuperSaveCalled = false;
        public SuperDeleteCalled = false;
        public ProviderToUse: unknown = {};
        public RunViewProviderToUse: unknown = {};
        public RoutineType: string | null = 'Scheduled';
        public WakeConfiguration: string | null = null;
        public __mj_UpdatedAt: Date | null = null;
        public LastRegisteredResult: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } } | null = null;
        private fieldState: Record<string, FieldState> = {};
        public FlushJSONFieldObjects(): void {}
        public SetFieldState(name: string, state: FieldState): void {
            this.fieldState[name] = state;
        }
        public GetFieldByName(name: string): FieldState {
            return this.fieldState[name] ?? { Dirty: false, OldValue: null };
        }
        public RegisterResultHistoryEntry(result: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } }): void {
            this.LastRegisteredResult = result;
        }
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
        public SuperSaveOptions: unknown = null;
        public OnSuperSave?: (entity: MockMJUserRoutineEntity, options?: unknown) => Promise<boolean>;
        public async Save(options?: unknown): Promise<boolean> {
            this.SuperSaveCalled = true;
            this.SuperSaveOptions = options ?? null;
            if (this.OnSuperSave) {
                return this.OnSuperSave(this, options);
            }
            return true;
        }
        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }
    }
    return { MJUserRoutineEntity: MockMJUserRoutineEntity };
});

import { RunView } from '@memberjunction/core';
import { MJUserRoutineEntityServer } from '../custom/MJUserRoutineEntityServer.server';

/** The mock base's extra test hooks, layered over the subclass's typed surface. */
interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: { ID: string; Type: string | null } | null;
    SuperSaveCalled: boolean;
    SuperDeleteCalled: boolean;
    TargetID: string | null;
    SetFieldState(name: string, state: FieldState): void;
}

function makeEntity(): MJUserRoutineEntityServer & MockHooks {
    return new MJUserRoutineEntityServer() as MJUserRoutineEntityServer & MockHooks;
}

describe('MJUserRoutineEntityServer.Validate', () => {
    it('rejects an invalid cron expression', () => {
        const e = makeEntity();
        e.CronExpression = 'BAD CRON';
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'CronExpression')).toBe(true);
    });

    it('rejects a valid cron with a timezone that cannot compute a next occurrence', () => {
        const e = makeEntity();
        e.Timezone = 'Bad/Zone';
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'CronExpression' && err.Message.includes('Bad/Zone'))).toBe(true);
    });

    it('rejects a TargetType without a TargetID', () => {
        const e = makeEntity();
        e.TargetID = null;
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'TargetID')).toBe(true);
    });

    it('passes for a valid schedule + target', () => {
        const e = makeEntity();
        expect(e.Validate().Success).toBe(true);
    });

    describe('ownership defense', () => {
        it('blocks a non-Owner-type user from saving a routine they do not own', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A'; // someone else's routine
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'User' };
            const result = e.Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors.some(err => err.Source === 'UserID')).toBe(true);
        });

        it('compares against the PRE-save owner — reassigning UserID cannot bypass the gate', () => {
            const e = makeEntity();
            e.UserID = 'BBBBBBBB-0000-0000-0000-00000000000B'; // attacker sets themselves as owner
            e.SetFieldState('UserID', { Dirty: true, OldValue: 'AAAAAAAA-0000-0000-0000-00000000000A' });
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'User' };
            const result = e.Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors.some(err => err.Source === 'UserID')).toBe(true);
        });

        it('allows the owner to save their own routine (case-insensitive UUID comparison)', () => {
            const e = makeEntity();
            e.UserID = 'aaaaaaaa-0000-0000-0000-00000000000a';
            e.ContextCurrentUser = { ID: 'AAAAAAAA-0000-0000-0000-00000000000A', Type: 'User' };
            expect(e.Validate().Success).toBe(true);
        });

        it('exempts Owner-type users (admins + the scheduler system user)', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A';
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'Owner' };
            expect(e.Validate().Success).toBe(true);
        });

        it('skips the gate when there is no context user (system path)', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A';
            e.ContextCurrentUser = null;
            expect(e.Validate().Success).toBe(true);
        });
    });
});

describe('MJUserRoutineEntityServer.Save', () => {
    it('defaults UserID to the context user on first save when unset', async () => {
        const e = makeEntity();
        e.IsSaved = false;
        e.ContextCurrentUser = { ID: 'CCCCCCCC-0000-0000-0000-00000000000C', Type: 'User' };
        await e.Save();
        expect(e.UserID).toBe('CCCCCCCC-0000-0000-0000-00000000000C');
        expect(e.SuperSaveCalled).toBe(true);
    });

    it('computes NextRunAt when it was never set', async () => {
        const e = makeEntity();
        e.NextRunAt = null;
        const before = Date.now();
        await e.Save();
        expect(e.NextRunAt).not.toBeNull();
        expect(e.NextRunAt!.getTime()).toBeGreaterThan(before);
    });

    it('recomputes NextRunAt when a schedule field of a SAVED routine is dirty', async () => {
        const e = makeEntity();
        e.IsSaved = true; // editing an existing routine's cron; on an unsaved record a set NextRunAt is explicit
        const stale = new Date('2020-01-01T00:00:00.000Z');
        e.NextRunAt = stale;
        e.SetFieldState('CronExpression', { Dirty: true, OldValue: '0 0 0 * * *' });
        await e.Save();
        expect(e.NextRunAt!.getTime()).not.toBe(stale.getTime());
    });

    it('respects the StartAt floor when recomputing', async () => {
        const e = makeEntity();
        e.NextRunAt = null;
        e.StartAt = new Date(Date.now() + 7 * 24 * 3_600_000); // window opens in a week
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBeGreaterThanOrEqual(e.StartAt.getTime());
    });

    it('NEVER overrides an explicitly-set (dirty) NextRunAt — the dispatcher claim path', async () => {
        const e = makeEntity();
        const explicit = new Date('2020-01-01T00:00:00.000Z');
        e.NextRunAt = explicit;
        e.SetFieldState('NextRunAt', { Dirty: true, OldValue: null });
        e.SetFieldState('CronExpression', { Dirty: true, OldValue: 'x' }); // even with the schedule dirty
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBe(explicit.getTime());
    });

    it('computes NextRunAt on create even when a NULL NextRunAt arrived dirty — the GraphQL create path marks every provided field dirty', async () => {
        const e = makeEntity();
        e.IsSaved = false;
        e.NextRunAt = null;
        e.SetFieldState('NextRunAt', { Dirty: true, OldValue: null }); // client sent its untouched null
        const before = Date.now();
        await e.Save();
        expect(e.NextRunAt).not.toBeNull();
        expect(e.NextRunAt!.getTime()).toBeGreaterThan(before);
    });

    it('keeps an explicit NextRunAt on a NEW record whose schedule fields were changed before the first save', async () => {
        // After NewRecord(), a field's FIRST write also becomes its OldValue, so a later write makes it
        // Dirty while a single write does not. A one-shot built with a default cron that is then cleared
        // reads as "schedule changed, NextRunAt not explicit"; recomputing yields null (no cron, no
        // StartAt) and the dispatcher's roll-up then disables the routine. On an unsaved record a
        // non-null NextRunAt is the caller's explicit time.
        const e = makeEntity();
        e.IsSaved = false;
        const when = new Date('2030-01-01T15:00:00Z');
        (e as unknown as { ScheduleMode: string }).ScheduleMode = 'OneShot';
        e.CronExpression = null as unknown as string;
        e.NextRunAt = when;
        e.SetFieldState('NextRunAt', { Dirty: false, OldValue: when });
        e.SetFieldState('CronExpression', { Dirty: true, OldValue: '0 0 * * * *' });
        await e.Save();
        expect(e.NextRunAt).toBe(when);
    });

    it('leaves NextRunAt untouched when nothing schedule-related changed', async () => {
        const e = makeEntity();
        const existing = new Date('2030-06-01T00:00:00.000Z');
        e.NextRunAt = existing;
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBe(existing.getTime());
    });

    it('leaves NextRunAt null (and still saves) when the cron helper throws — Validate() owns the rejection', async () => {
        const e = makeEntity();
        e.CronExpression = 'BAD CRON';
        e.NextRunAt = null;
        await e.Save();
        expect(e.NextRunAt).toBeNull();
        expect(e.SuperSaveCalled).toBe(true);
    });

    it('rejects stale AgentWake coalescing writes on transactional SQL providers (SQL Server & PostgreSQL) when DB coalesceRevision has already advanced', async () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const e = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
                RoutineType: string | null;
                WakeConfiguration: string | null;
                ProviderToUse: unknown;
                RunViewProviderToUse: unknown;
                LastRegisteredResult: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } } | null;
            };
            e.IsSaved = true;
            e.RoutineType = 'AgentWake';
            e.CronExpression = null as unknown as string;
            e.WakeConfiguration = JSON.stringify({
                workstreamKey: 'app:tasks',
                resumeState: { coalesceRevision: 2, coalesceWriteToken: 'tok-stale' },
            });
            e.SetFieldState('WakeConfiguration', {
                Dirty: true,
                OldValue: JSON.stringify({ workstreamKey: 'app:tasks', resumeState: { coalesceRevision: 1, coalesceWriteToken: 'tok-1' } }),
            });

            const provider = {
                PlatformKey: platform,
                SupportsEntityTransactions: true,
                ConfigData: { MJCoreSchemaName: '__mj' },
                QuoteIdentifier: (n: string) => (platform === 'postgresql' ? `"${n}"` : `[${n}]`),
                QuoteSchemaAndView: (s: string, o: string) => (platform === 'postgresql' ? `"${s}"."${o}"` : `[${s}].[${o}]`),
                BuildParameterPlaceholder: (i: number) => (platform === 'postgresql' ? `$${i + 1}` : `@p${i}`),
                BeginEntityTransaction: async () => ({
                    IsNested: false,
                    Commit: async () => undefined,
                    Rollback: async () => undefined,
                }),
                ExecuteSQL: async <T>(sql: string): Promise<Array<T>> => {
                    if (sql.includes('sp_getapplock')) {
                        return [{ LockResult: 0 }] as Array<T>;
                    }
                    if (sql.includes('pg_advisory_xact_lock')) {
                        return [] as Array<T>;
                    }
                    if (sql.includes('WITH (UPDLOCK, ROWLOCK)') || sql.includes('FOR UPDATE')) {
                        return [
                            {
                                ID: e.ID,
                                WakeConfiguration: JSON.stringify({
                                    workstreamKey: 'app:tasks',
                                    resumeState: { coalesceRevision: 2, coalesceWriteToken: 'tok-newer' },
                                }),
                            } as unknown as T,
                        ];
                    }
                    return [] as Array<T>;
                },
            };
            e.ProviderToUse = provider;
            e.RunViewProviderToUse = provider;

            const ok = await e.Save();
            expect(ok).toBe(false);
            expect(e.SuperSaveCalled).toBe(false);
            expect(e.LastRegisteredResult?.Message).toContain('Concurrent AgentWake coalescing conflict');
            expect(e.LastRegisteredResult?.ConcurrencyConflict?.ConflictingFields).toEqual(['WakeConfiguration']);
        }
    });

    it('enforces atomic SQL bucket lock (sp_getapplock) + UPDLOCK read + ConcurrencyCheck:enforce across barrier-synchronized writers (SQL Server)', async () => {
        interface StoredRow {
            ID: string;
            WakeConfiguration: string;
            __mj_UpdatedAt: Date;
        }
        const t0 = new Date('2026-11-22T12:00:00.000Z');
        const initialCfg = JSON.stringify({
            workstreamKey: 'app:tasks',
            resumeState: { applicationID: 'app-tasks', coalesceRevision: 1, coalesceWriteToken: 'tok-1', pendingEvents: [{ taskID: 't-0' }] },
        });
        const dbRow: StoredRow = { ID: 'RRRRRRRR-0000-0000-0000-00000000000R', WakeConfiguration: initialCfg, __mj_UpdatedAt: t0 };

        let txChain: Promise<void> = Promise.resolve();
        const executedSql: string[] = [];
        const sqlServerProvider = {
            PlatformKey: 'sqlserver',
            SupportsEntityTransactions: true,
            ConfigData: { MJCoreSchemaName: '__mj' },
            QuoteIdentifier: (n: string) => `[${n}]`,
            QuoteSchemaAndView: (s: string, o: string) => `[${s}].[${o}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            BeginEntityTransaction: async () => {
                let release!: () => void;
                const next = new Promise<void>((res) => { release = res; });
                const prev = txChain;
                txChain = txChain.then(() => next, () => next);
                await prev;
                return { IsNested: false, Commit: async () => { release(); }, Rollback: async () => { release(); } };
            },
            ExecuteSQL: async <T>(sql: string): Promise<Array<T>> => {
                executedSql.push(sql);
                if (sql.includes('sp_getapplock')) {
                    return [{ LockResult: 0 }] as unknown as Array<T>;
                }
                if (sql.includes('WITH (UPDLOCK, ROWLOCK)')) {
                    return [{ ...dbRow }] as unknown as Array<T>;
                }
                return [] as Array<T>;
            },
        };

        // Synchronization barrier ensuring both writers have already completed their initial read at revision 1
        let readyCount = 0;
        let releaseBarrier!: () => void;
        const barrier = new Promise<void>((res) => { releaseBarrier = res; });
        const arriveAtBarrier = async (): Promise<void> => {
            readyCount++;
            if (readyCount === 2) {
                releaseBarrier();
            }
            await barrier;
        };

        const buildWriter = (token: string, taskId: string) => {
            const w = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
                RoutineType: string | null;
                WakeConfiguration: string | null;
                __mj_UpdatedAt: Date | null;
                ProviderToUse: unknown;
                RunViewProviderToUse: unknown;
                SuperSaveOptions: { ConcurrencyCheck?: string } | null;
                OnSuperSave?: (entity: unknown) => Promise<boolean>;
                LastRegisteredResult: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } } | null;
            };
            w.IsSaved = true;
            w.UserID = 'UUUUUUUU-0000-0000-0000-000000000001';
            w.TargetID = 'CCCCCCCC-0000-0000-0000-000000000001';
            w.RoutineType = 'AgentWake';
            w.CronExpression = null as unknown as string;
            w.__mj_UpdatedAt = t0;
            w.ProviderToUse = sqlServerProvider;
            w.RunViewProviderToUse = sqlServerProvider;
            w.WakeConfiguration = JSON.stringify({
                workstreamKey: 'app:tasks',
                resumeState: {
                    applicationID: 'app-tasks',
                    coalesceRevision: 2,
                    coalesceWriteToken: token,
                    pendingEvents: [{ taskID: 't-0' }, { taskID: taskId }],
                },
            });
            w.SetFieldState('WakeConfiguration', { Dirty: true, OldValue: initialCfg });
            w.SetFieldState('__mj_UpdatedAt', { Dirty: false, OldValue: t0 });
            w.OnSuperSave = async () => {
                // Dumb DB write — overwrites without any provider-side check; only MJUserRoutineEntityServer CAS protects it
                dbRow.WakeConfiguration = w.WakeConfiguration ?? '';
                dbRow.__mj_UpdatedAt = new Date(t0.getTime() + 1000);
                return true;
            };
            return w;
        };

        const writerA = buildWriter('tok-a', 't-a');
        const writerB = buildWriter('tok-b', 't-b');

        const [resA, resB] = await Promise.all([
            (async () => { await arriveAtBarrier(); return writerA.Save(); })(),
            (async () => { await arriveAtBarrier(); return writerB.Save(); })(),
        ]);

        expect([resA, resB].filter(Boolean)).toHaveLength(1);
        expect([resA, resB].filter((v) => !v)).toHaveLength(1);
        expect(executedSql.some((s) => s.includes('sp_getapplock'))).toBe(true);
        expect(executedSql.some((s) => s.includes('WITH (UPDLOCK, ROWLOCK)'))).toBe(true);
        const winner = resA ? writerA : writerB;
        const loser = resA ? writerB : writerA;
        expect(winner.SuperSaveCalled).toBe(true);
        expect(winner.SuperSaveOptions?.ConcurrencyCheck).toBe('enforce');
        expect(loser.SuperSaveCalled).toBe(false);
        expect(loser.LastRegisteredResult?.Message).toContain('Concurrent AgentWake coalescing conflict');
        expect(loser.LastRegisteredResult?.ConcurrencyConflict?.ConflictingFields).toEqual(['WakeConfiguration']);
        expect(JSON.parse(dbRow.WakeConfiguration).resumeState.coalesceWriteToken).toBe(resA ? 'tok-a' : 'tok-b');
    });

    it('acquires PostgreSQL pg_advisory_xact_lock + FOR UPDATE and rejects concurrent cold-start INSERTs on SQL providers', async () => {
        const persistedRows: Array<{ ID: string; WakeConfiguration: string }> = [];
        const pgSql: string[] = [];
        let txChain: Promise<void> = Promise.resolve();
        const pgProvider = {
            PlatformKey: 'postgresql',
            SupportsEntityTransactions: true,
            ConfigData: { MJCoreSchemaName: '__mj' },
            QuoteIdentifier: (n: string) => `"${n}"`,
            QuoteSchemaAndView: (s: string, o: string) => `"${s}"."${o}"`,
            BuildParameterPlaceholder: (i: number) => `$${i + 1}`,
            BeginEntityTransaction: async () => {
                let release!: () => void;
                const next = new Promise<void>((res) => { release = res; });
                const prev = txChain;
                txChain = txChain.then(() => next, () => next);
                await prev;
                return { IsNested: false, Commit: async () => { release(); }, Rollback: async () => { release(); } };
            },
            ExecuteSQL: async <T>(sql: string): Promise<Array<T>> => {
                pgSql.push(sql);
                if (sql.includes('FOR UPDATE')) {
                    return persistedRows.map((r) => ({ ...r })) as unknown as Array<T>;
                }
                return [] as Array<T>;
            },
        };

        const makeColdCreator = (id: string, token: string) => {
            const c = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
                RoutineType: string | null;
                WakeConfiguration: string | null;
                ProviderToUse: unknown;
                RunViewProviderToUse: unknown;
                OnSuperSave?: () => Promise<boolean>;
                LastRegisteredResult: { Message?: string } | null;
            };
            c.ID = id;
            c.IsSaved = false;
            c.UserID = 'UUUUUUUU-0000-0000-0000-000000000001';
            c.TargetID = 'CCCCCCCC-0000-0000-0000-000000000001';
            c.RoutineType = 'AgentWake';
            c.CronExpression = null as unknown as string;
            c.ProviderToUse = pgProvider;
            c.RunViewProviderToUse = pgProvider;
            c.WakeConfiguration = JSON.stringify({
                workstreamKey: 'app:tasks',
                resumeState: { applicationID: 'app-tasks', coalesceRevision: 1, coalesceWriteToken: token, pendingEvents: [{ taskID: token }] },
            });
            c.OnSuperSave = async () => {
                persistedRows.push({ ID: c.ID, WakeConfiguration: c.WakeConfiguration ?? '' });
                return true;
            };
            return c;
        };

        const creator1 = makeColdCreator('11111111-0000-0000-0000-000000000001', 'tok-1');
        const creator2 = makeColdCreator('11111111-0000-0000-0000-000000000002', 'tok-2');

        const [r1, r2] = await Promise.all([creator1.Save(), creator2.Save()]);
        expect(r1).toBe(true);
        expect(r2).toBe(false);
        expect(persistedRows).toHaveLength(1);
        expect(pgSql.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true);
        expect(pgSql.some((s) => s.includes('FOR UPDATE'))).toBe(true);
        expect(creator2.SuperSaveCalled).toBe(false);
        expect(creator2.LastRegisteredResult?.Message).toContain('active bucket routine');
    });

    it('fails closed (returns false) for coalesced AgentWake saves on non-transactional or non-SQL providers', async () => {
        const nonAtomicProviders: Array<{ label: string; provider: Record<string, unknown> }> = [
            { label: 'plain non-SQL stub', provider: {} },
            { label: 'client provider with SupportsEntityTransactions=false', provider: { SupportsEntityTransactions: false } },
            {
                label: 'SQL provider without SupportsEntityTransactions=true',
                provider: {
                    PlatformKey: 'sqlserver',
                    SupportsEntityTransactions: false,
                    ExecuteSQL: async () => [{ LockResult: 0 }],
                },
            },
            {
                label: 'SQL provider missing BeginEntityTransaction',
                provider: {
                    PlatformKey: 'postgresql',
                    SupportsEntityTransactions: true,
                    ExecuteSQL: async () => [],
                },
            },
        ];

        for (const { label, provider } of nonAtomicProviders) {
            const e = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
                RoutineType: string | null;
                WakeConfiguration: string | null;
                ProviderToUse: unknown;
                RunViewProviderToUse: unknown;
                LastRegisteredResult: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } } | null;
            };
            e.IsSaved = true;
            e.UserID = 'UUUUUUUU-0000-0000-0000-000000000001';
            e.TargetID = 'CCCCCCCC-0000-0000-0000-000000000001';
            e.RoutineType = 'AgentWake';
            e.CronExpression = null as unknown as string;
            e.ProviderToUse = provider;
            e.RunViewProviderToUse = provider;
            e.WakeConfiguration = JSON.stringify({
                workstreamKey: 'app:tasks',
                resumeState: { applicationID: 'app-tasks', coalesceRevision: 2, coalesceWriteToken: 'tok-2', pendingEvents: [{ taskID: 't-2' }] },
            });
            e.SetFieldState('WakeConfiguration', {
                Dirty: true,
                OldValue: JSON.stringify({
                    workstreamKey: 'app:tasks',
                    resumeState: { applicationID: 'app-tasks', coalesceRevision: 1, coalesceWriteToken: 'tok-1', pendingEvents: [{ taskID: 't-1' }] },
                }),
            });

            const ok = await e.Save();
            expect(ok, `Expected fail-closed false for ${label}`).toBe(false);
            expect(e.SuperSaveCalled, `Expected SuperSave not called for ${label}`).toBe(false);
            expect(e.LastRegisteredResult?.Message).toContain('lacks transactional SQL bucket locking');
        }
    });

    it('fails closed when SQL CAS verification read returns empty for a saved routine or invalid lock result', async () => {
        const emptyReadProvider = {
            PlatformKey: 'sqlserver',
            SupportsEntityTransactions: true,
            ConfigData: { MJCoreSchemaName: '__mj' },
            BeginEntityTransaction: async () => ({
                IsNested: false,
                Commit: async () => undefined,
                Rollback: async () => undefined,
            }),
            ExecuteSQL: async <T>(sql: string): Promise<Array<T>> => {
                if (sql.includes('sp_getapplock')) {
                    return [{ LockResult: 0 }] as Array<T>;
                }
                // Simulate target row missing / verification read returning empty
                return [] as Array<T>;
            },
        };

        const e = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
            RoutineType: string | null;
            WakeConfiguration: string | null;
            ProviderToUse: unknown;
            RunViewProviderToUse: unknown;
            LastRegisteredResult: { Message?: string } | null;
        };
        e.IsSaved = true;
        e.RoutineType = 'AgentWake';
        e.CronExpression = null as unknown as string;
        e.ProviderToUse = emptyReadProvider;
        e.RunViewProviderToUse = emptyReadProvider;
        e.WakeConfiguration = JSON.stringify({
            workstreamKey: 'app:tasks',
            resumeState: { coalesceRevision: 2, coalesceWriteToken: 'tok-2' },
        });
        e.SetFieldState('WakeConfiguration', {
            Dirty: true,
            OldValue: JSON.stringify({ workstreamKey: 'app:tasks', resumeState: { coalesceRevision: 1, coalesceWriteToken: 'tok-1' } }),
        });

        expect(await e.Save()).toBe(false);
        expect(e.SuperSaveCalled).toBe(false);
        expect(e.LastRegisteredResult?.Message).toContain('locked verification read returned empty');

        // Also fail closed if sp_getapplock returns negative/empty LockResult
        const lockFailProvider = {
            ...emptyReadProvider,
            ExecuteSQL: async <T>(): Promise<Array<T>> => [{ LockResult: -1 }] as Array<T>,
        };
        e.ProviderToUse = lockFailProvider;
        e.RunViewProviderToUse = lockFailProvider;
        expect(await e.Save()).toBe(false);
        expect(e.SuperSaveCalled).toBe(false);
        expect(e.LastRegisteredResult?.Message).toContain('sp_getapplock returned -1');
    });

    it('proves two independent process contexts passing preflight at revision 1 serialize via transactional SQL CAS and preserve 100% of events', async () => {
        interface DbRow {
            ID: string;
            WakeConfiguration: string;
            __mj_UpdatedAt: Date;
        }
        interface EventItem {
            taskID: string;
        }
        const t0 = new Date('2026-11-22T12:00:00.000Z');
        const routineId = 'RRRRRRRR-0000-0000-0000-00000000000A';
        const sharedDatabaseRow: DbRow = {
            ID: routineId,
            WakeConfiguration: JSON.stringify({
                workstreamKey: 'app:tasks',
                resumeState: {
                    applicationID: 'app-tasks',
                    coalesceRevision: 1,
                    coalesceWriteToken: 'tok-0',
                    pendingEvents: [{ taskID: 'ev-0' }],
                },
            }),
            __mj_UpdatedAt: t0,
        };

        // Shared database lock queue simulating database-level transaction/advisory lock across two separate OS processes
        let dbTxChain: Promise<void> = Promise.resolve();
        const createIndependentProcessSqlProvider = (processName: string) => {
            const sqlLog: string[] = [];
            return {
                processName,
                sqlLog,
                PlatformKey: 'postgresql' as const,
                SupportsEntityTransactions: true,
                ConfigData: { MJCoreSchemaName: '__mj' },
                QuoteIdentifier: (n: string) => `"${n}"`,
                QuoteSchemaAndView: (s: string, o: string) => `"${s}"."${o}"`,
                BuildParameterPlaceholder: (i: number) => `$${i + 1}`,
                BeginEntityTransaction: async () => {
                    let release!: () => void;
                    const next = new Promise<void>((res) => { release = res; });
                    const prev = dbTxChain;
                    dbTxChain = dbTxChain.then(() => next, () => next);
                    await prev;
                    return {
                        IsNested: false,
                        Commit: async () => { release(); },
                        Rollback: async () => { release(); },
                    };
                },
                ExecuteSQL: async <T>(sql: string): Promise<Array<T>> => {
                    sqlLog.push(sql);
                    if (sql.includes('FOR UPDATE')) {
                        return [{ ...sharedDatabaseRow }] as Array<T>;
                    }
                    return [] as Array<T>;
                },
            };
        };

        const providerProcessA = createIndependentProcessSqlProvider('process-A');
        const providerProcessB = createIndependentProcessSqlProvider('process-B');
        expect(providerProcessA).not.toBe(providerProcessB);

        // Both processes perform independent preflight reads BEFORE either write commits
        const preflightA = { ...sharedDatabaseRow };
        const preflightB = { ...sharedDatabaseRow };

        // Synchronization barrier ensuring both processes hold revision-1 preflight state before calling Save()
        let barrierCount = 0;
        let openBarrier!: () => void;
        const preflightBarrier = new Promise<void>((res) => { openBarrier = res; });
        const waitForBothPreflights = async (): Promise<void> => {
            barrierCount++;
            if (barrierCount === 2) {
                openBarrier();
            }
            await preflightBarrier;
        };

        const makeProcessWriter = (
            provider: ReturnType<typeof createIndependentProcessSqlProvider>,
            preflight: DbRow,
            token: string,
            newEventId: string
        ) => {
            const preflightCfg = JSON.parse(preflight.WakeConfiguration) as {
                workstreamKey: string;
                resumeState: { applicationID: string; coalesceRevision: number; coalesceWriteToken: string; pendingEvents: EventItem[] };
            };
            const entity = makeEntity() as MJUserRoutineEntityServer & MockHooks & {
                RoutineType: string | null;
                WakeConfiguration: string | null;
                __mj_UpdatedAt: Date | null;
                ProviderToUse: unknown;
                RunViewProviderToUse: unknown;
                SuperSaveOptions: { ConcurrencyCheck?: string } | null;
                OnSuperSave?: () => Promise<boolean>;
                LastRegisteredResult: { Message?: string; ConcurrencyConflict?: { ConflictingFields?: string[] } } | null;
            };
            entity.ID = preflight.ID;
            entity.IsSaved = true;
            entity.UserID = 'UUUUUUUU-0000-0000-0000-000000000001';
            entity.TargetID = 'CCCCCCCC-0000-0000-0000-000000000001';
            entity.RoutineType = 'AgentWake';
            entity.CronExpression = null as unknown as string;
            entity.__mj_UpdatedAt = preflight.__mj_UpdatedAt;
            entity.ProviderToUse = provider;
            entity.RunViewProviderToUse = provider;
            entity.WakeConfiguration = JSON.stringify({
                workstreamKey: preflightCfg.workstreamKey,
                resumeState: {
                    applicationID: preflightCfg.resumeState.applicationID,
                    coalesceRevision: preflightCfg.resumeState.coalesceRevision + 1,
                    coalesceWriteToken: token,
                    pendingEvents: [...preflightCfg.resumeState.pendingEvents, { taskID: newEventId }],
                },
            });
            entity.SetFieldState('WakeConfiguration', { Dirty: true, OldValue: preflight.WakeConfiguration });
            entity.SetFieldState('__mj_UpdatedAt', { Dirty: false, OldValue: preflight.__mj_UpdatedAt });
            entity.OnSuperSave = async () => {
                sharedDatabaseRow.WakeConfiguration = entity.WakeConfiguration ?? '';
                sharedDatabaseRow.__mj_UpdatedAt = new Date(sharedDatabaseRow.__mj_UpdatedAt.getTime() + 1000);
                return true;
            };
            return entity;
        };

        const writerA = makeProcessWriter(providerProcessA, preflightA, 'proc-a', 'ev-A');
        const writerB = makeProcessWriter(providerProcessB, preflightB, 'proc-b', 'ev-B');

        const [okA, okB] = await Promise.all([
            (async () => { await waitForBothPreflights(); return writerA.Save(); })(),
            (async () => { await waitForBothPreflights(); return writerB.Save(); })(),
        ]);

        // Exactly one process wins at revision 2; the second is rejected by SQL CAS (never overwrites!)
        expect([okA, okB].filter(Boolean)).toHaveLength(1);
        expect([okA, okB].filter((v) => !v)).toHaveLength(1);
        const loser = okA ? writerB : writerA;
        const loserEventId = okA ? 'ev-B' : 'ev-A';
        const loserProvider = okA ? providerProcessB : providerProcessA;
        expect(loser.SuperSaveCalled).toBe(false);
        expect(loser.LastRegisteredResult?.Message).toContain('Concurrent AgentWake coalescing conflict');

        // Loser retries from latest committed DB state (revision 2) and persists revision 3 with 100% of events
        const retryWriter = makeProcessWriter(loserProvider, { ...sharedDatabaseRow }, 'proc-retry', loserEventId);
        expect(await retryWriter.Save()).toBe(true);

        const finalState = JSON.parse(sharedDatabaseRow.WakeConfiguration) as {
            resumeState: { coalesceRevision: number; pendingEvents: EventItem[] };
        };
        expect(finalState.resumeState.coalesceRevision).toBe(3);
        expect(finalState.resumeState.pendingEvents.map((ev) => ev.taskID)).toEqual(['ev-0', okA ? 'ev-A' : 'ev-B', loserEventId]);
        expect(providerProcessA.sqlLog.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true);
        expect(providerProcessB.sqlLog.some((s) => s.includes('FOR UPDATE'))).toBe(true);
    });
});

describe('MJUserRoutineEntityServer.Delete', () => {
    /** A dependent row (recipient/run) whose Delete outcome is scripted. */
    function dependent(deleteResult: boolean): { Delete: () => Promise<boolean>; DeleteCalls: () => number } {
        let calls = 0;
        return {
            Delete: async () => {
                calls++;
                return deleteResult;
            },
            DeleteCalls: () => calls,
        };
    }

    function stubDependents(recipients: Array<{ Delete(): Promise<boolean> }>, runs: Array<{ Delete(): Promise<boolean> }>): void {
        vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([
            { Success: true, Results: recipients },
            { Success: true, Results: runs },
        ] as unknown as Awaited<ReturnType<RunView['RunViews']>>);
    }

    it('cascades recipients + run bookkeeping BEFORE the routine row (FK cleanup)', async () => {
        const r1 = dependent(true);
        const u1 = dependent(true);
        const u2 = dependent(true);
        stubDependents([r1], [u1, u2]);
        const e = makeEntity();
        const ok = await e.Delete();
        expect(ok).toBe(true);
        expect(r1.DeleteCalls()).toBe(1);
        expect(u1.DeleteCalls()).toBe(1);
        expect(u2.DeleteCalls()).toBe(1);
        expect(e.SuperDeleteCalled).toBe(true);
        vi.restoreAllMocks();
    });

    it('aborts (routine row untouched) when a dependent delete fails', async () => {
        const failing = dependent(false);
        stubDependents([], [failing]);
        const e = makeEntity();
        const ok = await e.Delete();
        expect(ok).toBe(false);
        expect(e.SuperDeleteCalled).toBe(false);
        vi.restoreAllMocks();
    });

    it('deletes cleanly when there are no dependents at all', async () => {
        stubDependents([], []);
        const e = makeEntity();
        const ok = await e.Delete();
        expect(ok).toBe(true);
        expect(e.SuperDeleteCalled).toBe(true);
        vi.restoreAllMocks();
    });
});
