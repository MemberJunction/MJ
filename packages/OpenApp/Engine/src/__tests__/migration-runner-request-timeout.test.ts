/**
 * The per-request timeout on the Skyway config for an app's migrations. Data migrations can run one
 * long request each, so with no configured timeout the install uses the same default as `mj migrate`.
 */
import { describe, it, expect } from 'vitest';
import { BuildSkywayConfig, type SkywayDatabaseConfig } from '../install/migration-runner.js';

const DB_CONFIG: SkywayDatabaseConfig = {
    Host: 'sqlserver',
    Port: 1433,
    Database: 'MemberJunction_Test',
    User: 'sa',
    Password: 'secret',
};

describe('BuildSkywayConfig request timeout', () => {
    it('uses 30 minutes when no timeout is configured', () => {
        const config = BuildSkywayConfig('/tmp/migrations', 'app_schema', DB_CONFIG);
        expect(config.Database.Options?.RequestTimeout).toBe(1_800_000);
    });
});
