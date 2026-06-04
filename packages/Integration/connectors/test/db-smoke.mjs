/**
 * DB smoke test (no external creds) — proves the MJ framework connects to a real
 * workbench MJ database, loads metadata, and runs a query. Foundation for the Tier-2a
 * dual-dialect connector-Apply test.
 *
 * SQL Server (workbench sql-claude is on host port 1444):
 *   SMOKE_DB_PORT=1444 SMOKE_DB_NAME=MJTest SMOKE_DB_PASS=<workbench-sa-pw> \
 *     node packages/Integration/connectors/test/db-smoke.mjs mssql
 * (Host/port/name/user default to the workbench; password is REQUIRED via env so no
 *  credential is hardcoded here.)
 */
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { RunView } from '@memberjunction/core';

const dialect = process.argv[2] ?? 'mssql';

async function mssql() {
    const pool = new sql.ConnectionPool({
        server: process.env.SMOKE_DB_HOST ?? 'localhost',
        port: parseInt(process.env.SMOKE_DB_PORT ?? '1433', 10),
        database: process.env.SMOKE_DB_NAME ?? 'MJTest',
        user: process.env.SMOKE_DB_USER ?? 'sa',
        password: process.env.SMOKE_DB_PASS, // required via env — no hardcoded credential
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    });
    await pool.connect();
    const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'));
    const user = UserCache.Instance.GetSystemUser?.() ?? UserCache.Instance.Users?.find(u => u.IsActive);
    const md = provider;
    const integrationEntities = md.Entities.filter(e => e.Name.toLowerCase().includes('integration')).length;

    const rv = new RunView();
    const res = await rv.RunView({ EntityName: 'MJ: Integrations', ResultType: 'simple', Fields: ['ID', 'Name'] }, user);

    const out = {
        ok: res.Success === true,
        dialect: 'mssql',
        entityCount: md.Entities.length,
        integrationEntityCount: integrationEntities,
        integrationsQuery: { success: res.Success, count: res.Results?.length ?? 0, sample: (res.Results ?? []).slice(0, 8).map(r => r.Name) },
    };
    await pool.close();
    return out;
}

const result = dialect === 'mssql' ? await mssql() : { ok: false, error: `dialect '${dialect}' not wired in smoke test yet (PG needs hand-wired Config)` };
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
