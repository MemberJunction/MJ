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
