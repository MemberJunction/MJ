// MJ SQL Parser — unified parser for MJ's SQL superset
export { SQLParser } from './sql-parser.js';
// Re-export SQLParserDialect so consumers can import from either sql-parser or sql-dialect
export type { SQLParserDialect } from '@memberjunction/sql-dialect';
// ORDER BY analysis (shared between composition and paging engines)
export { AnalyzeTopLevelOrderBy, HasTopLevelOrderBy, ExtractOrderBy, findOrderByStatement, isOrderByLegalInCTE } from './orderByAnalyzer.js';
export type { OrderByAnalysis } from './orderByAnalyzer.js';
// Token-level SQL reading that works on any statement, including SQL the AST parser rejects
export { LexSQL, SignificantTokens, IsKeyword } from './sqlLexer.js';
export type { SQLLexToken, SQLLexTokenKind } from './sqlLexer.js';
export { SplitLeadingCTEs, IsReadOnlyQuery } from './sqlShape.js';
export type { LeadingCTEs, LeadingCTEDefinition, ReadOnlyQueryCheck } from './sqlShape.js';
export { AnalyzePagingShape } from './pagingShape.js';
export type { PagingShape, OwnRowCap } from './pagingShape.js';
// Structural parser and composition IR
export { ParseToIR, RenderIR } from './structuralParser.js';
export type { QueryIR, CTENode, Fragment, SQLFragment, TemplateExprFragment, BlockFragment, CommentFragment, CompositionRefFragment, CTEOrigin } from './compositionIR.js';
export type {
    MJAstifyResult,
    SQLTableReference,
    SQLColumnReference,
    SQLSelectColumn,
    SQLCTEExtraction,
    MJParameterInfo,
    SQLParseResult,
    SQLParseOptions,
    SQLStatementKind,
    RowCapInfo,
} from './sql-parser.js';

// Re-export node-sql-parser's AST type so consumers don't need a direct dependency
export type { AST as SQLAst } from 'node-sql-parser';

// MJ AST Types
export type {
    // AST node types
    MJNode,
    MJNodeType,
    MJTemplateExpr,
    MJFilter,
    MJCompositionRef,
    MJCompositionParam,
    MJConditionalBlock,
    MJBranch,
    MJLoopBlock,
    MJComment,
    MJSetBlock,
    MJSQLFragment,
    MJRawSQL,
    // Lexer token types
    MJTokenType,
    MJToken,
    MJTokenParsedContent,
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
    MJSQLTextContent,
    // Placeholder types
    PlaceholderContext,
    PlaceholderEntry,
    PlaceholderSubstitutionResult,
    // Parse result
    MJParseResult,
    // AST Walker types
    SQLClauseContext,
    MJASTAnnotation,
    MJASTWalkResult,
} from './mj-ast-types.js';
