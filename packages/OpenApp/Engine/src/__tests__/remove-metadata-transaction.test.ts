/**
 * Tests for RemoveAppEntityMetadata's atomic-transaction semantics (PG3).
 *
 * The app-removal metadata cleanup deletes MJ entity metadata (entities, fields, field
 * values, permissions, relationships, schema info) in FK-dependency order. Pre-fix each
 * delete was committed individually; on PostgreSQL each autocommits, so an FK violation
 * partway left partially-committed orphan rows with no rollback. The fix queues EVERY delete
 * into ONE TransactionGroup and commits once — all-or-nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submitSpy = vi.fn(async () => true);
const sharedTg = { Submit: submitSpy };
let createTgCalls = 0;
// Records on which Delete() was actually called (the precise set that must be transactional).
let deletedRecords: FakeEntity[] = [];

class FakeEntity {
    ID: string;
    Name: string;
    TransactionGroup: unknown = undefined;
    LatestResult = { CompleteMessage: '' };
    constructor(id: string) {
        this.ID = id;
        this.Name = `name-${id}`;
    }
    async Delete() { deletedRecords.push(this); return true; }
}

// RunView returns fresh records keyed by EntityName. 'MJ: Entities' + 'MJ: Entity Fields' also
// drive id collection (read-only passes), so only the records actually passed to Delete() are
// the ones we assert on.
function recordsFor(entityName: string): FakeEntity[] {
    const map: Record<string, FakeEntity[]> = {
        'MJ: Entities': [new FakeEntity('ent-1'), new FakeEntity('ent-2')],
        'MJ: Entity Fields': [new FakeEntity('fld-1')],
        'MJ: Entity Field Values': [new FakeEntity('efv-1')],
        'MJ: Entity Permissions': [new FakeEntity('perm-1')],
        'MJ: Application Entities': [],
        'MJ: Entity Settings': [],
        'MJ: Entity Relationships': [new FakeEntity('rel-1')],
        'MJ: Schema Info': [new FakeEntity('schema-1')],
    };
    return map[entityName] ?? [];
}

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        async CreateTransactionGroup() { createTgCalls++; return sharedTg; }
    },
    RunView: class {
        async RunView(params: { EntityName: string }) {
            return { Success: true, Results: recordsFor(params.EntityName) };
        }
    },
    BaseEntity: class {},
    DatabaseProviderBase: class {},
    CompositeKey: class {},
}));

import { RemoveAppEntityMetadata } from '../install/install-orchestrator.js';

const user = {} as never;

beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockResolvedValue(true);
    createTgCalls = 0;
    deletedRecords = [];
});

describe('RemoveAppEntityMetadata — atomic transaction (PG3)', () => {
    it('queues every delete into ONE transaction group and commits once', async () => {
        const result = await RemoveAppEntityMetadata('app_schema', user);

        expect(result.Success).toBe(true);
        // Exactly one transaction created, one commit.
        expect(createTgCalls).toBe(1);
        expect(submitSpy).toHaveBeenCalledTimes(1);
        // EVERY record that was deleted was queued into the shared tg — there is no
        // un-grouped delete that would autocommit on PostgreSQL.
        expect(deletedRecords.length).toBeGreaterThan(0);
        for (const r of deletedRecords) {
            expect(r.TransactionGroup).toBe(sharedTg);
        }
    });

    it('reports failure (no partial cleanup) when the transaction cannot commit', async () => {
        submitSpy.mockResolvedValue(false);
        const result = await RemoveAppEntityMetadata('app_schema', user);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('atomically');
    });

    it('still uses a transaction for the no-entities (schema-info only) path', async () => {
        // Override so 'MJ: Entities' returns nothing → the short-circuit branch.
        const RunViewMock = (await import('@memberjunction/core')).RunView as unknown as {
            prototype: { RunView: (p: { EntityName: string }) => Promise<{ Success: boolean; Results: FakeEntity[] }> };
        };
        const spy = vi.spyOn(RunViewMock.prototype, 'RunView').mockImplementation(async (p) => {
            if (p.EntityName === 'MJ: Entities') return { Success: true, Results: [] };
            return { Success: true, Results: recordsFor(p.EntityName) };
        });

        const result = await RemoveAppEntityMetadata('app_schema', user);

        expect(result.Success).toBe(true);
        expect(createTgCalls).toBe(1);
        expect(submitSpy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
