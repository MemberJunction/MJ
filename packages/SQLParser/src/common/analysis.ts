/**
 * Result and diagnostic shapes shared by every analysis in this package: the token stream, the
 * MJ Query template and the SQL document all report what they found the same way.
 */

/** A range of the input text, as UTF-16 code-unit offsets: `Start` inclusive, `End` exclusive. */
export interface Span {
    readonly Start: number;
    readonly End: number;
}

/**
 * How serious a diagnostic is.
 *
 * - `Error`: the text breaks a rule; saving a new or edited query refuses it.
 * - `Warning`: the text works but is risky or unclear; it is reported, never refused.
 * - `Info`: a note for the author.
 */
export type DiagnosticSeverity = 'Error' | 'Warning' | 'Info';

/** One finding about the input, with a stable code that tools and tests can match on. */
export interface Diagnostic {
    /** A stable identifier, such as `MJQ_UNFILTERED_VALUE`. Codes never change meaning. */
    readonly Code: string;
    readonly Severity: DiagnosticSeverity;
    /** The part of the input the finding is about. */
    readonly Span: Span;
    /** What is wrong, in a sentence a query author can act on. */
    readonly Message: string;
    /** How to fix it, or `null` when there is nothing specific to suggest. */
    readonly FixHint: string | null;
}

/**
 * The result of one analysis.
 *
 * `Complete` is `false` when part of the input could not be read (an unsupported construct, an
 * unclosed tag), so `Value` may be missing something. An analysis never answers "nothing found"
 * when it really means "could not tell": it returns what it found and says it is incomplete.
 */
export interface Analysis<T> {
    readonly Value: T;
    readonly Complete: boolean;
    readonly Diagnostics: readonly Diagnostic[];
}

/** Builds a {@link Diagnostic}. */
export function MakeDiagnostic(
    code: string,
    severity: DiagnosticSeverity,
    span: Span,
    message: string,
    fixHint: string | null = null,
): Diagnostic {
    return { Code: code, Severity: severity, Span: { Start: span.Start, End: span.End }, Message: message, FixHint: fixHint };
}

/** Builds a {@link Span}. */
export function MakeSpan(start: number, end: number): Span {
    return { Start: start, End: end };
}

/** Whether `inner` lies entirely inside `outer`. */
export function SpanContains(outer: Span, inner: Span): boolean {
    return inner.Start >= outer.Start && inner.End <= outer.End;
}
