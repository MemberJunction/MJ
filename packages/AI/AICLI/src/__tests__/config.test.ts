/**
 * Unit tests for AICLI config: mj.config.cjs laid over the database settings the environment
 * supplies, the way MJAPI and the `mj` CLI resolve them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cosmiconfigSearch = vi.hoisted(() => vi.fn());

// Mock cosmiconfig — each test decides what mj.config.cjs (if any) contains
vi.mock('cosmiconfig', () => ({
    cosmiconfig: () => ({
        search: cosmiconfigSearch,
    }),
}));

// Mock dotenv — tests control the environment directly
vi.mock('dotenv', () => ({
    default: { config: vi.fn() },
}));

import {
    AICliConfig,
    BuildAIConfigDefaults,
    LoadAIConfig,
    MergeAIConfig,
    ParseBooleanSetting,
    ParsePortSetting,
} from '../config';

/** An installed workspace's .env, as `mj install` writes it. */
const INSTALLED_ENV: NodeJS.ProcessEnv = {
    DB_HOST: 'sql-server',
    DB_PORT: '1444',
    DB_USERNAME: 'mj_api',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'MJ_Workspace',
    DB_TRUST_SERVER_CERTIFICATE: '1',
    MJ_CORE_SCHEMA: '__mj',
};

describe('AICliConfig', () => {
    it('should accept a full config object', () => {
        const config: AICliConfig = {
            dbHost: 'localhost',
            dbDatabase: 'testdb',
            dbPort: 1433,
            dbUsername: 'sa',
            dbPassword: 'password',
            coreSchema: '__mj',
            aiSettings: {
                defaultTimeout: 30000,
                outputFormat: 'json',
                logLevel: 'debug',
                enableChat: true,
                chatHistoryLimit: 50,
            },
        };
        expect(config.dbHost).toBe('localhost');
        expect(config.aiSettings?.outputFormat).toBe('json');
    });

    it('should accept a minimal config object', () => {
        const config: AICliConfig = {};
        expect(config.dbHost).toBeUndefined();
        expect(config.aiSettings).toBeUndefined();
    });
});

describe('ParseBooleanSetting', () => {
    it.each(['true', 'TRUE', '1', 'yes', 'y', 'Y', 'on', 't', ' true '])('reads %j as true', (value) => {
        expect(ParseBooleanSetting(value)).toBe(true);
    });

    it.each(['false', '0', 'no', 'N', 'off', '', 'maybe'])('reads %j as false', (value) => {
        expect(ParseBooleanSetting(value)).toBe(false);
    });

    it('passes booleans through and treats unset as false', () => {
        expect(ParseBooleanSetting(true)).toBe(true);
        expect(ParseBooleanSetting(false)).toBe(false);
        expect(ParseBooleanSetting(undefined)).toBe(false);
        expect(ParseBooleanSetting(null)).toBe(false);
    });
});

describe('ParsePortSetting', () => {
    it('reads numbers and numeric strings', () => {
        expect(ParsePortSetting(1433, 'dbPort')).toBe(1433);
        expect(ParsePortSetting('1444', 'DB_PORT')).toBe(1444);
        expect(ParsePortSetting(' 1500 ', 'DB_PORT')).toBe(1500);
    });

    it('returns undefined when unset', () => {
        expect(ParsePortSetting(undefined, 'DB_PORT')).toBeUndefined();
        expect(ParsePortSetting(null, 'DB_PORT')).toBeUndefined();
        expect(ParsePortSetting('', 'DB_PORT')).toBeUndefined();
    });

    it('rejects a value that is not a port, naming where it came from', () => {
        expect(() => ParsePortSetting('abc', 'DB_PORT')).toThrow(/DB_PORT is "abc"/);
        expect(() => ParsePortSetting(Number.NaN, 'dbPort in mj.config.cjs')).toThrow(/dbPort in mj.config.cjs/);
        expect(() => ParsePortSetting(-1, 'DB_PORT')).toThrow(/Invalid database port/);
    });
});

describe('BuildAIConfigDefaults', () => {
    it('reads every database setting from the environment', () => {
        expect(BuildAIConfigDefaults(INSTALLED_ENV)).toEqual({
            dbHost: 'sql-server',
            dbPort: 1444,
            dbDatabase: 'MJ_Workspace',
            dbUsername: 'mj_api',
            dbPassword: 'secret',
            dbTrustServerCertificate: true,
            dbInstanceName: undefined,
            coreSchema: '__mj',
        });
    });

    it('falls back to the same defaults MJAPI uses', () => {
        const defaults = BuildAIConfigDefaults({});
        expect(defaults.dbHost).toBe('localhost');
        expect(defaults.dbPort).toBe(1433);
        expect(defaults.coreSchema).toBe('__mj');
        expect(defaults.dbTrustServerCertificate).toBe(false);
        expect(defaults.dbDatabase).toBeUndefined();
    });

    it('treats an empty variable (DB_HOST= in a .env) as unset', () => {
        expect(BuildAIConfigDefaults({ DB_HOST: '', DB_PORT: '' }).dbHost).toBe('localhost');
        expect(BuildAIConfigDefaults({ DB_HOST: '', DB_PORT: '' }).dbPort).toBe(1433);
    });

    it('reads MJ_CORE_SCHEMA and DB_INSTANCE_NAME', () => {
        const defaults = BuildAIConfigDefaults({ MJ_CORE_SCHEMA: 'custom', DB_INSTANCE_NAME: 'SQLEXPRESS' });
        expect(defaults.coreSchema).toBe('custom');
        expect(defaults.dbInstanceName).toBe('SQLEXPRESS');
    });
});

describe('MergeAIConfig', () => {
    const defaults = BuildAIConfigDefaults(INSTALLED_ENV);

    // The installed workspace ships mj.config.cjs with its db* lines commented out.
    it('uses the environment for every setting the config file leaves out', () => {
        const merged = MergeAIConfig(defaults, { output: [] } as AICliConfig);
        expect(merged.dbDatabase).toBe('MJ_Workspace');
        expect(merged.dbUsername).toBe('mj_api');
        expect(merged.dbPassword).toBe('secret');
        expect(merged.dbHost).toBe('sql-server');
        expect(merged.dbPort).toBe(1444);
        expect(merged.dbTrustServerCertificate).toBe(true);
    });

    it('lets a value set in the config file win over the environment', () => {
        const merged = MergeAIConfig(defaults, { dbDatabase: 'FromFile', dbHost: 'file-host', dbPort: 1500 });
        expect(merged.dbDatabase).toBe('FromFile');
        expect(merged.dbHost).toBe('file-host');
        expect(merged.dbPort).toBe(1500);
        expect(merged.dbUsername).toBe('mj_api');
    });

    it('ignores null and undefined in the file, as `dbPassword: process.env.DB_PASSWORD` yields when unset', () => {
        const merged = MergeAIConfig(defaults, { dbPassword: undefined, dbUsername: null });
        expect(merged.dbPassword).toBe('secret');
        expect(merged.dbUsername).toBe('mj_api');
    });

    it('keeps an explicit false for dbTrustServerCertificate, and reads Y/N', () => {
        expect(MergeAIConfig(defaults, { dbTrustServerCertificate: false }).dbTrustServerCertificate).toBe(false);
        expect(MergeAIConfig(BuildAIConfigDefaults({}), { dbTrustServerCertificate: 'Y' }).dbTrustServerCertificate).toBe(true);
        expect(MergeAIConfig(defaults, { dbTrustServerCertificate: 'N' }).dbTrustServerCertificate).toBe(false);
    });

    it('reads a port given as a string in the file', () => {
        expect(MergeAIConfig(defaults, { dbPort: '1600' }).dbPort).toBe(1600);
    });

    it('reads mjCoreSchema as an alias of coreSchema, with coreSchema winning', () => {
        expect(MergeAIConfig(defaults, { mjCoreSchema: 'alias' }).coreSchema).toBe('alias');
        expect(MergeAIConfig(defaults, { mjCoreSchema: 'alias', coreSchema: 'primary' }).coreSchema).toBe('primary');
        expect(MergeAIConfig(defaults, {}).coreSchema).toBe('__mj');
    });

    it('passes every other key in the file through', () => {
        const merged = MergeAIConfig(defaults, { aiSettings: { outputFormat: 'json' } });
        expect(merged.aiSettings?.outputFormat).toBe('json');
    });

    it('returns the defaults when there is no config file', () => {
        expect(MergeAIConfig(defaults, undefined)).toEqual(defaults);
        expect(MergeAIConfig(defaults, null)).toEqual(defaults);
    });
});

describe('LoadAIConfig', () => {
    const savedEnv = Object.fromEntries(Object.keys(INSTALLED_ENV).map((key) => [key, process.env[key]]));

    /** Puts back whatever the DB_* variables were before this suite touched them. */
    const restoreEnv = () => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    beforeEach(() => {
        cosmiconfigSearch.mockReset();
        restoreEnv();
    });

    afterEach(restoreEnv);

    it('merges mj.config.cjs over the environment', async () => {
        Object.assign(process.env, INSTALLED_ENV);
        cosmiconfigSearch.mockResolvedValue({ config: { dbDatabase: 'FromFile' }, filepath: '/ws/mj.config.cjs' });

        const config = await LoadAIConfig();

        expect(config.dbDatabase).toBe('FromFile');
        expect(config.dbUsername).toBe('mj_api');
        expect(config.dbTrustServerCertificate).toBe(true);
    });

    // It used to throw "No mj.config.cjs configuration found" even with every setting in the environment.
    it('uses the environment alone when there is no config file', async () => {
        Object.assign(process.env, INSTALLED_ENV);
        cosmiconfigSearch.mockResolvedValue(null);

        const config = await LoadAIConfig();

        expect(config.dbDatabase).toBe('MJ_Workspace');
        expect(config.dbPassword).toBe('secret');
    });
});
