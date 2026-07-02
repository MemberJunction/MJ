/**
 * Archive pre-flight — validates the destination MJ instance BEFORE the suite
 * runs, so we fail in ~5 seconds instead of after the 10-minute suite.
 *
 * Reads ARCHIVE_DB_* env vars (see test-runner-entrypoint.sh § 8 for the full
 * contract). Defaults ARCHIVE_DB_HOST to `host.docker.internal` so most users
 * never have to think about docker networks — their destination just needs
 * to publish its DB port to the host.
 *
 * Checks performed:
 *   1. Required env vars present (DB host, database, username, password)
 *   2. TCP reachability — can we open a socket to host:port?
 *   3. SQL auth — can we authenticate?
 *   4. Target DB exists — `SELECT name FROM sys.databases WHERE name = ?`
 *   5. MJ core schema installed — `sys.tables WHERE schema = <core>, name = 'TestSuiteRun'`
 *   6. Archive user exists — `<core>.[User] WHERE Email = <ARCHIVE_USER_EMAIL>`
 *
 * Exit codes:
 *   0 = archive disabled (no env vars set) OR all checks pass — archive runs
 *   1 = critical failure (a required precondition is missing) — archive skipped
 *
 * Encryption-key fingerprint is intentionally NOT validated here. TestSuiteRun
 * + children have no encrypted fields, so a key mismatch wouldn't break the
 * archive flow. If the archive ever expands to encrypted entities, surface
 * that check as a separate script.
 *
 * IMPORTANT: this script must be cheap. Use short connection timeouts and
 * never block the suite on slow DNS or a hanging destination.
 */

const sql = require('mssql');
const net = require('node:net');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function log(label, msg) {
    console.log(`  ${label} ${msg}`);
}
function ok(msg) { log(`${GREEN}✓${RESET}`, msg); }
function fail(msg) { log(`${RED}✗${RESET}`, `${RED}${msg}${RESET}`); }
function warn(msg) { log(`${YELLOW}⚠${RESET}`, `${YELLOW}${msg}${RESET}`); }
function info(msg) { log(`${DIM}·${RESET}`, msg); }

function readEnv() {
    return {
        host: process.env.ARCHIVE_DB_HOST || 'host.docker.internal',
        port: parseInt(process.env.ARCHIVE_DB_PORT || '1433', 10),
        database: process.env.ARCHIVE_DB_DATABASE,
        username: process.env.ARCHIVE_DB_USERNAME,
        password: process.env.ARCHIVE_DB_PASSWORD,
        trustCert: (process.env.ARCHIVE_DB_TRUST_CERT || 'true').toLowerCase() === 'true',
        userEmail: process.env.ARCHIVE_USER_EMAIL || 'not.set@nowhere.com',
        coreSchema: process.env.ARCHIVE_MJ_CORE_SCHEMA || '__mj',
    };
}

function archiveRequested(env) {
    return Boolean(env.database);
}

function checkRequiredFields(env) {
    const missing = [];
    if (!env.database) missing.push('ARCHIVE_DB_DATABASE');
    if (!env.username) missing.push('ARCHIVE_DB_USERNAME');
    if (!env.password) missing.push('ARCHIVE_DB_PASSWORD');
    if (missing.length > 0) {
        fail(`Missing required env vars: ${missing.join(', ')}`);
        info('Either set the missing vars or remove ARCHIVE_DB_DATABASE to disable the archive flow.');
        return false;
    }
    return true;
}

function tcpProbe(host, port, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;
        const done = (success, reason) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve({ success, reason });
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false, `timed out after ${timeoutMs}ms`));
        socket.once('error', (err) => done(false, err.message));
        socket.connect(port, host);
    });
}

async function sqlConnect(env) {
    const cfg = {
        server: env.host,
        port: env.port,
        user: env.username,
        password: env.password,
        // Connect to `master` for the DB-existence check; we re-connect to the
        // real DB once we've confirmed it exists.
        database: 'master',
        options: { encrypt: true, trustServerCertificate: env.trustCert },
        connectionTimeout: 10000,
        requestTimeout: 10000,
    };
    return sql.connect(cfg);
}

async function checkDbExists(pool, dbName) {
    const result = await pool.request()
        .input('name', sql.NVarChar, dbName)
        .query('SELECT name FROM sys.databases WHERE name = @name');
    return result.recordset.length > 0;
}

async function checkSchema(env) {
    // Re-connect with the target DB selected.
    const cfg = {
        server: env.host,
        port: env.port,
        user: env.username,
        password: env.password,
        database: env.database,
        options: { encrypt: true, trustServerCertificate: env.trustCert },
        connectionTimeout: 10000,
        requestTimeout: 10000,
    };
    const pool = await sql.connect(cfg);
    try {
        const tables = await pool.request()
            .input('schema', sql.NVarChar, env.coreSchema)
            .query(`
                SELECT COUNT(*) AS cnt
                FROM sys.tables
                WHERE schema_id = SCHEMA_ID(@schema)
                  AND name IN ('TestSuiteRun', 'TestRun', 'TestRunOutput', 'User')
            `);
        const cnt = tables.recordset[0].cnt;
        if (cnt < 4) {
            return { ok: false, found: cnt, expected: 4 };
        }
        const user = await pool.request()
            .input('email', sql.NVarChar, env.userEmail)
            .input('schema', sql.NVarChar, env.coreSchema)
            .query(`SELECT COUNT(*) AS cnt FROM [${env.coreSchema}].[User] WHERE Email = @email`);
        const userCnt = user.recordset[0].cnt;
        return { ok: true, found: 4, userExists: userCnt > 0 };
    } finally {
        await pool.close();
    }
}

async function main() {
    const env = readEnv();

    if (!archiveRequested(env)) {
        info('Archive flow disabled (no ARCHIVE_DB_DATABASE set) — skipping pre-flight.');
        process.exit(0);
    }

    // 1. Required vars (validate before printing the destination summary so
    // we don't show `undefined@host/db` for partially-configured runs)
    if (!checkRequiredFields(env)) process.exit(1);

    console.log(`  Destination: ${env.username}@${env.host}:${env.port}/${env.database}`);
    console.log('');
    ok('Required env vars present');

    // 2. TCP reachability
    const probe = await tcpProbe(env.host, env.port);
    if (!probe.success) {
        fail(`Cannot reach ${env.host}:${env.port} — ${probe.reason}`);
        info('Possible fixes:');
        info(`  · If the DB is in another docker container, attach it to mj-regression_default:`);
        info(`      docker network connect mj-regression_default <container-name>`);
        info(`    Then set ARCHIVE_DB_HOST=<container-name>.`);
        info(`  · If the DB is on your Mac/host, ensure ARCHIVE_DB_HOST=host.docker.internal`);
        info(`    and the destination publishes its port to the host.`);
        info(`  · If the DB is on a remote machine, ensure firewall + DNS allow the connection.`);
        process.exit(1);
    }
    ok(`TCP connect to ${env.host}:${env.port}`);

    // 3 + 4. Auth + DB exists
    let pool;
    try {
        pool = await sqlConnect(env);
    } catch (err) {
        fail(`SQL auth failed: ${err.message}`);
        info(`Check ARCHIVE_DB_USERNAME / ARCHIVE_DB_PASSWORD.`);
        process.exit(1);
    }
    ok(`SQL auth as ${env.username}`);

    let dbExists;
    try {
        dbExists = await checkDbExists(pool, env.database);
    } catch (err) {
        fail(`Could not query sys.databases: ${err.message}`);
        await pool.close();
        process.exit(1);
    } finally {
        await pool.close();
    }
    if (!dbExists) {
        fail(`Database '${env.database}' does not exist on ${env.host}:${env.port}`);
        info(`Create it on the destination first, then run Flyway migrations + CodeGen to install the MJ core schema.`);
        process.exit(1);
    }
    ok(`Database '${env.database}' exists`);

    // 5 + 6. Schema + user
    let schemaResult;
    try {
        schemaResult = await checkSchema(env);
    } catch (err) {
        fail(`Schema check failed: ${err.message}`);
        process.exit(1);
    }
    if (!schemaResult.ok) {
        fail(`MJ core schema incomplete — found ${schemaResult.found}/${schemaResult.expected} expected tables in [${env.coreSchema}]`);
        info(`Run Flyway migrations against '${env.database}' to install the schema.`);
        process.exit(1);
    }
    ok(`MJ core schema present (schema: ${env.coreSchema})`);

    if (!schemaResult.userExists) {
        warn(`Archive user '${env.userEmail}' not found in [${env.coreSchema}].[User]`);
        info(`The push will fail with an FK error. Create the user with:`);
        info(`  INSERT INTO [${env.coreSchema}].[User] (ID, Name, Email, FirstName, LastName, Type, IsActive)`);
        info(`  VALUES (NEWID(), '<full name>', '${env.userEmail}', '<first>', '<last>', 'User', 1);`);
        info(`Or set ARCHIVE_USER_EMAIL to an email that already exists in the destination.`);
        process.exit(1);
    }
    ok(`Archive user '${env.userEmail}' exists`);

    console.log('');
    ok(`${GREEN}Archive pre-flight passed — destination is ready.${RESET}`);
    process.exit(0);
}

main().catch((err) => {
    fail(`Unexpected pre-flight error: ${err.stack || err.message || err}`);
    process.exit(1);
});
