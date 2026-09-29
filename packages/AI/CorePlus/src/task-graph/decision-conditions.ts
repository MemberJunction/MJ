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
 * between the two must still name the step it named.
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

/** The step segment of one reference, where it sits, and how it was written. */
type StepSegment = {
    Name: string;
    Start: number;
    End: number;
    /** The segment as written, including any whitespace before it. */
    Text: string;
    /** The quote a bracket segment used, or `null` for `.name`. */
    Quote: '\'' | '"' | null;
};

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

    const strings = stringSpans(condition);
    const parts: string[] = [];
    let copied = 0;
    for (const match of condition.matchAll(ROOT_PATTERN)) {
        const start = match.index ?? 0;
        if (strings.some(([from, to]) => start >= from && start < to)) continue;

        const segment = stepSegmentAt(condition, start + ROOT.length);
        if (!segment) continue;
        const renamed = rename(segment.Name);
        if (renamed === undefined) {
            if (!rewrite.Unknown.includes(segment.Name)) rewrite.Unknown.push(segment.Name);
            continue;
        }
        parts.push(condition.slice(copied, segment.Start), formatStepSegment(segment, renamed));
        copied = segment.End;
    }
    parts.push(condition.slice(copied));
    rewrite.Expression = parts.join('');
    return rewrite;
}

/** The step segment of a reference that also names a question, or `null` for a malformed use. */
function stepSegmentAt(expression: string, from: number): StepSegment | null {
    const [step, question] = readSegments(expression, from, 2).Segments;
    if (!step || !question) return null;

    SEGMENT.lastIndex = from;
    const match = SEGMENT.exec(expression);
    if (!match) return null;
    const quote = match[1] !== undefined ? null : match[2] !== undefined ? '\'' : '"';
    return { Name: step, Start: from, End: SEGMENT.lastIndex, Text: match[0], Quote: quote };
}

/** A step segment written with a new name, in its original form where the name allows. */
function formatStepSegment(segment: StepSegment, name: string): string {
    const lead = /^\s*/.exec(segment.Text)?.[0] ?? '';
    const optional = /^\s*\?\./.test(segment.Text);
    if (segment.Quote === null && IDENTIFIER.test(name)) return `${lead}${optional ? '?.' : '.'}${name}`;

    const quote = segment.Quote ?? '\'';
    const escaped = name.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`);
    return `${lead}${optional ? '?.' : ''}[${quote}${escaped}${quote}]`;
}

/** The `[start, end)` ranges of every string literal. */
function stringSpans(expression: string): Array<[number, number]> {
    return [...expression.matchAll(STRING_LITERAL)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** Reads up to `max` path segments starting at `from`. */
function readSegments(expression: string, from: number, max: number): { Segments: string[]; End: number } {
    const segments: string[] = [];
    let at = from;
    while (segments.length < max) {
        SEGMENT.lastIndex = at;
        const match = SEGMENT.exec(expression);
        if (!match) break;
        segments.push(match[1] ?? match[2] ?? match[3] ?? '');
        at = SEGMENT.lastIndex;
    }
    return { Segments: segments, End: at };
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
        return literal ? { ...reference, Value: literal[1] ?? literal[2] ?? '' } : null;
    }

    const literal = LEADING_LITERAL.exec(term);
    if (!literal) return null;
    const rest = term.slice(literal[0].length);
    const operator = EQUALITY.exec(rest);
    if (!operator) return null;
    const tail = rest.slice(operator[0].length);
    const reference = tail.startsWith(ROOT) ? readValueReference(tail, 0) : null;
    return reference && reference.End === tail.length
        ? { NodeId: reference.NodeId, QuestionKey: reference.QuestionKey, Value: literal[1] ?? literal[2] ?? '' }
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
