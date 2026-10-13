import { CompositeKey, EntityInfo } from '@memberjunction/core';

/**
 * SQL predicate selecting the records identified by compact key segments — the form
 * `MJ: List Details.RecordID`, prediction RecordIDs, search results and Explorer URLs carry:
 * the raw value for a single-column key, `F1|v1||F2|v2` for a composite one — on an
 * ARBITRARY entity whose key can have any column name(s).
 *
 * A single-column key collapses to one `<pk> IN (...)`; a composite key expands each segment
 * to its full `(F1='v1' AND F2='v2')` predicate and ORs them — an IN on the first column alone
 * would silently match the wrong rows.
 */
export function BuildRecordIdFilter(entityInfo: EntityInfo, recordIds: readonly string[]): string {
    if (recordIds.length === 0) {
        return '1=0';
    }
    if (entityInfo.PrimaryKeys.length === 1) {
        const inList = recordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
        return `${entityInfo.FirstPrimaryKey.Name} IN (${inList})`; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
    }
    return recordIds
        .map((id) => `(${CompositeKey.FromURLSegment(entityInfo, id).ToWhereClause()})`)
        .join(' OR ');
}
