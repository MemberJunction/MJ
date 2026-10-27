import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import { LexExpression } from './expressionLexer.js';
import type { ExpressionLexOptions, ExpressionToken } from './expressionLexer.js';
import type {
    TemplateBinaryOperator,
    TemplateExpression,
    UnsupportedConstruct,
} from './expressionTypes.js';

/** An expression and what went wrong reading it. */
export interface ParsedExpression {
    readonly Expression: TemplateExpression;
    readonly Diagnostics: readonly Diagnostic[];
}

/** One `Name = Expression` argument. */
export interface ParsedArgument {
    readonly Name: string;
    readonly NameSpan: Span;
    readonly Expression: TemplateExpression;
    readonly Span: Span;
}

/** An argument list and what went wrong reading it. */
export interface ParsedArguments {
    readonly Arguments: readonly ParsedArgument[];
    readonly Diagnostics: readonly Diagnostic[];
}

const COMPARISONS: ReadonlyMap<string, TemplateBinaryOperator> = new Map<string, TemplateBinaryOperator>([
    ['==', '=='], ['!=', '!='], ['<', '<'], ['>', '>'], ['<=', '<='], ['>=', '>='],
]);
const ADDITIVE: ReadonlyMap<string, TemplateBinaryOperator> = new Map<string, TemplateBinaryOperator>([['+', '+'], ['-', '-']]);
const MULTIPLICATIVE: ReadonlyMap<string, TemplateBinaryOperator> = new Map<string, TemplateBinaryOperator>([['*', '*'], ['/', '/'], ['%', '%']]);
const KEYWORDS: ReadonlySet<string> = new Set(['and', 'or', 'not', 'if', 'else', 'in', 'is']);
const MAX_DEPTH = 100;

const CONSTRUCT_RULES: Readonly<Record<UnsupportedConstruct, { Code: string; Message: string; Hint: string | null }>> = {
    FunctionCall: { Code: MJQueryDiagnosticCodes.FunctionCall, Message: 'Function and method calls are not part of the MJ Query language.', Hint: 'Compute the value in SQL, or pass it as a parameter.' },
    Subscript: { Code: MJQueryDiagnosticCodes.Subscript, Message: 'Subscripts (x[0], x["key"]) are not part of the MJ Query language.', Hint: 'Pass the value as its own parameter, or loop over an array with {% for %}.' },
    InlineIf: { Code: MJQueryDiagnosticCodes.InlineIf, Message: 'Inline "a if b else c" expressions are not part of the MJ Query language.', Hint: 'Use an {% if %} … {% else %} … {% endif %} block.' },
    MemberAccess: { Code: MJQueryDiagnosticCodes.MemberAccess, Message: 'Attribute access is allowed only as Context.<Token> or loop.<member>.', Hint: 'Pass the value as its own parameter.' },
    Operator: { Code: MJQueryDiagnosticCodes.UnsupportedOperator, Message: 'This operator or literal form is not part of the MJ Query language.', Hint: 'Use + - * / %, == != < > <= >=, and, or, not, and parentheses.' },
    Syntax: { Code: MJQueryDiagnosticCodes.Syntax, Message: 'This expression does not parse.', Hint: null },
};

/**
 * The MJ Query expression grammar, a small recursive-descent parser:
 *
 * ```
 * expression := or ["if" or ["else" or]]          (inline if: refused)
 * or         := and ("or" and)*
 * and        := not ("and" not)*
 * not        := "not" not | compare
 * compare    := additive (("==" | "!=" | "<" | ">" | "<=" | ">=") additive)*
 * additive   := term (("+" | "-") term)*
 * term       := unary (("*" | "/" | "%") unary)*
 * unary      := ("-" | "+") unary | postfix, then filters ("|" name ["(" args ")"])*
 * postfix    := primary ("." name | "(" args ")" | "[" expression "]")*
 * primary    := name | number | string | true | false | null | "(" expression ")"
 * ```
 *
 * Filters bind tighter than every binary operator, as in Nunjucks. Constructs outside the
 * grammar parse into `Unsupported` nodes with a diagnostic; parsing never throws.
 */
export class TemplateExpressionParser {
    private readonly tokens: ExpressionToken[];
    private position = 0;
    private depth = 0;
    private bailed = false;
    private lastEnd: number;
    private readonly diagnostics: Diagnostic[] = [];

    private constructor(private readonly source: string, start: number, end: number, options: ExpressionLexOptions = {}) {
        this.tokens = LexExpression(source, start, end, options);
        this.lastEnd = start;
    }

    /** Parses `source` from `start` to `end` as one expression. Offsets in the result are absolute. */
    static Parse(source: string, start: number, end: number): ParsedExpression {
        const parser = new TemplateExpressionParser(source, start, end);
        const expression = parser.parseWhole();
        return { Expression: expression, Diagnostics: parser.diagnostics };
    }

    /**
     * Parses `Name = Expression, …` from `start` to `end`, as in a composition's argument list.
     * An empty range is an empty list. String values accept both a backslash escape (`'It\'s'`)
     * and the SQL doubled quote (`'It''s'`).
     */
    static ParseArguments(source: string, start: number, end: number): ParsedArguments {
        const parser = new TemplateExpressionParser(source, start, end, { DoubledQuoteEscape: true });
        const args = parser.parseArgumentList();
        return { Arguments: args, Diagnostics: parser.diagnostics };
    }

    private parseWhole(): TemplateExpression {
        if (this.peek().Kind === 'End') {
            return this.unsupported('Syntax', this.peek().Start, this.peek().End, [], 'The tag is empty.');
        }
        const expression = this.parseExpression();
        if (this.peek().Kind === 'End') return expression;
        const trailing = this.peek();
        const end = this.tokens[this.tokens.length - 1].Start;
        this.position = this.tokens.length - 1;
        return this.unsupported('Syntax', expression.Span.Start, end, [expression], `Unexpected "${trailing.Text}".`);
    }

    private parseArgumentList(): ParsedArgument[] {
        const args: ParsedArgument[] = [];
        while (this.peek().Kind !== 'End') {
            const argument = this.parseArgument();
            if (argument === null) return args;
            args.push(argument);
            if (!this.acceptOperator(',')) break;
        }
        if (this.peek().Kind !== 'End') this.report('Syntax', this.peek().Start, this.peek().End, `Unexpected "${this.peek().Text}" in the argument list.`);
        return args;
    }

    private parseArgument(): ParsedArgument | null {
        const name = this.peek();
        if (name.Kind !== 'Name' || !this.isOperatorAt(this.position + 1, '=')) {
            this.report('Syntax', name.Start, name.End, 'Each argument is written Name=Value.');
            return null;
        }
        this.position += 2;
        const expression = this.parseExpression();
        return { Name: name.Text, NameSpan: { Start: name.Start, End: name.End }, Expression: expression, Span: { Start: name.Start, End: expression.Span.End } };
    }

    // ─── Precedence levels ───────────────────────────────

    private parseExpression(): TemplateExpression {
        if (++this.depth > MAX_DEPTH) return this.bailOut();
        const condition = this.parseOr();
        this.depth--;
        if (!this.isKeyword('if')) return condition;
        this.advance();
        const parts = [condition, this.parseOr()];
        if (this.isKeyword('else')) { this.advance(); parts.push(this.parseOr()); }
        return this.unsupported('InlineIf', condition.Span.Start, this.lastEnd, parts);
    }

    private parseOr(): TemplateExpression {
        let left = this.parseAnd();
        while (this.isKeyword('or')) {
            this.advance();
            left = this.binary('or', left, this.parseAnd());
        }
        return left;
    }

    private parseAnd(): TemplateExpression {
        let left = this.parseNot();
        while (this.isKeyword('and')) {
            this.advance();
            left = this.binary('and', left, this.parseNot());
        }
        return left;
    }

    private parseNot(): TemplateExpression {
        if (!this.isKeyword('not') || this.isKeywordAt(this.position + 1, 'in')) return this.parseCompare();
        const start = this.advance().Start;
        if (++this.depth > MAX_DEPTH) return this.bailOut();
        const operand = this.parseNot();
        this.depth--;
        return { Kind: 'Unary', Operator: 'not', Operand: operand, Span: { Start: start, End: operand.Span.End } };
    }

    private parseCompare(): TemplateExpression {
        let left = this.parseAdditive();
        for (;;) {
            const operator = this.operatorFrom(COMPARISONS);
            if (operator !== undefined) {
                this.advance();
                left = this.binary(operator, left, this.parseAdditive());
            } else if (this.isUnsupportedComparison()) {
                this.advance();
                if (this.isKeyword('in') || this.isKeyword('not')) this.advance();
                const right = this.parseAdditive();
                left = this.unsupported('Operator', left.Span.Start, right.Span.End, [left, right]);
            } else {
                return left;
            }
        }
    }

    private isUnsupportedComparison(): boolean {
        const token = this.peek();
        if (token.Kind === 'Operator') return token.Text === '===' || token.Text === '!==';
        return this.isKeyword('in') || this.isKeyword('is') || (this.isKeyword('not') && this.isKeywordAt(this.position + 1, 'in'));
    }

    private parseAdditive(): TemplateExpression {
        let left = this.parseTerm();
        for (;;) {
            const operator = this.operatorFrom(ADDITIVE);
            if (operator !== undefined) {
                this.advance();
                left = this.binary(operator, left, this.parseTerm());
            } else if (this.isOperator('~')) {
                this.advance();
                const right = this.parseTerm();
                left = this.unsupported('Operator', left.Span.Start, right.Span.End, [left, right]);
            } else {
                return left;
            }
        }
    }

    private parseTerm(): TemplateExpression {
        let left = this.parseUnary(true);
        for (;;) {
            const operator = this.operatorFrom(MULTIPLICATIVE);
            if (operator !== undefined) {
                this.advance();
                left = this.binary(operator, left, this.parseUnary(true));
            } else if (this.isOperator('//') || this.isOperator('**')) {
                this.advance();
                const right = this.parseUnary(true);
                left = this.unsupported('Operator', left.Span.Start, right.Span.End, [left, right]);
            } else {
                return left;
            }
        }
    }

    private parseUnary(allowFilters: boolean): TemplateExpression {
        let node: TemplateExpression;
        if (this.isOperator('-') || this.isOperator('+')) {
            const token = this.advance();
            if (++this.depth > MAX_DEPTH) return this.bailOut();
            const operand = this.parseUnary(false);
            this.depth--;
            node = { Kind: 'Unary', Operator: token.Text === '-' ? '-' : '+', Operand: operand, Span: { Start: token.Start, End: operand.Span.End } };
        } else {
            node = this.parsePostfix(this.parsePrimary());
        }
        return allowFilters ? this.parseFilters(node) : node;
    }

    // ─── Postfix, filters, primaries ─────────────────────

    private parsePostfix(primary: TemplateExpression): TemplateExpression {
        let node = primary;
        for (;;) {
            if (this.isOperator('.')) node = this.parseMember(node);
            else if (this.isOperator('(')) node = this.parseCall(node);
            else if (this.isOperator('[')) node = this.parseSubscript(node);
            else return node;
        }
    }

    private parseMember(object: TemplateExpression): TemplateExpression {
        this.advance();
        const name = this.peek();
        if (name.Kind !== 'Name') return this.unsupported('Syntax', object.Span.Start, this.lastEnd, [object], 'Expected a name after ".".');
        this.advance();
        const span = { Start: object.Span.Start, End: name.End };
        if (object.Kind === 'Name' && object.Name === 'Context') {
            return { Kind: 'Context', Token: name.Text, FullName: `Context.${name.Text}`, Span: span };
        }
        if (object.Kind === 'Name' && object.Name === 'loop') return { Kind: 'LoopMember', Member: name.Text, Span: span };
        return this.unsupported('MemberAccess', span.Start, span.End, [object]);
    }

    private parseCall(callee: TemplateExpression): TemplateExpression {
        this.advance();
        const args = this.parseCallArguments();
        return this.unsupported('FunctionCall', callee.Span.Start, this.lastEnd, [callee, ...args]);
    }

    private parseSubscript(object: TemplateExpression): TemplateExpression {
        this.advance();
        const index = this.parseExpression();
        this.expectOperator(']');
        return this.unsupported('Subscript', object.Span.Start, this.lastEnd, [object, index]);
    }

    private parseFilters(input: TemplateExpression): TemplateExpression {
        let node = input;
        while (this.isOperator('|')) {
            this.advance();
            const name = this.peek();
            if (name.Kind !== 'Name') return this.unsupported('Syntax', node.Span.Start, this.lastEnd, [node], 'Expected a filter name after "|".');
            this.advance();
            const args = this.acceptOperator('(') ? this.parseCallArguments() : [];
            node = { Kind: 'Filter', Input: node, Name: name.Text, NameSpan: { Start: name.Start, End: name.End }, Arguments: args, Span: { Start: node.Span.Start, End: this.lastEnd } };
        }
        return node;
    }

    /** Reads `expression, …)` after an opening parenthesis. */
    private parseCallArguments(): TemplateExpression[] {
        const args: TemplateExpression[] = [];
        if (this.acceptOperator(')')) return args;
        for (;;) {
            args.push(this.parseExpression());
            if (this.acceptOperator(',')) continue;
            this.expectOperator(')');
            return args;
        }
    }

    private parsePrimary(): TemplateExpression {
        const token = this.peek();
        if (token.Kind === 'Number') return this.literal(token, 'Number', token.Value);
        if (token.Kind === 'String') return this.parseString(token);
        if (token.Kind === 'Name' && !KEYWORDS.has(token.Text)) return this.parseNamePrimary(token);
        if (this.isOperator('(')) return this.parseGroup();
        if (this.isOperator('[') || this.isOperator('{')) return this.parseCollection(token);
        if (token.Kind === 'End') return this.unsupported('Syntax', token.Start, token.End, [], 'Expected a value.');
        this.advance();
        return this.unsupported('Syntax', token.Start, token.End, [], `Unexpected "${token.Text}".`);
    }

    private parseString(token: ExpressionToken): TemplateExpression {
        if (token.Unterminated) {
            this.advance();
            return this.unsupported('Syntax', token.Start, token.End, [], 'This string has no closing quote.');
        }
        return this.literal(token, 'String', token.Value);
    }

    private parseNamePrimary(token: ExpressionToken): TemplateExpression {
        if (token.Text === 'true' || token.Text === 'True') return this.literal(token, 'Boolean', true);
        if (token.Text === 'false' || token.Text === 'False') return this.literal(token, 'Boolean', false);
        if (token.Text === 'null' || token.Text === 'none' || token.Text === 'None') return this.literal(token, 'Null', null);
        this.advance();
        return { Kind: 'Name', Name: token.Text, Span: { Start: token.Start, End: token.End } };
    }

    private parseGroup(): TemplateExpression {
        this.advance();
        const inner = this.parseExpression();
        this.expectOperator(')');
        return inner;
    }

    /** A list `[a, b]` or object `{…}` literal: read and refused. */
    private parseCollection(open: ExpressionToken): TemplateExpression {
        const close = open.Text === '[' ? ']' : '}';
        this.advance();
        const parts: TemplateExpression[] = [];
        while (this.peek().Kind !== 'End' && !this.isOperator(close)) {
            const before = this.position;
            parts.push(this.parseExpression());
            if (!this.acceptOperator(',') && !this.acceptOperator(':') && this.position === before) this.advance();
        }
        this.expectOperator(close);
        return this.unsupported('Operator', open.Start, this.lastEnd, parts, 'List and object literals are not part of the MJ Query language.');
    }

    // ─── Helpers ──────────────────────────────────────────

    private literal(token: ExpressionToken, type: 'String' | 'Number' | 'Boolean' | 'Null', value: string | number | boolean | null): TemplateExpression {
        this.advance();
        return { Kind: 'Literal', LiteralType: type, Value: value, Span: { Start: token.Start, End: token.End } };
    }

    private binary(operator: TemplateBinaryOperator, left: TemplateExpression, right: TemplateExpression): TemplateExpression {
        return { Kind: 'Binary', Operator: operator, Left: left, Right: right, Span: { Start: left.Span.Start, End: right.Span.End } };
    }

    private unsupported(construct: UnsupportedConstruct, start: number, end: number, parts: TemplateExpression[], message?: string): TemplateExpression {
        const safeEnd = Math.max(start, end);
        this.report(construct, start, safeEnd, message);
        return { Kind: 'Unsupported', Construct: construct, Text: this.source.substring(start, safeEnd), Parts: parts, Span: { Start: start, End: safeEnd } };
    }

    private report(construct: UnsupportedConstruct, start: number, end: number, message?: string): void {
        if (this.bailed) return;
        const rule = CONSTRUCT_RULES[construct];
        this.diagnostics.push(MakeDiagnostic(rule.Code, 'Error', { Start: start, End: end }, message ?? rule.Message, rule.Hint));
    }

    /** Gives up on an expression nested too deeply: skips to the end of the tag. */
    private bailOut(): TemplateExpression {
        const start = this.peek().Start;
        this.position = this.tokens.length - 1;
        const end = this.tokens[this.position].Start;
        const node = this.unsupported('Syntax', start, end, [], 'This expression is nested too deeply.');
        this.bailed = true;
        return node;
    }

    /** The current token's operator, when it is one of `operators`. */
    private operatorFrom(operators: ReadonlyMap<string, TemplateBinaryOperator>): TemplateBinaryOperator | undefined {
        const token = this.peek();
        return token.Kind === 'Operator' ? operators.get(token.Text) : undefined;
    }

    private peek(): ExpressionToken {
        return this.tokens[this.position];
    }

    private advance(): ExpressionToken {
        const token = this.tokens[this.position];
        if (token.Kind !== 'End') {
            this.position++;
            this.lastEnd = token.End;
        }
        return token;
    }

    private isOperator(text: string): boolean {
        return this.isOperatorAt(this.position, text);
    }

    private isOperatorAt(index: number, text: string): boolean {
        const token = this.tokens[index];
        return token !== undefined && token.Kind === 'Operator' && token.Text === text;
    }

    private isKeyword(word: string): boolean {
        return this.isKeywordAt(this.position, word);
    }

    private isKeywordAt(index: number, word: string): boolean {
        const token = this.tokens[index];
        return token !== undefined && token.Kind === 'Name' && token.Text === word;
    }

    private acceptOperator(text: string): boolean {
        if (!this.isOperator(text)) return false;
        this.advance();
        return true;
    }

    private expectOperator(text: string): void {
        if (this.acceptOperator(text)) return;
        const token = this.peek();
        this.report('Syntax', token.Start, token.End, `Expected "${text}".`);
    }
}
