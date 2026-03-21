// Existing API (backward compatible)
export { SQLParser, SQLTableReference, SQLColumnReference, SQLParseResult, SQLCTEExtraction } from './sql-parser.js';

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

// MJ Lexer
export { MJLexer } from './mj-lexer.js';

// MJ Placeholder Substitution
export { MJPlaceholderSubstitution } from './mj-placeholder.js';

// MJ SQL Parser — main entry points
export {
    mjAstify,
    mjSqlify,
    extractTemplateExpressions,
    extractCompositionRefs,
    extractConditionalBlocks,
    extractParameterInfo,
} from './mj-sql-parser.js';
export type { MJAstifyResult, MJParameterInfo } from './mj-sql-parser.js';
