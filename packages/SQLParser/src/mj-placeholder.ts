/**
 * MJ Placeholder Substitution
 *
 * Replaces MJ tokens (Nunjucks templates, composition refs) with SQL-safe
 * placeholders that node-sql-parser can parse correctly. Each placeholder
 * is typed to match the SQL context:
 *
 * - sqlString/sqlDate → string literal:    '__MJT_001__'
 * - sqlNumber         → numeric literal:   42001
 * - sqlIdentifier     → bare identifier:   __MJI_001__
 * - sqlIn             → IN list:           ('__MJT_001__')
 * - sqlBoolean        → numeric literal:   1
 * - composition ref   → subquery alias:    [__MJQ_001__]
 *
 * The position map allows later reconstruction of the original MJ SQL
 * from the AST by mapping placeholders back to their original tokens.
 */

import { MJLexer } from './mj-lexer.js';
import {
    MJToken,
    MJTemplateExprContent,
    PlaceholderContext,
    PlaceholderEntry,
    PlaceholderSubstitutionResult,
} from './mj-ast-types.js';

/**
 * Substitutes MJ tokens in SQL with SQL-safe placeholders.
 */
export class MJPlaceholderSubstitution {
    private stringCounter = 0;
    private numberCounter = 0;
    private identifierCounter = 0;
    private inListCounter = 0;
    private compositionCounter = 0;
    private booleanCounter = 0;

    /**
     * Tokenize the SQL and replace all MJ tokens with SQL-safe placeholders.
     *
     * Block tags (if/elif/else/endif/for/endfor/set) are stripped entirely
     * (their body content is kept). Template expressions and composition refs
     * are replaced with typed placeholders.
     */
    public static Substitute(sql: string): PlaceholderSubstitutionResult {
        const instance = new MJPlaceholderSubstitution();
        return instance.substituteInternal(sql);
    }

    private substituteInternal(sql: string): PlaceholderSubstitutionResult {
        const tokens = MJLexer.Tokenize(sql);
        const positionMap = new Map<string, PlaceholderEntry>();
        const strippedTokens: MJToken[] = [];

        // Build the clean SQL by processing tokens in order
        let cleanSQL = '';

        for (const token of tokens) {
            switch (token.type) {
                case 'SQL_TEXT':
                    cleanSQL += token.raw;
                    break;

                case 'MJ_TEMPLATE_EXPR': {
                    const { placeholder, context } = this.createExpressionPlaceholder(token);
                    positionMap.set(placeholder, { placeholder, originalToken: token, context });
                    cleanSQL += placeholder;
                    break;
                }

                case 'MJ_COMPOSITION_REF': {
                    // Composition refs in FROM clauses need to be valid table-like references
                    // For now, replace with a subquery-style placeholder
                    const placeholder = this.nextCompositionPlaceholder();
                    positionMap.set(placeholder, { placeholder, originalToken: token, context: 'string' });
                    // Replace with a simple SELECT to make it a valid subquery
                    cleanSQL += `(SELECT 1 AS ${placeholder})`;
                    break;
                }

                // Block tags — strip the tags, keep the SQL body content
                case 'MJ_IF_OPEN':
                case 'MJ_ELIF':
                case 'MJ_ELSE':
                case 'MJ_ENDIF':
                case 'MJ_FOR_OPEN':
                case 'MJ_ENDFOR':
                case 'MJ_SET':
                    strippedTokens.push(token);
                    // Block tags are removed — the SQL between them stays
                    break;

                case 'MJ_COMMENT':
                    strippedTokens.push(token);
                    // Comments are removed entirely
                    break;

                default:
                    cleanSQL += token.raw;
            }
        }

        return { cleanSQL, positionMap, strippedTokens };
    }

    /**
     * Creates a SQL-safe placeholder for a template expression,
     * choosing the placeholder type based on the filter chain.
     */
    private createExpressionPlaceholder(token: MJToken): { placeholder: string; context: PlaceholderContext } {
        const parsed = token.parsed as MJTemplateExprContent;
        const filters = parsed.filters;

        // Find the primary SQL filter (last one wins for type determination)
        const sqlFilter = this.findPrimarySQLFilter(filters);

        switch (sqlFilter) {
            case 'sqlNumber':
                return { placeholder: this.nextNumberPlaceholder(), context: 'number' };
            case 'sqlString':
            case 'sqlDate':
                return { placeholder: this.nextStringPlaceholder(), context: 'string' };
            case 'sqlIdentifier':
            case 'sqlNoKeywordsExpression':
                return { placeholder: this.nextIdentifierPlaceholder(), context: 'identifier' };
            case 'sqlIn':
                return { placeholder: this.nextInListPlaceholder(), context: 'in_list' };
            case 'sqlBoolean':
                return { placeholder: this.nextBooleanPlaceholder(), context: 'boolean' };
            default:
                // No recognized filter — default to string literal (safest)
                return { placeholder: this.nextStringPlaceholder(), context: 'string' };
        }
    }

    /**
     * Finds the primary SQL filter from the filter chain.
     * Looks for MJ-specific SQL filters, ignoring utility filters like 'default'.
     */
    private findPrimarySQLFilter(filters: { name: string; args: (string | number)[] }[]): string | null {
        const sqlFilterNames = new Set([
            'sqlString', 'sqlNumber', 'sqlDate', 'sqlBoolean',
            'sqlIdentifier', 'sqlIn', 'sqlNoKeywordsExpression',
        ]);

        // Reverse search — last SQL filter in chain takes precedence
        for (let i = filters.length - 1; i >= 0; i--) {
            if (sqlFilterNames.has(filters[i].name)) {
                return filters[i].name;
            }
        }

        return null;
    }

    // ─────────────────────────────────────────────────────
    // Placeholder generators
    // ─────────────────────────────────────────────────────

    private nextStringPlaceholder(): string {
        return `'__MJT_${String(++this.stringCounter).padStart(3, '0')}__'`;
    }

    private nextNumberPlaceholder(): string {
        return String(42000 + ++this.numberCounter);
    }

    private nextIdentifierPlaceholder(): string {
        return `__MJI_${String(++this.identifierCounter).padStart(3, '0')}__`;
    }

    private nextInListPlaceholder(): string {
        return `('__MJIN_${String(++this.inListCounter).padStart(3, '0')}__')`;
    }

    private nextBooleanPlaceholder(): string {
        this.booleanCounter++;
        return '1';
    }

    private nextCompositionPlaceholder(): string {
        return `__MJQ_${String(++this.compositionCounter).padStart(3, '0')}__`;
    }
}
