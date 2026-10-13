/**
 * in-transaction-refresh-race.ts — metadata-refresh rig: forces, against the real database, the races between
 * `RefreshWithinTransaction` (what `mj sync push` calls inside its transaction) and a pool metadata reload, and
 * checks each outcome. Every scenario opens a transaction on the host provider (the process-global one PushService
 * uses), appends a marker to one `Entity` row's Description (uncommitted), and ROLLS BACK at the end, so nothing is
 * left in the database.
 *
 * The scenarios run depend on the database's READ_COMMITTED_SNAPSHOT setting:
 *
 * RCSI OFF — `lock`: the IT94 deadlock. A pool reload started after the UPDATE blocks on its row lock (the rig waits
 *   until SQL Server shows a session of this process in LCK_M_* blocked by the transaction); only then is
 *   RefreshWithinTransaction called, which used to join the blocked reload and wait forever. Expected: it returns, its
 *   snapshot shows the marker, the pool reload is still blocked; after ROLLBACK the pool reload completes and the
 *   metadata matches the rolled-back row.
 *
 * RCSI ON — pool reads never block, they return the committed (pre-transaction) state:
 *   `rcsi-older-pool-pass` (shape i): a pool reload is in flight — held at its dataset read — when
 *     RefreshWithinTransaction starts; it is released only after the in-transaction pass returned, so it finishes after
 *     it (the rig asserts that order). Expected: the in-transaction snapshot (marker) stays adopted for as long as the
 *     transaction is open — the pool result, and any rerun, is held back.
 *   `rcsi-newer-pool-pass` (shape ii): the transaction's connection is kept busy (WAITFOR) so RefreshWithinTransaction's
 *     reads queue behind it; a pool reload started AFTER the in-transaction pass began finishes FIRST. Expected: the
 *     pool result is not adopted, RefreshWithinTransaction returns true, and its snapshot (marker) is the one in use.
 *   Both RCSI scenarios then ROLL BACK and expect the provider itself to reload (OnAmbientTransactionEnded): the
 *   metadata no longer shows the marker once RollbackTransaction() returns, with no Refresh() issued by the rig.
 *
 * Usage (from the MJ repo root, private env loaded — the DB comes from DB_DATABASE):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/in-transaction-refresh-race.ts
 * Needs SQL Server (DMVs, an mssql pool) and a database no one else is using: it updates one Entity row inside a
 * transaction it always rolls back, so nothing is left behind.
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap error.
 */
import sql from 'mssql';
import { DatabaseProviderBase, EntityInfo, Metadata } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { BootstrapIntegrationServer, Settle } from '@memberjunction/testing-integration';
import { RigCLI } from '../lib/rig-cli';

const MARKER = ' [in-transaction refresh race rig]';
const BOUND_MS = 60_000;
const ENTITY_NAME = 'MJ: Actions';

type Settled<T> = { State: 'settled'; Value: T; At: number } | { State: 'pending' };
type Check = [label: string, pass: boolean, detail: string];

interface RigContext {
    Host: DatabaseProviderBase;
    Pool: sql.ConnectionPool;
    Schema: string;
    Entity: EntityInfo;
    OriginalDescription: string;
}

/** Resolves with the promise's outcome (and when it settled), or 'pending' once `ms` passes without it settling. */
async function settledWithin<T>(promise: Promise<T>, ms: number): Promise<Settled<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Promise<Settled<T>>((resolve) => {
        timer = setTimeout(() => resolve({ State: 'pending' }), ms);
    });
    try {
        return await Promise.race([promise.then((Value): Settled<T> => ({ State: 'settled', Value, At: Date.now() })), pending]);
    } finally {
        clearTimeout(timer);
    }
}

/** Polls (on a separate pool connection) until a session waits on a lock held by `blockerSpid`. */
async function waitForBlockedReader(pool: sql.ConnectionPool, blockerSpid: number, ms: number): Promise<string | null> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        const r = await new sql.Request(pool).query<{ session_id: number; wait_type: string; wait_time: number }>(
            `SELECT session_id, wait_type, wait_time FROM sys.dm_exec_requests WHERE blocking_session_id = ${blockerSpid}`,
        );
        const row = r.recordset[0];
        if (row) {
            return `session ${row.session_id} ${row.wait_type} ${row.wait_time}ms blocked by ${blockerSpid}`;
        }
        await Settle(100);
    }
    return null;
}

function description(rig: RigContext): string {
    return rig.Host.EntityByName(ENTITY_NAME)?.Description || '';
}

/** BEGIN, then the uncommitted marker UPDATE; returns the transaction's session id. */
async function beginWithMarker(rig: RigContext): Promise<number> {
    await rig.Host.BeginTransaction();
    const spidRows = await rig.Host.ExecuteSQL<{ Spid: number }>('SELECT @@SPID AS Spid');
    await rig.Host.ExecuteSQL(
        `UPDATE [${rig.Schema}].[Entity] SET Description = ISNULL(Description, N'') + N'${EscapeSQLString(MARKER)}' WHERE ID = '${EscapeSQLString(rig.Entity.ID)}'`,
    );
    return spidRows[0].Spid;
}

/** ROLLBACK through the provider, then the checks every scenario ends with. */
async function rollbackAndCheck(rig: RigContext, checks: Check[]): Promise<void> {
    const before = rig.Host.Entities;
    const started = Date.now();
    await rig.Host.RollbackTransaction();
    checks.push(['RollbackTransaction returned', true, `${Date.now() - started}ms`]);
    // No Refresh() from the rig: the provider's own release (OnAmbientTransactionEnded) must have reloaded.
    checks.push(['the provider reloaded on rollback (new snapshot)', rig.Host.Entities !== before, '']);
    checks.push(['metadata matches the rolled-back row', description(rig) === rig.OriginalDescription, description(rig).slice(-60)]);
    checks.push(['transaction depth 0', rig.Host.TransactionDepth === 0, String(rig.Host.TransactionDepth)]);
    const dbRow = await new sql.Request(rig.Pool).query<{ Description: string | null }>(
        `SELECT Description FROM [${rig.Schema}].[Entity] WHERE ID = '${EscapeSQLString(rig.Entity.ID)}'`,
    );
    checks.push(['database row unchanged', (dbRow.recordset[0]?.Description || '') === rig.OriginalDescription, '']);
}

/** RCSI off: the IT94 deadlock shape. */
async function lockScenario(rig: RigContext, checks: Check[]): Promise<void> {
    const txSpid = await beginWithMarker(rig);
    console.log(`[lock] transaction open on session ${txSpid}; Entity row ${rig.Entity.ID} (${ENTITY_NAME}) updated, uncommitted`);

    const poolReload = rig.Host.Refresh();
    const blocked = await waitForBlockedReader(rig.Pool, txSpid, 20_000);
    checks.push(['[lock] pool reload blocked on the transaction before the in-transaction refresh', blocked !== null, blocked || '']);

    const started = Date.now();
    const inTx = await settledWithin(rig.Host.RefreshWithinTransaction(), BOUND_MS);
    checks.push(['[lock] RefreshWithinTransaction returned true', inTx.State === 'settled' && inTx.Value === true, `${inTx.State} after ${Date.now() - started}ms`]);
    checks.push(['[lock] its snapshot shows the uncommitted Description', description(rig).endsWith(MARKER), description(rig).slice(-60)]);
    const stillBlocked = await settledWithin(poolReload, 500);
    checks.push(['[lock] pool reload still blocked after it returned', stillBlocked.State === 'pending', stillBlocked.State]);

    await rollbackAndCheck(rig, checks);
    const poolDone = await settledWithin(poolReload, BOUND_MS);
    checks.push(['[lock] pool reload completed after ROLLBACK', poolDone.State === 'settled', poolDone.State]);
    checks.push(['[lock] final metadata matches the rolled-back row', description(rig) === rig.OriginalDescription, '']);
}

/**
 * Holds the pool pass's MJ_Metadata dataset read — and only a pool read: a read that joins the transaction passes
 * straight through — until `Release()`. Under RCSI no database lock can hold one of the two passes' readers and not the
 * other (they read the same tables and neither takes shared locks), so the hold is at the provider boundary, on the
 * pool pass's own read. That makes the order of shape (i) a fact the rig asserts rather than a race it hopes for.
 */
class PoolReadHold {
    public HeldAt: number | null = null;
    private _release: (() => void) | null = null;
    private readonly _gate: Promise<void> = new Promise<void>((resolve) => { this._release = resolve; });
    private readonly _original: DatabaseProviderBase['GetDatasetByName'];

    constructor(private readonly host: DatabaseProviderBase) {
        this._original = host.GetDatasetByName.bind(host);
        host.GetDatasetByName = async (...args: Parameters<DatabaseProviderBase['GetDatasetByName']>) => {
            const [datasetName, , , , , readOptions] = args;
            if (datasetName === 'MJ_Metadata' && readOptions?.JoinAmbientTransaction !== true && this.HeldAt === null) {
                this.HeldAt = Date.now();
                await this._gate;
            }
            return this._original(...args);
        };
    }

    /** Lets the held read run, and puts the provider's own method back. */
    public Release(): void {
        this.host.GetDatasetByName = this._original;
        this._release?.();
    }
}

/** RCSI on, shape (i): a pool pass that started first finishes after the in-transaction pass and must not revert it. */
async function rcsiOlderPoolPass(rig: RigContext, checks: Check[]): Promise<void> {
    await beginWithMarker(rig);
    const hold = new PoolReadHold(rig.Host);
    let inTx: Settled<boolean> = { State: 'pending' };
    let pool: Settled<boolean> = { State: 'pending' };
    let inTxCalledAt = 0;
    try {
        const poolReload = rig.Host.Refresh(); // in flight before the in-transaction pass starts
        const deadline = Date.now() + 20_000;
        while (hold.HeldAt === null && Date.now() < deadline) {
            await Settle(20);
        }
        checks.push(['[i] the pool pass started (and is held at its dataset read) before the in-transaction pass', hold.HeldAt !== null, hold.HeldAt === null ? 'never reached its dataset read' : '']);
        inTxCalledAt = Date.now();
        inTx = await settledWithin(rig.Host.RefreshWithinTransaction(), BOUND_MS);
        hold.Release(); // the older pool pass resumes only now, after the in-transaction pass has finished
        pool = await settledWithin(poolReload, BOUND_MS);
    } finally {
        hold.Release();
    }
    console.log(`[rcsi-older-pool-pass] pool pass held at +0ms, in-transaction pass called at +${inTxCalledAt - (hold.HeldAt || inTxCalledAt)}ms, settled at +${inTx.State === 'settled' ? inTx.At - (hold.HeldAt || 0) : -1}ms; pool reload settled at +${pool.State === 'settled' ? pool.At - (hold.HeldAt || 0) : -1}ms`);
    checks.push(['[i] order: pool pass started first, in-transaction pass finished, pool pass finished last',
        hold.HeldAt !== null && hold.HeldAt < inTxCalledAt && inTx.State === 'settled' && pool.State === 'settled' && pool.At > inTx.At, '']);
    checks.push(['[i] RefreshWithinTransaction returned true', inTx.State === 'settled' && inTx.Value === true, inTx.State]);
    checks.push(['[i] pool reload finished (RCSI: it did not block)', pool.State === 'settled', pool.State]);
    // Give a (wrongly) queued follow-up every chance to run and be adopted mid-transaction.
    await Settle(8000);
    checks.push(['[i] the in-transaction snapshot is still the one in use while the transaction is open (the older pool pass was not adopted)', description(rig).endsWith(MARKER), description(rig).slice(-60)]);
    await rollbackAndCheck(rig, checks);
}

/** RCSI on, shape (ii): a pool pass that starts after the in-transaction pass and finishes first must not win. */
async function rcsiNewerPoolPass(rig: RigContext, checks: Check[]): Promise<void> {
    await beginWithMarker(rig);
    // Keep the transaction's connection busy: the in-transaction pass's reads queue behind this.
    const busy = rig.Host.ExecuteSQL(`WAITFOR DELAY '00:00:08'`);
    const inTxPromise = rig.Host.RefreshWithinTransaction();
    await Settle(50);
    const beforePool = rig.Host.Entities;
    const poolReload = rig.Host.Refresh(); // starts after the in-transaction pass began
    const pool = await settledWithin(poolReload, BOUND_MS);
    const poolAdopted = rig.Host.Entities !== beforePool;
    const inTx = await settledWithin(inTxPromise, BOUND_MS);
    await busy;
    console.log(`[rcsi-newer-pool-pass] pool reload ${pool.State}, in-transaction pass ${inTx.State}${pool.State === 'settled' && inTx.State === 'settled' ? ` ${inTx.At - pool.At}ms after the pool reload` : ''}`);
    checks.push(['[ii] the pool reload (started later) finished first', pool.State === 'settled' && inTx.State === 'settled' && pool.At < inTx.At, '']);
    checks.push(['[ii] the pool result was not adopted', !poolAdopted, '']);
    checks.push(['[ii] RefreshWithinTransaction returned true', inTx.State === 'settled' && inTx.Value === true, inTx.State]);
    checks.push(['[ii] its snapshot (with the marker) is the one in use', description(rig).endsWith(MARKER), description(rig).slice(-60)]);
    await rollbackAndCheck(rig, checks);
}

async function main(): Promise<number> {
    const ctx = await BootstrapIntegrationServer();
    const pool = ctx.Pool;
    if (!pool) {
        console.error('this rig needs SQL Server (no mssql pool)');
        await ctx.ClosePool();
        return 2;
    }
    const host = Metadata.Provider; // global-provider-ok: the rig drives the same provider PushService.hostProvider() uses
    if (!(host instanceof DatabaseProviderBase)) {
        console.error('the global provider is not a database provider');
        await ctx.ClosePool();
        return 2;
    }
    const entity = host.EntityByName(ENTITY_NAME);
    if (!entity) {
        console.error(`entity ${ENTITY_NAME} not in metadata`);
        await ctx.ClosePool();
        return 2;
    }
    const rcsiRows = await new sql.Request(pool).query<{ Db: string; Rcsi: boolean }>(
        'SELECT DB_NAME() AS Db, is_read_committed_snapshot_on AS Rcsi FROM sys.databases WHERE name = DB_NAME()',
    );
    const { Db, Rcsi } = rcsiRows.recordset[0];
    console.log(`database ${Db}: READ_COMMITTED_SNAPSHOT ${Rcsi ? 'ON' : 'OFF'}`);
    const rig: RigContext = { Host: host, Pool: pool, Schema: host.ConfigData.MJCoreSchemaName, Entity: entity, OriginalDescription: entity.Description || '' };
    const scenarios: Array<(r: RigContext, c: Check[]) => Promise<void>> = Rcsi ? [rcsiOlderPoolPass, rcsiNewerPoolPass] : [lockScenario];

    const checks: Check[] = [];
    try {
        for (const scenario of scenarios) {
            try {
                await scenario(rig, checks);
            } finally {
                if (host.TransactionDepth > 0) {
                    checks.push([`${scenario.name}: transaction still open at the end (rolled back by the rig)`, false, '']);
                    await host.RollbackTransaction();
                }
            }
        }
    } catch (e) {
        checks.push(['scenario threw', false, e instanceof Error ? e.message : String(e)]);
    }
    await ctx.ClosePool();
    return RigCLI.ExitCodeOf(checks.map(([label, pass, detail]) => ({ Label: label, Pass: pass, Detail: detail })));
}

void RigCLI.Main(main);
