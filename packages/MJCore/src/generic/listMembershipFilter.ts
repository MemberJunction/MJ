/**
 * The SQL predicate selecting the rows of a single-column-key entity that are members of a list:
 * `<pk> IN (SELECT RecordID FROM <List Details view> WHERE ListID='<id>')`.
 *
 * `RecordID` is text. SQL Server converts it to the key's type on its own, but PostgreSQL has no
 * `uuid = text` or `integer = text` operator, so the plain form fails there for every non-text key.
 * The list side is cast to the key's own type — the type the metadata reports for this database
 * (`uuid` on PostgreSQL, `uniqueidentifier` on SQL Server, `integer`, ...) — which runs on both and
 * leaves the key column bare, so the primary-key index stays usable. Text keys compare as they are.
 *
 * Callers on the client cannot ask which database is behind the API, which is why the cast is
 * driven by the key's type rather than by a platform switch.
 */
export function ListMembershipFilter(
    pkField: { Name: string; Type: string | null },
    listDetailsView: string,
    listId: string
): string {
    const type = (pkField.Type ?? '').trim();
    // Only a plain SQL type word is ever spliced into the SQL.
    const castable = /^[A-Za-z][A-Za-z ]*$/.test(type) && !/char|text/i.test(type);
    const recordId = castable ? `CAST(RecordID AS ${type})` : 'RecordID';
    return `${pkField.Name} IN (SELECT ${recordId} FROM ${listDetailsView} WHERE ListID='${listId}')`;
}
