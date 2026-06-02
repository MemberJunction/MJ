/**
 * @fileoverview Safe predicate language for the `where` operator. Grammar:
 *
 *   expr   := or
 *   or     := and ( 'or' and )*
 *   and    := not ( 'and' not )*
 *   not    := 'not' not | primary
 *   primary:= '(' expr ')' | comparison
 *   comparison := path OP value
 *   OP     := '==' | '!=' | '<=' | '>=' | '<' | '>'
 *           | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'in'
 *   value  := string | number | true | false | null | today | now | '[' value (',' value)* ']'
 *
 * Parsed with a hand-written recursive-descent parser — never `eval`'d. The `matches` operator
 * compiles a user regex (bounded risk); everything else is plain comparison. This is the security
 * spine for LLM-authored filters.
 *
 * @module @memberjunction/ai-agents
 */
import { PipeValue } from './pipeline.types';
import { getValue } from './path';

type Comparison = { kind: 'cmp'; path: string; op: string; value: PipeValue | PipeValue[] };
type PredicateNode =
    | Comparison
    | { kind: 'and'; nodes: PredicateNode[] }
    | { kind: 'or'; nodes: PredicateNode[] }
    | { kind: 'not'; node: PredicateNode };

const SYMBOL_OPS = ['==', '!=', '<=', '>=', '<', '>'];
const WORD_OPS = ['contains', 'startsWith', 'endsWith', 'matches', 'in'];
const STOP_CHARS = new Set([' ', '\t', '\n', '=', '!', '<', '>', '(', ')', ',']);

/** Parse a predicate string into an AST. Throws with a clear message on malformed input. */
export function parsePredicate(src: string): PredicateNode {
    const parser = new PredicateParser(src);
    const ast = parser.parseExpr();
    parser.expectEnd();
    return ast;
}

/** Evaluate a parsed predicate against one element. */
export function evaluatePredicate(ast: PredicateNode, element: PipeValue): boolean {
    switch (ast.kind) {
        case 'and':
            return ast.nodes.every((n) => evaluatePredicate(n, element));
        case 'or':
            return ast.nodes.some((n) => evaluatePredicate(n, element));
        case 'not':
            return !evaluatePredicate(ast.node, element);
        case 'cmp':
            return evaluateComparison(ast, element);
    }
}

class PredicateParser {
    private pos = 0;
    constructor(private readonly s: string) {}

    public parseExpr(): PredicateNode {
        return this.parseOr();
    }

    public expectEnd(): void {
        this.ws();
        if (this.pos < this.s.length) {
            throw new Error(`Unexpected "${this.s.slice(this.pos)}" in predicate`);
        }
    }

    private parseOr(): PredicateNode {
        const nodes = [this.parseAnd()];
        while (this.matchWord('or')) {
            nodes.push(this.parseAnd());
        }
        return nodes.length === 1 ? nodes[0] : { kind: 'or', nodes };
    }

    private parseAnd(): PredicateNode {
        const nodes = [this.parseNot()];
        while (this.matchWord('and')) {
            nodes.push(this.parseNot());
        }
        return nodes.length === 1 ? nodes[0] : { kind: 'and', nodes };
    }

    private parseNot(): PredicateNode {
        if (this.matchWord('not')) {
            return { kind: 'not', node: this.parseNot() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): PredicateNode {
        this.ws();
        if (this.s[this.pos] === '(') {
            this.pos++;
            const e = this.parseExpr();
            this.ws();
            if (this.s[this.pos] !== ')') {
                throw new Error('Unbalanced parentheses in predicate');
            }
            this.pos++;
            return e;
        }
        return this.parseComparison();
    }

    private parseComparison(): Comparison {
        const path = this.scanPath();
        const op = this.scanOp();
        const value = op === 'in' ? this.scanArray() : this.scanValue();
        return { kind: 'cmp', path, op, value };
    }

    private scanPath(): string {
        this.ws();
        const start = this.pos;
        while (this.pos < this.s.length && !STOP_CHARS.has(this.s[this.pos])) {
            this.pos++;
        }
        const path = this.s.slice(start, this.pos);
        if (!path) {
            throw new Error(`Expected a field name at position ${start} in predicate`);
        }
        return path;
    }

    private scanOp(): string {
        this.ws();
        for (const op of SYMBOL_OPS) {
            if (this.s.startsWith(op, this.pos)) {
                this.pos += op.length;
                return op;
            }
        }
        for (const op of WORD_OPS) {
            if (this.matchWord(op)) {
                return op;
            }
        }
        throw new Error(`Expected a comparison operator at position ${this.pos} in predicate`);
    }

    private scanArray(): PipeValue[] {
        this.ws();
        if (this.s[this.pos] !== '[') {
            throw new Error('"in" expects a [list] of values');
        }
        this.pos++;
        const items: PipeValue[] = [];
        this.ws();
        if (this.s[this.pos] === ']') {
            this.pos++;
            return items;
        }
        do {
            items.push(this.scanValue());
            this.ws();
        } while (this.s[this.pos] === ',' && ++this.pos);
        this.ws();
        if (this.s[this.pos] !== ']') {
            throw new Error('Unterminated [list] in predicate');
        }
        this.pos++;
        return items;
    }

    private scanValue(): PipeValue {
        this.ws();
        const c = this.s[this.pos];
        if (c === "'" || c === '"') {
            return this.scanString(c);
        }
        if (c === '-' || (c >= '0' && c <= '9')) {
            return this.scanNumber();
        }
        const word = this.scanWord();
        if (word === '') {
            throw new Error(`Expected a value at position ${this.pos} in predicate`);
        }
        switch (word.toLowerCase()) {
            case 'true':
                return true;
            case 'false':
                return false;
            case 'null':
                return null;
            case 'today':
                return new Date().toISOString().slice(0, 10);
            case 'now':
                return new Date().toISOString();
            default:
                return word; // lenient: an unquoted bareword is treated as a string
        }
    }

    private scanString(quote: string): string {
        this.pos++; // opening quote
        const start = this.pos;
        while (this.pos < this.s.length && this.s[this.pos] !== quote) {
            this.pos++;
        }
        const str = this.s.slice(start, this.pos);
        if (this.s[this.pos] !== quote) {
            throw new Error('Unterminated string literal in predicate');
        }
        this.pos++; // closing quote
        return str;
    }

    private scanNumber(): number {
        const start = this.pos;
        if (this.s[this.pos] === '-') {
            this.pos++;
        }
        while (this.pos < this.s.length && /[0-9.]/.test(this.s[this.pos])) {
            this.pos++;
        }
        const n = Number(this.s.slice(start, this.pos));
        if (!Number.isFinite(n)) {
            throw new Error(`Invalid number at position ${start} in predicate`);
        }
        return n;
    }

    private scanWord(): string {
        const start = this.pos;
        while (this.pos < this.s.length && !STOP_CHARS.has(this.s[this.pos]) && this.s[this.pos] !== ']') {
            this.pos++;
        }
        return this.s.slice(start, this.pos);
    }

    private ws(): void {
        while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) {
            this.pos++;
        }
    }

    /** Match a whole keyword (case-insensitive) followed by a word boundary; consume on success. */
    private matchWord(word: string): boolean {
        this.ws();
        const slice = this.s.slice(this.pos, this.pos + word.length);
        if (slice.toLowerCase() !== word.toLowerCase()) {
            return false;
        }
        const after = this.s[this.pos + word.length];
        if (after !== undefined && !STOP_CHARS.has(after) && after !== '[') {
            return false; // part of a longer identifier
        }
        this.pos += word.length;
        return true;
    }
}

function evaluateComparison(cmp: Comparison, element: PipeValue): boolean {
    const actual = getValue(element, cmp.path) ?? null;
    switch (cmp.op) {
        case '==':
            return looseEquals(actual, cmp.value as PipeValue);
        case '!=':
            return !looseEquals(actual, cmp.value as PipeValue);
        case '<':
            return compare(actual, cmp.value as PipeValue) < 0;
        case '>':
            return compare(actual, cmp.value as PipeValue) > 0;
        case '<=':
            return compare(actual, cmp.value as PipeValue) <= 0;
        case '>=':
            return compare(actual, cmp.value as PipeValue) >= 0;
        case 'contains':
            return Array.isArray(actual)
                ? actual.some((a) => looseEquals(a, cmp.value as PipeValue))
                : String(actual).includes(String(cmp.value));
        case 'startsWith':
            return String(actual).startsWith(String(cmp.value));
        case 'endsWith':
            return String(actual).endsWith(String(cmp.value));
        case 'matches':
            return safeRegex(String(cmp.value)).test(String(actual));
        case 'in':
            return (cmp.value as PipeValue[]).some((v) => looseEquals(actual, v));
        default:
            return false;
    }
}

function looseEquals(a: PipeValue, b: PipeValue): boolean {
    if (a === b) {
        return true;
    }
    return String(a) === String(b);
}

/** Numeric comparison when both sides are numeric; otherwise lexicographic on their string forms. */
function compare(a: PipeValue, b: PipeValue): number {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na - nb;
    }
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function safeRegex(pattern: string): RegExp {
    try {
        return new RegExp(pattern);
    } catch (e) {
        throw new Error(`Invalid regex in "matches": ${(e as Error).message}`);
    }
}
