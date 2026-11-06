import { describe, expect, it } from 'vitest';
import { CompositeRecordIDExpression, ListMembershipFilter, RecordIDAsKeyType } from '../generic/listMembershipFilter';
import { CompositeKey } from '../generic/compositeKey';

const VIEW = '__mj.vwListDetails';
const LIST = 'list-1';

describe('ListMembershipFilter', () => {
    // Metadata reports a uuid key as `uniqueidentifier` on PostgreSQL too (vwSQLColumnsAndEntityFields
    // maps it), so this is the form both platforms receive; the PostgreSQL provider and the
    // client-clause screen map the type to `uuid`.
    it('casts RecordID to a uuid key as metadata types it (uniqueidentifier, on both platforms)', () => {
        expect(ListMembershipFilter({ Name: 'ID', Type: 'uniqueidentifier' }, VIEW, LIST)).toBe(
            "ID IN (SELECT CAST(RecordID AS uniqueidentifier) FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('casts RecordID to a key typed with a PostgreSQL type name', () => {
        expect(ListMembershipFilter({ Name: 'ID', Type: 'UUID' }, VIEW, LIST)).toBe(
            "ID IN (SELECT CAST(RecordID AS UUID) FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('casts RecordID to an integer key', () => {
        expect(ListMembershipFilter({ Name: 'id', Type: 'integer' }, VIEW, LIST)).toBe(
            "id IN (SELECT CAST(RecordID AS integer) FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('casts the list side only, leaving the key column bare so its index stays usable', () => {
        const filter = ListMembershipFilter({ Name: 'ID', Type: 'uniqueidentifier' }, VIEW, LIST);
        expect(filter.startsWith('ID IN (')).toBe(true);
        expect(filter).toContain('CAST(RecordID AS uniqueidentifier)');
    });

    it.each(['nvarchar', 'varchar', 'character varying', 'text', 'nchar'])('compares a %s key to RecordID uncast', (type) => {
        expect(ListMembershipFilter({ Name: 'Code', Type: type }, VIEW, LIST)).toBe(
            "Code IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('escapes the list id, which is spliced into the SQL as a string literal', () => {
        const filter = ListMembershipFilter({ Name: 'ID', Type: 'uniqueidentifier' }, VIEW, "abc' OR 1=1--");
        expect(filter).toContain("WHERE ListID='abc'' OR 1=1--')");
        expect(filter).not.toContain("ListID='abc' OR");
    });

    it('compares uncast when the key type is unknown', () => {
        expect(ListMembershipFilter({ Name: 'ID', Type: null }, VIEW, LIST)).toBe(
            "ID IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('never splices a type name that is not a plain SQL type word', () => {
        expect(ListMembershipFilter({ Name: 'ID', Type: 'int); DROP TABLE x; --' }, VIEW, LIST)).toBe(
            "ID IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });
});

describe('ListMembershipFilter — key field lists', () => {
    it('gives the single-key form, unchanged, for a one-element key list', () => {
        expect(ListMembershipFilter([{ Name: 'ID', Type: 'uniqueidentifier' }], VIEW, LIST)).toBe(
            ListMembershipFilter({ Name: 'ID', Type: 'uniqueidentifier' }, VIEW, LIST)
        );
    });

    it('matches a two-column key (uuid + int) with CONCAT over the F1|v1||F2|v2 record id', () => {
        expect(ListMembershipFilter([{ Name: 'OrderID', Type: 'uniqueidentifier' }, { Name: 'LineNo', Type: 'int' }], VIEW, LIST)).toBe(
            "CONCAT('OrderID|', [OrderID], '||', 'LineNo|', [LineNo]) IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID='list-1')"
        );
    });

    it('matches a three-column key in key order', () => {
        expect(CompositeRecordIDExpression([
            { Name: 'TenantID', Type: 'int' },
            { Name: 'SheetID', Type: 'uniqueidentifier' },
            { Name: 'CellRef', Type: 'nvarchar' },
        ])).toBe("CONCAT('TenantID|', [TenantID], '||', 'SheetID|', [SheetID], '||', 'CellRef|', [CellRef])");
    });

    it('builds the same string CompositeKey writes to RecordID', () => {
        const key = new CompositeKey([{ FieldName: 'OrderID', Value: 'A' }, { FieldName: 'LineNo', Value: 3 }]);
        // Evaluate the CONCAT arguments by hand: literals as written, columns by their values.
        const args = CompositeRecordIDExpression([{ Name: 'OrderID', Type: 'uniqueidentifier' }, { Name: 'LineNo', Type: 'int' }])
            .slice('CONCAT('.length, -1)
            .split(', ')
            .map(arg => arg === '[OrderID]' ? 'A' : arg === '[LineNo]' ? '3' : arg.slice(1, -1));
        expect(args.join('')).toBe(key.ToURLSegment());
    });

    it('escapes the list id in the composite form', () => {
        const filter = ListMembershipFilter([{ Name: 'A', Type: 'int' }, { Name: 'B', Type: 'int' }], VIEW, "x' OR 1=1--");
        expect(filter).toContain("WHERE ListID='x'' OR 1=1--')");
    });

    // A key column the List Details view also has (ID) must not bind to the view's column.
    it('keeps the key columns outside the List Details subquery', () => {
        const filter = ListMembershipFilter([{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Ver', Type: 'int' }], VIEW, LIST);
        const subquery = filter.slice(filter.indexOf(' IN (SELECT'));
        expect(filter.startsWith("CONCAT('ID|', [ID], '||', 'Ver|', [Ver]) IN (SELECT")).toBe(true);
        expect(subquery).not.toContain('[ID]');
    });

    it('throws for an empty key list', () => {
        expect(() => ListMembershipFilter([], VIEW, LIST)).toThrow(/at least one key field/);
    });
});

describe('RecordIDAsKeyType', () => {
    it('casts a named record-id column', () => {
        expect(RecordIDAsKeyType({ Name: 'ID', Type: 'uniqueidentifier' }, '"RecordID"')).toBe('CAST("RecordID" AS uniqueidentifier)');
    });

    it('leaves a text key uncast', () => {
        expect(RecordIDAsKeyType({ Name: 'Code', Type: 'varchar' })).toBe('RecordID');
    });
});
