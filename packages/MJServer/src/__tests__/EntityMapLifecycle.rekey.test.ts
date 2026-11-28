import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { CatalogIdentityKey, ClearRekeyedObjectData, DecideRekeyed, IdentityKeyFields } from '../integration/EntityMapLifecycle.js';

/**
 * A connector upgrade can change what identifies a row. PheedLoop 1.4.6 makes Attendees
 * `code + eventCode`, because the object is fetched once per event and an attendee at two events
 * comes back twice carrying the same `code`.
 *
 * `ToExternalRecord` joins every IsPrimaryKey field with '|' in Sequence order, so both the
 * MEMBERS and the ORDER are part of identity. These pin the two pure decisions that drive the
 * evolution's clear-and-rebuild.
 */
const f = (Name: string, IsPrimaryKey: boolean | null, Sequence: number | null) =>
    ({ Name, IsPrimaryKey, Sequence });

describe('IdentityKeyFields', () => {
    it('takes only key fields, in Sequence order — not declaration order', () => {
        expect(IdentityKeyFields([
            f('eventCode', true, 2),
            f('is_checked_in', false, 3),
            f('code', true, 1),
        ])).toEqual(['code', 'eventCode']);
    });

    it('is empty when nothing is flagged', () => {
        expect(IdentityKeyFields([f('a', false, 1), f('b', null, 2)])).toEqual([]);
    });

    it('treats a missing Sequence as 0 rather than dropping the field', () => {
        expect(IdentityKeyFields([f('b', true, null), f('a', true, 1)])).toEqual(['b', 'a']);
    });

    it('does not mutate the caller array', () => {
        const input = [f('z', true, 9), f('a', true, 1)];
        IdentityKeyFields(input);
        expect(input[0].Name).toBe('z');
    });
});

describe('DecideRekeyed', () => {
    it('a column joining the key is a re-key — the PheedLoop case', () => {
        expect(DecideRekeyed(['code'], ['code', 'eventCode'])).toBe(true);
    });

    it('a column leaving the key is a re-key', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['code'])).toBe(true);
    });

    it('the same columns in a different ORDER is a re-key — the identity string differs', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['eventCode', 'code'])).toBe(true);
    });

    it('an unchanged key is not', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['code', 'eventCode'])).toBe(false);
    });

    it('matches case-insensitively, as every catalog-to-map reconciliation does', () => {
        expect(DecideRekeyed(['Code'], ['code'])).toBe(false);
    });

    // The guard that stops this from clearing the fleet. An empty BUILT key means the entity's
    // fields could not be read, not that the table never had a key — and treating unknown as
    // empty would re-key (and therefore WIPE) every table on a workspace whose metadata failed
    // to load.
    it('an unreadable built key is never a re-key, however different the catalog looks', () => {
        expect(DecideRekeyed([], ['code', 'eventCode'])).toBe(false);
        expect(DecideRekeyed([], [])).toBe(false);
    });

    it('a catalog that reports no key against a real built key IS a re-key', () => {
        expect(DecideRekeyed(['code'], [])).toBe(true);
    });

    // The same guard on the catalog side. A refresh reading a per-connection object whose fields
    // were never warmed got `[]`, and "no key" against a real built key cleared the object's
    // record maps and rows on every refresh.
    it('an unread catalog key is never a re-key', () => {
        expect(DecideRekeyed(['code'], null)).toBe(false);
        expect(DecideRekeyed(['code', 'eventCode'], CatalogIdentityKey([]))).toBe(false);
    });
});

describe('CatalogIdentityKey', () => {
    const row = (Name: string, IsPrimaryKey: boolean, Sequence: number, Status = 'Active') =>
        ({ Name, IsPrimaryKey, Sequence, Status });

    it('is null when no field row was read — a cold per-connection object answers []', () => {
        expect(CatalogIdentityKey([])).toBeNull();
    });

    it('is null when no row is Active — nothing describes the object', () => {
        expect(CatalogIdentityKey([row('code', true, 1, 'Inactive')])).toBeNull();
    });

    it('is the Active key fields in Sequence order', () => {
        expect(CatalogIdentityKey([
            row('eventCode', true, 2),
            row('old_key', true, 0, 'Inactive'),
            row('code', true, 1),
            row('name', false, 3),
        ])).toEqual(['code', 'eventCode']);
    });

    it('is [] when Active rows declare no key — read, and keyless, so still a re-key', () => {
        const key = CatalogIdentityKey([row('name', false, 1)]);
        expect(key).toEqual([]);
        expect(DecideRekeyed(['code'], key)).toBe(true);
    });
});

/**
 * Two connections to the same vendor share one schema, so they share every entity table. The clear
 * may only touch the rows THIS connection's record maps point at; the other connection's rows in
 * the same table are not its to delete.
 */
describe('ClearRekeyedObjectData', () => {
    const USER = { ID: 'user-1' } as UserInfo;
    const RECORD_MAPS = { Name: 'MJ: Company Integration Record Maps', SchemaName: '__mj', BaseTable: 'CompanyIntegrationRecordMap' };
    const TARGET = { ExternalObjectName: 'attendees', EntityMapID: 'M1', EntityID: 'E1', SchemaName: 'pheedloop', BaseTable: 'attendees' };
    type MapRow = { ID: string; EntityRecordID: string };
    type RunViewParams = Parameters<RunView['RunView']>[0];
    type RunViewResult = Awaited<ReturnType<RunView['RunView']>>;

    /** A provider that records every statement and transaction step, in order. */
    function fakeProvider(key: string[], failOn?: string) {
        const log: string[] = [];
        const provider = {
            Dialect: {
                QuoteIdentifier: (s: string) => `[${s}]`,
                QuoteStringLiteral: (s: string) => `'${s.replace(/'/g, "''")}'`,
            },
            Entities: [RECORD_MAPS],
            EntityByName: (name: string) => (name === RECORD_MAPS.Name ? RECORD_MAPS : undefined),
            EntityByID: (id: string) => (id === 'E1' ? { PrimaryKeys: key.map(Name => ({ Name })) } : undefined),
            ExecuteSQL: async (sql: string) => {
                log.push(sql);
                if (failOn && sql.includes(failOn)) throw new Error('deadlock victim');
                return [];
            },
            BeginTransaction: async () => { log.push('BEGIN'); },
            CommitTransaction: async () => { log.push('COMMIT'); },
            RollbackTransaction: async () => { log.push('ROLLBACK'); },
        };
        return { provider: provider as unknown as DatabaseProviderBase, log };
    }

    let runView: ReturnType<typeof vi.spyOn>;
    /** Answers the record-map reads one page at a time, then empty. */
    function recordMapPages(...pages: MapRow[][]) {
        for (const page of pages) {
            runView.mockResolvedValueOnce({ Success: true, Results: page } as unknown as RunViewResult);
        }
        runView.mockResolvedValue({ Success: true, Results: [] } as unknown as RunViewResult);
    }
    const reads = () => runView.mock.calls.map(c => c[0] as RunViewParams);

    beforeEach(() => { runView = vi.spyOn(RunView.prototype, 'RunView'); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('deletes only the rows this connection\'s record maps point at — never the whole table', async () => {
        const { provider, log } = fakeProvider(['ID']);
        recordMapPages([{ ID: 'm1', EntityRecordID: 'r1' }, { ID: 'm2', EntityRecordID: 'r2' }]);

        const cleared = await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(cleared).toEqual(['attendees']);
        expect(log).not.toContain('DELETE FROM [pheedloop].[attendees]');
        expect(log).toContain("DELETE FROM [pheedloop].[attendees] WHERE [ID] IN ('r1','r2')");
        expect(reads()[0].EntityName).toBe(RECORD_MAPS.Name);
        expect(reads()[0].ExtraFilter).toBe("CompanyIntegrationID='CI-A' AND EntityID='E1'");
    });

    it('deletes the rows while their maps still say which rows they are, in one transaction with the maps', async () => {
        const { provider, log } = fakeProvider(['ID']);
        recordMapPages([{ ID: 'm1', EntityRecordID: 'r1' }]);

        await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(log).toEqual([
            'BEGIN',
            "DELETE FROM [pheedloop].[attendees] WHERE [ID] IN ('r1')",
            "DELETE FROM [__mj].[CompanyIntegrationRecordMap] WHERE [CompanyIntegrationID]='CI-A' AND [EntityID]='E1' AND [ID] IN ('m1')",
            'COMMIT',
        ]);
    });

    it('matches every column of a composite key, split the way the engine joined it', async () => {
        const { provider, log } = fakeProvider(['code', 'eventCode']);
        recordMapPages([{ ID: 'm1', EntityRecordID: 'a|1' }, { ID: 'm2', EntityRecordID: "b'x|2" }]);

        await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(log).toContain(
            "DELETE FROM [pheedloop].[attendees] WHERE ([code]='a' AND [eventCode]='1') OR ([code]='b''x' AND [eventCode]='2')"
        );
    });

    it('leaves a map whose id cannot name exactly one row, and does not report the object cleared', async () => {
        // 'a|1|z' against a two-column key is a value that itself contained '|': splitting it would
        // name some OTHER row. An empty component is a null key value, which matches nothing safely.
        const { provider, log } = fakeProvider(['code', 'eventCode']);
        recordMapPages([
            { ID: 'm1', EntityRecordID: 'a|1' },
            { ID: 'm2', EntityRecordID: 'a|1|z' },
            { ID: 'm3', EntityRecordID: '|2' },
        ]);

        const cleared = await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(cleared).toEqual([]);
        expect(log).toContain("DELETE FROM [pheedloop].[attendees] WHERE ([code]='a' AND [eventCode]='1')");
        expect(log.some(s => s.includes('m2') || s.includes('m3'))).toBe(false);
    });

    it('pages through the maps by id, so a big table is never read or deleted whole', async () => {
        const { provider, log } = fakeProvider(['ID']);
        recordMapPages(
            [{ ID: 'm1', EntityRecordID: 'r1' }, { ID: 'm2', EntityRecordID: 'r2' }],
            [{ ID: 'm3', EntityRecordID: 'r3' }],
        );

        const cleared = await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider, 2);

        expect(cleared).toEqual(['attendees']);
        expect(reads()).toHaveLength(2);
        expect(reads()[0]).toMatchObject({ OrderBy: 'ID', MaxRows: 2, SkipTotalRowCount: true, BypassCache: true });
        expect(reads()[1].ExtraFilter).toBe("CompanyIntegrationID='CI-A' AND EntityID='E1' AND ID > 'm2'");
        expect(log.filter(s => s === 'COMMIT')).toHaveLength(2);
    });

    it('rolls a failed chunk back and does not report the object cleared', async () => {
        const { provider, log } = fakeProvider(['ID'], 'CompanyIntegrationRecordMap');
        recordMapPages([{ ID: 'm1', EntityRecordID: 'r1' }]);

        const cleared = await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(cleared).toEqual([]);
        expect(log).toContain('ROLLBACK');
        expect(log).not.toContain('COMMIT');
    });

    it('deletes nothing when the record maps cannot be read', async () => {
        const { provider, log } = fakeProvider(['ID']);
        runView.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout' } as unknown as RunViewResult);

        const cleared = await ClearRekeyedObjectData([TARGET], 'CI-A', USER, provider);

        expect(cleared).toEqual([]);
        expect(log).toEqual([]);
    });
});
