export { GenericDatabaseProvider, ExecuteSQLBatchOptions } from './GenericDatabaseProvider.js';
// Side-effect import: registers DatabaseWellKnownUserSource with the class factory so any
// process holding a database provider can resolve MJ's built-in accounts.
export { DatabaseWellKnownUserSource } from './DatabaseWellKnownUserSource.js';
export { SystemUserID } from './systemUser.js';
export type {
    SaveCoercedValue,
    SaveCallBinding,
    SaveSQLFragment,
    RecordChangePayload,
} from './saveTypes.js';
export {
    CRUDSprocType,
    shouldIncludeFieldInParams,
    needsClearCompanionBroadRule,
    projectedParamCount,
    useJsonArgShape,
} from './crudSprocFieldRules.js';
export { resolveDbPlatformFromEnv } from './dbPlatformEnv.js';
export { UserCache } from './UserCache.js';
export { SqlLoggingOptions, SqlLoggingSession } from './types.js';
export { SqlLoggingSessionImpl } from './SqlLogger.js';
export { QueryCompositionEngine, CompositionCTEInfo, CompositionResult } from './queryCompositionEngine.js';
export { QueryPagingEngine, PagingWrappedSQL } from './queryPagingEngine.js';
export { RenderPipeline, RenderContext, RenderResult, RenderTrace, CompositionDiagnostic } from './renderPipeline.js';
export { SymbolTable } from './symbolTable.js';
// Re-export from @memberjunction/sql-parser for backward compatibility
export { AnalyzeTopLevelOrderBy, HasTopLevelOrderBy, ExtractOrderBy, ParseToIR, RenderIR } from '@memberjunction/sql-parser';
export type { OrderByAnalysis, QueryIR, CTENode, Fragment, SQLFragment, TemplateExprFragment, BlockFragment, CommentFragment, CompositionRefFragment, CTEOrigin } from '@memberjunction/sql-parser';
