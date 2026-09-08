// ── EDS-consuming ingestion connector ABSTRACTIONS (the "heart" — share the External Data Sources
//    connection layer). The thin per-engine leaves (SQLServerConnector, PostgresConnector, MongoConnector,
//    OracleConnector, SnowflakeConnector, MySQLConnector) ship as per-engine Open Apps in the
//    MemberJunction/Integrations repo, each extending one of these and importing it from this package. ──
//
// These three base classes are the ENTIRE remaining surface of this package. Every concrete vendor
// connector that used to live here now ships from MemberJunction/Integrations as its own Open App —
// see the README for the removal rationale.
export { BaseExternalDataSourceConnector } from './datasource/BaseExternalDataSourceConnector.js';
export { BaseSqlExternalDataSourceConnector } from './datasource/BaseSqlExternalDataSourceConnector.js';
export { BaseDocumentDataSourceConnector } from './datasource/BaseDocumentDataSourceConnector.js';
