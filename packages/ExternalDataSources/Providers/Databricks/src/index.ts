// PUBLIC API SURFACE AREA
// Side-effect: importing this barrel registers the Databricks driver with
// MJGlobal.ClassFactory via @RegisterClass(BaseExternalDataSourceDriver, 'DatabricksExternalDriver').
export * from './DatabricksExternalDataSourceDriver';
