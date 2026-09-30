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
 * than guessed at, so the validator refuses it and the gate holds on it.
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

const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;

/** One path segment: `.name`, `?.name`, `['name']` or `?.["name"]`. Sticky: it matches only at `lastIndex`. */
const SEGMENT = /\s*(?:\??\.\s*([A-Za-z_$][A-Za-z0-9_$]*)|(?:\?\.)?\s*\[\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\])/y;

/** A whole string literal, and nothing after it. */
const WHOLE_LITERAL = /^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")$/;

/** A leading string literal. */
const LEADING_LITERAL = /^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/;

/** Loose or strict equality, with the whitespace around it. */
const EQUALITY = /^\s*===?\s*/;

/** A name that can follow a dot. Anything else is written in brackets. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** An equality or inequality operator, with the whitespace around it, at the start of the text. */
const COMPARISON_AFTER = /^\s*(?:===?|!==?)\s*/;

/** Nothing but an equality or inequality operator and whitespace. */
const COMPARISON_BETWEEN = /^\s*(?:===?|!==?)\s*$/;

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

/** A string literal, captured whole with its quotes. */
const LITERAL = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;

/** Where an operand ends: the end, a closing parenthesis, a logical operator, a ternary or a comma. */
const OPERAND_END = String.raw`(?:$|[)?:,]|&&|\|\|)`;

/** An (in)equality with a literal right after a value reference, and nothing more to that operand. */
const COMPARED_WITH_LITERAL = new RegExp(String.raw`^\s*(?:===?|!==?)\s*${LITERAL}\s*(?=${OPERAND_END})`);

/** A literal and an (in)equality right before a value reference, starting its own operand. */
const LITERAL_COMPARED_WITH = new RegExp(String.raw`(?:^|[(?:,]|&&|\|\|)\s*${LITERAL}\s*(?:===?|!==?)\s*$`);

/** Nothing more to the operand after a value reference. */
const ENDS_OPERAND = new RegExp(String.raw`^\s*${OPERAND_END}`);

/**
 * `decisions` read as a PROPERTY — `.decisions`, `?.decisions`, `['decisions']` — rather than as the
 * root. A spread (`...decisions`) is not a property read, and an array literal (`['decisions']`
 * after an operator) is not one either.
 */
const DECISIONS_PROPERTY = /(?:\?\.|(?<!\.)\.)\s*decisions(?![A-Za-z0-9_$])|(?<=[A-Za-z0-9_$)\]]\s*)(?:\?\.)?\s*\[\s*(?:'decisions'|"decisions")\s*\]/g;

/** The member chain that ends where the text ends: `payload`, `stepResult.result`, `output?.['x']`. */
const CHAIN_BEFORE = /[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\??\.\s*[A-Za-z_$][A-Za-z0-9_$]*|\s*(?:\?\.)?\s*\[\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\d+)\s*\])*\s*$/;

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
        if (strings.some(([from, to]) => start >= from && start < to)) continue;

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
        .filter((start) => !strings.some(([from, to]) => start >= from && start < to));
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
    const operator = COMPARISON_AFTER.exec(expression.slice(end));
    const after = operator ? strings.find(([from]) => from === end + operator[0].length) : undefined;
    const before = [...strings].reverse().find(([, to]) => to <= start);
    const span = after ?? (before && COMPARISON_BETWEEN.test(expression.slice(before[1], start)) ? before : undefined);
    return span ? { Start: span[0], End: span[1], Value: expression.slice(span[0] + 1, span[1] - 1) } : null;
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
    const lead = /^\s*/.exec(segment.Text)?.[0] ?? '';
    const optional = /^\s*\?\./.test(segment.Text);
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
    for (const match of expression.matchAll(ROOT_PATTERN)) {
        const start = match.index ?? 0;
        if (strings.some(([from, to]) => start >= from && start < to)) continue;
        const reference = readValueReference(expression, start);
        if (!reference) continue;

        const rest = expression.slice(reference.End);
        const after = COMPARED_WITH_LITERAL.exec(rest);
        const before = after ? null : ENDS_OPERAND.test(rest) ? LITERAL_COMPARED_WITH.exec(expression.slice(0, start)) : null;
        const literal = after?.[1] ?? before?.[1];
        if (literal === undefined) continue;
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
    for (const match of expression.matchAll(DECISIONS_PROPERTY)) {
        const start = match.index ?? 0;
        if (strings.some(([from, to]) => start >= from && start < to)) continue;
        // The chain it hangs off, for a message the author recognises. Bounded, because a condition
        // is short and a failed search over a long prefix is the only way this could be slow.
        const prefix = expression.slice(Math.max(0, start - 200), start);
        const chain = CHAIN_BEFORE.exec(prefix)?.[0].trim() ?? '…';
        reads.push(`${chain}${match[0].trim()}`);
    }
    return reads;
}

/** The `[start, end)` ranges of every string literal. */
function stringSpans(expression: string): Array<[number, number]> {
    return [...expression.matchAll(STRING_LITERAL)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** Up to `max` path segments starting at `from`, each with where it sits and how it was written. */
function pathSegmentsAt(expression: string, from: number, max: number): PathSegment[] {
    const segments: PathSegment[] = [];
    let at = from;
    while (segments.length < max) {
        SEGMENT.lastIndex = at;
        const match = SEGMENT.exec(expression);
        if (!match) break;
        const quote = match[1] !== undefined ? null : match[2] !== undefined ? '\'' : '"';
        segments.push({ Name: match[1] ?? match[2] ?? match[3] ?? '', Start: at, End: SEGMENT.lastIndex, Text: match[0], Quote: quote });
        at = SEGMENT.lastIndex;
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
        const rest = term.slice(reference.End);
        const operator = EQUALITY.exec(rest);
        const literal = operator ? WHOLE_LITERAL.exec(rest.slice(operator[0].length)) : null;
        return literal ? { ...reference, Value: unescapeLiteral(literal[1] ?? literal[2] ?? '') } : null;
    }

    const literal = LEADING_LITERAL.exec(term);
    if (!literal) return null;
    const rest = term.slice(literal[0].length);
    const operator = EQUALITY.exec(rest);
    if (!operator) return null;
    const tail = rest.slice(operator[0].length);
    const reference = tail.startsWith(ROOT) ? readValueReference(tail, 0) : null;
    return reference && reference.End === tail.length
        ? { NodeId: reference.NodeId, QuestionKey: reference.QuestionKey, Value: unescapeLiteral(literal[1] ?? literal[2] ?? '') }
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
