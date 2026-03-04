/**
 * Shared helper to check whether the sql-claude mock database is reachable.
 * When sql-claude is unavailable (e.g. in GitHub Actions CI), tests that
 * depend on it are skipped gracefully rather than failing.
 */
import sql from 'mssql';

let _canConnect: boolean | null = null;

/**
 * Attempts a quick TCP connection to the sql-claude mock database.
 * Result is cached after the first call so repeated checks are instant.
 */
export async function canConnectToMockDB(): Promise<boolean> {
    if (_canConnect !== null) return _canConnect;

    try {
        const pool = new sql.ConnectionPool({
            server: 'sql-claude',
            database: 'mock_data',
            user: 'sa',
            password: 'Claude2Sql99',
            options: { encrypt: false, trustServerCertificate: true },
            connectionTimeout: 3000,
        });
        await pool.connect();
        await pool.close();
        _canConnect = true;
    } catch {
        _canConnect = false;
    }
    return _canConnect;
}
