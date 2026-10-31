/**
 * Test fixtures for statement failures as the SQL Server provider reports them: `executeSQLCore`
 * rewrites a failed statement's error message to carry the full statement text and its parameters.
 */

/** SQL Server's own text for a login that may not manage credentials. */
export const CREDENTIAL_PERMISSION_DENIED = "Cannot alter the credential 'https://storage.blob.core.windows.net/backups', because it does not exist or you do not have permission.";

/** An error shaped exactly as `SQLServerDataProvider` throws it for a failed statement. */
export function ProviderShapedSqlError(serverText: string, query: string): Error {
    return new Error(`Error executing SQL
    Error: ${serverText}
    Query: ${query}
    Parameters: None`);
}

/** True when the statement registers a storage credential (it embeds the SAS token). */
export function IsCredentialDdl(sql: string): boolean {
    return sql.includes('CREDENTIAL') && sql.includes('SECRET');
}
