import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import * as nunjucks from 'nunjucks';

/**
 * A single table/view reference extracted from SQL.
 */
export interface SQLTableReference {
    /** The table or view name as it appears in SQL */
    TableName: string;
    /** The schema name, defaults to 'dbo' if unspecified */
    SchemaName: string;
    /** The alias used in the query, or the table name if no alias */
    Alias: string;
}

/**
 * A column reference extracted from SQL expressions.
 */
export interface SQLColumnReference {
    /** Column name */
    ColumnName: string;
    /** Table alias or name prefix, if qualified (e.g. "t" in "t.Name") */
    TableQualifier: string | null;
}

/**
 * Complete result of parsing a SQL statement for table and column references.
 */
export interface SQLParseResult {
    /** All table/view references found (FROM, JOIN, subqueries, CTEs) */
    Tables: SQLTableReference[];
    /** All column references found (SELECT, WHERE, JOIN ON, GROUP BY, ORDER BY) */
    Columns: SQLColumnReference[];
    /** Whether parsing succeeded via AST (true) or fell back to regex (false) */
    UsedASTParsing: boolean;
}

/**
 * Reusable SQL parsing utility that extracts table/view references and column references
 * from SQL statements using node-sql-parser with a regex fallback.
 *
 * This class has no dependency on MJ Metadata — it returns raw parse results.
 * Callers are responsible for cross-referencing against entity metadata.
 */
export class SQLParser {
    /**
     * Parse a plain SQL statement and extract all table and column references.
     * Uses AST parsing with TransactSQL dialect, falls back to regex on failure.
     */
    public static Parse(sql: string): SQLParseResult {
        if (!sql || sql.trim().length === 0) {
            return { Tables: [], Columns: [], UsedASTParsing: false };
        }

        const astResult = SQLParser.ParseViaAST(sql);
        if (astResult) {
            return astResult;
        }

        return SQLParser.ParseViaRegex(sql);
    }

    /**
     * Parse a SQL statement that may contain Nunjucks template syntax.
     * Pre-processes templates into valid SQL before parsing.
     */
    public static ParseWithTemplatePreprocessing(sql: string): SQLParseResult {
        if (!sql || sql.trim().length === 0) {
            return { Tables: [], Columns: [], UsedASTParsing: false };
        }

        const processedSQL = SQLParser.PreProcessNunjucksForParsing(sql);
        return SQLParser.Parse(processedSQL);
    }

    /**
     * Attempt to parse SQL via node-sql-parser AST.
     * Returns null if parsing fails (caller should fall back to regex).
     */
    private static ParseViaAST(sql: string): SQLParseResult | null {
        try {
            const parser = new Parser();
            const ast = parser.astify(sql, { database: 'TransactSQL' });

            const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
            const columnRefs = new Set<string>();

            const statements = Array.isArray(ast) ? ast : [ast];
            for (const statement of statements) {
                SQLParser.ExtractFromAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }

            return SQLParser.BuildResult(tableAliasMap, columnRefs, true);
        } catch {
            return null;
        }
    }

    /**
     * Regex-based fallback for extracting table references from SQL.
     * Less accurate than AST but handles edge cases where the parser fails.
     */
    private static ParseViaRegex(sql: string): SQLParseResult {
        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const tablePattern = /(?:FROM|JOIN|INTO)\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        const matches = [...sql.matchAll(tablePattern)];

        for (const match of matches) {
            const schemaName = match[1] || 'dbo';
            const tableName = match[2];
            const alias = match[3] || tableName;
            const key = alias;

            if (!tableAliasMap.has(key)) {
                tableAliasMap.set(key, { schemaName, tableName });
            }
        }

        // Regex can't reliably extract column references, return empty
        return SQLParser.BuildResult(tableAliasMap, new Set<string>(), false);
    }

    /**
     * Converts internal maps into the public SQLParseResult shape.
     */
    private static BuildResult(
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>,
        columnRefs: Set<string>,
        usedAST: boolean
    ): SQLParseResult {
        const tables = SQLParser.DeduplicateTables(tableAliasMap);
        const columns = SQLParser.ParseColumnRefs(columnRefs);
        return { Tables: tables, Columns: columns, UsedASTParsing: usedAST };
    }

    /**
     * Deduplicates table references by schema.table key, keeping distinct entries.
     */
    private static DeduplicateTables(
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>
    ): SQLTableReference[] {
        const seen = new Set<string>();
        const tables: SQLTableReference[] = [];

        for (const [alias, info] of tableAliasMap) {
            const key = `${info.schemaName.toLowerCase()}.${info.tableName.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                tables.push({
                    TableName: info.tableName,
                    SchemaName: info.schemaName,
                    Alias: alias
                });
            }
        }

        return tables;
    }

    /**
     * Converts raw column reference strings into structured SQLColumnReference objects.
     */
    private static ParseColumnRefs(columnRefs: Set<string>): SQLColumnReference[] {
        const columns: SQLColumnReference[] = [];
        for (const ref of columnRefs) {
            const dotIndex = ref.lastIndexOf('.');
            if (dotIndex >= 0) {
                columns.push({
                    ColumnName: ref.substring(dotIndex + 1),
                    TableQualifier: ref.substring(0, dotIndex)
                });
            } else {
                columns.push({ ColumnName: ref, TableQualifier: null });
            }
        }
        return columns;
    }

    // ─────────────────────────────────────────────────────
    // AST Walking (moved from MJQueryEntityServer)
    // ─────────────────────────────────────────────────────

    /**
     * Recursively extracts table references and column references from SQL AST.
     */
    private static ExtractFromAST(
        node: Record<string, unknown>,
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>,
        referencedColumns: Set<string>
    ): void {
        if (!node || typeof node !== 'object') return;

        // Handle CTEs (WITH clause)
        if (node.with) {
            const ctes = Array.isArray(node.with) ? node.with : [node.with];
            for (const cte of ctes) {
                const cteRecord = cte as Record<string, unknown>;
                if (cteRecord.stmt) {
                    const stmtRecord = cteRecord.stmt as Record<string, unknown>;
                    const cteAst = (stmtRecord.ast || stmtRecord) as Record<string, unknown>;
                    SQLParser.ExtractFromAST(cteAst, tableAliasMap, referencedColumns);
                }
            }
        }

        // Extract FROM clause tables (including JOINs)
        if (node.from) {
            const fromItems = Array.isArray(node.from) ? node.from : [node.from];
            for (const fromItem of fromItems) {
                SQLParser.ExtractTableFromItem(
                    fromItem as Record<string, unknown>,
                    tableAliasMap,
                    referencedColumns
                );
            }
        }

        // Extract column references from SELECT
        if (node.columns) {
            const cols = Array.isArray(node.columns) ? node.columns : [node.columns];
            for (const col of cols) {
                if (col === '*') continue;
                const colRecord = col as Record<string, unknown>;
                if (colRecord.expr) {
                    SQLParser.ExtractColumnReferences(
                        colRecord.expr as Record<string, unknown>,
                        referencedColumns,
                        tableAliasMap
                    );
                }
            }
        }

        // Extract column references from WHERE
        if (node.where) {
            SQLParser.ExtractColumnReferences(
                node.where as Record<string, unknown>,
                referencedColumns,
                tableAliasMap
            );
        }

        // Extract column references from GROUP BY
        if (node.groupby) {
            const groupbyRecord = node.groupby as Record<string, unknown>;
            const groupItems = groupbyRecord.columns || node.groupby;
            const items = Array.isArray(groupItems) ? groupItems : [groupItems];
            for (const group of items) {
                SQLParser.ExtractColumnReferences(
                    group as Record<string, unknown>,
                    referencedColumns,
                    tableAliasMap
                );
            }
        }

        // Extract column references from ORDER BY
        if (node.orderby) {
            const orders = Array.isArray(node.orderby) ? node.orderby : [node.orderby];
            for (const order of orders) {
                const orderRecord = order as Record<string, unknown>;
                SQLParser.ExtractColumnReferences(
                    (orderRecord.expr || orderRecord) as Record<string, unknown>,
                    referencedColumns,
                    tableAliasMap
                );
            }
        }

        // Handle UNION/INTERSECT/EXCEPT
        if (node._next) {
            SQLParser.ExtractFromAST(
                node._next as Record<string, unknown>,
                tableAliasMap,
                referencedColumns
            );
        }
    }

    /**
     * Extracts table information from a FROM clause item, handling tables and JOINs.
     */
    private static ExtractTableFromItem(
        fromItem: Record<string, unknown>,
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>,
        referencedColumns: Set<string>
    ): void {
        if (!fromItem) return;

        // Direct table reference
        if (fromItem.table) {
            const alias = (fromItem.as || fromItem.table) as string;
            tableAliasMap.set(alias, {
                schemaName: (fromItem.db as string) || 'dbo',
                tableName: fromItem.table as string
            });
        }

        // Handle subqueries in FROM (derived tables)
        if (fromItem.expr) {
            const exprRecord = fromItem.expr as Record<string, unknown>;
            const subqueryAst = (exprRecord.ast || exprRecord) as Record<string, unknown>;
            SQLParser.ExtractFromAST(subqueryAst, tableAliasMap, referencedColumns);
        }

        // Extract column references from ON conditions
        if (fromItem.on) {
            SQLParser.ExtractColumnReferences(
                fromItem.on as Record<string, unknown>,
                referencedColumns,
                tableAliasMap
            );
        }

        // Handle USING clause
        if (fromItem.using) {
            const usings = Array.isArray(fromItem.using) ? fromItem.using : [fromItem.using];
            for (const col of usings) {
                if (typeof col === 'string') {
                    referencedColumns.add(col);
                } else if (col && typeof col === 'object' && 'column' in col) {
                    referencedColumns.add((col as Record<string, string>).column);
                }
            }
        }
    }

    /**
     * Extracts column references from an expression node.
     * Also extracts tables from subqueries found in expressions (e.g., EXISTS, IN).
     */
    private static ExtractColumnReferences(
        expr: Record<string, unknown>,
        referencedColumns: Set<string>,
        tableAliasMap?: Map<string, { schemaName: string; tableName: string }>
    ): void {
        if (!expr || typeof expr !== 'object') return;

        if (expr.type === 'column_ref') {
            const colName = expr.table ? `${expr.table}.${expr.column}` : expr.column as string;
            referencedColumns.add(colName);
        }

        // Handle subqueries in expressions (EXISTS, IN, scalar subqueries)
        if (expr.ast && tableAliasMap) {
            SQLParser.ExtractFromAST(
                expr.ast as Record<string, unknown>,
                tableAliasMap,
                referencedColumns
            );
        }

        // Recursively process nested expressions
        if (expr.left) {
            SQLParser.ExtractColumnReferences(expr.left as Record<string, unknown>, referencedColumns, tableAliasMap);
        }
        if (expr.right) {
            SQLParser.ExtractColumnReferences(expr.right as Record<string, unknown>, referencedColumns, tableAliasMap);
        }
        if (expr.args) {
            const argsRecord = expr.args as Record<string, unknown>;
            const args = argsRecord.value || expr.args;
            const argList = Array.isArray(args) ? args : [args];
            for (const arg of argList) {
                SQLParser.ExtractColumnReferences(arg as Record<string, unknown>, referencedColumns, tableAliasMap);
            }
        }
        if (expr.expr) {
            SQLParser.ExtractColumnReferences(expr.expr as Record<string, unknown>, referencedColumns, tableAliasMap);
        }
    }

    // ─────────────────────────────────────────────────────
    // Nunjucks Preprocessing (moved from MJQueryEntityServer)
    // ─────────────────────────────────────────────────────

    /**
     * Pre-processes Nunjucks templates in SQL to create valid SQL for parsing.
     * Replaces Nunjucks syntax with placeholder values.
     */
    private static PreProcessNunjucksForParsing(sql: string): string {
        const env = new nunjucks.Environment(null, {
            autoescape: false,
            throwOnUndefined: false
        });

        // Add placeholder filters that return safe SQL values
        env.addFilter('sqlString', () => "'placeholder'");
        env.addFilter('sqlNumber', () => '0');
        env.addFilter('sqlDate', () => "'2000-01-01'");
        env.addFilter('sqlIn', () => "('placeholder')");
        env.addFilter('sqlIdentifier', (val: string) => val || 'placeholder');
        env.addFilter('sqlNoKeywordsExpression', (val: string) => val || 'placeholder');
        env.addFilter('default', (val: string, defaultVal: string) => val || defaultVal || 'placeholder');
        env.addFilter('safe', (val: string) => val || 'placeholder');
        env.addFilter('dump', (val: unknown) => JSON.stringify(val || {}));

        try {
            return env.renderString(sql, {});
        } catch {
            return SQLParser.PreProcessNunjucksViaRegex(sql);
        }
    }

    /**
     * Regex fallback for Nunjucks preprocessing when rendering fails.
     */
    private static PreProcessNunjucksViaRegex(sql: string): string {
        let processed = sql;

        // Replace {{ variable | filter }} patterns
        processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlString\s*\}\}/g, "'placeholder'");
        processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlNumber\s*\}\}/g, '0');
        processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlDate\s*\}\}/g, "'2000-01-01'");
        processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlIn\s*\}\}/g, "('placeholder')");
        processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlIdentifier\s*\}\}/g, 'placeholder');
        processed = processed.replace(/\{\{\s*[\w.]+\s*[^}]*\}\}/g, "'placeholder'");

        // Remove block tags but keep content between them
        processed = processed.replace(/\{%\s*if\s+[^%]+%\}/g, '');
        processed = processed.replace(/\{%\s*endif\s*%\}/g, '');
        processed = processed.replace(/\{%\s*else\s*%\}/g, '');
        processed = processed.replace(/\{%\s*elif\s+[^%]+%\}/g, '');
        processed = processed.replace(/\{%\s*for\s+[^%]+%\}/g, '');
        processed = processed.replace(/\{%\s*endfor\s*%\}/g, '');
        processed = processed.replace(/\{%\s*set\s+[^%]+%\}/g, '');
        processed = processed.replace(/\{#[^#]*#\}/g, ''); // Comments

        return processed;
    }
}
