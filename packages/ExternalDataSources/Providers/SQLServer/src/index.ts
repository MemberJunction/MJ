// PUBLIC API SURFACE AREA
// Side-effect: importing this barrel registers the SQL Server driver with
// MJGlobal.ClassFactory via @RegisterClass(BaseExternalDataSourceDriver, 'SQLServerExternalDriver').
export * from './SQLServerExternalDataSourceDriver';
