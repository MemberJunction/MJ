/**
 * PR 5 milestone B3 — attack 9 (overlapping slice runs, F-011, D5-41, D5-44), the `RederivationLease` half, and attack
 * 11 (no reversed dependency, F-022).
 *
 * The fake database below holds the lease table, the Process Run statuses, a database clock that can differ from the
 * host clock, and the lock Query's semantics: a transaction that runs `Predictive Studio: Lock Rederivation Lease` holds
 * the lock of that Record Process until it ends, and another transaction's lock Query fails at once (NOWAIT) until then.
 * The lease is read and taken only under the lock, so two runs that start together get exactly one holder.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunQueryParams, RunViewParams, UserInfo } from '@memberjunction/core';
import { RederivationLease } from '../versions/rederivation-lease';
import type { FeatureValueLockClock } from '../cache/feature-value-locks';

/** One lease row as the fake database holds it. */
interface LeaseRow {
    ID: string;
    RecordProcessID: string;
    ProcessRunID: string;
    AcquiredAt: Date;
    RenewedAt: Date;
    ReleasedAt: Date | null;
}

const db = vi.hoisted(() => {
    const leases: LeaseRow[] = [];
    const runStatus = new Map<string, string>();
    const locks = new Map<string, number>();
    // A hoisted block cannot read the file's imports, so node:async_hooks is loaded here (as feature-value-concurrency.test.ts does).
    const { AsyncLocalStorage } = process.getBuiltinModule('node:async_hooks');
    const store = new AsyncLocalStorage<number>();
    const state = { dbNow: new Date('2026-11-27T12:00:00.000Z'), nextTx: 1, nextId: 1, lockQueries: 0, readsOutsideTx: 0 };
    return { leases, runStatus, locks, store, state };
});

/** The lease entity object the code under test saves (only the fields the lease writes). */
class FakeLeaseEntity {
    public ID = '';
    public RecordProcessID = '';
    public ProcessRunID = '';
    public AcquiredAt: Date = new Date(0);
    public RenewedAt: Date = new Date(0);
    public ReleasedAt: Date | null = null;
    public LatestResult = { CompleteMessage: '' };
    private isNew = true;
    public NewRecord(): boolean { this.isNew = true; return true; }
    public async Load(id: string): Promise<boolean> {
        const row = db.leases.find((r) => r.ID === id);
        if (!row) return false;
        Object.assign(this, { ...row });
        this.isNew = false;
        return true;
    }
    public async Save(): Promise<boolean> {
        await Promise.resolve();
        if (db.store.getStore() === undefined) throw new Error('a lease row was written outside a transaction');
        if (this.isNew) {
            if (db.leases.some((r) => r.RecordProcessID === this.RecordProcessID)) {
                this.LatestResult.CompleteMessage = 'Violation of UNIQUE KEY constraint UQ_FeaturePipelineRederivationLease_RecordProcessID';
                return false;
            }
            this.ID = `lease-${db.state.nextId++}`;
            db.leases.push(this.row());
            this.isNew = false;
            return true;
        }
        const at = db.leases.findIndex((r) => r.ID === this.ID);
        db.leases[at] = this.row();
        return true;
    }
    private row(): LeaseRow {
        return { ID: this.ID, RecordProcessID: this.RecordProcessID, ProcessRunID: this.ProcessRunID, AcquiredAt: this.AcquiredAt, RenewedAt: this.RenewedAt, ReleasedAt: this.ReleasedAt };
    }
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class FakeRunQuery {
        public async RunQuery(params: RunQueryParams) {
            await Promise.resolve();
            const rp = String((params.Parameters || {})['RecordProcessID']);
            const me = db.store.getStore();
            if (me === undefined) throw new Error('the lock Query ran outside a transaction');
            db.state.lockQueries++;
            const holder = db.locks.get(rp.toLowerCase());
            if (holder !== undefined && holder !== me) return { Success: false, Results: [], ErrorMessage: 'Lock request time out period exceeded.' };
            db.locks.set(rp.toLowerCase(), me);
            const lease = db.leases.find((r) => r.RecordProcessID.toLowerCase() === rp.toLowerCase());
            return {
                Success: true, ErrorMessage: '',
                Results: [{ DbNow: db.state.dbNow.toISOString(), ID: lease?.ID ?? null, ProcessRunID: lease?.ProcessRunID ?? null,
                    AcquiredAt: lease?.AcquiredAt.toISOString() ?? null, RenewedAt: lease?.RenewedAt.toISOString() ?? null, ReleasedAt: lease?.ReleasedAt?.toISOString() ?? null }],
            };
        }
    }
    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView { return new FakeRunView(); }
        public async RunView(params: RunViewParams) {
            await Promise.resolve();
            if (db.store.getStore() === undefined) db.state.readsOutsideTx++;
            if (params.EntityName !== 'MJ: Process Runs') throw new Error(`unexpected read of ${params.EntityName}`);
            const id = /ID='([^']+)'/.exec(String(params.ExtraFilter))?.[1] ?? '';
            const status = db.runStatus.get(id);
            return { Success: true, Results: status === undefined ? [] : [{ ID: id, Status: status }], TotalRowCount: status === undefined ? 0 : 1, ErrorMessage: '' };
        }
    }
    const fakeTransaction = async <T,>(_p: unknown, work: () => Promise<T>): Promise<T> => {
        const me = db.state.nextTx++;
        return db.store.run(me, async () => {
            try {
                return await work();
            } finally {
                for (const [k, v] of [...db.locks]) if (v === me) db.locks.delete(k);
            }
        });
    };
    return { ...actual, RunQuery: FakeRunQuery, RunView: FakeRunView, RunInEntityTransaction: fakeTransaction };
});

const user = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;
const provider = {
    GetEntityObject: vi.fn(async () => new FakeLeaseEntity()),
    RunQuery: vi.fn(),
} as Partial<IMetadataProvider> as IMetadataProvider;

/** A lock-wait clock that advances without waiting (the host clock; the lease never reads it). */
class FakeClock implements FeatureValueLockClock {
    public Time = 0;
    public Now(): number { return this.Time; }
    public async Sleep(ms: number): Promise<void> { this.Time += ms; await Promise.resolve(); }
}

const RP = 'RP-1';
const minutes = (n: number): number => n * 60_000;

beforeEach(() => {
    db.leases.length = 0;
    db.runStatus.clear();
    db.locks.clear();
    db.state.dbNow = new Date('2026-11-27T12:00:00.000Z');
    db.state.lockQueries = 0;
    db.state.readsOutsideTx = 0;
    db.runStatus.set('run-a', 'Running');
    db.runStatus.set('run-b', 'Running');
});

describe('RederivationLease — its constants (D5-41, D5-42)', () => {
    it('a 15-minute TTL renewed every 60 s, owned by @memberjunction/feature-pipelines', () => {
        expect(RederivationLease.TTL_MINUTES).toBe(15);
        expect(RederivationLease.RENEW_SECONDS).toBe(60);
        expect(RederivationLease.LOCK_QUERY).toBe('Predictive Studio: Lock Rederivation Lease');
    });
});

describe('RederivationLease.Acquire — single flight (attack 9)', () => {
    it('two runs that start together: exactly one holds the lease, the other is told who holds it', async () => {
        const [a, b] = await Promise.all([
            RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock()),
            RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock()),
        ]);
        const held = [a, b].filter((r) => r.Held);
        expect(held).toHaveLength(1);
        const loser = [a, b].find((r) => !r.Held);
        expect(loser).toEqual({ Held: false, HolderRunID: a.Held ? 'run-a' : 'run-b' });
        expect(db.leases).toHaveLength(1);
        expect(db.state.readsOutsideTx).toBe(0);
    });

    it('the lease is written from the database clock (DbNow), never the host clock', async () => {
        db.state.dbNow = new Date('2030-01-01T00:00:00.000Z');
        const r = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        expect(r.Held).toBe(true);
        expect(db.leases[0].AcquiredAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
        expect(db.leases[0].RenewedAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    });

    it('a live lease is not taken; a released one is', async () => {
        await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        expect(await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).toEqual({ Held: false, HolderRunID: 'run-a' });
        const lease = db.leases[0];
        expect(await RederivationLease.Release(lease.ID, 'run-a', provider, user, new FakeClock())).toBe(true);
        expect((await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).Held).toBe(true);
        expect(db.leases[0].ProcessRunID).toBe('run-b');
        expect(db.leases[0].ReleasedAt).toBeNull();
    });

    it('a holder whose run has ended (Completed, Failed, Cancelled) no longer holds the lease', async () => {
        await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        db.runStatus.set('run-a', 'Completed');
        expect((await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).Held).toBe(true);
    });

    it('a slice running longer than TTL_MINUTES keeps the lease by renewal: no second run takes it', async () => {
        const a = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        if (!a.Held) throw new Error('run-a should hold the lease');
        for (let i = 0; i < 20; i++) {
            db.state.dbNow = new Date(db.state.dbNow.getTime() + minutes(1));
            expect(await RederivationLease.Renew(a.LeaseID, 'run-a', provider, user, new FakeClock())).toBe(true);
        }
        // 20 minutes after it was taken, renewed 0 minutes ago
        expect(await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).toEqual({ Held: false, HolderRunID: 'run-a' });
    });

    it('a holder killed mid-slice: after TTL_MINUTES (database time) the next run takes the lease, and the old holder\'s renewal is lease-lost', async () => {
        const a = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        if (!a.Held) throw new Error('run-a should hold the lease');
        db.state.dbNow = new Date(db.state.dbNow.getTime() + minutes(RederivationLease.TTL_MINUTES - 1));
        expect((await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).Held).toBe(false);
        db.state.dbNow = new Date(db.state.dbNow.getTime() + minutes(2));
        const b = await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock());
        expect(b.Held).toBe(true);
        expect(await RederivationLease.Renew(a.LeaseID, 'run-a', provider, user, new FakeClock())).toBe(false);
        expect(db.leases[0].ProcessRunID).toBe('run-b');
    });

    it('D5-44: with the contender\'s host clock skewed +20 min, a lease renewed 1 min ago (database time) is not taken', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(new Date('2026-11-27T12:00:00.000Z'));
            const a = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
            if (!a.Held) throw new Error('run-a should hold the lease');
            db.state.dbNow = new Date(db.state.dbNow.getTime() + minutes(1));
            vi.setSystemTime(new Date('2026-11-27T12:21:00.000Z'));
            expect(await RederivationLease.Acquire(RP, 'run-b', provider, user, new FakeClock())).toEqual({ Held: false, HolderRunID: 'run-a' });
        } finally {
            vi.useRealTimers();
        }
    });

    it('a re-acquire by the holding run itself keeps the lease (idempotent)', async () => {
        const first = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        const again = await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        expect(first.Held && again.Held && first.LeaseID === again.LeaseID).toBe(true);
    });

    it('takes the lock Query before it reads the lease (every read under the lock)', async () => {
        await RederivationLease.Acquire(RP, 'run-a', provider, user, new FakeClock());
        expect(db.state.lockQueries).toBeGreaterThanOrEqual(1);
        expect(db.state.readsOutsideTx).toBe(0);
    });
});

describe('attack 11: no reversed dependency (F-022)', () => {
    const root = join(__dirname, '..', '..');

    it('@memberjunction/feature-pipelines declares no @memberjunction/predictive-studio* dependency', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
        const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
        expect(all.filter((d) => d.startsWith('@memberjunction/predictive-studio'))).toEqual([]);
    });

    it('its source imports no @memberjunction/predictive-studio* module', () => {
        const files: string[] = [];
        const walk = (dir: string): void => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) walk(p);
                else if (p.endsWith('.ts')) files.push(p);
            }
        };
        walk(join(root, 'src'));
        const offenders = files.filter((f) => /from\s+['"]@memberjunction\/predictive-studio/.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });
});

