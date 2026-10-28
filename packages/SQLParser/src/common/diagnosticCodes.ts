/**
 * Every diagnostic code the MJ Query language reports, with the rule it stands for. Codes are
 * stable: a code is never renamed or reused for another rule. `guides/MJ_QUERY_LANGUAGE.md`
 * documents each one with an example and its fix.
 */
export const MJQueryDiagnosticCodes = {
    // Lexing
    /** A `{{`, `{%` or `{#` with no closing `}}`, `%}` or `#}`. */
    UnclosedTag: 'MJQ_UNCLOSED_TAG',
    /** A template tag inside a SQL string literal. */
    TagInStringLiteral: 'MJQ_TAG_IN_STRING_LITERAL',
    /** A template tag inside a SQL quoted identifier. */
    TagInQuotedIdentifier: 'MJQ_TAG_IN_QUOTED_IDENTIFIER',
    /** Info: a template tag inside a SQL comment, which is inert (comments are removed before rendering). */
    ExpressionInComment: 'MJQ_EXPRESSION_IN_COMMENT',

    // Template structure
    /** An `{% if %}` or `{% for %}` with no `{% endif %}` / `{% endfor %}`. */
    UnclosedBlock: 'MJQ_UNCLOSED_BLOCK',
    /** An `{% elif %}`, `{% else %}`, `{% endif %}` or `{% endfor %}` with no block to belong to. */
    UnexpectedTag: 'MJQ_UNEXPECTED_TAG',
    /** A tag body that does not parse. */
    Syntax: 'MJQ_SYNTAX',
    /** A block tag outside the allow-list (`macro`, `include`, `import`, `extends`, `block`, `call`, `filter`, `raw`, …). */
    UnsupportedTag: 'MJQ_UNSUPPORTED_TAG',
    /** A function or method call in an expression. */
    FunctionCall: 'MJQ_FUNCTION_CALL',
    /** A subscript (`x[0]`, `x['k']`) in an expression. */
    Subscript: 'MJQ_SUBSCRIPT',
    /** An inline `a if b else c` expression. */
    InlineIf: 'MJQ_INLINE_IF',
    /** Attribute access other than `Context.<Token>` and `loop.<member>`. */
    MemberAccess: 'MJQ_MEMBER_ACCESS',
    /** An operator outside the grammar (`in`, `is`, `~`, `**`, `//`, list or object literals). */
    UnsupportedOperator: 'MJQ_UNSUPPORTED_OPERATOR',
    /** An operator inside a `{{ }}` hole. */
    ArithmeticInHole: 'MJQ_ARITHMETIC_IN_HOLE',
    /** A `{{ }}` hole that does not start from a parameter, a `Context` token or a loop value. */
    HoleNotAValue: 'MJQ_HOLE_NOT_A_VALUE',
    /** A filter that is not one of the MJ SQL filters or `default`. */
    UnknownFilter: 'MJQ_UNKNOWN_FILTER',
    /** A `default(…)` whose argument is not a literal. */
    DefaultNotLiteral: 'MJQ_DEFAULT_NOT_LITERAL',
    /** `loop.<member>` outside a `{% for %}` body, or an unknown loop member. */
    LoopOutsideFor: 'MJQ_LOOP_OUTSIDE_FOR',
    /** A `{% for %}` whose iterable is not an array parameter, or that has an unsupported shape. */
    ForIterable: 'MJQ_FOR_ITERABLE',

    // Values and types
    /** A string, array or date value written into the SQL without an MJ SQL filter. */
    UnfilteredValue: 'MJQ_UNFILTERED_VALUE',
    /** A value written without a filter whose type is not known. */
    UnfilteredUntyped: 'MJQ_UNFILTERED_UNTYPED',
    /** A `Context.<Token>` that is not one of the defined tokens. */
    UnknownContextToken: 'MJQ_UNKNOWN_CONTEXT_TOKEN',
    /** A SQL filter that does not fit the parameter's declared type. */
    FilterTypeMismatch: 'MJQ_FILTER_TYPE_MISMATCH',
    /** Two uses of one parameter imply different types. */
    ParameterTypeConflict: 'MJQ_PARAMETER_TYPE_CONFLICT',

    // Composition
    /** A `{{query:"…"}}` token whose path or argument list does not parse. */
    CompositionMalformed: 'MJQ_COMPOSITION_MALFORMED',
    /** A composition outside a FROM / JOIN / comma table-source position. */
    CompositionPosition: 'MJQ_COMPOSITION_POSITION',
    /** The composed query does not exist at that full path. */
    CompositionNotFound: 'MJQ_COMPOSITION_NOT_FOUND',
    /**
     * The path names the composed query by part of its category path (a whole-segment suffix of
     * exactly one query's). It runs, with a warning; save refuses it.
     */
    CompositionPartialPath: 'MJQ_COMPOSITION_PARTIAL_PATH',
    /** The composed query is not marked Reusable. */
    CompositionNotReusable: 'MJQ_COMPOSITION_NOT_REUSABLE',
    /** A required parameter of the composed query is not passed. */
    CompositionMissingArgument: 'MJQ_COMPOSITION_MISSING_ARGUMENT',
    /** An unpassed parameter of the composed query has the same name as an outer parameter. */
    CompositionImplicitArgument: 'MJQ_COMPOSITION_IMPLICIT_ARGUMENT',
    /** An argument name the composed query does not declare. */
    CompositionUnknownArgument: 'MJQ_COMPOSITION_UNKNOWN_ARGUMENT',
    /** The same argument passed twice. */
    CompositionDuplicateArgument: 'MJQ_COMPOSITION_DUPLICATE_ARGUMENT',
    /** Compositions that lead back to a query already being composed. */
    CompositionCycle: 'MJQ_COMPOSITION_CYCLE',
    /** No resolver was supplied, so the composed queries were not checked. */
    CompositionUnchecked: 'MJQ_COMPOSITION_UNCHECKED',

    // Doc comments
    /** An `@tag` in a `{# #}` doc comment other than `@param` and `@field`. */
    DocUnknownTag: 'MJQ_DOC_UNKNOWN_TAG',
    /** An `@param` or `@field` with no name. */
    DocMissingName: 'MJQ_DOC_MISSING_NAME',
    /** Two descriptions for the same parameter or field. */
    DocDuplicate: 'MJQ_DOC_DUPLICATE',
    /** An `@param` naming something that is not a parameter of the query. */
    DocUnknownParameter: 'MJQ_DOC_UNKNOWN_PARAMETER',
    /** A `--:` comment that cannot be attached to exactly one select item. */
    DocTrailingAmbiguous: 'MJQ_DOC_TRAILING_AMBIGUOUS',
} as const;

/** One of the {@link MJQueryDiagnosticCodes}. */
export type MJQueryDiagnosticCode = typeof MJQueryDiagnosticCodes[keyof typeof MJQueryDiagnosticCodes];
