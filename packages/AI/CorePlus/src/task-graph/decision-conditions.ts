/**
 * @fileoverview Reading the `decisions` root out of a condition, without evaluating it.
 *
 * Two readers need the same answer to "which decisions does this condition read?", at two different
 * times. The validator asks at SUBMIT, to refuse a reference to a Decision step or question that does
 * not exist and to check that a Choice fork has a path for every option. The dispatcher asks at RUN
 * time, to hold an edge whose judgment is not settled rather than let it read as `false`. One scanner
 * serves both, so what the door accepts is exactly what the gate can check.
 *
 * Textual, like `UnknownConditionRoots`, and for the same reason: this package does not parse
 * JavaScript. The grammar it accepts is deliberately narrow — the root, then two segments written as
 * `.name` or `['name']` — and anything else that touches `decisions` is reported as malformed rather
 * than guessed at, so the validator refuses it and the gate holds on it. It is read by hand, in time
 * linear in the condition's length, because a condition is author input (see the scanner below).
 *
 * The same grammar rewrites the step names in a condition ({@link RewriteDecisionReferences}): a flow
 * names a Decision step by its key and a compiled graph by its step ID, so a condition crossing
 * between the two must still name the step it named. It also writes and rewrites conditions for an
 * editor — a reference ({@link DecisionReferenceText}), an option literal
 * ({@link DecisionConditionLiteral}), and a renamed question or option
 * ({@link RewriteDecisionQuestionReferences}, {@link RewriteDecisionChoiceValues}) — so what an
 * editor writes is exactly what this scanner reads back.
 *
 * Two more readers serve the validator only: every comparison of a Choice `value` with a literal, so
 * a misspelled option is refused on any edge, and every read of `decisions` as a PROPERTY of another
 * root (`payload.decisions`), which is a copy no hold applies to.
 *
 * @module @memberjunction/ai-core-plus
 */

/** One `decisions.<step>.<question>` reference in a condition. */
export type DecisionReference = {
    /** The Decision step's `tempId`. */
    NodeId: string;
    /** The question key on that step. */
    QuestionKey: string;
    /** The answer field read, when the reference goes that deep (`value`, `probability`, ...). */
    Field?: string;
};

/** Everything a condition reads from the `decisions` root. */
export type DecisionReferenceScan = {
    References: DecisionReference[];
    /**
     * Uses of `decisions` that do not name a step AND a question — `decisions`, `decisions.triage`,
     * `decisions[key]`. Nothing can say which answer they read, so none of them can be checked.
     */
    Malformed: string[];
};

/** A condition with the step names in its `decisions` references rewritten. */
export type DecisionReferenceRewrite = {
    /** The condition, with every reference `rename` could map rewritten and everything else as written. */
    Expression: string;
    /** Step names `rename` could not map, each once, in the order they appear. Their references are left as written. */
    Unknown: string[];
};

/**
 * A condition that tests one Choice answer against literal options:
 * `decisions.triage.intent.value === 'billing' || decisions.triage.intent.value === 'refund'`.
 */
export type DecisionChoiceTest = {
    NodeId: string;
    QuestionKey: string;
    /** The option values the condition accepts. */
    Values: string[];
};

/**
 * A comparison of one answer's `value` with a string literal, anywhere in a condition:
 * `decisions.triage.intent.value !== 'billing'`, or `'refund' == decisions.triage.intent.value`.
 */
export type DecisionValueComparison = {
    NodeId: string;
    QuestionKey: string;
    /** The literal as the evaluator reads it, with its escapes resolved. */
    Value: string;
};

const ROOT = 'decisions';

/** The root as an identifier: not a property (`x.decisions`) and not part of a longer name. */
const ROOT_PATTERN = /(?<![A-Za-z0-9_$.])decisions(?![A-Za-z0-9_$])/g;

/** A name that can follow a dot. Anything else is written in brackets. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Characters no literal can carry verbatim: the scanner compares a literal's raw text, escapes included. */
const UNQUOTABLE = /[\\\r\n\u2028\u2029]/;

/** One path segment of a reference, where it sits, and how it was written. */
type PathSegment = {
    Name: string;
    Start: number;
    End: number;
    /** The segment as written, including any whitespace before it. */
    Text: string;
    /** The quote a bracket segment used, or `null` for `.name`. */
    Quote: '\'' | '"' | null;
};

/**
 * How far back {@link DecisionsReadAsProperty} looks for the chain a property read hangs off. A
 * condition is short; this only bounds the message for one that is not.
 */
const CHAIN_WINDOW = 200;

/**
 * Every `decisions` reference in a condition, and every use of the root that is not one.
 *
 * Text inside string literals is ignored, so `payload.note === 'see decisions.x'` reads nothing.
 */
export function DecisionReferencesIn(expression: string): DecisionReferenceScan {
    const scan: DecisionReferenceScan = { References: [], Malformed: [] };
    if (!expression) return scan;

    const strings = stringSpans(expression);
    for (const match of expression.matchAll(ROOT_PATTERN)) {
        const start = match.index ?? 0;
        if (insideString(strings, start)) continue;

        const path = readSegments(expression, start + ROOT.length, 3);
        const [nodeId, questionKey, field] = path.Segments;
        if (!nodeId || !questionKey) {
            scan.Malformed.push(expression.slice(start, path.End).trim() || ROOT);
            continue;
        }
        scan.References.push({ NodeId: nodeId, QuestionKey: questionKey, Field: field });
    }
    return scan;
}

/**
 * The Choice test a condition is, or `null` when it is anything else.
 *
 * Recognizes one shape: a disjunction (`||`) of equalities between one question's
 * `decisions.<step>.<question>.value` and a string literal, in either order, with any parentheses.
 * Anything else — another operator, another field, a second question, a non-literal — is not a
 * Choice test, and a fork containing one is not checked for exhaustiveness.
 */
export function DecisionChoiceTestOf(expression: string): DecisionChoiceTest | null {
    const terms = splitTopLevelOr(expression ?? '');
    if (!terms) return null;

    let test: DecisionChoiceTest | null = null;
    for (const term of terms) {
        const equality = parseChoiceEquality(stripOuterParens(term));
        if (!equality) return null;
        if (test && (test.NodeId !== equality.NodeId || test.QuestionKey !== equality.QuestionKey)) return null;
        test = test ?? { NodeId: equality.NodeId, QuestionKey: equality.QuestionKey, Values: [] };
        test.Values.push(equality.Value);
    }
    return test;
}

/**
 * Rewrites the step name in every `decisions.<step>.<question>` reference a condition makes.
 *
 * The grammar is {@link DecisionReferencesIn}'s: text inside string literals is left alone, a
 * property named `decisions` (`payload.decisions`) is not the root, and `.step`, `?.step` and
 * `['step']` are all read. Only references that name a step AND a question are rewritten; a malformed
 * use stays as written, for the validator or the hold to report.
 *
 * A rewritten name keeps its reference's form where it can: `.triage` stays a dot when the new name
 * can follow a dot, and becomes `['<name>']` when it cannot (a step ID); `?.` is kept either way.
 *
 * @param condition the condition to rewrite
 * @param rename    maps a step name to its new name, or `undefined` when it has none
 * @returns the rewritten condition, and every step name `rename` could not map
 */
export function RewriteDecisionReferences(
    condition: string,
    rename: (key: string) => string | undefined,
): DecisionReferenceRewrite {
    const rewrite: DecisionReferenceRewrite = { Expression: condition, Unknown: [] };
    if (!condition) return rewrite;

    const edits: TextEdit[] = [];
    for (const start of rootsIn(condition)) {
        const segment = stepSegmentAt(condition, start + ROOT.length);
        if (!segment) continue;
        const renamed = rename(segment.Name);
        if (renamed === undefined) {
            if (!rewrite.Unknown.includes(segment.Name)) rewrite.Unknown.push(segment.Name);
            continue;
        }
        edits.push({ Start: segment.Start, End: segment.End, Text: formatSegment(segment, renamed) });
    }
    rewrite.Expression = applyEdits(condition, edits);
    return rewrite;
}

/**
 * Rewrites the question name in every `decisions.<step>.<question>` reference to one step.
 *
 * {@link RewriteDecisionReferences} renames a step; this renames one of its questions, in the same
 * grammar and keeping each reference's form the same way: `.intent` stays a dot when the new name
 * can follow one, and becomes `['<name>']` when it cannot. References to other steps, malformed uses
 * and text inside string literals are left as written.
 *
 * @param condition the condition to rewrite
 * @param step      the step whose question is renamed, as the condition names it (a flow's step key)
 * @param rename    maps a question key to its new key, or `undefined` to leave it
 * @returns the rewritten condition
 */
export function RewriteDecisionQuestionReferences(
    condition: string,
    step: string,
    rename: (questionKey: string) => string | undefined,
): string {
    if (!condition) return condition;

    const edits: TextEdit[] = [];
    for (const start of rootsIn(condition)) {
        const [stepSegment, questionSegment] = pathSegmentsAt(condition, start + ROOT.length, 2);
        if (!stepSegment?.Name || !questionSegment?.Name || stepSegment.Name !== step) continue;
        const renamed = rename(questionSegment.Name);
        if (renamed === undefined || renamed === questionSegment.Name) continue;
        edits.push({ Start: questionSegment.Start, End: questionSegment.End, Text: formatSegment(questionSegment, renamed) });
    }
    return applyEdits(condition, edits);
}

/**
 * Rewrites the option values a condition compares one Choice question's answer with.
 *
 * Reads the comparisons {@link DecisionChoiceTestOf} recognizes, wherever they sit in a condition:
 * `decisions.<step>.<question>.value` against a string literal by `===`, `==`, `!==` or `!=`, with the
 * literal on either side. A literal is matched by its raw text, as the Choice test and the fork check
 * read it, and written back with {@link DecisionConditionLiteral}; a new value no literal can carry
 * verbatim leaves its literal as written. Other reads of the answer — `probabilities.<value>`, a
 * literal passed to a function — are not comparisons of `value` and are left alone.
 *
 * @param condition the condition to rewrite
 * @param step      the step whose answer is compared, as the condition names it (a flow's step key)
 * @param question  the Choice question's key
 * @param rename    maps an option value to its new value, or `undefined` to leave it
 * @returns the rewritten condition
 */
export function RewriteDecisionChoiceValues(
    condition: string,
    step: string,
    question: string,
    rename: (value: string) => string | undefined,
): string {
    if (!condition) return condition;

    const strings = stringSpans(condition);
    const edits: TextEdit[] = [];
    for (const start of rootsIn(condition, strings)) {
        const [stepSegment, questionSegment, field] = pathSegmentsAt(condition, start + ROOT.length, 3);
        if (stepSegment?.Name !== step || questionSegment?.Name !== question || field?.Name !== 'value') continue;

        const literal = comparedLiteral(condition, start, field.End, strings);
        if (!literal) continue;
        const renamed = rename(literal.Value);
        const text = renamed === undefined || renamed === literal.Value ? null : DecisionConditionLiteral(renamed);
        if (text !== null) edits.push({ Start: literal.Start, End: literal.End, Text: text });
    }
    return applyEdits(condition, edits);
}

/**
 * Writes `decisions.<step>.<question>.<field>` so that {@link DecisionReferencesIn} reads back exactly
 * those names, or returns `null` when one of them cannot be written that way.
 *
 * A name that can follow a dot is written `.name`; any other is written `['name']`, quoted as
 * {@link DecisionConditionLiteral} quotes a value. An empty name has no reference at all.
 */
export function DecisionReferenceText(step: string, question: string, field: string): string | null {
    const segments = [step, question, field].map(writeSegment);
    return segments.every((segment): segment is string => segment !== null) ? ROOT + segments.join('') : null;
}

/**
 * A string literal for `value`, written so the condition grammar reads back exactly `value`, or
 * `null` when no literal can be.
 *
 * The grammar compares a literal's raw text — {@link DecisionChoiceTestOf}, and through it the
 * exhaustiveness check — so an escape would be read back with its backslash and never match the
 * option it was meant to name. A value is therefore quoted with whichever quote it does not contain,
 * and a value holding both quotes, a backslash or a line break has no literal that reads back.
 */
export function DecisionConditionLiteral(value: string): string | null {
    if (UNQUOTABLE.test(value)) return null;
    if (!value.includes('\'')) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    return null;
}

/** One replacement of the text in `[Start, End)`. */
type TextEdit = { Start: number; End: number; Text: string };

/** The condition with every edit applied. Edits must not overlap. */
function applyEdits(expression: string, edits: readonly TextEdit[]): string {
    if (edits.length === 0) return expression;
    const parts: string[] = [];
    let copied = 0;
    for (const edit of [...edits].sort((a, b) => a.Start - b.Start)) {
        parts.push(expression.slice(copied, edit.Start), edit.Text);
        copied = edit.End;
    }
    parts.push(expression.slice(copied));
    return parts.join('');
}

/** Where each use of the `decisions` root starts, outside string literals. */
function rootsIn(expression: string, strings: ReadonlyArray<[number, number]> = stringSpans(expression)): number[] {
    return [...expression.matchAll(ROOT_PATTERN)]
        .map((match) => match.index ?? 0)
        .filter((start) => !insideString(strings, start));
}

/**
 * The string literal compared with the reference spanning `[start, end)`, on either side of an
 * equality or inequality, or `null` when it is compared with anything else.
 */
function comparedLiteral(
    expression: string,
    start: number,
    end: number,
    strings: ReadonlyArray<[number, number]>,
): { Start: number; End: number; Value: string } | null {
    const span = literalRightAfter(expression, end, strings) ?? literalRightBefore(expression, start, strings);
    return span ? { Start: span[0], End: span[1], Value: expression.slice(span[0] + 1, span[1] - 1) } : null;
}

/** The string literal that opens right after an equality or inequality following `end`, or `undefined`. */
function literalRightAfter(expression: string, end: number, strings: ReadonlyArray<[number, number]>): [number, number] | undefined {
    const operatorEnd = operatorEndAt(expression, skipSpaces(expression, end), COMPARISONS);
    if (operatorEnd < 0) return undefined;
    const open = skipSpaces(expression, operatorEnd);
    const span = strings[firstSpanEndingAfter(strings, open)];
    return span?.[0] === open ? span : undefined;
}

/**
 * The last string literal before `start` when nothing but an equality or inequality, and whitespace,
 * separates the two; or `undefined`.
 */
function literalRightBefore(expression: string, start: number, strings: ReadonlyArray<[number, number]>): [number, number] | undefined {
    const span = strings[firstSpanEndingAfter(strings, start) - 1];
    if (!span) return undefined;
    const operatorStart = operatorStartBefore(expression, skipSpacesBack(expression, start));
    return operatorStart >= span[1] && skipSpacesBack(expression, operatorStart) === span[1] ? span : undefined;
}

/** One name as a path segment the scanner reads back, or `null` when none can carry it. */
function writeSegment(name: string): string | null {
    if (!name) return null;
    if (IDENTIFIER.test(name)) return `.${name}`;
    const literal = DecisionConditionLiteral(name);
    return literal === null ? null : `[${literal}]`;
}

/** The step segment of a reference that also names a question, or `null` for a malformed use. */
function stepSegmentAt(expression: string, from: number): PathSegment | null {
    const [step, question] = pathSegmentsAt(expression, from, 2);
    return step?.Name && question?.Name ? step : null;
}

/** A segment written with a new name, in its original form where the name allows. */
function formatSegment(segment: PathSegment, name: string): string {
    const lead = segment.Text.slice(0, skipSpaces(segment.Text, 0));
    const optional = segment.Text.startsWith('?.', lead.length);
    if (segment.Quote === null && IDENTIFIER.test(name)) return `${lead}${optional ? '?.' : '.'}${name}`;

    const quote = segment.Quote ?? '\'';
    const escaped = name.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`);
    return `${lead}${optional ? '?.' : ''}[${quote}${escaped}${quote}]`;
}

/**
 * Every comparison of a `decisions.<step>.<question>.value` with a string literal, wherever it sits
 * in a condition — not only in the disjunction a fork is checked on.
 *
 * Only a whole operand counts: `decisions.t.q.value === 'a' + suffix` compares with more than the
 * literal, so it is not reported.
 */
export function DecisionValueComparisonsIn(expression: string): DecisionValueComparison[] {
    const comparisons: DecisionValueComparison[] = [];
    if (!expression) return comparisons;

    const strings = stringSpans(expression);
    let literalBefore: ((start: number) => string | null) | undefined;
    for (const match of expression.matchAll(ROOT_PATTERN)) {
        const start = match.index ?? 0;
        if (insideString(strings, start)) continue;
        const reference = readValueReference(expression, start);
        if (!reference) continue;

        let literal = literalComparedAfter(expression, reference.End);
        if (literal === null && endsOperandAt(expression, skipSpaces(expression, reference.End))) {
            literalBefore ??= literalsComparedBefore(expression);
            literal = literalBefore(start);
        }
        if (literal === null) continue;
        comparisons.push({ NodeId: reference.NodeId, QuestionKey: reference.QuestionKey, Value: unescapeLiteral(literal.slice(1, -1)) });
    }
    return comparisons;
}

/**
 * Every place a condition reads a PROPERTY named `decisions` — `payload.decisions`,
 * `output?.decisions`, `stepResult.result['decisions']` — as written, for a message.
 *
 * A Decision step also leaves its answers in its output, under `decisions`, for the steps after it
 * to read. A condition reading that copy is never held, so this is how the validator finds one.
 * Text inside string literals is ignored.
 */
export function DecisionsReadAsProperty(expression: string): string[] {
    const reads: string[] = [];
    if (!expression) return reads;

    const strings = stringSpans(expression);
    for (const read of decisionsPropertyReads(expression)) {
        if (insideString(strings, read.Start)) continue;
        // The chain it hangs off, for a message the author recognises.
        const prefix = expression.slice(Math.max(0, read.Start - CHAIN_WINDOW), read.Start);
        const chain = chainEndingAt(prefix)?.trim() ?? '…';
        reads.push(`${chain}${expression.slice(read.Start, read.End).trim()}`);
    }
    return reads;
}

/**
 * The `[start, end)` ranges of every string literal, in order.
 *
 * A quote whose literal never closes opens nothing, and the text after it is searched again. A quote
 * of the same kind inside that text was escaped, so a literal opened there would stop where the first
 * did; each kind of quote is therefore read past once, and the whole search is linear.
 */
function stringSpans(expression: string): Array<[number, number]> {
    const spans: Array<[number, number]> = [];
    const unclosedUntil: Record<Quote, number> = { '\'': 0, '"': 0 };
    let at = 0;
    while (at < expression.length) {
        const quote = expression.charAt(at);
        if (isQuote(quote) && at >= unclosedUntil[quote]) {
            const literal = scanLiteral(expression, at);
            if (literal.Closed) {
                spans.push([at, literal.End]);
                at = literal.End;
                continue;
            }
            unclosedUntil[quote] = literal.End;
        }
        at++;
    }
    return spans;
}

/** Whether `at` falls inside one of `spans`, which are in order and do not overlap. */
function insideString(spans: ReadonlyArray<[number, number]>, at: number): boolean {
    const index = firstSpanEndingAfter(spans, at);
    return index < spans.length && spans[index][0] <= at;
}

/** The index of the first of `spans` that ends after `at`, or `spans.length` when none does. */
function firstSpanEndingAfter(spans: ReadonlyArray<[number, number]>, at: number): number {
    let low = 0;
    let high = spans.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (spans[middle][1] <= at) low = middle + 1;
        else high = middle;
    }
    return low;
}

/** Up to `max` path segments starting at `from`, each with where it sits and how it was written. */
function pathSegmentsAt(expression: string, from: number, max: number): PathSegment[] {
    const segments: PathSegment[] = [];
    let at = from;
    while (segments.length < max) {
        const segment = readSegment(expression, at);
        if (!segment) break;
        segments.push({ Name: segment.Name, Start: at, End: segment.End, Text: expression.slice(at, segment.End), Quote: segment.Quote });
        at = segment.End;
    }
    return segments;
}

/** Reads up to `max` path segments starting at `from`. */
function readSegments(expression: string, from: number, max: number): { Segments: string[]; End: number } {
    const segments = pathSegmentsAt(expression, from, max);
    return { Segments: segments.map((s) => s.Name), End: segments.length > 0 ? segments[segments.length - 1].End : from };
}

/** Splits on `||` outside strings and parentheses, or returns `null` when a term is empty. */
function splitTopLevelOr(expression: string): string[] | null {
    const terms: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let from = 0;
    for (let i = 0; i < expression.length; i++) {
        const ch = expression[i];
        if (quote) {
            if (ch === '\\') i++;
            else if (ch === quote) quote = null;
        } else if (ch === '\'' || ch === '"') {
            quote = ch;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
        } else if (depth === 0 && ch === '|' && expression[i + 1] === '|') {
            terms.push(expression.slice(from, i));
            from = i + 2;
            i++;
        }
    }
    terms.push(expression.slice(from));
    const trimmed = terms.map((t) => t.trim());
    return trimmed.some((t) => t.length === 0) ? null : trimmed;
}

/** Removes parentheses that wrap the whole term, as many layers as there are. */
function stripOuterParens(term: string): string {
    let current = term.trim();
    while (current.startsWith('(') && closingParenOf(current) === current.length - 1) {
        current = current.slice(1, -1).trim();
    }
    return current;
}

/** The index of the parenthesis that closes the one at index 0, or -1. */
function closingParenOf(text: string): number {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\') i++;
            else if (ch === quote) quote = null;
        } else if (ch === '\'' || ch === '"') {
            quote = ch;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')' && --depth === 0) {
            return i;
        }
    }
    return -1;
}

/** `<value reference> == 'x'` or `'x' == <value reference>`, or `null`. */
function parseChoiceEquality(term: string): { NodeId: string; QuestionKey: string; Value: string } | null {
    if (term.startsWith(ROOT)) {
        const reference = readValueReference(term, 0);
        if (!reference) return null;
        const literalAt = equalityEnd(term, reference.End);
        const literal = literalAt < 0 ? null : closedLiteralAt(term, literalAt);
        return literal && literal.End === term.length ? { ...reference, Value: unescapeLiteral(literal.Body) } : null;
    }

    const literal = closedLiteralAt(term, 0);
    if (!literal) return null;
    const referenceAt = equalityEnd(term, literal.End);
    if (referenceAt < 0) return null;
    const reference = readValueReference(term, referenceAt);
    return reference && reference.End === term.length
        ? { NodeId: reference.NodeId, QuestionKey: reference.QuestionKey, Value: unescapeLiteral(literal.Body) }
        : null;
}

/** `decisions.<step>.<question>.value` starting at `from`, or `null`. */
function readValueReference(text: string, from: number): { NodeId: string; QuestionKey: string; End: number } | null {
    if (!text.startsWith(ROOT, from)) return null;
    const path = readSegments(text, from + ROOT.length, 3);
    const [nodeId, questionKey, field] = path.Segments;
    if (!nodeId || !questionKey || field !== 'value') return null;
    return { NodeId: nodeId, QuestionKey: questionKey, End: path.End };
}

/** Single-character escapes and what they stand for; any other escaped character stands for itself. */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
    n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0',
};

/**
 * A string literal's body as the evaluator reads it, with its escapes resolved as JavaScript
 * resolves them — so `'it\'s'` compares equal to the option `it's`.
 */
function unescapeLiteral(body: string): string {
    return body.replace(
        /\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
        (_whole: string, braced?: string, unicode?: string, hex?: string, single?: string): string => {
            const code = braced ?? unicode ?? hex;
            if (code !== undefined) {
                const point = parseInt(code, 16);
                return point <= 0x10ffff ? String.fromCodePoint(point) : '';
            }
            // A backslash before a line break continues the line and stands for nothing.
            if (single === undefined || /^(?:\r\n|[\r\n\u2028\u2029])$/.test(single)) return '';
            return SIMPLE_ESCAPES[single] ?? single;
        },
    );
}

// ---------------------------------------------------------------------------------------------
// The scanner. Hand-written rather than regular expressions: a condition is author input, and the
// patterns that used to describe this grammar backtracked on crafted input — quadratically on a run
// of whitespace or an unclosed string, exponentially on the chain before a property read. Each
// reader below makes one pass over the text it reads and accepts exactly what those patterns did.
// ---------------------------------------------------------------------------------------------

type Quote = '\'' | '"';

/** Where a string literal opening at a quote ends. */
type LiteralScan = {
    /** Whether the literal closes. */
    Closed: boolean;
    /** Just past the closing quote when it closes; where the literal stops being one when it does not. */
    End: number;
};

/** One path segment: `.name`, `?.name`, `['name']` or `?.["name"]`, with any whitespace before it. */
type Segment = {
    /** The name, as written — a bracket segment's escapes are not resolved. */
    Name: string;
    /** Just past the segment. */
    End: number;
    /** The quote a bracket segment used, or `null` for `.name` (and for an index). */
    Quote: Quote | null;
};

/**
 * Reads the string literal opening at `at`, which must be a quote: any characters but the quote and
 * a backslash, or a backslash and the character after it. A backslash before a line break, or at
 * the end, ends it unclosed — an escape takes any character but a line break.
 */
function scanLiteral(text: string, at: number): LiteralScan {
    const quote = text.charAt(at);
    let i = at + 1;
    while (i < text.length) {
        const ch = text.charAt(i);
        if (ch === quote) return { Closed: true, End: i + 1 };
        if (ch !== '\\') {
            i++;
        } else if (i + 1 < text.length && !isLineBreak(text.charAt(i + 1))) {
            i += 2;
        } else {
            return { Closed: false, End: i };
        }
    }
    return { Closed: false, End: i };
}

/** The string literal opening at `at` when there is one and it closes: where it ends, and its body as written. */
function closedLiteralAt(text: string, at: number): { End: number; Body: string } | null {
    if (!isQuote(text.charAt(at))) return null;
    const literal = scanLiteral(text, at);
    return literal.Closed ? { End: literal.End, Body: text.slice(at + 1, literal.End - 1) } : null;
}

/**
 * The path segment at `at`, or `null`. With `numericIndex`, `[0]` is a segment too — as it is in a
 * member chain, though not in a `decisions` reference.
 */
function readSegment(text: string, at: number, numericIndex = false): Segment | null {
    const start = skipSpaces(text, at);
    const optional = text.startsWith('?.', start);
    if (optional || text.charAt(start) === '.') {
        const name = skipSpaces(text, start + (optional ? 2 : 1));
        const nameEnd = identifierEnd(text, name);
        if (nameEnd > name) return { Name: text.slice(name, nameEnd), End: nameEnd, Quote: null };
    }

    const open = skipSpaces(text, optional ? start + 2 : start);
    if (text.charAt(open) !== '[') return null;
    const key = skipSpaces(text, open + 1);
    const quote = text.charAt(key);
    let keyEnd = -1;
    let name = '';
    if (isQuote(quote)) {
        const literal = closedLiteralAt(text, key);
        if (literal) {
            keyEnd = literal.End;
            name = literal.Body;
        }
    } else if (numericIndex && isDigit(text.charAt(key))) {
        keyEnd = key;
        while (isDigit(text.charAt(keyEnd))) keyEnd++;
        name = text.slice(key, keyEnd);
    }
    if (keyEnd < 0) return null;
    const close = skipSpaces(text, keyEnd);
    return text.charAt(close) === ']' ? { Name: name, End: close + 1, Quote: isQuote(quote) ? quote : null } : null;
}

/**
 * The member chain that runs to the end of `text`, whitespace aside — `payload`, `stepResult.result`,
 * `output?.['x']`, `rows[0]` — starting as early as one can, or `null` when none does.
 */
function chainEndingAt(text: string): string | null {
    // Chains that meet at a point end the same way from there, so each point is followed once.
    const reachesEnd = new Map<number, boolean>();
    let triedThisName = false;
    for (let at = 0; at < text.length; at++) {
        const ch = text.charAt(at);
        if (!isIdentifierPart(ch)) {
            triedThisName = false;
            continue;
        }
        // Every start inside one name reads to the same end of it, and so to the same answer.
        if (triedThisName || !isIdentifierStart(ch)) continue;
        triedThisName = true;
        if (chainReachesEnd(text, identifierEnd(text, at), reachesEnd)) return text.slice(at);
    }
    return null;
}

/** Whether path segments from `from` run to the end of `text`, whitespace aside. Records every point it passes. */
function chainReachesEnd(text: string, from: number, reachesEnd: Map<number, boolean>): boolean {
    const passed: number[] = [];
    let at = from;
    let known = reachesEnd.get(at);
    while (known === undefined && skipSpaces(text, at) < text.length) {
        passed.push(at);
        const segment = readSegment(text, at, true);
        if (!segment) {
            known = false;
            break;
        }
        at = segment.End;
        known = reachesEnd.get(at);
    }
    const reaches = known ?? true;
    for (const point of passed) reachesEnd.set(point, reaches);
    return reaches;
}

/**
 * Every read of `decisions` as a property, as written: `.decisions` or `?.decisions` (not a spread,
 * `...decisions`), and `['decisions']` or `?.["decisions"]` after a name, `)` or `]` — an array
 * literal `['decisions']` after an operator is not one. The span of a bracketed read includes the
 * whitespace before it.
 */
function decisionsPropertyReads(expression: string): Array<{ Start: number; End: number }> {
    const reads: Array<{ Start: number; End: number }> = [];
    // The last character before `at` that is not whitespace: what a bracketed read must follow.
    let lastSolid = -1;
    let at = 0;
    while (at < expression.length) {
        const end = dottedDecisionsEnd(expression, at) ?? bracketedDecisionsEnd(expression, at, lastSolid);
        if (end !== null) {
            reads.push({ Start: at, End: end });
            lastSolid = end - 1;
            at = end;
        } else if (isSpace(expression.charAt(at))) {
            // From anywhere in a run of whitespace, a bracketed read follows the same character and
            // needs the same `[` after the run, so the rest of the run fails as its first position did.
            at = skipSpaces(expression, at);
        } else {
            lastSolid = at++;
        }
    }
    return reads;
}

/** Where `.decisions` or `?.decisions` starting at `at` ends, or `null`. */
function dottedDecisionsEnd(text: string, at: number): number | null {
    let dot: number;
    if (text.startsWith('?.', at)) dot = at + 2;
    else if (text.charAt(at) === '.' && text.charAt(at - 1) !== '.') dot = at + 1;
    else return null;
    const name = skipSpaces(text, dot);
    const end = name + ROOT.length;
    return text.startsWith(ROOT, name) && !isIdentifierPart(text.charAt(end)) ? end : null;
}

/** Where `['decisions']` or `?.["decisions"]` starting at `at` ends, when it follows a name, `)` or `]`; or `null`. */
function bracketedDecisionsEnd(text: string, at: number, lastSolid: number): number | null {
    if (lastSolid < 0 || !isPropertyOwnerEnd(text.charAt(lastSolid))) return null;
    const open = skipSpaces(text, text.startsWith('?.', at) ? at + 2 : at);
    if (text.charAt(open) !== '[') return null;
    const key = skipSpaces(text, open + 1);
    if (!text.startsWith(`'${ROOT}'`, key) && !text.startsWith(`"${ROOT}"`, key)) return null;
    const close = skipSpaces(text, key + ROOT.length + 2);
    return text.charAt(close) === ']' ? close + 1 : null;
}

/**
 * The string literal a value reference ending at `end` is compared with — `=== 'x'`, `!= "x"` — when
 * nothing more follows it in that operand; or `null`.
 */
function literalComparedAfter(expression: string, end: number): string | null {
    const operatorEnd = operatorEndAt(expression, skipSpaces(expression, end), COMPARISONS);
    if (operatorEnd < 0) return null;
    const open = skipSpaces(expression, operatorEnd);
    const literal = closedLiteralAt(expression, open);
    return literal && endsOperandAt(expression, skipSpaces(expression, literal.End)) ? expression.slice(open, literal.End) : null;
}

/**
 * For one condition, the string literal compared with a value reference from its left — `'x' === <ref>`
 * — when the literal starts its own operand: after the start, `(`, `?`, `:`, `,`, `&&` or `||`.
 *
 * Built once per condition. A literal that closes right before the comparison can only have opened at
 * the nearest quote of its kind that starts an operand: a literal opened earlier ends at that quote,
 * which no backslash precedes. So each such quote is found by a search, and read once.
 */
function literalsComparedBefore(expression: string): (start: number) => string | null {
    const openers: Record<Quote, number[]> = { '\'': [], '"': [] };
    for (let at = 0; at < expression.length; at++) {
        const quote = expression.charAt(at);
        if (isQuote(quote) && startsOperand(expression, at)) openers[quote].push(at);
    }
    const scans = new Map<number, LiteralScan>();

    return (start: number): string | null => {
        const operatorStart = operatorStartBefore(expression, skipSpacesBack(expression, start));
        if (operatorStart < 0) return null;
        const close = skipSpacesBack(expression, operatorStart) - 1;
        const quote = expression.charAt(close);
        if (!isQuote(quote)) return null;
        const open = lastBelow(openers[quote], close);
        if (open < 0) return null;
        let literal = scans.get(open);
        if (!literal) {
            literal = scanLiteral(expression, open);
            scans.set(open, literal);
        }
        return literal.Closed && literal.End === close + 1 ? expression.slice(open, close + 1) : null;
    };
}

/** Whether the quote at `at` starts an operand: only whitespace between it and the start, `(`, `?`, `:`, `,`, `&&` or `||`. */
function startsOperand(text: string, at: number): boolean {
    const before = skipSpacesBack(text, at);
    if (before === 0) return true;
    return '(?:,'.includes(text.charAt(before - 1))
        || (before >= 2 && (text.startsWith('&&', before - 2) || text.startsWith('||', before - 2)));
}

/** Whether an operand ends at `at`: the end, `)`, `?`, `:`, `,`, `&&` or `||`. */
function endsOperandAt(text: string, at: number): boolean {
    if (at >= text.length) return true;
    return ')?:,'.includes(text.charAt(at)) || text.startsWith('&&', at) || text.startsWith('||', at);
}

/** Equality and inequality, longest first. */
const COMPARISONS: readonly string[] = ['===', '!==', '==', '!='];

/** Equality alone, longest first. */
const EQUALITIES: readonly string[] = ['===', '=='];

/** Just past one of `operators` at `at`, or -1. */
function operatorEndAt(text: string, at: number, operators: readonly string[]): number {
    const operator = operators.find((o) => text.startsWith(o, at));
    return operator === undefined ? -1 : at + operator.length;
}

/** Where a comparison operator that ends at `end` starts, or -1. */
function operatorStartBefore(text: string, end: number): number {
    const operator = COMPARISONS.find((o) => end >= o.length && text.startsWith(o, end - o.length));
    return operator === undefined ? -1 : end - operator.length;
}

/** Past an equality at `at` and the whitespace around it, or -1. */
function equalityEnd(text: string, at: number): number {
    const operatorEnd = operatorEndAt(text, skipSpaces(text, at), EQUALITIES);
    return operatorEnd < 0 ? -1 : skipSpaces(text, operatorEnd);
}

/** The largest of `sorted` below `limit`, or -1. */
function lastBelow(sorted: readonly number[], limit: number): number {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (sorted[middle] < limit) low = middle + 1;
        else high = middle;
    }
    return low > 0 ? sorted[low - 1] : -1;
}

/** The first position at or after `at` that is not whitespace. */
function skipSpaces(text: string, at: number): number {
    let i = at;
    while (i < text.length && isSpace(text.charAt(i))) i++;
    return i;
}

/** The start of the whitespace that ends at `at`. */
function skipSpacesBack(text: string, at: number): number {
    let i = at;
    while (i > 0 && isSpace(text.charAt(i - 1))) i--;
    return i;
}

/** Just past the name starting at `at`, or `at` when none does. */
function identifierEnd(text: string, at: number): number {
    if (!isIdentifierStart(text.charAt(at))) return at;
    let i = at + 1;
    while (isIdentifierPart(text.charAt(i))) i++;
    return i;
}

/** One character each, as the patterns these replace read them; an empty string (past the end) is none of them. */
const SPACE = /\s/;
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const PROPERTY_OWNER_END = /[A-Za-z0-9_$)\]]/;

function isSpace(ch: string): boolean {
    return SPACE.test(ch);
}

function isIdentifierStart(ch: string): boolean {
    return IDENTIFIER_START.test(ch);
}

function isIdentifierPart(ch: string): boolean {
    return IDENTIFIER_PART.test(ch);
}

function isDigit(ch: string): boolean {
    return DIGIT.test(ch);
}

/** A character a property read can follow: the end of a name, a call or an index. */
function isPropertyOwnerEnd(ch: string): boolean {
    return PROPERTY_OWNER_END.test(ch);
}

function isQuote(ch: string): ch is Quote {
    return ch === '\'' || ch === '"';
}

/** A line break, which an escape cannot take. */
function isLineBreak(ch: string): boolean {
    return ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ';
}
