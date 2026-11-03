import type { Analysis, Span } from '../common/analysis.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import { IsTableSourcePosition, PrecedingSignificantIndex } from './sqlPosition.js';
import type { CompositionArgument, CompositionNode, TemplateNode } from './templateNodes.js';
import { WalkTemplate } from './templateWalker.js';

/** One `{{query:"…"}}` composition, with where it sits in the SQL. */
export interface CompositionReference {
    /** The category path and query name joined by `/`, such as `Sales/Reports/Top Customers`. */
    readonly FullPath: string;
    /** The category path, or `''` for a query with no category. */
    readonly CategoryPath: string;
    readonly Name: string;
    readonly Span: Span;
    readonly PathSpan: Span;
    /** The arguments as written: each name with its expression, and whether the value is static or reads outer values. */
    readonly Arguments: readonly CompositionArgument[];
    /** The nearest SQL token before the composition, skipping whitespace, comments and block tags; `null` at the start. */
    readonly PrecedingToken: SqlToken | null;
    /** Whether the composition stands where a table source goes (after FROM, JOIN, APPLY, or a comma in a FROM list). */
    readonly InTablePosition: boolean;
    /** Whether it sits inside an `{% if %}` block. */
    readonly InsideConditional: boolean;
    readonly Node: CompositionNode;
}

/** Lists the compositions of a template in source order. */
export function FindCompositionReferences(nodes: readonly TemplateNode[], tokens: SqlTokens, complete: boolean): Analysis<readonly CompositionReference[]> {
    const references: CompositionReference[] = [];
    WalkTemplate(nodes, {
        Node: (node, scope) => {
            if (node.Kind !== 'Composition') return;
            const index = tokens.IndexAt(node.Span.Start);
            const before = index < 0 ? -1 : PrecedingSignificantIndex(tokens, index);
            references.push({
                FullPath: node.FullPath, CategoryPath: node.CategoryPath, Name: node.Name, Span: node.Span, PathSpan: node.PathSpan,
                Arguments: node.Arguments, PrecedingToken: before < 0 ? null : tokens.Tokens[before],
                InTablePosition: index >= 0 && IsTableSourcePosition(tokens, index), InsideConditional: scope.Conditional, Node: node,
            });
        },
    });
    return { Value: references, Complete: complete, Diagnostics: [] };
}
