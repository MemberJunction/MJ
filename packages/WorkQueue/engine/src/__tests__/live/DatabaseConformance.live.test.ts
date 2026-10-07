import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import sql from 'mssql';
import { ResolveStartupMode, SetProductionStatus } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import type { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { CreateDatabaseConformanceHarness, DATABASE_CONFORMANCE_TRAITS } from '../../testing/DatabaseConformanceHarness';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../../transports/database/databaseCapabilities';
import type { DatabaseConformanceHarness } from '../../testing/DatabaseConformanceHarness';
import '../../index';

/**
 * LIVE DATABASE. Runs the 26 core conformance cases through the Database transport against the SQL Server named in
 * the repository .env. Opt in with MJ_WORKQUEUE_LIVE_DB=1; without it the suite is skipped so `pnpm test` stays
 * hermetic. Plan 06's integration bundle is the CI home of this run.
 */
const LIVE = process.env.MJ_WORKQUEUE_LIVE_DB === '1';

function ReadDotEnv(): Record<string, string> {
    const path = fileURLToPath(new URL('../../../../../../.env', import.meta.url));
    const env: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
        if (match) {
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
    }
    return env;
}

describe.skipIf(!LIVE)('Database transport conformance against a live SQL Server', () => {
    let pool: sql.ConnectionPool;
    let provider: SQLServerDataProvider;
    let harness: DatabaseConformanceHarness;
    let user: UserInfo;

    beforeAll(async () => {
        SetProductionStatus(false);
        const env = ReadDotEnv();
        pool = new sql.ConnectionPool({
            server: env.DB_HOST, port: Number(env.DB_PORT ?? 1433), user: env.DB_USERNAME, password: env.DB_PASSWORD,
            database: env.DB_DATABASE, options: { encrypt: true, trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE !== '0' },
        });
        await pool.connect();
        provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, env.MJ_CORE_SCHEMA ?? '__mj'),
            { mode: ResolveStartupMode({ defaultMode: 'task' }).mode });
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            throw new Error('System user not found in UserCache');
        }
        user = systemUser;
        harness = await CreateDatabaseConformanceHarness(provider, user);
    }, 120_000);

    afterAll(async () => {
        await harness?.Cleanup();
        await pool?.close();
    }, 120_000);

    // The suite gates its cases at registration time (before beforeAll), so the static capabilities and traits are
    // given directly and everything that needs the live harness resolves it at run time.
    RunTransportConformanceSuite('Database', {
        Capabilities: DATABASE_TRANSPORT_CAPABILITIES,
        Traits: DATABASE_CONFORMANCE_TRAITS,
        CreateDriver: () => harness.CreateDriver(),
        CreateTopic: (driver, name, overrides) => harness.CreateTopic(driver, name, overrides),
        CreateSubscription: (driver, topic, name, overrides) => harness.CreateSubscription(driver, topic, name, overrides),
        AdvanceTime: ms => harness.AdvanceTime(ms),
        Dispose: async () => undefined,
    });

    it('ran against the database named in .env', () => {
        // Placeholder so an all-skipped gate still reports the suite was reached.
    });
});
