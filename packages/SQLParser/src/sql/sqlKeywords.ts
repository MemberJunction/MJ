import type { ForClauseForm, SqlStatementKind } from './sqlNodes.js';

/**
 * Keyword sets the structural parser and the expression helpers read. Every entry is upper case.
 * Words outside {@link RESERVED_WORDS} are read as names wherever a name can stand, so a column
 * named `Date`, `Year` or `Range` is never lost.
 */

function words(list: string): ReadonlySet<string> {
    return new Set(list.trim().split(/\s+/));
}

/** Words that are never a bare alias or a column name in any supported dialect. */
export const RESERVED_WORDS = words(`
    ALL AND ANY APPLY AS ASC BETWEEN BY CASE CROSS DESC DISTINCT ELSE END ESCAPE EXCEPT EXISTS FALSE FETCH
    FOR FROM FULL GROUP HAVING ILIKE IN INNER INTERSECT INTO IS JOIN LATERAL LEFT LIKE LIMIT MINUS NATURAL
    NOT NULL OFFSET ON OPTION OR ORDER OUTER OVER PIVOT QUALIFY RIGHT SELECT SOME THEN TOP TRUE UNION
    UNPIVOT USING WHEN WHERE WINDOW WITH VALUES TABLESAMPLE COLLATE RETURNING INSERT UPDATE DELETE MERGE
    SET DECLARE EXEC EXECUTE CREATE ALTER DROP TRUNCATE GRANT REVOKE DENY CALL DEFAULT CURRENT_DATE
    CURRENT_TIME CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP CURRENT_USER SESSION_USER SYSTEM_USER
    STRAIGHT_JOIN
`);

/** Reserved words that end a value, so an alias may follow them (`CASE … END AS x`, `NULL x`). */
export const VALUE_KEYWORDS = words(`
    NULL TRUE FALSE END DEFAULT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP
    CURRENT_USER SESSION_USER SYSTEM_USER
`);

/** Reserved words that are function calls when a `(` follows them. */
export const FUNCTION_KEYWORDS = words(`
    LEFT RIGHT INSERT TRUNCATE REPLACE CURRENT_TIMESTAMP CURRENT_DATE CURRENT_TIME LOCALTIME LOCALTIMESTAMP
    VALUES
`);

/** Words that are never an alias although they are not reserved: parts of multi-word type names. */
export const NEVER_ALIAS_WORDS = words('VARYING PRECISION ZONE');

/** Keywords of a window specification, read as syntax only inside `OVER (…)` and `WITHIN GROUP (…)`. */
export const WINDOW_WORDS = words(`
    PARTITION ROWS RANGE GROUPS UNBOUNDED PRECEDING FOLLOWING CURRENT ROW EXCLUDE TIES NO OTHERS NULLS
    FIRST LAST
`);

/** Functions whose first argument is a date part keyword (`DATEADD(day, …)`). */
export const DATE_PART_FUNCTIONS = words(`
    DATEADD DATEDIFF DATEDIFF_BIG DATEPART DATENAME DATETRUNC DATE_BUCKET DATE_TRUNC TIMESTAMPADD
    TIMESTAMPDIFF TIMEADD TIMEDIFF TIMESTAMP_TRUNC
`);

/** Date part names those functions take; a first argument outside this list is read as a column. */
export const DATE_PART_NAMES = words(`
    YEAR YEARS YY YYYY YYY YR YRS Y QUARTER QUARTERS QQ Q QTR QTRS MONTH MONTHS MM M MON MONS DAYOFYEAR DY
    DAY DAYS DD D DAYOFMONTH DAYOFWEEK DAYOFWEEKISO WEEK WEEKS WK WW W WEEKDAY DW WEEKOFYEAR WOY WY ISO_WEEK
    ISOWK ISOWW HOUR HOURS HH H HR HRS MINUTE MINUTES MI N MIN MINS SECOND SECONDS SS S SEC SECS MILLISECOND
    MILLISECONDS MS MSEC MICROSECOND MICROSECONDS MCS US USEC NANOSECOND NANOSECONDS NS NSEC TZOFFSET TZ
    EPOCH SQL_TSI_DAY SQL_TSI_HOUR SQL_TSI_MINUTE SQL_TSI_SECOND SQL_TSI_MONTH SQL_TSI_YEAR SQL_TSI_WEEK
`);

/** Functions whose first argument is a type (`CONVERT(INT, x)`). */
export const TYPE_FIRST_FUNCTIONS = words('CONVERT TRY_CONVERT');

/** Words that continue a type name after its first word. */
export const TYPE_CONTINUATION_WORDS = words('VARYING PRECISION WITH WITHOUT TIME ZONE UNSIGNED SIGNED');

/** Type names the MySQL form `CONVERT(x, type)` takes. */
export const CONVERT_TARGET_TYPES = words('SIGNED UNSIGNED CHAR NCHAR DATE DATETIME TIME DECIMAL BINARY JSON DOUBLE FLOAT REAL INTEGER INT');

/** Units written after an `INTERVAL` value (`INTERVAL 1 DAY`). */
export const INTERVAL_UNITS = words(`
    YEAR YEARS QUARTER MONTH MONTHS WEEK WEEKS DAY DAYS HOUR HOURS MINUTE MINUTES SECOND SECONDS
    MILLISECOND MICROSECOND
`);

/** Words that open a statement, mapped to the kind of statement. */
export const STATEMENT_KEYWORDS: ReadonlyMap<string, SqlStatementKind> = new Map<string, SqlStatementKind>([
    ['SELECT', 'Select'], ['WITH', 'Select'], ['VALUES', 'Select'], ['TABLE', 'Select'],
    ['INSERT', 'Insert'], ['UPDATE', 'Update'], ['DELETE', 'Delete'], ['MERGE', 'Merge'],
    ['EXEC', 'Execute'], ['EXECUTE', 'Execute'], ['CALL', 'Call'], ['DECLARE', 'Declare'], ['SET', 'Set'],
    ['CREATE', 'Create'], ['ALTER', 'Alter'], ['DROP', 'Drop'], ['TRUNCATE', 'Truncate'], ['GRANT', 'Grant'],
    ['REVOKE', 'Revoke'], ['DENY', 'Deny'], ['USE', 'Use'],
]);

/** Statement kinds whose statement ends at the next statement keyword when no `;` ends it (T-SQL). */
export const SHORT_STATEMENT_KINDS: ReadonlySet<SqlStatementKind> = new Set<SqlStatementKind>(['Declare', 'Set', 'Execute', 'Use']);

/** Words that may open the next statement when no `;` ends the previous one. */
export const NEXT_STATEMENT_WORDS = words('SELECT INSERT UPDATE DELETE MERGE EXEC EXECUTE DECLARE SET');

/** Words after `FOR` that make it a query-level clause, mapped to the clause form. */
export const FOR_CLAUSE_FORMS: ReadonlyMap<string, ForClauseForm> = new Map<string, ForClauseForm>([
    ['JSON', 'Json'], ['XML', 'Xml'], ['BROWSE', 'Browse'], ['UPDATE', 'Update'], ['SHARE', 'Share'],
    ['NO', 'NoKeyUpdate'], ['KEY', 'KeyShare'], ['READ', 'ReadOnly'],
]);

/** T-SQL join hints written between the join kind and `JOIN`. */
export const JOIN_HINTS = words('HASH LOOP MERGE REMOTE');

/** Functions that turn a whole row into one value when given a source name or `alias.*`. */
export const ROW_VALUE_FUNCTIONS = words(`
    ROW_TO_JSON TO_JSON TO_JSONB JSON_AGG JSONB_AGG HSTORE ROW ARRAY_AGG TO_JSON_STRING OBJECT_CONSTRUCT
`);

/** Functions whose `*` argument does not read any column. */
export const COUNT_FUNCTIONS = words('COUNT COUNT_BIG');
