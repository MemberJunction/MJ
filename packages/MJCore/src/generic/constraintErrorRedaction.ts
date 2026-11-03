import { EntityInfo } from './entityInfo';
import { UserInfo } from './securityInfo';

/** What replaces a value list the database echoed in a constraint error. */
export const REDACTED_CONSTRAINT_VALUES = '(values withheld)';

/**
 * Value lists the database puts into constraint errors, matched to the end of their line so a
 * value that itself contains parentheses is still removed whole.
 *
 * - SQL Server unique key / unique index: `The duplicate key value is (a, b).`
 * - SQL Server truncation (2628): `Truncated value: 'abc'.`
 * - PostgreSQL unique / foreign key detail: `Key (a, b)=(1, 2) already exists.` /
 *   `... is not present in table "t".` The column names stay; only the values go.
 * - PostgreSQL check / not-null detail: `Failing row contains (1, 2, 3).`
 */
const VALUE_PATTERNS: ReadonlyArray<RegExp> = [
    /(The duplicate key value is )\([^\n]*\)/g,
    /(Truncated value: )'[^\n]*'/g,
    /(Key \([^)\n]*\)=)\([^\n]*\)(?=\s+(?:already exists|is not present|is still referenced))/g,
    /(Failing row contains )\([^\n]*\)/g,
];

/**
 * Removes the column values a database constraint error echoes, keeping the rest of the
 * message (constraint name, table, column names) so the caller still learns which rule failed.
 *
 * A duplicate-key error on a unique index lists every value in the index, including the stored
 * value of a column the caller may not be allowed to read. A message with none of the known
 * value lists comes back unchanged.
 */
export function RedactConstraintValues(message: string): string {
    if (!message) {
        return message;
    }
    let result = message;
    for (const Pattern of VALUE_PATTERNS) {
        // Each pattern's first group is the label kept in front of the removed values.
        result = result.replace(Pattern, (_match: string, label: string) => `${label}${REDACTED_CONSTRAINT_VALUES}`);
    }
    return result;
}

/**
 * The save-failure message a caller may see: unchanged when field-level security withholds no
 * column of this entity from them, otherwise without the executed SQL (see
 * {@link StripExecutedSQL}) and with constraint values removed (see {@link RedactConstraintValues}). The full message still belongs in the server log.
 */
export function SaveErrorMessageForUser(message: string, entityInfo: EntityInfo, user: UserInfo | undefined): string {
    if (!entityInfo?.FieldLevelSecurityApplies) {
        return message;
    }
    if (user && entityInfo.GetDeniedReadFields(user).size === 0) {
        return message;
    }
    return RedactConstraintValues(StripExecutedSQL(message));
}

/**
 * Drops the SQL text a provider appends to an execution error (`Query: …` and `Parameters: …`
 * lines and everything after them). A save's SQL can carry stored values the caller may not
 * read, such as the full-record JSON written to the audit trail.
 */
export function StripExecutedSQL(message: string): string {
    if (!message) {
        return message;
    }
    const match = /^[ \t]*(?:Query|Parameters):/m.exec(message);
    return match ? message.slice(0, match.index).trimEnd() : message;
}
