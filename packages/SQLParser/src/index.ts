// MJ SQL Parser — unified parser for MJ's SQL superset
export { MJSQLParser } from './mj-sql-parser.js';
export type { MJAstifyResult, SQLTableReference, SQLColumnReference, SQLCTEExtraction, MJParameterInfo } from './mj-sql-parser.js';

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
} from './mj-ast-types.js';
