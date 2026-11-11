import { EntityInfo } from './entityInfo';
import { UserInfo } from './securityInfo';

/** What replaces a value list the database echoed in a constraint error. */
export const REDACTED_CONSTRAINT_VALUES = '(values withheld)';

/**
 * A value list the database puts into a constraint error: the text after `Label`, from the `Open`
 * character through the last `Close` character on the same line, so a value that itself contains
 * parentheses is still removed whole. When `Suffixes` is set, that closing character must be
 * followed by whitespace and one of them.
 *
 * - SQL Server unique key / unique index: `The duplicate key value is (a, b).`
 * - SQL Server truncation (2628): `Truncated value: 'abc'.`
 * - PostgreSQL unique / foreign key detail: `Key (a, b)=(1, 2) already exists.` /
 *   `... is not present in table "t".` The column names stay; only the values go.
 * - PostgreSQL check / not-null detail: `Failing row contains (1, 2, 3).`
 *
 * The lists are found with `indexOf` scans rather than regular expressions with an open-ended
 * `[^\n]*`, whose backtracking is quadratic on a crafted message.
 */
interface ValueListRule {
    Label: string;
    Open: string;
    Close: string;
    /** Only for the PostgreSQL key detail: the label is `Key (<columns>)=` and needs parsing. */
    KeyColumns?: boolean;
    Suffixes?: readonly string[];
}

const VALUE_LIST_RULES: readonly ValueListRule[] = [
    { Label: 'The duplicate key value is ', Open: '(', Close: ')' },
    { Label: 'Truncated value: ', Open: "'", Close: "'" },
    { Label: 'Key (', Open: '(', Close: ')', KeyColumns: true, Suffixes: ['already exists', 'is not present', 'is still referenced'] },
    { Label: 'Failing row contains ', Open: '(', Close: ')' },
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
    const lines = message.split('\n');
    const out: string[] = [];
    for (const line of lines) {
        const redacted = VALUE_LIST_RULES.reduce((current, rule) => redactLine(current, rule), line);
        // A value can itself contain a line break, so its list does not close on this line. The
        // rest of the message may be part of that value, so everything from the opening
        // character on is withheld.
        const unclosedAt = findUnclosedValueList(redacted);
        if (unclosedAt >= 0) {
            out.push(redacted.slice(0, unclosedAt) + REDACTED_CONSTRAINT_VALUES);
            break;
        }
        out.push(redacted);
    }
    return out.join('\n');
}

/** Where a value list opens on the line without being closed (and not already redacted), or -1. */
function findUnclosedValueList(line: string): number {
    let first = -1;
    for (const rule of VALUE_LIST_RULES) {
        let searchFrom = 0;
        while (searchFrom < line.length) {
            const labelAt = line.indexOf(rule.Label, searchFrom);
            if (labelAt < 0) {
                break;
            }
            const opened = findValueListOpen(line, labelAt, rule);
            if (opened.OpenAt >= 0 && !line.startsWith(REDACTED_CONSTRAINT_VALUES, opened.OpenAt)) {
                if (first < 0 || opened.OpenAt < first) {
                    first = opened.OpenAt;
                }
                break;
            }
            searchFrom = opened.ResumeAt;
        }
    }
    return first;
}

/**
 * Applies one rule to one line; returns the line unchanged when the rule does not match.
 * The value list runs to the last qualifying closing character on the line, so that position is
 * found once; the scan then takes the first label before it whose opening character is in place.
 */
function redactLine(line: string, rule: ValueListRule): string {
    const closeAt = findLastValueListClose(line, rule);
    let searchFrom = 0;
    while (closeAt >= 0 && searchFrom < closeAt) {
        const labelAt = line.indexOf(rule.Label, searchFrom);
        if (labelAt < 0 || labelAt >= closeAt) {
            return line;
        }
        const opened = findValueListOpen(line, labelAt, rule);
        if (opened.OpenAt >= 0 && opened.OpenAt < closeAt) {
            return line.slice(0, opened.OpenAt) + REDACTED_CONSTRAINT_VALUES + line.slice(closeAt + 1);
        }
        if (opened.OpenAt >= closeAt) {
            return line;
        }
        searchFrom = opened.ResumeAt;
    }
    return line;
}

/**
 * Where the value list after the label at `labelAt` opens (`OpenAt`, -1 when it does not), and
 * where to look for the next label when it does not.
 */
function findValueListOpen(line: string, labelAt: number, rule: ValueListRule): { OpenAt: number; ResumeAt: number } {
    const afterLabel = labelAt + rule.Label.length;
    if (rule.KeyColumns) {
        // `Key (<columns>)=(` — the column list ends at the first `)=(`, not the first `)`, because
        // an expression index lists an expression such as `lower(email)` in place of a column.
        // Any later label before that `)=(` ends its column list at the same place, so the search
        // resumes after it.
        const columnsClose = line.indexOf(')=' + rule.Open, afterLabel);
        if (columnsClose < 0) {
            return { OpenAt: -1, ResumeAt: line.length };
        }
        return { OpenAt: columnsClose + 2, ResumeAt: columnsClose + 1 };
    }
    return { OpenAt: line.startsWith(rule.Open, afterLabel) ? afterLabel : -1, ResumeAt: afterLabel };
}

/** Index of the last closing character on the line that satisfies the rule's suffix, or -1. */
function findLastValueListClose(line: string, rule: ValueListRule): number {
    let closeAt = line.lastIndexOf(rule.Close);
    while (closeAt >= 0) {
        if (!rule.Suffixes || closeIsFollowedBySuffix(line, closeAt, rule.Suffixes)) {
            return closeAt;
        }
        closeAt = closeAt > 0 ? line.lastIndexOf(rule.Close, closeAt - 1) : -1;
    }
    return -1;
}

/** True when the text after `closeAt` is whitespace and then one of `suffixes`. */
function closeIsFollowedBySuffix(line: string, closeAt: number, suffixes: readonly string[]): boolean {
    let at = closeAt + 1;
    while (at < line.length && /\s/.test(line[at])) {
        at++;
    }
    if (at === closeAt + 1) {
        return false;
    }
    return suffixes.some((suffix) => line.startsWith(suffix, at));
}

/**
 * The save- or delete-failure message a caller may see (direct or through a transaction group): unchanged when field-level security withholds no
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
    let cut = message.length;
    const match = /^[ \t]*(?:Query|Parameters):/m.exec(message);
    if (match) {
        cut = match.index;
    }
    // The provider's own "no rows" save errors put the SQL inline after a fixed lead-in.
    for (const leadIn of INLINE_SQL_LEAD_INS) {
        const at = message.indexOf(leadIn);
        if (at >= 0 && at + leadIn.length < cut) {
            cut = at + leadIn.length;
        }
    }
    return cut < message.length ? message.slice(0, cut).trimEnd() : message;
}

/** Lead-ins after which a provider save error carries the executed SQL on the same line. */
const INLINE_SQL_LEAD_INS: readonly string[] = [
    'no rows returned from SQL:',
    'no MATCHING rows found within the database:',
];
