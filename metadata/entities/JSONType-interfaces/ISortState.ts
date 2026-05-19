/**
 * A single sort-field entry within a User View's sort configuration.
 *
 * The `SortState` column of the `User Views` entity stores a JSON **array** of these
 * objects, representing a multi-column sort applied left-to-right. For example:
 * ```json
 * [{ "field": "LastName", "direction": "asc" }, { "field": "FirstName", "direction": "asc" }]
 * ```
 *
 * The runtime class `ViewSortInfo` in MJUserViewEntityExtended maps the `direction`
 * string to a `ViewSortDirectionInfo` enum. This interface represents the raw
 * serialized form. The `JSONTypeIsArray` flag is set so CodeGen emits `ISortStateItem[]`.
 */
export interface ISortStateItem {
    /** Field name to sort by */
    field: string;
    /** Sort direction (lowercase in JSON) */
    direction: 'asc' | 'desc';
}
