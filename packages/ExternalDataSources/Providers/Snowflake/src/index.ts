// PUBLIC API SURFACE AREA
// Side-effect: importing this barrel registers the Snowflake driver with
// MJGlobal.ClassFactory via @RegisterClass(BaseExternalDataSourceDriver, 'SnowflakeExternalDriver').
export * from './SnowflakeExternalDataSourceDriver';
