/**
 * Tests for `applyPlatformDependentEnvVars()` in `Config/config.ts` — the
 * post-merge helper that re-applies PG_*-prefixed env-var precedence after
 * `mergeConfigs()` has folded the user's `mj.config.cjs` into the defaults.
 *
 * Why this helper exists (and these tests): `_resolveConnEnv()` keys its
 * PG_* check on `_IS_PG_DEFAULT` — derived from `process.env.DB_PLATFORM`
 * at module load. A user who sets `dbPlatform: 'postgresql'` in
 * `mj.config.cjs` (no DB_PLATFORM env var) but supplies the host via
 * PG_HOST would have had PG_HOST silently ignored before this helper
 * existed, connecting to `localhost`. The pre-multi-provider-refactor
 * inline `setupPostgreSQLDataSource()` did
 * `process.env.PG_HOST ?? configInfo.dbHost` unconditionally — these tests
 * verify the helper restores that behavior at the config layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock heavy deps so importing `config.ts` doesn't try to do real I/O.
vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    resolveDbPlatformFromEnv: vi.fn().mockReturnValue('sqlserver'),
}));

vi.mock('@memberjunction/config', () => ({
    mergeConfigs: vi.fn((...configs: unknown[]) => Object.assign({}, ...configs)),
    parseBooleanEnv: vi.fn(() => false),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    SeverityType: { Info: 'Info', Warning: 'Warning', Critical: 'Critical' },
}));

vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue(null) }),
}));

import type { ConfigInfo } from '../Config/config';
import { applyPlatformDependentEnvVars, _warnedEnvPrecedencePairs } from '../Config/config';

/** Build a minimal `ConfigInfo`-shaped object for tests. */
function makeConfig(overrides: Partial<ConfigInfo> = {}): ConfigInfo {
    return {
        dbPlatform: 'postgresql' as ConfigInfo['dbPlatform'],
        dbHost: 'placeholder.host',
        dbPort: 1234,
        dbDatabase: 'placeholder_db',
        codeGenLogin: 'placeholder_user',
        codeGenPassword: 'placeholder_pwd',
        dbTrustServerCertificate: 'N',
        mjCoreSchema: '__mj',
        graphqlPort: 4000,
        entityPackageName: 'mj_generatedentities',
        verboseOutput: false,
        ...overrides,
    } as ConfigInfo;
}

describe('applyPlatformDependentEnvVars — short-circuits', () => {
    beforeEach(() => {
        _warnedEnvPrecedencePairs.clear();
        for (const key of ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USERNAME', 'PG_PASSWORD',
                            'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'CODEGEN_DB_USERNAME', 'CODEGEN_DB_PASSWORD']) {
            delete process.env[key];
        }
    });

    it('is a no-op when dbPlatform is sqlserver (PG_* env vars are ignored)', () => {
        process.env.PG_HOST = 'pg.example.com';
        const config = makeConfig({ dbPlatform: 'sqlserver' as ConfigInfo['dbPlatform'], dbHost: 'sql.example.com' });
        applyPlatformDependentEnvVars(config, {});
        expect(config.dbHost).toBe('sql.example.com');
    });
});

describe('applyPlatformDependentEnvVars — PG_* precedence on postgresql', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _warnedEnvPrecedencePairs.clear();
        for (const key of ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USERNAME', 'PG_PASSWORD',
                            'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'CODEGEN_DB_USERNAME', 'CODEGEN_DB_PASSWORD']) {
            delete process.env[key];
        }
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('applies PG_HOST when the user did NOT set dbHost in mj.config.cjs', () => {
        process.env.PG_HOST = 'pg.example.com';
        const config = makeConfig({ dbHost: 'fallback.from.defaults' });
        applyPlatformDependentEnvVars(config, /* userConfig */ {});
        expect(config.dbHost).toBe('pg.example.com');
    });

    it('does NOT override dbHost when the user explicitly set it in mj.config.cjs', () => {
        process.env.PG_HOST = 'pg.example.com';
        const config = makeConfig({ dbHost: 'user.set.host' });
        applyPlatformDependentEnvVars(config, /* userConfig */ { dbHost: 'user.set.host' });
        expect(config.dbHost).toBe('user.set.host');
    });

    it('is a no-op when no PG_* env var is set (default-resolved config wins)', () => {
        const config = makeConfig({ dbHost: 'defaults.host' });
        applyPlatformDependentEnvVars(config, {});
        expect(config.dbHost).toBe('defaults.host');
    });

    it('applies all five PG_* env vars when the user set none in mj.config.cjs', () => {
        process.env.PG_HOST = 'pg.host';
        process.env.PG_PORT = '5433';
        process.env.PG_DATABASE = 'pg_db';
        process.env.PG_USERNAME = 'pg_user';
        process.env.PG_PASSWORD = 'pg_pwd';

        const config = makeConfig();
        applyPlatformDependentEnvVars(config, {});

        expect(config.dbHost).toBe('pg.host');
        expect(config.dbPort).toBe(5433);
        expect(config.dbDatabase).toBe('pg_db');
        expect(config.codeGenLogin).toBe('pg_user');
        expect(config.codeGenPassword).toBe('pg_pwd');
    });

    it('respects per-field user precedence — only unset fields get the PG_* override', () => {
        process.env.PG_HOST = 'pg.host';
        process.env.PG_PORT = '5433';
        process.env.PG_DATABASE = 'pg_db';

        const config = makeConfig({ dbHost: 'will.be.overridden', dbPort: 9999, dbDatabase: 'user_db' });
        // User explicitly set dbDatabase in mj.config.cjs but NOT dbHost / dbPort.
        applyPlatformDependentEnvVars(config, { dbDatabase: 'user_db' });

        expect(config.dbHost).toBe('pg.host');           // overridden by PG_HOST
        expect(config.dbPort).toBe(5433);                // overridden by PG_PORT
        expect(config.dbDatabase).toBe('user_db');       // user value preserved
    });

    it('does NOT corrupt dbPort when PG_PORT is non-numeric — leaves the existing value', () => {
        process.env.PG_PORT = 'definitely-not-a-port';
        const config = makeConfig({ dbPort: 5432 });
        applyPlatformDependentEnvVars(config, {});
        expect(config.dbPort).toBe(5432);
    });
});

describe('applyPlatformDependentEnvVars — precedence warning', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _warnedEnvPrecedencePairs.clear();
        for (const key of ['PG_HOST', 'PG_PORT', 'DB_HOST', 'DB_PORT']) {
            delete process.env[key];
        }
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* capture */ });
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('warns when PG_HOST and DB_HOST are both set and differ', () => {
        process.env.PG_HOST = 'pg.host';
        process.env.DB_HOST = 'sql.host';
        applyPlatformDependentEnvVars(makeConfig(), {});
        expect(warnSpy).toHaveBeenCalledOnce();
        const msg = String(warnSpy.mock.calls[0]![0]);
        expect(msg).toContain('PG_HOST=pg.host');
        expect(msg).toContain('DB_HOST=sql.host');
        expect(msg).toContain('takes precedence');
    });

    it('does NOT warn when PG_HOST and DB_HOST are set to the same value', () => {
        process.env.PG_HOST = 'same.host';
        process.env.DB_HOST = 'same.host';
        applyPlatformDependentEnvVars(makeConfig(), {});
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does NOT warn when only PG_HOST is set (no DB_HOST to differ from)', () => {
        process.env.PG_HOST = 'pg.host';
        applyPlatformDependentEnvVars(makeConfig(), {});
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('de-dups: the same divergence warns once across multiple calls (initializeConfig invariant)', () => {
        process.env.PG_HOST = 'pg.host';
        process.env.DB_HOST = 'sql.host';
        // First call (e.g. module-load merge)
        applyPlatformDependentEnvVars(makeConfig(), {});
        // Second call (e.g. user invoked `initializeConfig(cwd)`)
        applyPlatformDependentEnvVars(makeConfig(), {});
        // Third call (e.g. CLI re-resolved cwd after navigating)
        applyPlatformDependentEnvVars(makeConfig(), {});
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('warns once per distinct env-var pair', () => {
        process.env.PG_HOST = 'pg.host';
        process.env.DB_HOST = 'sql.host';
        process.env.PG_PORT = '5433';
        process.env.DB_PORT = '1433';
        applyPlatformDependentEnvVars(makeConfig(), {});
        // Two distinct divergences → two warnings.
        expect(warnSpy).toHaveBeenCalledTimes(2);
    });
});
