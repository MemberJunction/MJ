/**
 * Archive config — LOOPBACK variant for testing.
 *
 * Points at the SAME local docker SQL Server as the test-runner, so the
 * archive push re-targets the same DB the pull came from. Records upsert
 * by primary key, so the push is a no-op for unchanged rows.
 *
 * Used by Phase 3 verification to confirm:
 *   - ARCHIVE_MJ_CONFIG env override picks up an alternate config
 *   - mj sync pull → tag-archive → mj sync push pipeline runs cleanly
 *   - Externalized screenshots round-trip without collisions
 *
 * For a real archive deployment, see archive-mj.config.cjs.example which
 * points at a separate destination MJ instance.
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
    dbHost: process.env.DB_HOST || 'sqlserver',
    dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 1433,
    dbDatabase: process.env.DB_DATABASE || 'MemberJunction_Test',
    dbUsername: process.env.DB_USERNAME || 'sa',
    dbPassword: process.env.DB_PASSWORD || '',
    dbTrustServerCertificate: true,
    currentUserEmail: 'not.set@nowhere.com',
    mjCoreSchema: '__mj',
    baseEncryptionKey: process.env.MJ_BASE_ENCRYPTION_KEY || '',
};
