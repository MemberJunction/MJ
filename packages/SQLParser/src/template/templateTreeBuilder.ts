import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import { InertCommentDiagnostic } from '../lexer/sqlTokens.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import { IsCompositionBody, ParseComposition } from './compositionParser.js';
import { TemplateExpressionParser } from './expressionParser.js';
import type { TemplateExpression } from './expressionTypes.js';
import type { ElseBranch, IfBranch, TemplateNode } from './templateNodes.js';

/** The tree of a template and what went wrong building it. */
export interface BuiltTree {
    readonly Nodes: readonly TemplateNode[];
    readonly Diagnostics: readonly Diagnostic[];
}

/** A branch being filled. */
interface OpenBranch {
    Kind: 'If' | 'ElseIf' | 'Else';
    TagSpan: Span;
    Condition: TemplateExpression | null;
    Body: TemplateNode[];
}

/** A block whose end tag has not been reached. */
type Frame =
    | { Kind: 'Root'; Body: TemplateNode[] }
    | { Kind: 'If'; Start: number; Branches: OpenBranch[] }
    | { Kind: 'For'; Start: number; TagSpan: Span; LoopVariable: string; LoopVariableSpan: Span; Iterable: TemplateExpression; Body: TemplateNode[] };

const BLOCK_HEAD = /^\s*([A-Za-z_]\w*)/;
const FOR_HEAD = /^\s*for\s+([A-Za-z_]\w*)\s+in\b/;
const SET_HEAD = /^\s*set\s+([A-Za-z_]\w*)\s*=(?!=)/;
/** Blocks nested deeper than this are refused, which keeps every walk of the tree shallow. */
export const MAX_BLOCK_NESTING = 64;
const REFUSED_TAG_HINT = 'MJ Query allows only if / elif / else / endif, for / endfor and set block tags.';

/**
 * Builds the template tree from a token stream: SQL text runs, holes, compositions, comments,
 * and nested `if` / `for` blocks. Tags outside the language become `Unknown` nodes. Unclosed
 * blocks are closed at the end of the text and reported. Runs in linear time; never throws.
 */
export class TemplateTreeBuilder {
    private readonly stack: Frame[] = [{ Kind: 'Root', Body: [] }];
    private readonly diagnostics: Diagnostic[] = [];
    private pendingSql: SqlToken[] = [];
    /** Openers refused for nesting too deeply whose end tags have not been reached. */
    private overflow = 0;

    private constructor(private readonly tokens: SqlTokens) {}

    /** Builds the tree for a token stream. */
    static Build(tokens: SqlTokens): BuiltTree {
        const builder = new TemplateTreeBuilder(tokens);
        for (const token of tokens.Tokens) builder.add(token);
        return builder.finish();
    }

    private add(token: SqlToken): void {
        if (token.Template === null && token.Kind !== 'Unknown') {
            this.pendingSql.push(token);
            return;
        }
        if (token.Template !== null && token.Template.SqlContext === 'Comment') {
            this.diagnostics.push(InertCommentDiagnostic(token.Span));
            this.pendingSql.push(token);
            return;
        }
        this.flushSql();
        if (token.Kind === 'Unknown') this.addUnknown(token.Span, token.Text, 'A template opener with no closer.');
        else if (token.Kind === 'TemplateComment') this.addComment(token);
        else if (token.Kind === 'TemplateExpression') this.addExpression(token);
        else this.addBlock(token);
    }

    private finish(): BuiltTree {
        this.flushSql();
        const end = this.tokens.Text.length;
        while (this.stack.length > 1) {
            const frame = this.top();
            this.report(MJQueryDiagnosticCodes.UnclosedBlock, frameStartSpan(frame),
                `This {% ${frame.Kind === 'If' ? 'if' : 'for'} %} block has no {% end${frame.Kind === 'If' ? 'if' : 'for'} %}.`,
                'Close the block before the end of the query.');
            this.closeFrame(end, false);
        }
        return { Nodes: this.body(), Diagnostics: this.diagnostics };
    }

    // ─── Leaves ───────────────────────────────────────────

    private flushSql(): void {
        if (this.pendingSql.length === 0) return;
        const first = this.pendingSql[0];
        const last = this.pendingSql[this.pendingSql.length - 1];
        const span = { Start: first.Span.Start, End: last.Span.End };
        this.body().push({ Kind: 'SqlText', Span: span, Text: this.tokens.Slice(span), Tokens: this.pendingSql });
        this.pendingSql = [];
    }

    private addComment(token: SqlToken): void {
        const tag = token.Template;
        if (tag === null) return;
        this.body().push({ Kind: 'DocComment', Span: token.Span, Token: token, Body: tag.Body, BodySpan: tag.BodySpan });
    }

    private addExpression(token: SqlToken): void {
        const tag = token.Template;
        if (tag === null) return;
        if (IsCompositionBody(tag.Body)) {
            const parsed = ParseComposition(token, this.tokens.Text);
            this.diagnostics.push(...parsed.Diagnostics);
            if (parsed.Node) this.body().push(parsed.Node);
            else this.addUnknown(token.Span, token.Text, 'A composition token that does not parse.');
            return;
        }
        const expression = this.parseExpression(tag.BodySpan.Start, tag.BodySpan.End);
        this.body().push({ Kind: 'Expression', Span: token.Span, Token: token, Expression: expression, SqlContext: tag.SqlContext });
    }

    private addUnknown(span: Span, text: string, reason: string): void {
        this.body().push({ Kind: 'Unknown', Span: span, Text: text, Reason: reason });
    }

    // ─── Block tags ───────────────────────────────────────

    private addBlock(token: SqlToken): void {
        const tag = token.Template;
        if (tag === null) return;
        const head = BLOCK_HEAD.exec(tag.Body);
        const keyword = head ? head[1] : '';
        const afterKeyword = tag.BodySpan.Start + (head ? head[0].length : 0);
        if (this.absorbOverflow(token, keyword)) return;
        switch (keyword) {
            case 'if': this.openIf(token, afterKeyword); break;
            case 'elif': case 'elseif': this.addElseIf(token, afterKeyword); break;
            case 'else': this.addElse(token); break;
            case 'endif': this.closeBlock(token, 'If'); break;
            case 'for': this.openFor(token); break;
            case 'endfor': this.closeBlock(token, 'For'); break;
            case 'set': this.addSet(token); break;
            default: this.refuseTag(token, keyword);
        }
    }

    /**
     * Handles a block tag at or past the nesting limit: a new `if` / `for` opener is refused, and
     * the tags belonging to a refused opener are absorbed without further diagnostics.
     */
    private absorbOverflow(token: SqlToken, keyword: string): boolean {
        const opens = keyword === 'if' || keyword === 'for';
        if (opens && (this.overflow > 0 || this.stack.length > MAX_BLOCK_NESTING)) {
            if (this.overflow === 0) {
                this.report(MJQueryDiagnosticCodes.Syntax, token.Span, `Blocks are nested more than ${MAX_BLOCK_NESTING} deep.`, 'Flatten the conditions.');
            }
            this.overflow++;
            this.addUnknown(token.Span, token.Text, 'A block nested too deeply.');
            return true;
        }
        if (this.overflow === 0) return false;
        if (keyword === 'endif' || keyword === 'endfor') this.overflow--;
        if (['endif', 'endfor', 'elif', 'elseif', 'else'].includes(keyword)) {
            this.addUnknown(token.Span, token.Text, 'A tag of a block nested too deeply.');
            return true;
        }
        return false;
    }

    private openIf(token: SqlToken, conditionStart: number): void {
        const condition = this.parseExpression(conditionStart, this.bodyEnd(token));
        const branch: OpenBranch = { Kind: 'If', TagSpan: token.Span, Condition: condition, Body: [] };
        this.stack.push({ Kind: 'If', Start: token.Span.Start, Branches: [branch] });
    }

    private addElseIf(token: SqlToken, conditionStart: number): void {
        const frame = this.top();
        if (frame.Kind !== 'If' || lastBranch(frame.Branches).Kind === 'Else') {
            this.unexpected(token, 'This {% elif %} does not follow an {% if %} or {% elif %} branch.');
            return;
        }
        const condition = this.parseExpression(conditionStart, this.bodyEnd(token));
        frame.Branches.push({ Kind: 'ElseIf', TagSpan: token.Span, Condition: condition, Body: [] });
    }

    private addElse(token: SqlToken): void {
        const frame = this.top();
        if (frame.Kind === 'For') {
            this.refuseTag(token, 'for … else');
            return;
        }
        if (frame.Kind !== 'If' || lastBranch(frame.Branches).Kind === 'Else') {
            this.unexpected(token, 'This {% else %} does not belong to an open {% if %}.');
            return;
        }
        frame.Branches.push({ Kind: 'Else', TagSpan: token.Span, Condition: null, Body: [] });
    }

    private openFor(token: SqlToken): void {
        const tag = token.Template;
        const head = tag ? FOR_HEAD.exec(tag.Body) : null;
        if (tag === null || head === null) {
            this.report(MJQueryDiagnosticCodes.ForIterable, token.Span, 'A {% for %} tag must read {% for Item in ArrayParameter %}.',
                'Loop over one array parameter with one loop variable.');
            this.addUnknown(token.Span, token.Text, 'A for tag with an unsupported shape.');
            return;
        }
        const variableStart = tag.BodySpan.Start + head[0].indexOf(head[1], head[0].indexOf('for') + 3);
        const iterable = this.parseExpression(tag.BodySpan.Start + head[0].length, this.bodyEnd(token));
        this.stack.push({
            Kind: 'For', Start: token.Span.Start, TagSpan: token.Span, LoopVariable: head[1],
            LoopVariableSpan: { Start: variableStart, End: variableStart + head[1].length }, Iterable: iterable, Body: [],
        });
    }

    private addSet(token: SqlToken): void {
        const tag = token.Template;
        const head = tag ? SET_HEAD.exec(tag.Body) : null;
        if (tag === null || head === null) {
            this.refuseTag(token, 'set without "="');
            return;
        }
        const nameStart = tag.BodySpan.Start + head[0].indexOf(head[1], head[0].indexOf('set') + 3);
        const value = this.parseExpression(tag.BodySpan.Start + head[0].length, this.bodyEnd(token));
        this.body().push({
            Kind: 'Set', Span: token.Span, Name: head[1], NameSpan: { Start: nameStart, End: nameStart + head[1].length }, Value: value,
        });
    }

    /** Closes the innermost block of `kind`, reporting any blocks left open inside it. */
    private closeBlock(token: SqlToken, kind: 'If' | 'For'): void {
        const index = this.findFrame(kind);
        const word = kind === 'If' ? 'endif' : 'endfor';
        if (index < 0) {
            this.unexpected(token, `This {% ${word} %} has no open {% ${kind === 'If' ? 'if' : 'for'} %}.`);
            return;
        }
        while (this.stack.length - 1 > index) {
            const inner = this.top();
            this.report(MJQueryDiagnosticCodes.UnclosedBlock, frameStartSpan(inner), `This block is not closed before {% ${word} %}.`,
                'Close inner blocks before the outer one.');
            this.closeFrame(token.Span.Start, false);
        }
        this.closeFrame(token.Span.End, true);
    }

    private closeFrame(end: number, closed: boolean): void {
        const frame = this.stack.pop();
        if (frame === undefined || frame.Kind === 'Root') return;
        if (frame.Kind === 'For') {
            const { Kind, Start, TagSpan, LoopVariable, LoopVariableSpan, Iterable, Body } = frame;
            this.body().push({ Kind, Span: { Start, End: end }, TagSpan, LoopVariable, LoopVariableSpan, Iterable, Body, Closed: closed });
            return;
        }
        this.body().push(buildIfNode(frame.Start, frame.Branches, end, closed));
    }

    private refuseTag(token: SqlToken, keyword: string): void {
        const name = keyword === '' ? 'an empty tag' : `{% ${keyword} %}`;
        this.report(MJQueryDiagnosticCodes.UnsupportedTag, token.Span, `${name} is not part of the MJ Query language.`, REFUSED_TAG_HINT);
        this.addUnknown(token.Span, token.Text, `Unsupported block tag: ${keyword || '(empty)'}`);
    }

    private unexpected(token: SqlToken, message: string): void {
        this.report(MJQueryDiagnosticCodes.UnexpectedTag, token.Span, message, 'Remove the tag, or add the block it belongs to.');
        this.addUnknown(token.Span, token.Text, message);
    }

    // ─── Helpers ──────────────────────────────────────────

    private parseExpression(start: number, end: number): TemplateExpression {
        const parsed = TemplateExpressionParser.Parse(this.tokens.Text, start, end);
        this.diagnostics.push(...parsed.Diagnostics);
        return parsed.Expression;
    }

    private bodyEnd(token: SqlToken): number {
        return token.Template ? token.Template.BodySpan.End : token.Span.End;
    }

    private top(): Frame {
        return this.stack[this.stack.length - 1];
    }

    private findFrame(kind: 'If' | 'For'): number {
        for (let i = this.stack.length - 1; i > 0; i--) {
            if (this.stack[i].Kind === kind) return i;
        }
        return -1;
    }

    /** The node list new nodes go into: the open branch or loop body, or the root. */
    private body(): TemplateNode[] {
        const frame = this.top();
        if (frame.Kind === 'If') return lastBranch(frame.Branches).Body;
        return frame.Body;
    }

    private report(code: string, span: Span, message: string, hint: string | null): void {
        this.diagnostics.push(MakeDiagnostic(code, 'Error', span, message, hint));
    }
}

function lastBranch(branches: OpenBranch[]): OpenBranch {
    return branches[branches.length - 1];
}

function frameStartSpan(frame: Frame): Span {
    if (frame.Kind === 'Root') return { Start: 0, End: 0 };
    if (frame.Kind === 'For') return frame.TagSpan;
    return frame.Branches[0].TagSpan;
}

/** Turns the branches of a closed `if` frame into an {@link IfNode}. */
function buildIfNode(start: number, branches: OpenBranch[], end: number, closed: boolean): TemplateNode {
    const spans = branches.map((b, i) => ({ Start: b.TagSpan.Start, End: i + 1 < branches.length ? branches[i + 1].TagSpan.Start : end }));
    const conditional: IfBranch[] = [];
    let elseBranch: ElseBranch | null = null;
    branches.forEach((branch, i) => {
        if (branch.Kind === 'Else' || branch.Condition === null) {
            elseBranch = { Span: spans[i], TagSpan: branch.TagSpan, Body: branch.Body };
        } else {
            conditional.push({ Kind: branch.Kind, Span: spans[i], TagSpan: branch.TagSpan, Condition: branch.Condition, Body: branch.Body });
        }
    });
    return { Kind: 'If', Span: { Start: start, End: end }, Branches: conditional, Else: elseBranch, Closed: closed };
}
