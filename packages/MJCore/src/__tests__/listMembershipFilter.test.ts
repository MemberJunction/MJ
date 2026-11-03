import { describe, expect, it } from 'vitest';
import { CompositeRecordIDExpression, ListMembershipFilter, RecordIDAsKeyType } from '../generic/listMembershipFilter';
import { CompositeKey } from '../generic/compositeKey';

const VIEW = '__mj.vwListDetails';
const LIST = 'list-1';

describe('ListMembershipFilter', () => {
    it('casts RecordID to a PostgreSQL uuid key, so uuid = text never reaches the server', () => {
        expect(ListMembershipFilter({ Name: 'ID', Type: 'uuid' }, VIEW, LIST)).toBe(
            "ID IN (SELECT CAST(RecordID AS uuid) FROM __mj.vwListDetails WHERE ListID='list-1')"
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
        const filter = ListMembershipFilter({ Name: 'ID', Type: 'uuid' }, VIEW, "abc' OR 1=1--");
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
        expect(ListMembershipFilter([{ Name: 'ID', Type: 'uuid' }], VIEW, LIST)).toBe(
            ListMembershipFilter({ Name: 'ID', Type: 'uuid' }, VIEW, LIST)
        );
    });

    it('matches a two-column key (uuid + int) with CONCAT over the F1|v1||F2|v2 record id', () => {
        expect(ListMembershipFilter([{ Name: 'OrderID', Type: 'uuid' }, { Name: 'LineNo', Type: 'integer' }], VIEW, LIST)).toBe(
            "EXISTS (SELECT 1 FROM __mj.vwListDetails ld WHERE ld.ListID='list-1' AND ld.RecordID = " +
            "CONCAT('OrderID|', [OrderID], '||', 'LineNo|', [LineNo]))"
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
        const args = CompositeRecordIDExpression([{ Name: 'OrderID', Type: 'uuid' }, { Name: 'LineNo', Type: 'int' }])
            .slice('CONCAT('.length, -1)
            .split(', ')
            .map(arg => arg === '[OrderID]' ? 'A' : arg === '[LineNo]' ? '3' : arg.slice(1, -1));
        expect(args.join('')).toBe(key.ToURLSegment());
    });

    it('escapes the list id in the composite form', () => {
        const filter = ListMembershipFilter([{ Name: 'A', Type: 'int' }, { Name: 'B', Type: 'int' }], VIEW, "x' OR 1=1--");
        expect(filter).toContain("ld.ListID='x'' OR 1=1--'");
    });

    it('throws for an empty key list', () => {
        expect(() => ListMembershipFilter([], VIEW, LIST)).toThrow(/at least one key field/);
    });
});

describe('RecordIDAsKeyType', () => {
    it('casts a named record-id column', () => {
        expect(RecordIDAsKeyType({ Name: 'ID', Type: 'uuid' }, '"RecordID"')).toBe('CAST("RecordID" AS uuid)');
    });

    it('leaves a text key uncast', () => {
        expect(RecordIDAsKeyType({ Name: 'Code', Type: 'varchar' })).toBe('RecordID');
    });
});
