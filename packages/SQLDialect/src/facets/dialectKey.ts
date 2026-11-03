/**
 * The key a SQL dialect is registered and looked up under.
 *
 * Open on purpose: the named keys are the dialects this package ships, and any other string is a
 * dialect a consumer registered itself. Keys are lower case by convention. This is wider than
 * `DatabasePlatform`, which names only the platforms MJ itself runs on.
 */
export type DialectKey =
    | 'sqlserver'
    | 'postgresql'
    | 'mysql'
    | 'oracle'
    | 'snowflake'
    | 'databricks'
    | (string & Record<never, never>);
