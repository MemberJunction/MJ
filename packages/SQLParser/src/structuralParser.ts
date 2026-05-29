/**
 * Structural SQL Parser for Composition IR
 *
 * SQL-context-aware parser that produces a {@link QueryIR} for the composition
 * engine. Unlike MJLexer (which splits purely on brace patterns without regard
 * for SQL context), this parser understands:
 *
 * - `'{{ X }}'` is a template expression inside a SQL string literal
 * - `/* ... {{ X }} ... *​/` is a template token inside a block comment
 * - `WITH ... AS (...)` boundaries for CTE detection
 * - Top-level ORDER BY position (not inside subqueries/window functions)
 *
 * The parser produces Fragment[] sequences that the composition engine
 * manipulates structurally (hoisting CTEs, stripping ORDER BY, renaming
 * references) before the IR renderer emits SQL with template tokens intact
 * for Nunjucks evaluation.
 */

import { SQLParser } from './sql-parser.js';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { AnalyzeTopLevelOrderBy } from './orderByAnalyzer.js';
import type {
    QueryIR,
    CTENode,
    Fragment,
    SQLFragment,
    TemplateExprFragment,
    BlockFragment,
    CommentFragment,
    CompositionRefFragment,
} from './compositionIR.js';

// ════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════

/**
 * Parses SQL (potentially containing MJ template tokens) into a QueryIR.
 *
 * @param sql - Raw SQL with potential {{query:"..."}}, {{ var }}, {% %} tokens
 * @param dialect - SQL dialect for parsing and identifier quoting
 * @returns Structural IR for composition manipulation
 */
export function ParseToIR(sql: string, dialect: SQLParserDialect): QueryIR {
    if (!sql || sql.trim().length === 0) {
        return { CTEs: [], Body: [], HasUserCTEs: false, TrailingOrderBy: null, OrderByIsLegalInCTE: false };
    }

    // Step 1: Tokenize into fragments using MJLexer
    const fragments = tokenizeToFragments(sql);

    // Step 2: Detect and extract CTE structure
    const { ctes, body, hasUserCTEs } = extractCTEStructure(sql, fragments, dialect);

    // Step 3: Detect trailing ORDER BY and split from body
    const bodyText = renderFragments(body);
    const orderByAnalysis = AnalyzeTopLevelOrderBy(bodyText, dialect);

    let finalBody = body;
    let trailingOrderBy: Fragment[] | null = null;

    if (orderByAnalysis.Positions.length > 0) {
        const lastPos = orderByAnalysis.Positions[orderByAnalysis.Positions.length - 1];
        const bodyWithoutOrder = bodyText.substring(0, lastPos).trimEnd();
        const orderByText = bodyText.substring(lastPos);

        finalBody = tokenizeToFragments(bodyWithoutOrder);
        trailingOrderBy = [{ Kind: 'sql', Text: orderByText } as SQLFragment];
    }

    return {
        CTEs: ctes,
        Body: finalBody,
        HasUserCTEs: hasUserCTEs,
        TrailingOrderBy: trailingOrderBy,
        OrderByIsLegalInCTE: orderByAnalysis.IsLegalInCTE,
    };
}

/**
 * Renders a QueryIR back to a SQL string with {{ }}/{% %} tokens intact.
 *
 * This is the single code path that emits SQL from the composition engine.
 * All template tokens are preserved verbatim for downstream Nunjucks evaluation.
 */
export function RenderIR(ir: QueryIR, _dialect: SQLParserDialect): string {
    const parts: string[] = [];

    // Render CTEs
    if (ir.CTEs.length > 0) {
        parts.push('WITH ');
        const cteDefs = ir.CTEs.map(cte => renderCTENode(cte));
        parts.push(cteDefs.join(',\n'));
        parts.push('\n');
    }

    // Render body
    parts.push(renderFragments(ir.Body));

    // Render trailing ORDER BY (if present and not stripped)
    if (ir.TrailingOrderBy) {
        parts.push('\n');
        parts.push(renderFragments(ir.TrailingOrderBy));
    }

    return parts.join('');
}

// ════════════════════════════════════════════════════════════════════
// Fragment tokenization
// ════════════════════════════════════════════════════════════════════

/**
 * Tokenizes SQL into a sequence of fragments using MJLexer.
 * Maps MJLexer token types to IR fragment types.
 */
function tokenizeToFragments(sql: string): Fragment[] {
    const tokens = SQLParser.Tokenize(sql);
    const fragments: Fragment[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'SQL_TEXT':
                fragments.push({ Kind: 'sql', Text: token.raw } as SQLFragment);
                break;
            case 'MJ_TEMPLATE_EXPR': {
                const variable = extractVariableName(token.raw);
                fragments.push({
                    Kind: 'template-expr',
                    Raw: token.raw,
                    Variable: variable,
                } as TemplateExprFragment);
                break;
            }
            case 'MJ_COMPOSITION_REF':
                fragments.push({
                    Kind: 'composition-ref',
                    Raw: token.raw,
                    QueryPath: extractQueryPath(token.raw),
                } as CompositionRefFragment);
                break;
            case 'MJ_IF_OPEN':
            case 'MJ_ELIF':
            case 'MJ_ELSE':
            case 'MJ_ENDIF':
            case 'MJ_FOR_OPEN':
            case 'MJ_ENDFOR':
            case 'MJ_SET':
                fragments.push({
                    Kind: 'block',
                    Raw: token.raw,
                    BlockType: mapBlockType(token.type),
                } as BlockFragment);
                break;
            case 'MJ_COMMENT':
                fragments.push({ Kind: 'comment', Raw: token.raw } as CommentFragment);
                break;
            default:
                // Unknown token type — treat as SQL text
                fragments.push({ Kind: 'sql', Text: token.raw } as SQLFragment);
                break;
        }
    }

    return fragments;
}

function extractVariableName(raw: string): string {
    // {{ variable | filter1 | filter2 }} → "variable"
    const content = raw.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
    const parts = content.split('|');
    return parts[0].trim();
}

function extractQueryPath(raw: string): string {
    // {{query:"path/Name(params)"}} → "path/Name(params)"
    const match = raw.match(/\{\{\s*query\s*:\s*"([^"]*)"/);
    return match ? match[1] : '';
}

function mapBlockType(tokenType: string): 'if' | 'for' | 'set' | 'other' {
    if (tokenType.includes('IF') || tokenType.includes('ELIF') ||
        tokenType.includes('ELSE') || tokenType.includes('ENDIF')) return 'if';
    if (tokenType.includes('FOR') || tokenType.includes('ENDFOR')) return 'for';
    if (tokenType.includes('SET')) return 'set';
    return 'other';
}

// ════════════════════════════════════════════════════════════════════
// CTE extraction
// ════════════════════════════════════════════════════════════════════

interface CTEStructure {
    ctes: CTENode[];
    body: Fragment[];
    hasUserCTEs: boolean;
}

/**
 * Extracts CTE definitions from the SQL. Uses SQLParser.ExtractCTEs for
 * robust splitting, then maps the results to IR nodes.
 */
function extractCTEStructure(
    sql: string,
    fragments: Fragment[],
    dialect: SQLParserDialect
): CTEStructure {
    // Strip comments to check for WITH prefix
    const commentStripped = stripSQLCommentsFromFragments(fragments).trimStart();
    if (!/^WITH\s/i.test(commentStripped)) {
        return { ctes: [], body: fragments, hasUserCTEs: false };
    }

    // Use SQLParser.ExtractCTEs for the actual splitting
    const extraction = new SQLParser(sql, dialect).ExtractCTEs();
    if (!extraction) {
        return { ctes: [], body: fragments, hasUserCTEs: false };
    }

    const cteNodes: CTENode[] = extraction.CTEDefinitions.map((def, idx) => {
        const nameMatch = def.match(/^(\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s+AS\s*\(/i);
        const rawName = nameMatch ? nameMatch[1] : `__unknown_cte_${idx}`;
        const canonicalName = rawName.replace(/^[\["]|[\]"]$/g, '');
        const bodyStart = def.indexOf('(') + 1;
        const bodyEnd = def.lastIndexOf(')');
        const bodyText = bodyStart > 0 && bodyEnd > bodyStart
            ? def.substring(bodyStart, bodyEnd).trim()
            : def;

        return {
            Id: `user_cte_${idx}_${canonicalName}`,
            Name: rawName,
            CanonicalName: canonicalName,
            Body: [{ Kind: 'sql', Text: bodyText } as SQLFragment],
            Origin: { Kind: 'user' as const },
            OrderByStripped: false,
        };
    });

    const mainBody = tokenizeToFragments(extraction.MainStatement);

    return { ctes: cteNodes, body: mainBody, hasUserCTEs: true };
}

/**
 * Extracts the SQL text from fragments, skipping comments.
 */
function stripSQLCommentsFromFragments(fragments: Fragment[]): string {
    return fragments
        .filter(f => f.Kind !== 'comment')
        .map(f => {
            switch (f.Kind) {
                case 'sql': return f.Text;
                case 'template-expr': return f.Raw;
                case 'block': return f.Raw;
                case 'composition-ref': return f.Raw;
                default: return '';
            }
        })
        .join('');
}

// ════════════════════════════════════════════════════════════════════
// IR rendering
// ════════════════════════════════════════════════════════════════════

function renderCTENode(cte: CTENode): string {
    const columns = cte.Columns ? `(${cte.Columns.join(', ')})` : '';
    const body = renderFragments(cte.Body);
    return `${cte.Name}${columns} AS (\n${body}\n)`;
}

function renderFragments(fragments: Fragment[]): string {
    return fragments.map(renderFragment).join('');
}

function renderFragment(fragment: Fragment): string {
    switch (fragment.Kind) {
        case 'sql': return fragment.Text;
        case 'template-expr': return fragment.Raw;
        case 'block': return fragment.Raw;
        case 'comment': return fragment.Raw;
        case 'composition-ref': return fragment.Raw;
    }
}
