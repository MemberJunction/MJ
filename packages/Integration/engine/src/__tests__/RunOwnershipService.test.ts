/**
 * Durable sync runs (tasks.md PR 1) — ownership/lease/fence unit pins.
 *
 * These cover the invariants that make a run survivable across a process death:
 * a claim is a single atomic statement whose zero-row result means "lost"; the
 * heartbeat renews at roughly a third of the lease so a lease needs ~3 consecutive
 * failures to lapse; every boundary check compares BOTH owner token and fence; and
 * progress/terminal writes can never clobber a newer owner.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationRunEntity } from '@memberjunction/core-entities';
import { RunOwnershipService, RunOwnershipLostError } from '../RunOwnershipService.js';

const RUN_ID = 'run-0000-1111-2222-333333333333';
const mockContextUser = { ID: 'user-1' } as UserInfo;

/** Captures every statement + parameter array the service sends to the DB. */
interface ExecutedStatement {
    sql: string;
    params: unknown[];
}

function createMockProvider(platformKey: 'sqlserver' | 'postgresql' = 'sqlserver') {
    const executed: ExecutedStatement[] = [];
    let nextResult: unknown[] = [];

    const provider = {
        PlatformKey: platformKey,
        MJCoreSchemaName: '__mj',
        BuildParameterPlaceholder: (i: number) => (platformKey === 'postgresql' ? `$${i + 1}` : `@p${i}`),
        Dialect: {
            QuoteIdentifier: (name: string) => (platformKey === 'postgresql' ? `"${name}"` : `[${name}]`),
            CurrentTimestampUTC: () => (platformKey === 'postgresql' ? 'NOW()' : 'SYSDATETIMEOFFSET()'),
            ProcedureCallSyntax: (schema: string, sproc: string, placeholders: string[]) =>
                platformKey === 'postgresql'
                    ? `SELECT * FROM "${schema}"."${sproc}"(${placeholders.join(', ')})`
                    : `EXEC [${schema}].[${sproc}] ${placeholders.join(', ')}`,
        },
        ExecuteSQL: vi.fn(async (sql: string, params: unknown[]) => {
            executed.push({ sql, params });
            return nextResult;
        }),
    };

    return {
        provider: provider as unknown as DatabaseProviderBase,
        executed,
        setResult: (rows: unknown[]) => {
            nextResult = rows;
        },
    };
}

describe('RunOwnershipService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('lease sizing', () => {
        it('uses the default lease when the caller supplies none', () => {
            const { provider } = createMockProvider();
            const svc = new RunOwnershipService(provider, RUN_ID);
            expect(svc.LeaseMinutes).toBe(RunOwnershipService.DEFAULT_LEASE_MINUTES);
        });

        it('a MaxRuntimeMinutes override only ever EXTENDS the lease, never shrinks it', () => {
            const { provider } = createMockProvider();
            expect(new RunOwnershipService(provider, RUN_ID, 45).LeaseMinutes).toBe(45);
            // A short override must not weaken protection below the default.
            expect(new RunOwnershipService(provider, RUN_ID, 2).LeaseMinutes).toBe(
                RunOwnershipService.DEFAULT_LEASE_MINUTES
            );
        });

        it('mints a distinct owner token per execution (token identity IS execution identity)', () => {
            const { provider } = createMockProvider();
            const a = new RunOwnershipService(provider, RUN_ID);
            const b = new RunOwnershipService(provider, RUN_ID);
            expect(a.OwnerToken).not.toBe(b.OwnerToken);
        });
    });

    describe('Claim', () => {
        it('succeeds when the sproc returns a row, caching the DB-assigned fence + lease', async () => {
            const { provider, executed, setResult } = createMockProvider();
            const expiry = new Date('2026-01-01T00:10:00Z');
            setResult([{ FenceToken: 7, LeaseExpiresAt: expiry.toISOString() }]);

            const svc = new RunOwnershipService(provider, RUN_ID, 30, mockContextUser);
            await expect(svc.Claim()).resolves.toBe(true);

            expect(svc.FenceToken).toBe(7);
            expect(svc.LeaseExpiresAt?.toISOString()).toBe(expiry.toISOString());
            // Exactly one statement — the claim is a single atomic UPDATE, never select-then-update.
            expect(executed).toHaveLength(1);
            expect(executed[0].sql).toContain('spClaimCompanyIntegrationRun');
            expect(executed[0].params).toEqual([RUN_ID, svc.OwnerToken, 30]);
        });

        it('returns false (no fence cached) when zero rows come back — someone else holds a live lease', async () => {
            const { provider, setResult } = createMockProvider();
            setResult([]);
            const svc = new RunOwnershipService(provider, RUN_ID);
            await expect(svc.Claim()).resolves.toBe(false);
            expect(svc.FenceToken).toBeNull();
        });

        it('emits dialect-appropriate sproc syntax on both platforms', async () => {
            for (const platform of ['sqlserver', 'postgresql'] as const) {
                const { provider, executed, setResult } = createMockProvider(platform);
                setResult([{ FenceToken: 1, LeaseExpiresAt: new Date().toISOString() }]);
                await new RunOwnershipService(provider, RUN_ID).Claim();
                if (platform === 'postgresql') {
                    expect(executed[0].sql).toContain('$1');
                    expect(executed[0].sql).not.toContain('@p0');
                } else {
                    expect(executed[0].sql).toContain('@RunID=@p0');
                }
            }
        });
    });

    describe('Renew', () => {
        async function claimed(leaseMinutes = 30) {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: 4, LeaseExpiresAt: new Date('2026-01-01T00:00:00Z').toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID, leaseMinutes, mockContextUser);
            await svc.Claim();
            mock.executed.length = 0;
            return { svc, ...mock };
        }

        it('refuses to renew before a claim (no fence to check against)', async () => {
            const { provider, executed } = createMockProvider();
            const svc = new RunOwnershipService(provider, RUN_ID);
            await expect(svc.Renew()).resolves.toEqual({ Renewed: false, CancelRequested: false });
            expect(executed).toHaveLength(0);
        });

        it('sends token AND fence, and extends the cached lease on success', async () => {
            const { svc, executed, setResult } = await claimed();
            const newExpiry = new Date('2026-01-01T00:30:00Z');
            setResult([{ FenceToken: 4, LeaseExpiresAt: newExpiry.toISOString(), CancelRequestedAt: null }]);

            await expect(svc.Renew('{"RecordsProcessed":10}')).resolves.toEqual({
                Renewed: true,
                CancelRequested: false,
            });
            expect(executed[0].params).toEqual([RUN_ID, svc.OwnerToken, 4, 30, '{"RecordsProcessed":10}']);
            expect(svc.LeaseExpiresAt?.toISOString()).toBe(newExpiry.toISOString());
        });

        it('surfaces a cross-process cancel through the renewal result', async () => {
            const { svc, setResult } = await claimed();
            setResult([{ FenceToken: 4, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: new Date().toISOString() }]);
            await expect(svc.Renew()).resolves.toEqual({ Renewed: true, CancelRequested: true });
        });

        it('reports ownership lost when the fence-checked update matches nothing', async () => {
            const { svc, setResult } = await claimed();
            setResult([]);
            await expect(svc.Renew()).resolves.toEqual({ Renewed: false, CancelRequested: false });
        });
    });

    describe('CheckBoundary (the write fence)', () => {
        async function claimed(fence = 9) {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: fence, LeaseExpiresAt: new Date().toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID, undefined, mockContextUser);
            await svc.Claim();
            mock.executed.length = 0;
            return { svc, ...mock };
        }

        it('is a plain read — it never extends the lease', async () => {
            const { svc, executed, setResult } = await claimed();
            setResult([{ OwnerToken: svc.OwnerToken, FenceToken: 9, CancelRequestedAt: null }]);
            await svc.CheckBoundary();
            expect(executed[0].sql.startsWith('SELECT')).toBe(true);
            expect(executed[0].sql).not.toContain('UPDATE');
        });

        it('confirms ownership when BOTH token and fence match (case-insensitively on the token)', async () => {
            const { svc, setResult } = await claimed();
            setResult([{ OwnerToken: svc.OwnerToken.toUpperCase(), FenceToken: 9, CancelRequestedAt: null }]);
            await expect(svc.CheckBoundary()).resolves.toEqual({ Owned: true, CancelRequested: false });
        });

        it('denies ownership when the fence was bumped under us, even though the token still matches', async () => {
            const { svc, setResult } = await claimed(9);
            setResult([{ OwnerToken: svc.OwnerToken, FenceToken: 10, CancelRequestedAt: null }]);
            await expect(svc.CheckBoundary()).resolves.toEqual({ Owned: false, CancelRequested: false });
        });

        it('denies ownership when another worker took the row', async () => {
            const { svc, setResult } = await claimed();
            setResult([{ OwnerToken: 'someone-else', FenceToken: 9, CancelRequestedAt: null }]);
            await expect(svc.CheckBoundary()).resolves.toMatchObject({ Owned: false });
        });

        it('denies ownership when the row is gone entirely', async () => {
            const { svc, setResult } = await claimed();
            setResult([]);
            await expect(svc.CheckBoundary()).resolves.toEqual({ Owned: false, CancelRequested: false });
        });

        it('reports a pending cancel alongside a still-owned row', async () => {
            const { svc, setResult } = await claimed();
            setResult([{ OwnerToken: svc.OwnerToken, FenceToken: 9, CancelRequestedAt: '2026-01-01T00:00:00Z' }]);
            await expect(svc.CheckBoundary()).resolves.toEqual({ Owned: true, CancelRequested: true });
        });
    });

    describe('WriteProgress', () => {
        async function claimed() {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: 3, LeaseExpiresAt: new Date().toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID, undefined, mockContextUser);
            await svc.Claim();
            mock.executed.length = 0;
            mock.setResult([]);
            return { svc, ...mock };
        }

        it('does nothing before a claim (no fence ⇒ nothing to guard the write with)', async () => {
            const { provider, executed } = createMockProvider();
            await new RunOwnershipService(provider, RUN_ID).WriteProgress('{}');
            expect(executed).toHaveLength(0);
        });

        it('guards the write with BOTH owner token and fence so a reclaimed run cannot clobber the new owner', async () => {
            const { svc, executed } = await claimed();
            await svc.WriteProgress('{"RecordsProcessed":1}');
            expect(executed).toHaveLength(1);
            expect(executed[0].sql).toContain('OwnerToken');
            expect(executed[0].sql).toContain('FenceToken');
            expect(executed[0].params).toEqual(['{"RecordsProcessed":1}', RUN_ID, svc.OwnerToken, 3]);
        });

        it('throttles so progress never becomes its own hot path', async () => {
            const { svc, executed } = await claimed();
            await svc.WriteProgress('{"n":1}');
            await svc.WriteProgress('{"n":2}');
            await svc.WriteProgress('{"n":3}');
            expect(executed).toHaveLength(1);

            vi.setSystemTime(new Date(Date.now() + 6_000));
            await svc.WriteProgress('{"n":4}');
            expect(executed).toHaveLength(2);
            expect(executed[1].params[0]).toBe('{"n":4}');
        });

        it('swallows write failures — a progress write must never fault the sync', async () => {
            const { svc, provider } = await claimed();
            vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('deadlock'));
            await expect(svc.WriteProgress('{}')).resolves.toBeUndefined();
        });
    });

    describe('StartHeartbeat', () => {
        async function claimed(leaseMinutes: number) {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID, leaseMinutes, mockContextUser);
            await svc.Claim();
            mock.executed.length = 0;
            return { svc, ...mock };
        }

        it('renews at ~lease/3 so the lease needs ~3 consecutive failures to lapse', async () => {
            const { svc, executed, setResult } = await claimed(30);
            setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: null }]);
            svc.StartHeartbeat();

            await vi.advanceTimersByTimeAsync(9 * 60_000);
            expect(executed).toHaveLength(0); // 10 minutes is the interval; 9 is too soon

            await vi.advanceTimersByTimeAsync(1 * 60_000 + 10);
            expect(executed).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(10 * 60_000);
            expect(executed).toHaveLength(2);
            svc.StopHeartbeat();
        });

        it('never ticks faster than 5s even for a very short lease', async () => {
            const { svc, executed, setResult } = await claimed(0.06); // clamped up to the default lease anyway
            setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: null }]);
            svc.StartHeartbeat();
            await vi.advanceTimersByTimeAsync(4_000);
            expect(executed).toHaveLength(0);
            svc.StopHeartbeat();
        });

        it('fires onLost exactly once and stops renewing a lease it no longer holds', async () => {
            const { svc, setResult } = await claimed(30);
            setResult([]); // renewal matches nothing ⇒ ownership lost
            const onLost = vi.fn();
            svc.StartHeartbeat({ onLost });

            await vi.advanceTimersByTimeAsync(10 * 60_000 + 10);
            expect(onLost).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(30 * 60_000);
            expect(onLost).toHaveBeenCalledTimes(1);
        });

        it('fires onCancelRequested exactly once across repeated ticks', async () => {
            const { svc, setResult } = await claimed(30);
            setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: new Date().toISOString() }]);
            const onCancelRequested = vi.fn();
            svc.StartHeartbeat({ onCancelRequested });

            await vi.advanceTimersByTimeAsync(30 * 60_000 + 10);
            expect(onCancelRequested).toHaveBeenCalledTimes(1);
            svc.StopHeartbeat();
        });

        it('piggybacks the progress snapshot onto the renewal write', async () => {
            const { svc, executed, setResult } = await claimed(30);
            setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: null }]);
            svc.StartHeartbeat({ progressSupplier: () => '{"RecordsProcessed":42}' });
            await vi.advanceTimersByTimeAsync(10 * 60_000 + 10);
            expect(executed[0].params[4]).toBe('{"RecordsProcessed":42}');
            svc.StopHeartbeat();
        });

        it('survives a transient renewal throw without declaring ownership lost', async () => {
            const { svc, provider } = await claimed(30);
            vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('connection reset'));
            const onLost = vi.fn();
            svc.StartHeartbeat({ onLost });
            await vi.advanceTimersByTimeAsync(10 * 60_000 + 10);
            expect(onLost).not.toHaveBeenCalled();
            svc.StopHeartbeat();
        });

        it('StopHeartbeat is idempotent and halts further renewals', async () => {
            const { svc, executed, setResult } = await claimed(30);
            setResult([{ FenceToken: 2, LeaseExpiresAt: new Date().toISOString(), CancelRequestedAt: null }]);
            svc.StartHeartbeat();
            svc.StopHeartbeat();
            svc.StopHeartbeat();
            await vi.advanceTimersByTimeAsync(60 * 60_000);
            expect(executed).toHaveLength(0);
        });
    });

    describe('Release', () => {
        it('stops the heartbeat and token- AND fence-checks the terminal write', async () => {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: 5, LeaseExpiresAt: new Date().toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID, undefined, mockContextUser);
            await svc.Claim();
            svc.StartHeartbeat();
            mock.executed.length = 0;
            mock.setResult([{ ID: RUN_ID }]);

            await expect(svc.Release('Success')).resolves.toBe(true);
            expect(mock.executed[0].sql).toContain('spReleaseCompanyIntegrationRun');
            // The fence now rides along with the owner token, matching Renew: the token alone
            // proves only that SOME context using it owns the row, not that THIS one still
            // does. 5 is the FenceToken the Claim() above returned.
            expect(mock.executed[0].params).toEqual([RUN_ID, svc.OwnerToken, 'Success', 5]);

            mock.executed.length = 0;
            await vi.advanceTimersByTimeAsync(60 * 60_000);
            expect(mock.executed).toHaveLength(0); // heartbeat really stopped
        });

        it('a stale holder releasing late is a harmless no-op', async () => {
            const mock = createMockProvider();
            mock.setResult([{ FenceToken: 5, LeaseExpiresAt: new Date().toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID);
            await svc.Claim();
            mock.setResult([]); // the row is owned by someone else now
            await expect(svc.Release('Failed')).resolves.toBe(false);
        });
    });

    describe('SyncEntityOwnershipFields', () => {
        it('overwrites the entity ownership columns so a full-row Save cannot clobber the live lease', async () => {
            const mock = createMockProvider();
            const expiry = new Date('2026-01-01T00:10:00Z');
            mock.setResult([{ FenceToken: 11, LeaseExpiresAt: expiry.toISOString() }]);
            const svc = new RunOwnershipService(mock.provider, RUN_ID);
            await svc.Claim();

            // Deliberately stale in-memory values — what an entity loaded pre-claim carries.
            const run = { OwnerToken: null, LeaseExpiresAt: null, HeartbeatAt: null, FenceToken: 0 } as unknown as MJCompanyIntegrationRunEntity;
            svc.SyncEntityOwnershipFields(run);

            expect(run.OwnerToken).toBe(svc.OwnerToken);
            expect(run.LeaseExpiresAt?.toISOString()).toBe(expiry.toISOString());
            expect(run.FenceToken).toBe(11);
            expect(run.HeartbeatAt).toBeInstanceOf(Date);
        });

        it('leaves FenceToken untouched before a claim rather than writing a bogus zero', () => {
            const { provider } = createMockProvider();
            const svc = new RunOwnershipService(provider, RUN_ID);
            const run = { OwnerToken: null, LeaseExpiresAt: null, HeartbeatAt: null, FenceToken: 99 } as unknown as MJCompanyIntegrationRunEntity;
            svc.SyncEntityOwnershipFields(run);
            expect(run.FenceToken).toBe(99);
        });
    });

    describe('RunOwnershipLostError', () => {
        it('carries the run ID so the sync loop can attribute the abort', () => {
            const err = new RunOwnershipLostError(RUN_ID, 'fence bumped');
            expect(err.RunID).toBe(RUN_ID);
            expect(err.name).toBe('RunOwnershipLostError');
            expect(err.message).toContain(RUN_ID);
            expect(err.message).toContain('fence bumped');
        });
    });
});
