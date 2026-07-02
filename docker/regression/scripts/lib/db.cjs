/**
 * Shared mssql connection helper for the regression-test Docker scripts.
 *
 * Connection settings come from environment variables (DB_HOST, DB_PORT,
 * DB_DATABASE, DB_USERNAME, DB_PASSWORD) so a single image-bake config can
 * be reused across the db-setup, form-generator, and test-runner containers
 * without re-encoding credentials in every script.
 */

const sql = require('mssql');

function buildConfig({ withDatabase = true } = {}) {
    const cfg = {
        server: process.env.DB_HOST || 'sqlserver',
        port: parseInt(process.env.DB_PORT || '1433', 10),
        user: process.env.DB_USERNAME || 'sa',
        password: process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: true },
        requestTimeout: 120000,
    };
    if (withDatabase) {
        cfg.database = process.env.DB_DATABASE || 'MemberJunction_Test';
    }
    return cfg;
}

async function connect(opts) {
    return sql.connect(buildConfig(opts));
}

module.exports = { sql, connect };
