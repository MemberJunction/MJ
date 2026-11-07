import { describe, expect, it } from 'vitest';
import { ListMembershipFilter } from '../generic/listMembershipFilter';

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
