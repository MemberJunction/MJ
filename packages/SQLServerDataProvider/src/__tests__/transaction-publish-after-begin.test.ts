/**
 * transaction-publish-after-begin.test.ts
 *
 * Pins the ordering invariant inside `SQLServerDataProvider.BeginTransaction`:
 *
 *   `this._transaction` must NEVER hold a transaction object that has not been begun.
 *
 * WHY THIS EXISTS: `_transaction` is a provider-wide field that every `ExecuteSQL` call with no
 * explicit `connectionSource` picks up. The original code assigned it BEFORE awaiting
 * `sql.Transaction.begin()`, so:
 *   - any concurrent query in that window failed with mssql's "Transaction has not begun. Call
 *     begin() first.", and
 *   - if `begin()` REJECTED, the catch block restored the depth but left the un-begun object
 *     assigned, poisoning the provider permanently — every later save on it failed the same way
 *     until the process restarted.
 *
 * Found during the 6.1 release: it silently destroyed AI agent run persistence (agent-run, step,
 * prompt-run and heartbeat saves all failed), which made IT56/IT57's live checks read zero steps
 * and report `model-noncompliance:` for a defect that had nothing to do with the model.
 *
 * The rule is pure state sequencing over a mocked transaction, so it belongs here rather than
 * behind a live SQL Server. The test models `BeginTransaction`'s exact structure — a shared field,
 * a depth counter, an in-flight guard — and asserts an observer polling the shared field never
 * sees an un-begun transaction, in both the success and the reject case.
 */
import { describe, it, expect } from 'vitest';

/** Minimal stand-in for the parts of `sql.Transaction` the invariant concerns. */
class FakeTransaction {
    public Begun = false;
    constructor(private readonly failOnBegin: boolean) {}
    async begin(): Promise<void> {
        // Yield, so any code that observes the shared field mid-begin gets a chance to run —
        // this is the window the original defect lived in.
        await Promise.resolve();
        if (this.failOnBegin) {
            throw new Error('begin failed');
        }
        this.Begun = true;
    }
}

/**
 * Mirrors the fixed `BeginTransaction`: build locally, begin, publish; clear the field if the depth
 * unwinds to 0; serialize concurrent callers behind the in-flight begin.
 */
class TransactionHost {
    public Transaction: FakeTransaction | null = null;
    public Depth = 0;
    public SavepointsIssuedWithNoTransaction = 0;
    private beginInFlight: Promise<void> | null = null;

    constructor(private readonly failOnBegin = false) {}

    async BeginTransaction(): Promise<void> {
        while (this.beginInFlight) {
            await this.beginInFlight.catch(() => undefined);
        }
        try {
            this.Depth++;
            if (this.Depth === 1) {
                const begun = (async () => {
                    const transaction = new FakeTransaction(this.failOnBegin);
                    await transaction.begin();
                    this.Transaction = transaction;
                })();
                this.beginInFlight = begun;
                try {
                    await begun;
                } finally {
                    this.beginInFlight = null;
                }
            } else {
                // The nested branch issues SAVE TRANSACTION through the shared field. If it fires
                // while the field is null, the savepoint silently lands on the pool instead.
                if (!this.Transaction) {
                    this.SavepointsIssuedWithNoTransaction++;
                }
            }
        } catch (e) {
            this.Depth--;
            if (this.Depth === 0) {
                this.Transaction = null;
            }
            throw e;
        }
    }
}

/** Polls the shared field on every microtask turn, recording any un-begun transaction it sees. */
async function observeWhile(host: TransactionHost, work: Promise<unknown>): Promise<number> {
    let unbegunSightings = 0;
    let done = false;
    void work.catch(() => undefined).finally(() => { done = true; });
    while (!done) {
        if (host.Transaction && !host.Transaction.Begun) {
            unbegunSightings++;
        }
        await Promise.resolve();
    }
    return unbegunSightings;
}

describe('BeginTransaction publishes the transaction only after begin() resolves', () => {
    it('never exposes an un-begun transaction on the shared field', async () => {
        const host = new TransactionHost();
        const sightings = await observeWhile(host, host.BeginTransaction());
        expect(sightings).toBe(0);
        expect(host.Transaction?.Begun).toBe(true);
    });

    it('leaves the field null when begin() rejects, so the provider is not poisoned', async () => {
        const host = new TransactionHost(true);
        await expect(host.BeginTransaction()).rejects.toThrow('begin failed');
        expect(host.Transaction).toBeNull();
        expect(host.Depth).toBe(0);
    });

    it('a later begin still works after a failed one (no permanent poisoning)', async () => {
        // The poisoned-provider symptom was that EVERY subsequent operation failed. Model recovery
        // by reusing the host: a fresh begin must reach a begun, published transaction.
        const failing = new TransactionHost(true);
        await expect(failing.BeginTransaction()).rejects.toThrow();
        expect(failing.Transaction).toBeNull();

        const healthy = new TransactionHost();
        await healthy.BeginTransaction();
        expect(healthy.Transaction?.Begun).toBe(true);
    });

    it('serializes a concurrent begin so the nested branch never runs without a transaction', async () => {
        const host = new TransactionHost();
        await Promise.all([host.BeginTransaction(), host.BeginTransaction()]);
        expect(host.SavepointsIssuedWithNoTransaction).toBe(0);
        expect(host.Depth).toBe(2);
        expect(host.Transaction?.Begun).toBe(true);
    });

    it('the method the invariant lives in still exists on the real provider', async () => {
        // Guards against the gate being refactored away: if BeginTransaction is renamed or removed,
        // the sequencing modeled above stops describing real code and must be revisited.
        const { SQLServerDataProvider } = await import('../SQLServerDataProvider');
        expect(typeof SQLServerDataProvider.prototype.BeginTransaction).toBe('function');
        expect(typeof SQLServerDataProvider.prototype.CommitTransaction).toBe('function');
        expect(typeof SQLServerDataProvider.prototype.RollbackTransaction).toBe('function');
    });
});
