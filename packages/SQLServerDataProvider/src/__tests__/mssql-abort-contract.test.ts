/**
 * Upgrade guard for the mssql behaviour SQLServerDataProvider.waitForActiveRequest relies on.
 *
 * Every other suite in this package runs against helpers/mock-mssql.ts, whose `abortServerSide()` copies
 * what mssql 12.7.0 does after a server-side abort. This file drives the REAL mssql (tedious driver)
 * `Transaction` instead, over a fake pool and connection, so it needs no database. If an mssql upgrade
 * changes any of the three facts below, this fails and the provider's `_aborted` short-circuit (and the
 * mock) must be revisited.
 *
 * The request side is driven through `Transaction.acquire` / `Transaction.release`, the exact calls
 * mssql's own Request makes around a query (lib/tedious/request.js: `this.parent.acquire(this, …)` and
 * `this.parent.release(connection)`).
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import sql from 'mssql';

/** The tedious-connection surface mssql's tedious Transaction calls during begin / abort / rollback. */
class FakeTediousConnection extends EventEmitter {
    public beginTransaction(callback: (err?: Error) => void): void {
        setImmediate(callback);
    }
    public rollbackTransaction(callback: (err?: Error) => void): void {
        setImmediate(callback);
    }
    public commitTransaction(callback: (err?: Error) => void): void {
        setImmediate(callback);
    }
}

/** A pool that never connects: it lends one fake connection and records what is handed back. */
class FakePool extends sql.ConnectionPool {
    public readonly Connection = new FakeTediousConnection();
    public Released: FakeTediousConnection[] = [];

    constructor() {
        super({ server: 'fake.invalid', database: 'none', user: 'none', password: 'none', options: { trustServerCertificate: true } });
    }

    /** Called by mssql's Transaction._begin (lib/tedious/transaction.js). */
    public acquire(_requester: object, callback: (err: Error | null, connection: FakeTediousConnection, config: object) => void): void {
        setImmediate(callback, null, this.Connection, {});
    }

    /** Called by mssql's Transaction._abort (deferred) and after commit/rollback. */
    public release(connection: FakeTediousConnection): void {
        this.Released.push(connection);
    }
}

/** mssql's private Transaction members this guard pins (absent from @types/mssql). */
interface MssqlTransactionInternals extends sql.Transaction {
    _aborted?: boolean;
    _activeRequest?: object | null;
    acquire(requester: object, callback: (err: Error | null, connection?: FakeTediousConnection) => void): void;
    release(connection: FakeTediousConnection): void;
}

function hasInternals(tx: sql.Transaction): tx is MssqlTransactionInternals {
    return typeof Reflect.get(tx, 'acquire') === 'function' && typeof Reflect.get(tx, 'release') === 'function';
}

/** Borrows the transaction's connection the way a Request does, resolving with the connection. */
function borrow(tx: MssqlTransactionInternals, request: object): Promise<FakeTediousConnection> {
    return new Promise((resolve, reject) => {
        tx.acquire(request, (err, connection) => {
            if (err || !connection) {
                reject(err ?? new Error('no connection'));
                return;
            }
            resolve(connection);
        });
    });
}

describe('mssql (real tedious Transaction) after a server-side abort — upgrade guard', () => {
    it('sets _aborted, leaves _activeRequest set for good, and rejects rollback() with EABORT', async () => {
        const pool = new FakePool();
        const tx = new sql.Transaction(pool);
        expect(hasInternals(tx)).toBe(true);
        if (!hasInternals(tx)) return;

        await tx.begin();
        const request = {};
        const connection = await borrow(tx, request);
        expect(tx._activeRequest).toBe(request);

        // The server aborts the transaction while the request holds the connection (XACT_ABORT, a THROW in a trigger).
        connection.emit('rollbackTransaction');
        // The failing request then releases the connection, as lib/tedious/request.js does on completion.
        tx.release(connection);
        await new Promise<void>((resolve) => setImmediate(resolve)); // let _abort's deferred pool release run

        expect(tx._aborted).toBe(true);
        // The fact the provider works around: release() no longer recognizes the connection, so the marker stays.
        expect(tx._activeRequest).toBe(request);
        expect(pool.Released).toEqual([connection]);
        await expect(tx.rollback()).rejects.toMatchObject({ code: 'EABORT' });
    });
});
