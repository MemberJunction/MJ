import type { ParserDialect } from '@memberjunction/sql-dialect';
import { SqlDocument } from '../sql/sqlDocument.js';
import { WalkSqlNodes } from '../sql/sqlWalker.js';
import { QueryTemplate } from '../template/queryTemplate.js';
import { BranchEvaluator } from '../template/branchEvaluator.js';
import type { BranchLookup, LoopMemberLookup } from '../template/branchEvaluator.js';
import { BranchVariantValues } from '../template/branchVariants.js';
import type { BranchVariant, BranchVariantSet } from '../template/branchVariants.js';
import type { TemplateExpression, TemplateLiteralValue } from '../template/expressionTypes.js';
import { FindSqlFilter } from '../template/queryLanguage.js';
import { AllNodes } from '../template/templateNodes.js';
import type { CompositionNode, ExpressionNode, IfNode, TemplateNode } from '../template/templateNodes.js';
import { UnwrapFilters } from '../template/templateWalker.js';
import { IsTableSourcePosition, PrecedingSignificantIndex } from '../template/sqlPosition.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';

/** One SQL reading of a text: the SQL a render of it gives, parsed. */
export interface SqlView {
    /** The SQL text the view parsed: the input itself, or a render with template tags replaced by placeholders. */
    readonly Text: string;
    readonly Document: SqlDocument;
    /**
     * Whether the SQL parsed with no error. A statement that is not a query (`SET`, `DECLARE`,
     * `DELETE`) is kept whole with a warning and does not make the reading incomplete.
     */
    readonly Complete: boolean;
}

/** The most branch variants rendered beyond the base, so a template with many blocks stays linear. */
const MAX_VARIANT_RENDERS = 32;

/** `loop.<member>` values for a loop body rendered once: a one-item iteration. */
const SINGLE_ITERATION: Readonly<Record<string, TemplateLiteralValue>> = Object.freeze({
    first: true, last: true, index: 1, index0: 0, revindex: 1, revindex0: 0, length: 1,
});

const singleIteration: LoopMemberLookup = member => SINGLE_ITERATION[member];

/**
 * The SQL readings of a text that may hold MJ template tags. Plain SQL has one view, the text
 * itself. A template has one view per branch variant (`QueryTemplate.BranchVariants`): each
 * renders the branches the variant takes, a `{% for %}` body once, and every `{{ }}` hole as a
 * placeholder of the kind its filter writes (a string literal, a number, a bare identifier, an
 * IN list), the way the legacy placeholder substitution did. A `{{query:"…"}}` composition renders
 * as a derived table, so it is never read as a table name. The base variant comes first.
 *
 * Variants that only drop a block (an `{% if %}` with no `{% else %}` toggled off) add no SQL and
 * are not rendered; at most {@link MAX_VARIANT_RENDERS} others are.
 */
export function TemplateSqlViews(text: string, dialect: ParserDialect): SqlView[] {
    const template = QueryTemplate.Parse(text, dialect);
    if (!template.Tokens.HasTemplate) return [view(text, dialect)];
    const renderer = new SkeletonRenderer(template.Nodes, template.Tokens);
    const variants = template.BranchVariants().Value;
    const views = [view(renderer.Render(lookupFor(variants, variants.Variants[0])), dialect)];
    for (const variant of variantsWorthRendering(template.Nodes, variants)) {
        views.push(view(renderer.Render(lookupFor(variants, variant)), dialect));
    }
    return views;
}

/**
 * Whether a document parsed with no error-severity diagnostic and no statement of unknown kind. A
 * statement of a known kind that is not a query (`SET`, `DECLARE`, `UPDATE`) is kept whole and does
 * not count against it; text that starts no known statement does.
 */
export function ReadWithoutErrors(document: SqlDocument): boolean {
    if (document.Diagnostics.some(d => d.Severity === 'Error')) return false;
    let unknownStatement = false;
    WalkSqlNodes(document.Statements, node => {
        if ((node.Kind === 'Statement' || node.Kind === 'Query') && node.StatementKind === 'Other') unknownStatement = true;
    });
    return !unknownStatement;
}

function view(text: string, dialect: ParserDialect): SqlView {
    const document = SqlDocument.Parse(text, dialect);
    return { Text: text, Document: document, Complete: ReadWithoutErrors(document) };
}

function isDot(token: SqlToken | undefined): boolean {
    return token !== undefined && token.Kind === 'Punctuation' && token.Text === '.';
}

/** The filter names on the value a hole writes, innermost first; for an inline if, those on its body. */
function writtenFilters(expression: TemplateExpression): string[] {
    const { Base, Filters } = UnwrapFilters(expression);
    const own = Filters.map(f => f.Name);
    return Base.Kind === 'InlineIf' ? [...writtenFilters(Base.Body), ...own] : own;
}

function lookupFor(set: BranchVariantSet, variant: BranchVariant | undefined): BranchLookup {
    const values = variant === undefined ? set.Base : BranchVariantValues(set, variant);
    return name => values[name];
}

/** The non-base variants whose render can hold SQL the base render does not. */
function variantsWorthRendering(nodes: readonly TemplateNode[], set: BranchVariantSet): BranchVariant[] {
    const ifs = new Map<number, IfNode>();
    for (const node of AllNodes(nodes)) if (node.Kind === 'If') ifs.set(node.Span.Start, node);
    const worth = set.Variants.filter(variant => {
        if (variant.Toggle === null || !variant.Satisfiable || variant.Toggle.ToBranch === null) return false;
        const node = ifs.get(variant.Toggle.IfSpan.Start);
        return node === undefined || variant.Toggle.ToBranch < node.Branches.length || node.Else !== null;
    });
    return worth.slice(0, MAX_VARIANT_RENDERS);
}

/** Renders a template tree to SQL for one assignment of branch values. */
class SkeletonRenderer {
    private readonly opaque: ReadonlySet<string>;
    private counters = { string: 0, number: 0, identifier: 0, list: 0, composition: 0 };

    constructor(private readonly nodes: readonly TemplateNode[], private readonly tokens: SqlTokens) {
        const opaque = new Set<string>();
        for (const node of AllNodes(nodes)) {
            if (node.Kind === 'Set') opaque.add(node.Name);
            else if (node.Kind === 'For') opaque.add(node.LoopVariable);
        }
        this.opaque = opaque;
    }

    /** The SQL of one render. Placeholder numbering restarts for every render. */
    Render(lookup: BranchLookup): string {
        this.counters = { string: 0, number: 0, identifier: 0, list: 0, composition: 0 };
        const out: string[] = [];
        this.renderNodes(this.nodes, lookup, false, out);
        return out.join('');
    }

    private renderNodes(nodes: readonly TemplateNode[], lookup: BranchLookup, inLoop: boolean, out: string[]): void {
        for (const node of nodes) this.renderNode(node, lookup, inLoop, out);
    }

    private renderNode(node: TemplateNode, lookup: BranchLookup, inLoop: boolean, out: string[]): void {
        switch (node.Kind) {
            case 'SqlText': out.push(node.Text); break;
            case 'Expression': out.push(this.expressionPlaceholder(node)); break;
            case 'Composition': out.push(this.compositionPlaceholder(node)); break;
            case 'If': this.renderNodes(this.branchBody(node, lookup, inLoop), lookup, inLoop, out); break;
            case 'For': this.renderNodes(node.Body, lookup, true, out); break;
            case 'Set': break;
            default: out.push(' ');
        }
    }

    /** The body of the branch the block takes: the first whose condition is true or cannot be known. */
    private branchBody(node: IfNode, lookup: BranchLookup, inLoop: boolean): readonly TemplateNode[] {
        const evaluator = new BranchEvaluator(lookup, this.opaque, inLoop ? singleIteration : null);
        for (const branch of node.Branches) {
            if (evaluator.Truth(branch.Condition) !== false) return branch.Body;
        }
        return node.Else?.Body ?? [];
    }

    /** A placeholder of the kind the hole's last SQL filter writes; bare text inside a literal or quoted name. */
    private expressionPlaceholder(node: ExpressionNode): string {
        if (node.SqlContext !== 'Code') return `__MJT_${this.next('string')}__`;
        const filters = writtenFilters(node.Expression);
        const sqlFilter = [...filters].reverse().find(name => FindSqlFilter(name) !== undefined);
        switch (sqlFilter) {
            case 'sqlNumber': return String(42000 + this.counters.number++ + 1);
            case 'sqlIdentifier':
            case 'sqlNoKeywordsExpression': return `__MJI_${this.next('identifier')}__`;
            case 'sqlIn': return `('__MJIN_${this.next('list')}__')`;
            case 'sqlBoolean': return '1';
            default: return this.isNameSlot(node) ? `__MJI_${this.next('identifier')}__` : `'__MJT_${this.next('string')}__'`;
        }
    }

    /** Whether an unfiltered hole stands where a name goes: a table source, or next to a `.` of a dotted name. */
    private isNameSlot(node: ExpressionNode): boolean {
        const index = this.tokens.IndexAt(node.Span.Start);
        if (index < 0) return false;
        if (IsTableSourcePosition(this.tokens, index)) return true;
        const before = this.tokens.Tokens[PrecedingSignificantIndex(this.tokens, index)];
        return isDot(before) || isDot(this.tokens.Tokens[index + 1]);
    }

    private compositionPlaceholder(node: CompositionNode): string {
        const name = `__MJQ_${this.next('composition')}__`;
        return node.SqlContext === 'Code' ? `(SELECT 1 AS ${name})` : name;
    }

    private next(kind: 'string' | 'identifier' | 'list' | 'composition'): string {
        this.counters[kind]++;
        return String(this.counters[kind]).padStart(3, '0');
    }
}
