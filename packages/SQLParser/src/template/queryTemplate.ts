import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { Analysis, Diagnostic } from '../common/analysis.js';
import { SqlTokens } from '../lexer/sqlTokens.js';
import { WalkExpression } from './expressionTypes.js';
import type { TemplateExpression } from './expressionTypes.js';
import { BranchVariantPlanner } from './branchVariants.js';
import type { BranchVariantSet } from './branchVariants.js';
import { FindCompositionReferences } from './compositionReferences.js';
import type { CompositionReference } from './compositionReferences.js';
import { CompositionRules } from './compositionRules.js';
import { DocCommentReader } from './docComments.js';
import type { TemplateDocComments } from './docComments.js';
import { ParameterAnalyzer, SetVariableNames } from './parameterAnalysis.js';
import type { ContextTokenUse, TemplateParameter } from './parameterAnalysis.js';
import { AllNodes, NodeExpressions } from './templateNodes.js';
import type { TemplateNode } from './templateNodes.js';
import { TemplateTreeBuilder } from './templateTreeBuilder.js';
import { ValueRules } from './valueRules.js';
import type { QueryTemplateValidateOptions, QueryTemplateValidation } from './validationTypes.js';

/**
 * A parsed MJ Query template: SQL in one dialect with MJ template tags, read by the MJ Query
 * language v1 (`guides/MJ_QUERY_LANGUAGE.md`).
 *
 * The tree ({@link Nodes}) is public and read-only. Analyses are methods, computed on first
 * call and kept; each returns an {@link Analysis} that says whether it is complete and what it
 * found wrong. Parsing never throws, and every analysis runs in time linear in the text (branch
 * variants are bounded per block).
 *
 * ```ts
 * const template = QueryTemplate.Parse(sql, new SQLServerDialect());
 * const parameters = template.Parameters().Value;
 * const check = template.Validate({ Mode: 'Save', DeclaredParameters, ResolveComposition });
 * if (!check.Value.IsValid) refuse(check.Diagnostics);
 * ```
 */
export class QueryTemplate {
    private readonly tokens: SqlTokens;
    private readonly nodes: readonly TemplateNode[];
    private readonly diagnostics: readonly Diagnostic[];
    private readonly complete: boolean;
    private parameters: Analysis<readonly TemplateParameter[]> | null = null;
    private compositions: Analysis<readonly CompositionReference[]> | null = null;
    private contextTokens: Analysis<readonly ContextTokenUse[]> | null = null;
    private docComments: Analysis<TemplateDocComments> | null = null;
    private branchVariants: Analysis<BranchVariantSet> | null = null;

    private constructor(tokens: SqlTokens) {
        this.tokens = tokens;
        const built = TemplateTreeBuilder.Build(tokens);
        this.nodes = Object.freeze(built.Nodes);
        this.diagnostics = Object.freeze([...tokens.Diagnostics, ...built.Diagnostics].sort((a, b) => a.Span.Start - b.Span.Start));
        this.complete = isComplete(this.nodes);
    }

    /**
     * Parses MJ Query text.
     * @param text - The query text, template tags included.
     * @param dialect - The SQL dialect the query is written in.
     */
    static Parse(text: string, dialect: ParserDialect): QueryTemplate {
        return new QueryTemplate(SqlTokens.Lex(text, dialect));
    }

    /** The query text. */
    get Text(): string {
        return this.tokens.Text;
    }

    /** The dialect the SQL is read with. */
    get Dialect(): ParserDialect {
        return this.tokens.Dialect;
    }

    /** The token stream the template was built from. */
    get Tokens(): SqlTokens {
        return this.tokens;
    }

    /** The template tree, in source order. */
    get Nodes(): readonly TemplateNode[] {
        return this.nodes;
    }

    /** What went wrong reading the text: lexing, block structure and expression syntax. {@link Validate} adds the save-time rules. */
    get Diagnostics(): readonly Diagnostic[] {
        return this.diagnostics;
    }

    /** Whether every tag was read: no unsupported tag or expression, unclosed tag or unclosed block. */
    get IsComplete(): boolean {
        return this.complete;
    }

    /** The parameters: names a caller supplies, with their filters, inferred type, whether required, and every use. */
    Parameters(): Analysis<readonly TemplateParameter[]> {
        this.parameters ??= ParameterAnalyzer.Parameters(this.nodes, this.complete);
        return this.parameters;
    }

    /** The `{{query:"…"}}` compositions, with their arguments and SQL position. */
    CompositionReferences(): Analysis<readonly CompositionReference[]> {
        this.compositions ??= FindCompositionReferences(this.nodes, this.tokens, this.complete);
        return this.compositions;
    }

    /** The `Context.<Token>` values the template reads. */
    ContextTokens(): Analysis<readonly ContextTokenUse[]> {
        this.contextTokens ??= ParameterAnalyzer.ContextTokens(this.nodes, this.complete);
        return this.contextTokens;
    }

    /** The descriptions written into the template: `{# @param / @field #}` headers and trailing `--:` comments. */
    DocComments(): Analysis<TemplateDocComments> {
        this.docComments ??= DocCommentReader.Read(this.nodes, this.tokens, this.Parameters().Value.map(p => p.Name));
        return this.docComments;
    }

    /**
     * The parameter assignments to render the template with so every branch's SQL is seen: the
     * base assignment, and variants as overrides of it: the base first, then one per `{% if %}`
     * toggled on its own (n + 1 renders for n blocks).
     */
    BranchVariants(): Analysis<BranchVariantSet> {
        if (this.branchVariants === null) {
            const opaque = new Set([...SetVariableNames(this.nodes), ...loopVariableNames(this.nodes)]);
            this.branchVariants = BranchVariantPlanner.Plan(this.nodes, this.Parameters().Value, opaque, this.complete);
        }
        return this.branchVariants;
    }

    /** Applies every save-time rule of the MJ Query language. Errors refuse a save; warnings are reported. */
    Validate(options: QueryTemplateValidateOptions = {}): Analysis<QueryTemplateValidation> {
        const parameters = this.Parameters();
        const outerNames = [...parameters.Value.map(p => p.Name), ...(options.DeclaredParameters ?? []).map(p => p.Name)];
        const compositions = CompositionRules.Check(this.CompositionReferences().Value, options, outerNames);
        const diagnostics = [
            ...this.diagnostics,
            ...parameters.Diagnostics,
            ...ValueRules.Check(this.nodes, parameters.Value, options),
            ...compositions.Diagnostics,
        ].sort((a, b) => a.Span.Start - b.Span.Start);
        const errors = diagnostics.filter(d => d.Severity === 'Error').length;
        const warnings = diagnostics.filter(d => d.Severity === 'Warning').length;
        return {
            Value: { IsValid: errors === 0, ErrorCount: errors, WarningCount: warnings },
            Complete: this.complete && compositions.Complete,
            Diagnostics: diagnostics,
        };
    }
}

/** Whether the tree has no Unknown node, no unsupported expression and no unclosed block. */
function isComplete(nodes: readonly TemplateNode[]): boolean {
    for (const node of AllNodes(nodes)) {
        if (node.Kind === 'Unknown') return false;
        if ((node.Kind === 'If' || node.Kind === 'For') && !node.Closed) return false;
        if (NodeExpressions(node).some(hasUnsupported)) return false;
    }
    return true;
}

function hasUnsupported(expression: TemplateExpression): boolean {
    let found = false;
    WalkExpression(expression, n => {
        if (n.Kind === 'Unsupported') found = true;
    });
    return found;
}

function loopVariableNames(nodes: readonly TemplateNode[]): string[] {
    return AllNodes(nodes).flatMap(n => (n.Kind === 'For' ? [n.LoopVariable] : []));
}
