export { DataTypeMap, MappedType } from './dataTypeMap.js';
export { SQLDialect, DatabasePlatform } from './sqlDialect.js';
export type { SQLParserDialect } from './sqlDialect.js';
export type { LimitClauseResult, DateAddUnit, DialectWriter } from './facets/dialectWriter.js';
export type {
    SchemaFieldType,
    ResolveTypeOptions,
    SchemaIntrospectionSQL,
    TriggerOptions,
    IndexOptions,
    ColumnDDLOptions,
    AlterColumnOptions,
    DialectSchemaDDL,
} from './facets/dialectSchemaDDL.js';
export type { DialectKey } from './facets/dialectKey.js';
export type {
    DialectLexicalRules,
    IdentifierQuoteForm,
    StringLiteralForm,
    DollarQuoting,
    LineCommentForm,
    BlockCommentRules,
    ParameterPlaceholderForm,
    IdentifierCaseFolding,
} from './facets/dialectLexicalRules.js';
export type { DialectGrammar, RowCapForm, CorrelatedJoinForm } from './facets/dialectGrammar.js';
export type { DialectTypes } from './facets/dialectTypes.js';
export type { DialectBinding } from './facets/dialectBinding.js';
export { QueryDialect } from './queryDialect.js';
export type { ParserDialect } from './queryDialect.js';
export { AnsiQueryDialect, AnsiWriter, ANSI_LEXICAL, ANSI_GRAMMAR, ANSI_WRITE_STATEMENT_KEYWORDS } from './dialects/ansi.js';
export { BaseSchemaDDL } from './dialects/baseSchemaDDL.js';
export {
    SQLServerDialect, SQLServerWriter, SQLServerBinding,
    SQL_SERVER_LEXICAL, SQL_SERVER_GRAMMAR, SQL_SERVER_TYPES,
} from './sqlServerDialect.js';
export {
    PostgreSQLDialect, PostgreSQLWriter, PostgreSQLBinding,
    POSTGRESQL_LEXICAL, POSTGRESQL_GRAMMAR, POSTGRESQL_TYPES,
} from './postgresqlDialect.js';
export { SQLServerSchemaDDL } from './dialects/sqlServerSchemaDDL.js';
export { PostgreSQLSchemaDDL } from './dialects/postgresqlSchemaDDL.js';
export { MySQLQueryDialect, MySQLWriter, MYSQL_LEXICAL, MYSQL_GRAMMAR } from './dialects/mysqlQueryDialect.js';
export { OracleQueryDialect, OracleWriter, ORACLE_LEXICAL, ORACLE_GRAMMAR } from './dialects/oracleQueryDialect.js';
export { SnowflakeQueryDialect, SnowflakeWriter, SNOWFLAKE_LEXICAL, SNOWFLAKE_GRAMMAR } from './dialects/snowflakeQueryDialect.js';
export { DatabricksQueryDialect, DatabricksWriter, DATABRICKS_LEXICAL, DATABRICKS_GRAMMAR } from './dialects/databricksQueryDialect.js';
export {
    GetDialect, GetQueryDialect, IsSupportedPlatform, SupportedPlatforms,
    RegisteredDialectKeys, ShippedQueryOnlyDialectKeys,
} from './dialectFactory.js';
export { FindReferencedIdentifiers, IdentifierMatches } from './identifierReferences.js';
export {
    RestarLayeredOuterView, restarLayeredOuterView,
    BuildCreateOrReplaceLayeredOuterViewSQL, buildCreateOrReplaceLayeredOuterViewSQL,
    LayeredOuterRestarError,
    FindTopLevelKeyword, findTopLevelKeyword,
    SplitTopLevelCommaList, splitTopLevelCommaList,
} from './postgresqlRestarLayeredOuter.js';
export type { RestarLayeredOuterViewArgs } from './postgresqlRestarLayeredOuter.js';
export {
    AutoQuotePostgreSQLIdentifiers,
    AutoQuoteLeavesWordBare,
    PostgreSQLQuotingKeywords,
    PostgreSQLStructuralKeywords,
    PostgreSQLContextualStructuralKeywords,
} from './postgresqlAutoQuote.js';
export {
    IsBooleanSQLType,
    IsStringSQLType,
    IsFixedWidthStringSQLType,
    IsDateSQLType,
    IsIntegerSQLType,
    IsFloatSQLType,
    IsUuidSQLType,
    IsBinarySQLType,
    IsJsonSQLType,
    IsCurrencySQLType,
    IsIntervalSQLType,
    IsNetworkSQLType,
    IsNumericSQLType,
} from './typeClassification.js';
