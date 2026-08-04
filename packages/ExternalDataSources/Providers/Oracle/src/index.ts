// PUBLIC API SURFACE AREA
// Side-effect: importing this barrel registers the Oracle driver with
// MJGlobal.ClassFactory via @RegisterClass(BaseExternalDataSourceDriver, 'OracleExternalDriver').
export * from './OracleExternalDataSourceDriver';
