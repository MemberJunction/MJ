// PUBLIC API SURFACE AREA
// Side-effect: importing this barrel registers the Postgres driver with
// MJGlobal.ClassFactory via @RegisterClass(BaseExternalDataSourceDriver, 'PostgresExternalDriver').
export * from './PostgresExternalDataSourceDriver';
