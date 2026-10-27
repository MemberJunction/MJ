// MJ SQL Parser — unified parser for MJ's SQL superset
export { SQLParser } from './sql-parser.js';
// Re-export SQLParserDialect so consumers can import from either sql-parser or sql-dialect
export type { SQLParserDialect } from '@memberjunction/sql-dialect';
// ORDER BY analysis (shared between composition and paging engines)
export { AnalyzeTopLevelOrderBy, HasTopLevelOrderBy, ExtractOrderBy, FindOrderByStatement, findOrderByStatement, IsOrderByLegalInCTE, isOrderByLegalInCTE } from './orderByAnalyzer.js';
export type { OrderByAnalysis } from './orderByAnalyzer.js';
// Token-level SQL reading that works on any statement, including SQL the AST parser rejects
export { LexSQL, SignificantTokens, IsKeyword } from './sqlLexer.js';
export type { SQLLexToken, SQLLexTokenKind, LexDialect } from './sqlLexer.js';
export { SplitLeadingCTEs, IsReadOnlyQuery } from './sqlShape.js';
export type { LeadingCTEs, LeadingCTEDefinition, ReadOnlyQueryCheck } from './sqlShape.js';
export { IsBalancedSQLFragment, SplitTopLevelAndTerms } from './balancedFragment.js';
export type { BalancedFragmentCheck, BalancedFragmentOptions } from './balancedFragment.js';
export { AnalyzePagingShape } from './pagingShape.js';
export { FindForbiddenFunctionCalls } from './callerSqlFunctions.js';
// Screen for a caller-supplied RunView aggregate expression
export { CheckAggregateExpression } from './aggregateExpression.js';
export type { AggregateExpressionCheck } from './aggregateExpression.js';
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

// ─── MJ Query language: token stream and template layer ───────────────
export { MakeDiagnostic, MakeSpan, SpanContains } from './common/analysis.js';
export type { Analysis, Diagnostic, DiagnosticSeverity, Span } from './common/analysis.js';
export { MJQueryDiagnosticCodes } from './common/diagnosticCodes.js';
export type { MJQueryDiagnosticCode } from './common/diagnosticCodes.js';
export { SqlTokens, IsSignificantToken } from './lexer/sqlTokens.js';
export type { SqlToken, SqlTokenKind, TemplateSqlContext, TemplateTagForm, TemplateTagInfo } from './lexer/sqlTokenTypes.js';
export { QueryTemplate } from './template/queryTemplate.js';
export { TemplateExpressionParser } from './template/expressionParser.js';
export type { ParsedExpression, ParsedArgument, ParsedArguments } from './template/expressionParser.js';
export { ExpressionChildren, WalkExpression } from './template/expressionTypes.js';
export type {
    TemplateExpression,
    TemplateBinaryOperator,
    TemplateUnaryOperator,
    TemplateLiteralValue,
    UnsupportedConstruct,
    NameExpression,
    ContextExpression,
    LoopMemberExpression,
    LiteralExpression,
    UnaryExpression,
    BinaryExpression,
    FilterExpression,
    UnsupportedExpression,
} from './template/expressionTypes.js';
export { AllNodes, ChildBodies, NodeExpressions } from './template/templateNodes.js';
export type {
    TemplateNode,
    SqlTextNode,
    ExpressionNode,
    IfNode,
    IfBranch,
    ElseBranch,
    ForNode,
    SetNode,
    CompositionNode,
    CompositionArgument,
    DocCommentNode,
    UnknownTemplateNode,
} from './template/templateNodes.js';
export {
    MJ_QUERY_SQL_FILTERS,
    MJ_QUERY_CONTEXT_TOKENS,
    MJ_QUERY_LOOP_MEMBERS,
    MJ_QUERY_BLOCK_TAGS,
    DEFAULT_FILTER_NAME,
    FindSqlFilter,
    ContextTokenFilters,
} from './template/queryLanguage.js';
export type { TemplateParameterType, MJQuerySqlFilter } from './template/queryLanguage.js';
export type { TemplateParameter, ParameterUse, ContextTokenUse } from './template/parameterAnalysis.js';
export type { ValueUseRole } from './template/templateWalker.js';
export type { CompositionReference } from './template/compositionReferences.js';
export type { TemplateDocComments, DocCommentEntry, DocCommentSource } from './template/docComments.js';
export { BranchVariantValues } from './template/branchVariants.js';
export type { BranchVariant, BranchVariantSet, BranchToggle } from './template/branchVariants.js';
export type { BranchValue } from './template/branchEvaluator.js';
export type {
    QueryTemplateValidateOptions,
    QueryTemplateValidationMode,
    QueryTemplateValidation,
    DeclaredTemplateParameter,
    CompositionTarget,
    CompositionTargetParameter,
    CompositionResolver,
} from './template/validationTypes.js';

// ─── SqlDocument: the tolerant structural parser, scope, analyses and edits ───
export { SqlDocument } from './sql/sqlDocument.js';
export { SqlDocumentDiagnosticCodes } from './sql/sqlDiagnosticCodes.js';
export type { SqlDocumentDiagnosticCode } from './sql/sqlDiagnosticCodes.js';
export { SqlExpression } from './sql/sqlExpression.js';
export type { IdentifierPath, FunctionCall, StarReference } from './sql/sqlExpression.js';
export { SqlScope, NameKey } from './sql/sqlScope.js';
export type {
    ColumnClause,
    ScopeSource,
    ScopeSourceKind,
    QueryScope,
    ExpressionContext,
    QualifierBinding,
} from './sql/sqlScope.js';
export { SqlNodeChildren, WalkSqlNodes, LeftmostSelect, IsQueryExpression } from './sql/sqlWalker.js';
export type {
    SqlNode,
    UnknownNode,
    IdentifierNode,
    ObjectName,
    SqlStatementKind,
    StatementNode,
    QueryNode,
    WithClause,
    CTEDeclaration,
    QueryTailClauses,
    QueryExpression,
    SelectCore,
    SetOperator,
    SetOperationNode,
    ParenthesizedQuery,
    ValuesQuery,
    DistinctClause,
    TopClause,
    SelectItem,
    IntoClause,
    FromClause,
    FromSource,
    SourceAlias,
    TableSource,
    DerivedSource,
    FunctionSource,
    ValuesSource,
    JoinKind,
    JoinSource,
    ApplySource,
    PivotSource,
    ParenthesizedSource,
    ConditionClause,
    GroupByClause,
    WindowClause,
    WindowDefinition,
    OrderByClause,
    OrderByItem,
    LimitClause,
    OffsetClause,
    FetchClause,
    ForClauseForm,
    ForClause,
    OptionClause,
} from './sql/sqlNodes.js';
export type {
    TableReference,
    CTEInfo,
    OutputItem,
    OutputItems,
    TopLevelOrderBy,
    RowCap,
    ReadOnlyCheck,
    ColumnBinding,
    ColumnReference,
    WholeRowKind,
    WholeRowConstruct,
    DuplicateOutputName,
    DuplicateOutputNameOptions,
} from './sql/analyses/analysisTypes.js';
export { EditSet, EditConflictError, SpanMap } from './edit/editSet.js';
export type { EditTarget, TextEdit, TextEditKind, AppliedEdits, OffsetBias } from './edit/editSet.js';
export type { SqlTransformResult, TransformDialect } from './edit/transformSupport.js';
export { StripOrderBy, ReplaceSelectList, AppendTail, SetRowCap } from './edit/clauseTransforms.js';
export type { AppendTailOptions } from './edit/clauseTransforms.js';
export { HoistCTEs, RenameCTE, WrapAsDerivedTable, OutputOrderBy } from './edit/cteTransforms.js';
export type { HoistedCTE, HoistedCTEs, WrapOptions } from './edit/cteTransforms.js';
