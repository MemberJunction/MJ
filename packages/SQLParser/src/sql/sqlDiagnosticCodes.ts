/**
 * The diagnostic codes a {@link SqlDocument} and its edits report. Codes are stable: a code is
 * never renamed or reused for another finding.
 */
export const SqlDocumentDiagnosticCodes = {
    /** A `(` with no matching `)`, or a `)` with no matching `(`. */
    UnbalancedParenthesis: 'SQL_UNBALANCED_PARENTHESIS',
    /** A clause, source or statement the parser does not recognise; it is kept as an Unknown node. */
    UnknownSyntax: 'SQL_UNKNOWN_SYNTAX',
    /** A clause or list with nothing where something must be: `WHERE` with no condition, `FROM` with no source, a trailing comma. */
    EmptyClause: 'SQL_EMPTY_CLAUSE',
    /** Text after a complete query that belongs to no clause. */
    UnexpectedToken: 'SQL_UNEXPECTED_TOKEN',
    /** A statement or nested body that is not a query (`INSERT`, `EXEC`, `DELETE … RETURNING`); it is kept whole. */
    NotAQuery: 'SQL_NOT_A_QUERY',
    /** A template tag in text read as SQL; it is read as an opaque value. */
    TemplateToken: 'SQL_TEMPLATE_TOKEN',
    /** A construct the dialect does not have, such as `TOP` in PostgreSQL. */
    NotInDialect: 'SQL_NOT_IN_DIALECT',
    /** Queries nested deeper than the parser follows; the inner part is kept as an Unknown node. */
    NestingTooDeep: 'SQL_NESTING_TOO_DEEP',
    /** A transform that does not apply to this statement; the text is returned unchanged. */
    TransformNotApplicable: 'SQL_TRANSFORM_NOT_APPLICABLE',
} as const;

/** One of the {@link SqlDocumentDiagnosticCodes}. */
export type SqlDocumentDiagnosticCode = typeof SqlDocumentDiagnosticCodes[keyof typeof SqlDocumentDiagnosticCodes];
