/**
 * SQL predicates selecting the rows of an entity that are members of a list (`MJ: List Details`).
 *
 * `RecordID` is text. SQL Server converts it to the key's type on its own, but PostgreSQL has no
 * `uuid = text` or `integer = text` operator, so the plain form fails there for every non-text key.
 * The list side is cast to the key's own type — the type the metadata reports for this database
 * (`uuid` on PostgreSQL, `uniqueidentifier` on SQL Server, `integer`, ...) — which runs on both and
 * leaves the key column bare, so the primary-key index stays usable. Text keys compare as they are.
 *
 * A composite key is stored in `RecordID` as `Field1|Value1||Field2|Value2` (the
 * {@link CompositeKey} delimiters), so the composite predicate builds the same string from the
 * key columns with `CONCAT`, which converts every argument to text on both SQL Server and
 * PostgreSQL. The comparison is on formatted text: a uuid formats in upper case on SQL Server and
 * lower case on PostgreSQL, but a `RecordID` is written by the same platform that reads it and SQL
 * Server compares case-insensitively, so this matches what each platform stores.
 *
 * Callers on the client cannot ask which database is behind the API, which is why the cast is
 * driven by the key's type and the composite form uses only syntax both platforms accept, rather
 * than a platform switch.
 */
import { EscapeSQLString } from '@memberjunction/global';
import { CompositeKey } from './compositeKey';

/** The parts of a key field the list-membership predicates read. */
export interface ListMembershipKeyField {
    Name: string;
    Type: string | null;
}

/**
 * `RecordID` (or another text column holding a single-column record id) cast to the key field's
 * own SQL type, or left as it is for text keys and for types that are not a plain SQL type word.
 */
export function RecordIDAsKeyType(pkField: ListMembershipKeyField, recordIdColumn: string = 'RecordID'): string {
    const type = (pkField.Type ?? '').trim();
    // Only a plain SQL type word is ever spliced into the SQL.
    const castable = /^[A-Za-z][A-Za-z ]*$/.test(type) && !/char|text/i.test(type);
    return castable ? `CAST(${recordIdColumn} AS ${type})` : recordIdColumn;
}

/**
 * The predicate selecting the rows of an entity that are members of a list.
 *
 * - One key field: `<pk> IN (SELECT <RecordID cast to the key type> FROM <view> WHERE ListID='<id>')`.
 * - Several key fields: `EXISTS (SELECT 1 FROM <view> ld WHERE ld.ListID='<id>' AND ld.RecordID = CONCAT('F1|', [F1], '||', 'F2|', [F2]))`.
 *
 * @param keyFields the entity's primary key fields (`EntityInfo.PrimaryKeys`), or a single key field
 * @param listDetailsView the schema-qualified List Details view, e.g. `__mj.vwListDetails`
 * @param listId the list's ID; escaped before it is spliced into the SQL
 */
export function ListMembershipFilter(
    keyFields: ListMembershipKeyField | ReadonlyArray<ListMembershipKeyField>,
    listDetailsView: string,
    listId: string
): string {
    const fields: ReadonlyArray<ListMembershipKeyField> = isKeyFieldList(keyFields) ? keyFields : [keyFields];
    if (fields.length === 0) {
        throw new Error('ListMembershipFilter needs at least one key field');
    }
    // The list id is spliced into SQL as a string literal, so it is escaped like every other value.
    const listIdLiteral = `'${EscapeSQLString(listId)}'`;
    if (fields.length === 1) {
        const pk = fields[0];
        return `${pk.Name} IN (SELECT ${RecordIDAsKeyType(pk)} FROM ${listDetailsView} WHERE ListID=${listIdLiteral})`;
    }
    return `EXISTS (SELECT 1 FROM ${listDetailsView} ld WHERE ld.ListID=${listIdLiteral} AND ld.RecordID = ${CompositeRecordIDExpression(fields)})`;
}

/**
 * A `CONCAT(...)` expression producing the `Field1|Value1||Field2|Value2` record id from the key
 * columns, in the order given.
 */
export function CompositeRecordIDExpression(keyFields: ReadonlyArray<ListMembershipKeyField>): string {
    const valueDelimiter = CompositeKey.DefaultValueDelimiter;
    const fieldDelimiter = CompositeKey.DefaultFieldDelimiter;
    const args: string[] = [];
    keyFields.forEach((pk, index) => {
        if (index > 0) {
            args.push(`'${EscapeSQLString(fieldDelimiter)}'`);
        }
        args.push(`'${EscapeSQLString(pk.Name + valueDelimiter)}'`);
        args.push(`[${pk.Name}]`);
    });
    return `CONCAT(${args.join(', ')})`;
}

function isKeyFieldList(
    keyFields: ListMembershipKeyField | ReadonlyArray<ListMembershipKeyField>
): keyFields is ReadonlyArray<ListMembershipKeyField> {
    return Array.isArray(keyFields);
}
