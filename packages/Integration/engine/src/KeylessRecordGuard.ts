/**
 * Guard: a record destined for a SOFT-primary-key table must carry its key.
 *
 * ## Why this exists
 *
 * A soft primary key is INFERRED, not generated. It is the external system's own identifier stored
 * as ordinary data — `DDLGenerator` gives such columns a NON-UNIQUE index and no `PRIMARY KEY`
 * constraint, precisely because the key is inferred and a unique constraint would reject legitimate
 * rows. So nothing at the database level rejects a NULL key.
 *
 * A row written without its key can never be matched again: the next sync's existence check misses
 * it and inserts another copy, and the pass after that inserts another. The rows look completely
 * healthy — every business column populated — with only the key column empty, so the failure is
 * silent and compounding. A production incident of exactly this shape produced ~1.9M unmatchable
 * rows across 39 tables in a single day before anyone noticed.
 *
 * The engine cannot repair such a record, but it can refuse to write it, which turns a silent
 * data-integrity failure into a loud per-record skip naming the field map to fix.
 *
 * ## Why it is scoped to soft keys
 *
 * A missing mapped key is LEGITIMATE when the destination generates its own — an identity column or
 * a server-assigned UUID. Those rows are matched by record map, not by key, so refusing them would
 * break ordinary syncs. Only `IsSoftPrimaryKey` columns carry the "the key is data" contract.
 */

/** The subset of EntityFieldInfo this guard needs. */
export interface KeyFieldLike {
    Name: string;
    IsSoftPrimaryKey?: boolean;
}

export interface KeylessRefusal {
    /** True when the record must NOT be written. */
    Refuse: boolean;
    /** Comma-separated soft-key column names, for the operator-facing message. */
    KeyNames: string;
}

/**
 * Decides whether a record must be refused for lacking its inferred key.
 *
 * @param mappedPK - the key extracted from the record's mapped fields, or null when absent/empty
 * @param pkFields - the destination entity's primary-key fields
 */
export function DecideKeylessRefusal(
    mappedPK: string | null | undefined,
    pkFields: ReadonlyArray<KeyFieldLike>
): KeylessRefusal {
    if (mappedPK != null) {
        return { Refuse: false, KeyNames: '' };
    }
    const softKeys = pkFields.filter(f => f.IsSoftPrimaryKey === true);
    return {
        Refuse: softKeys.length > 0,
        KeyNames: softKeys.map(f => f.Name).join(', '),
    };
}

/**
 * The operator-facing explanation. Names what is wrong, why it cannot simply be written anyway, and
 * the two places the cause actually lives.
 */
export function DescribeKeylessRefusal(entityName: string, keyNames: string): string {
    return (
        `Record skipped — no value for the inferred key (${keyNames}) on ${entityName}. ` +
        `A soft primary key is DATA, not generated: a row written without one can never be matched ` +
        `again and would be re-inserted on every subsequent sync. Check the field map for the key ` +
        `column, and that discovery resolved this object's primary key.`
    );
}
