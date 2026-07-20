/**
 * Tests for `Config/db-connection.ts` — the SQL Server side of the codegen
 * connection layer. Exercises the {@link buildSqlConfig} precedence chain for
 * the cross-platform `codegenPool.statementTimeoutMs`:
 *
 *   codegenPool.statementTimeoutMs  →  legacy dbRequestTimeout  →  mssql default (120000)
 *
 * `buildSqlConfig()` is exported solely for testing — production code calls
 * {@link MSSQLConnection} which caches the resolved config and pool.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock heavy/global deps so importing `config.ts` doesn't try to do real I/O.
// `cosmiconfig` is the one that actually fails without a mock — it would
// search the filesystem at module load otherwise.

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

// Import after mocks. We mutate the shared `configInfo` to control what
// `buildSqlConfig()` sees in each test.
import { configInfo } from '../Config/config';
import { buildSqlConfig } from '../Config/db-connection';

describe('buildSqlConfig — codegenPool.statementTimeoutMs precedence', () => {
    beforeEach(() => {
        configInfo.dbHost = 'sql.example.com';
        configInfo.dbPort = 1433;
        configInfo.dbDatabase = 'mj_test';
        configInfo.codeGenLogin = 'mj_codegen';
        configInfo.codeGenPassword = 'pwd';
        configInfo.dbTrustServerCertificate = 'N';
        configInfo.dbRequestTimeout = undefined;
        configInfo.codegenPool = undefined;
        configInfo.dbInstanceName = undefined;
    });

    it('uses mssql default 120000ms when neither knob is set', () => {
        const cfg = buildSqlConfig();
        expect(cfg.options?.requestTimeout).toBe(120000);
    });

    it('falls back to legacy dbRequestTimeout when codegenPool.statementTimeoutMs is unset', () => {
        configInfo.dbRequestTimeout = 90000;
        const cfg = buildSqlConfig();
        expect(cfg.options?.requestTimeout).toBe(90000);
    });

    it('codegenPool.statementTimeoutMs takes precedence over dbRequestTimeout when both are set', () => {
        configInfo.dbRequestTimeout = 90000;
        configInfo.codegenPool = { statementTimeoutMs: 30000 };
        const cfg = buildSqlConfig();
        expect(cfg.options?.requestTimeout).toBe(30000);
    });

    it('uses codegenPool.statementTimeoutMs when only it is set (no dbRequestTimeout)', () => {
        configInfo.codegenPool = { statementTimeoutMs: 45000 };
        const cfg = buildSqlConfig();
        expect(cfg.options?.requestTimeout).toBe(45000);
    });
});

describe('buildSqlConfig — connection params', () => {
    beforeEach(() => {
        configInfo.dbHost = 'sql.custom.example';
        configInfo.dbPort = 14333;
        configInfo.dbDatabase = 'analytics';
        configInfo.codeGenLogin = 'codegen_user';
        configInfo.codeGenPassword = 'secret-value';
        configInfo.dbTrustServerCertificate = 'Y';
        configInfo.dbRequestTimeout = undefined;
        configInfo.codegenPool = undefined;
        configInfo.dbInstanceName = '';
    });

    it('reads connection params from configInfo', () => {
        const cfg = buildSqlConfig();
        expect(cfg.server).toBe('sql.custom.example');
        expect(cfg.port).toBe(14333);
        expect(cfg.database).toBe('analytics');
        expect(cfg.user).toBe('codegen_user');
        expect(cfg.password).toBe('secret-value');
        expect(cfg.options?.trustServerCertificate).toBe(true);
        expect(cfg.options?.encrypt).toBe(true);
    });

    it('uses dbInstanceName only when non-empty', () => {
        configInfo.dbInstanceName = '';
        expect(buildSqlConfig().options?.instanceName).toBeUndefined();
        configInfo.dbInstanceName = 'SQLEXPRESS';
        expect(buildSqlConfig().options?.instanceName).toBe('SQLEXPRESS');
    });
});
