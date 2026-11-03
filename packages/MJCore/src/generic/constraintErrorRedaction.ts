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
const VALUE_PATTERNS: ReadonlyArray<{ Pattern: RegExp; Replacement: string }> = [
    { Pattern: /(The duplicate key value is )\([^\n]*\)/g, Replacement: `$1${REDACTED_CONSTRAINT_VALUES}` },
    { Pattern: /(Truncated value: )'[^\n]*'/g, Replacement: `$1${REDACTED_CONSTRAINT_VALUES}` },
    {
        Pattern: /(Key \([^)\n]*\)=)\([^\n]*\)(?=\s+(?:already exists|is not present|is still referenced))/g,
        Replacement: `$1${REDACTED_CONSTRAINT_VALUES}`,
    },
    { Pattern: /(Failing row contains )\([^\n]*\)/g, Replacement: `$1${REDACTED_CONSTRAINT_VALUES}` },
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
    for (const { Pattern, Replacement } of VALUE_PATTERNS) {
        result = result.replace(Pattern, Replacement);
    }
    return result;
}

/**
 * The save-failure message a caller may see: unchanged when field-level security withholds no
 * column of this entity from them, otherwise with constraint values removed (see
 * {@link RedactConstraintValues}). The full message still belongs in the server log.
 */
export function SaveErrorMessageForUser(message: string, entityInfo: EntityInfo, user: UserInfo | undefined): string {
    if (!entityInfo?.FieldLevelSecurityApplies) {
        return message;
    }
    if (user && entityInfo.GetDeniedReadFields(user).size === 0) {
        return message;
    }
    return RedactConstraintValues(message);
}
