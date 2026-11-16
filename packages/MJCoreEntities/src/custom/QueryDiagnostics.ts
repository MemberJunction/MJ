/**
 * The text form of a query diagnostic, shared by the server that writes it and the clients that
 * read it back.
 *
 * A query save that breaks a save-time rule is refused with one line per finding, and a query's
 * `ExtractionMessage` records the findings of its last extraction the same way. Each finding is a
 * line of the form
 *
 * ```text
 * MJQ_UNFILTERED_VALUE at line 3, column 14: The value of "Region" is written without a filter. Fix: Add | sqlString.
 * ```
 *
 * The code, the location and the fix are optional: a line without a code is a plain message. The
 * format is plain text so that it reads well in a CLI, a log and a notification as well as in a UI
 * that lays it out.
 */

/** One finding about a query's SQL, as a UI shows it. */
export interface QueryDiagnosticLine {
    /** A stable code such as `MJQ_UNFILTERED_VALUE`; `null` for a plain message. */
    readonly Code: string | null;
    /** 1-based line in the SQL the finding is about; `null` when the finding has no location. */
    readonly Line: number | null;
    /** 1-based column in that line; `null` when the finding has no location. */
    readonly Column: number | null;
    /** What is wrong. */
    readonly Message: string;
    /** How to fix it; `null` when there is nothing specific to suggest. */
    readonly FixHint: string | null;
}

/** A refused save's message, split into its headline and its findings. */
export interface QuerySaveMessage {
    /** The first line when it introduces the findings (`Query "X" was not saved:`); otherwise `null`. */
    readonly Headline: string | null;
    readonly Diagnostics: readonly QueryDiagnosticLine[];
}

/** The parts {@link FormatQueryDiagnostic} writes. */
export interface QueryDiagnosticParts {
    readonly Code: string;
    readonly Message: string;
    readonly FixHint?: string | null;
    readonly Line?: number | null;
    readonly Column?: number | null;
}

const FIX_SEPARATOR = ' Fix: ';
const DIAGNOSTIC_LINE = /^([A-Z][A-Z0-9_]*)(?: at line (\d+), column (\d+))?: (.*)$/;
const HEADLINE = /:\s*$/;

/** Writes one diagnostic as a single line: code, location (when known), message and fix. */
export function FormatQueryDiagnostic(parts: QueryDiagnosticParts): string {
    const location = parts.Line != null && parts.Column != null ? ` at line ${parts.Line}, column ${parts.Column}` : '';
    const fix = parts.FixHint ? `${FIX_SEPARATOR}${parts.FixHint}` : '';
    return `${parts.Code}${location}: ${parts.Message}${fix}`;
}

/**
 * The 1-based line and column of a UTF-16 offset in `text`. An offset past the end is clamped to
 * the end; `\r\n`, `\n` and `\r` each end a line.
 */
export function QueryTextPosition(text: string, offset: number): { Line: number; Column: number } {
    const end = Math.max(0, Math.min(offset, text.length));
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < end; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 10 || (ch === 13 && text.charCodeAt(i + 1) !== 10)) {
            line++;
            lineStart = i + 1;
        }
    }
    return { Line: line, Column: end - lineStart + 1 };
}

/** Reads one line written by {@link FormatQueryDiagnostic}; any other text is a plain message. */
export function ParseQueryDiagnostic(text: string): QueryDiagnosticLine {
    const trimmed = text.trim();
    const match = DIAGNOSTIC_LINE.exec(trimmed);
    if (!match) return { Code: null, Line: null, Column: null, Message: trimmed, FixHint: null };
    const rest = match[4];
    const fixAt = rest.lastIndexOf(FIX_SEPARATOR);
    return {
        Code: match[1],
        Line: match[2] ? Number(match[2]) : null,
        Column: match[3] ? Number(match[3]) : null,
        Message: fixAt >= 0 ? rest.slice(0, fixAt) : rest,
        FixHint: fixAt >= 0 ? rest.slice(fixAt + FIX_SEPARATOR.length) : null,
    };
}

/** Reads every non-empty line of a diagnostics text, such as a query's `ExtractionMessage`. */
export function ParseQueryDiagnostics(text: string | null | undefined): QueryDiagnosticLine[] {
    if (!text) return [];
    return text.split(/\r?\n/).filter(l => l.trim().length > 0).map(ParseQueryDiagnostic);
}

/**
 * Reads the message of a refused query save. The first line is the headline when it ends with a
 * colon and more lines follow; every other line is a finding. A message with no findings at all
 * (a generic failure) comes back as one plain-message finding, so the reason is never lost.
 */
export function ParseQuerySaveMessage(text: string | null | undefined): QuerySaveMessage {
    const lines = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return { Headline: null, Diagnostics: [] };
    // The server can prefix the refusal with its own wording, so the headline is found, not assumed first.
    const headlineAt = lines.findIndex((l, i) => i < lines.length - 1 && HEADLINE.test(l) && !DIAGNOSTIC_LINE.test(l));
    const headline = headlineAt >= 0 ? lines[headlineAt] : null;
    const rest = headlineAt >= 0 ? lines.slice(headlineAt + 1) : lines;
    return { Headline: headline, Diagnostics: rest.map(ParseQueryDiagnostic) };
}

/** Whether a save message carries at least one coded finding (a rule the SQL broke). */
export function HasQueryRuleDiagnostics(text: string | null | undefined): boolean {
    return ParseQuerySaveMessage(text).Diagnostics.some(d => d.Code !== null);
}
