import type { Span } from '../common/analysis.js';

/**
 * Kinds of token in a {@link SqlTokens} stream.
 *
 * - `Word`: a bare keyword or identifier (`SELECT`, `Name`, `@p`, `#temp`).
 * - `QuotedIdentifier`: `"…"`, `[…]` or `` `…` ``, by the dialect's quoting forms.
 * - `String`: a string literal in any of the dialect's forms (`'…'`, `N'…'`, `E'…'`, `$tag$…$tag$`, `q'[…]'`).
 * - `Number`: a numeric literal.
 * - `Operator`: any other single character (`=`, `<`, `+`, `*`, `:`, …).
 * - `Punctuation`: `(`, `)`, `,`, `;` and `.`.
 * - `Whitespace` and `Comment`: text that carries no meaning to the database.
 * - `TemplateExpression`: a `{{ … }}` tag, including a composition `{{query:"…"}}`.
 * - `TemplateBlock`: a `{% … %}` tag.
 * - `TemplateComment`: a `{# … #}` tag.
 * - `Unknown`: text the lexer could not read, such as a template opener with no closer.
 *
 * Consumers must treat any kind they do not recognise as opaque: kinds may be added.
 */
export type SqlTokenKind =
    | 'Word'
    | 'QuotedIdentifier'
    | 'String'
    | 'Number'
    | 'Operator'
    | 'Punctuation'
    | 'Whitespace'
    | 'Comment'
    | 'TemplateExpression'
    | 'TemplateBlock'
    | 'TemplateComment'
    | 'Unknown';

/**
 * Where in the SQL a template tag sits, read as if the tag were not there.
 *
 * - `Code`: between SQL tokens, where a value, keyword or name can go.
 * - `StringLiteral`: inside a string literal (`'%{{ x }}%'`).
 * - `QuotedIdentifier`: inside a quoted identifier (`[{{ x }}]`).
 * - `Comment`: inside a SQL comment (`-- {{ x }}`).
 */
export type TemplateSqlContext = 'Code' | 'StringLiteral' | 'QuotedIdentifier' | 'Comment';

/** The three template tag forms. */
export type TemplateTagForm = 'Expression' | 'Block' | 'Comment';

/** The parts of one template tag. */
export interface TemplateTagInfo {
    readonly Form: TemplateTagForm;
    /** The tag's text between its delimiters and whitespace-control dashes. */
    readonly Body: string;
    /** Where {@link Body} sits in the input. */
    readonly BodySpan: Span;
    /** Whether the opener is `{{-`, `{%-` or `{#-`: whitespace before the tag is removed when it renders. */
    readonly TrimBefore: boolean;
    /** Whether the closer is `-}}`, `-%}` or `-#}`: whitespace after the tag is removed when it renders. */
    readonly TrimAfter: boolean;
    /** Where the tag sits in the SQL. */
    readonly SqlContext: TemplateSqlContext;
}

/** One token, covering its exact range of the input. */
export interface SqlToken {
    readonly Kind: SqlTokenKind;
    /** The token's text exactly as it appears in the input. */
    readonly Text: string;
    readonly Span: Span;
    /**
     * Parenthesis depth the token sits at. A `(` carries the depth outside it and a `)` the depth
     * outside the parenthesis it closes, so both match the text around them.
     */
    readonly Depth: number;
    /**
     * Whether this token is part of a SQL string literal, quoted identifier or comment that a
     * template tag interrupts. Such a literal is split into pieces around each tag; every piece
     * carries `true`, and {@link Enclosing} gives the literal's full extent.
     */
    readonly ContainsTemplate: boolean;
    /** The full extent of the literal, identifier or comment this piece belongs to; `null` when not split. */
    readonly Enclosing: Span | null;
    /** The tag's parts, for the three template kinds; `null` for SQL tokens. */
    readonly Template: TemplateTagInfo | null;
}
