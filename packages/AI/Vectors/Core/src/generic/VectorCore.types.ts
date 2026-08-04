import type { CompositeKey } from '@memberjunction/core';

export type PageRecordsParams = {
    /**
     * The ID of the entitiy to get the records from
     */
    EntityID: string | number;
    /**
     * OFFSET-mode pagination cursor — multiplied by PageSize to compute SQL OFFSET.
     *
     * Ignored when `AfterKey` is provided (keyset mode). For deep iteration over large
     * entities, prefer the keyset form — pass an undefined `AfterKey` on the first call,
     * then pass the PK of the last record returned on each subsequent call.
     */
    PageNumber: number;
    /**
     * Number of records returned per page
     */
    PageSize: number;
    /**
     * The type of result to return
     */
    ResultType: "entity_object" | "simple" | "count_only",
    /**
     * Filter to apply to the query
     */
    Filter?: string;
    /**
     * Keyset (seek) pagination cursor — when present, the query returns records ordered
     * by the entity's single-column PK with `WHERE pk > @lastSeen`. Keep each page O(log N)
     * regardless of how deep you go. Requires a single-column PK on the target entity.
     *
     * Pass `undefined` (or omit) to fetch the first page. On subsequent calls, pass a
     * CompositeKey containing the PK column name and the last returned record's PK value.
     *
     * See `guides/KEYSET_PAGINATION_GUIDE.md` for the full pattern.
     */
    AfterKey?: CompositeKey;
};