import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import type { DocCommentEntry } from './docComments.js';
import { EnclosingClauseKeyword, KeywordOf, PrecedingSignificantIndex } from './sqlPosition.js';

/** What {@link TrailingDocReader.Read} found. */
export interface TrailingDocResult {
    readonly Entries: readonly DocCommentEntry[];
    readonly Diagnostics: readonly Diagnostic[];
}

const MARKER = '--:';
const AMBIGUOUS_HINT = 'Put "--: description" at the end of the line of an aliased select item, or use {# @field Name description #}.';
/** Keywords that end an expression but are never its alias. */
const NOT_AN_ALIAS: ReadonlySet<string> = new Set(['END', 'NULL', 'TRUE', 'FALSE', 'DISTINCT', 'ALL', 'SELECT']);

/**
 * Reads trailing `--: description` comments on select-list lines. Each attaches to the select
 * item that ends just before it on the same line, named by its alias (`expr AS Name`,
 * `expr Name`, `Name = expr`) or, for a plain column, by the column's name. Best effort: a
 * comment on its own line, outside the outermost select list, or after an item with no name is
 * reported and ignored.
 */
export class TrailingDocReader {
    private readonly entries: DocCommentEntry[] = [];
    private readonly diagnostics: Diagnostic[] = [];
    private firstTopSelect: number | null | undefined = undefined;

    private constructor(private readonly tokens: SqlTokens) {}

    /** Reads every trailing `--:` comment in the stream. */
    static Read(tokens: SqlTokens): TrailingDocResult {
        const reader = new TrailingDocReader(tokens);
        tokens.Tokens.forEach((token, index) => {
            if (token.Kind === 'Comment' && token.Text.startsWith(MARKER) && !token.ContainsTemplate) reader.readComment(index);
        });
        return { Entries: reader.entries, Diagnostics: reader.diagnostics };
    }

    private readComment(index: number): void {
        const comment = this.tokens.Tokens[index];
        const description = comment.Text.substring(MARKER.length).trim();
        if (this.startsItsLine(index)) {
            this.ambiguous(comment.Span, 'A "--:" comment on its own line does not say which select item it describes.');
            return;
        }
        let end = PrecedingSignificantIndex(this.tokens, index);
        if (end >= 0 && this.tokens.Tokens[end].Text === ',') end = PrecedingSignificantIndex(this.tokens, end);
        const item = end >= 0 ? this.selectItem(end) : null;
        if (item === null) return;
        const name = itemName(item);
        if (name === null) {
            this.ambiguous(comment.Span, 'The select item before this "--:" comment has no alias or column name.');
            return;
        }
        this.entries.push({
            Name: unquote(name), Description: description, DeclaredType: null, Source: 'Trailing', Span: comment.Span, NameSpan: name.Span,
        });
    }

    /** Whether only whitespace sits between the start of the line and the comment. */
    private startsItsLine(index: number): boolean {
        for (let i = index - 1; i >= 0; i--) {
            const token = this.tokens.Tokens[i];
            if (token.Kind !== 'Whitespace') return false;
            if (/[\r\n]/.test(token.Text)) return true;
        }
        return true;
    }

    /** The significant tokens of the select item ending at `end`, or `null` (reported) when it is not one. */
    private selectItem(end: number): SqlToken[] | null {
        const span = this.tokens.Tokens[end].Span;
        const clause = EnclosingClauseKeyword(this.tokens, end);
        if (clause === null || clause.Keyword !== 'SELECT') {
            this.ambiguous(span, 'This "--:" comment does not follow a select-list item.');
            return null;
        }
        if (this.tokens.Tokens[end].Depth !== 0 || clause.Index !== this.firstTopLevelSelect()) {
            this.ambiguous(span, 'This "--:" comment is in a nested or later SELECT; only the outermost select list names the query\'s fields.');
            return null;
        }
        return this.itemTokens(clause.Index, end);
    }

    /** The significant tokens after the item's start (the SELECT keyword or the previous comma) up to `end`. */
    private itemTokens(selectIndex: number, end: number): SqlToken[] {
        const depth = this.tokens.Tokens[end].Depth;
        const item: SqlToken[] = [];
        for (let i = end; i > selectIndex; i--) {
            const token = this.tokens.Tokens[i];
            if (token.Depth === depth && token.Text === ',' && token.Kind === 'Punctuation') break;
            if (token.Kind !== 'Whitespace' && token.Kind !== 'Comment' && token.Kind !== 'TemplateComment' && token.Kind !== 'TemplateBlock') item.unshift(token);
        }
        return stripSelectModifiers(item);
    }

    /** The index of the first SELECT at depth 0, or `null`. Found once. */
    private firstTopLevelSelect(): number | null {
        if (this.firstTopSelect === undefined) {
            const index = this.tokens.Tokens.findIndex(t => t.Depth === 0 && KeywordOf(t) === 'SELECT');
            this.firstTopSelect = index < 0 ? null : index;
        }
        return this.firstTopSelect;
    }

    private ambiguous(span: Span, message: string): void {
        this.diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.DocTrailingAmbiguous, 'Warning', span, message, AMBIGUOUS_HINT));
    }
}

/** Drops a leading DISTINCT / ALL and a TOP n [PERCENT] [WITH TIES] from the first item. */
function stripSelectModifiers(item: SqlToken[]): SqlToken[] {
    let i = 0;
    const keyword = (at: number) => KeywordOf(item[at]);
    if (keyword(i) === 'DISTINCT' || keyword(i) === 'ALL') i++;
    if (keyword(i) === 'TOP') {
        i++;
        if (item[i]?.Text === '(') {
            const depth = item[i].Depth;
            i++;
            while (i < item.length && !(item[i].Text === ')' && item[i].Depth === depth)) i++;
        }
        i++;
        if (keyword(i) === 'PERCENT') i++;
        if (keyword(i) === 'WITH' && keyword(i + 1) === 'TIES') i += 2;
    }
    return item.slice(i);
}

/** The token naming a select item, or `null` when it has none. */
function itemName(item: readonly SqlToken[]): SqlToken | null {
    if (item.length === 0) return null;
    if (item.length >= 3 && isName(item[0]) && item[1].Text === '=' && item[1].Kind === 'Operator') return item[0];
    const last = item[item.length - 1];
    if (!isName(last)) return null;
    return item.length === 1 || !NOT_AN_ALIAS.has(last.Text.toUpperCase()) ? last : null;
}

function isName(token: SqlToken | undefined): token is SqlToken {
    return token !== undefined && (token.Kind === 'Word' || token.Kind === 'QuotedIdentifier');
}

/** A name without its quotes: `[Total]`, `"Total"` and `` `Total` `` all give `Total`. */
function unquote(token: SqlToken): string {
    if (token.Kind !== 'QuotedIdentifier' || token.Text.length < 2) return token.Text;
    const close = token.Text[token.Text.length - 1];
    return token.Text.substring(1, token.Text.length - 1).split(close + close).join(close);
}
