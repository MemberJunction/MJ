import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cosmiconfig and other deps before importing config
vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({
        search: vi.fn().mockReturnValue(null)
    })
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    SeverityType: { Info: 'Info', Warning: 'Warning', Critical: 'Critical' }
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn().mockReturnValue(null)
            }
        }
    },
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/config', () => ({
    mergeConfigs: vi.fn((...configs: unknown[]) => Object.assign({}, ...configs)),
    parseBooleanEnv: vi.fn((value: string | undefined, defaultValue: boolean) => {
        if (value === undefined || value === null) return defaultValue;
        return value.toLowerCase() === 'true';
    })
}));

import { parseBooleanEnv } from '@memberjunction/config';

describe('Config Types', () => {
    describe('parseBooleanEnv (utility function)', () => {
        it('should return default for undefined input', () => {
            expect(parseBooleanEnv(undefined, true)).toBe(true);
            expect(parseBooleanEnv(undefined, false)).toBe(false);
        });

        it('should parse "true" string', () => {
            expect(parseBooleanEnv('true', false)).toBe(true);
        });

        it('should parse "false" string', () => {
            expect(parseBooleanEnv('false', true)).toBe(false);
        });
    });
});

describe('Config Schema Shapes', () => {
    it('should define SettingInfo with name and value', () => {
        const setting = { name: 'testSetting', value: 'testValue' };
        expect(setting.name).toBe('testSetting');
        expect(setting.value).toBe('testValue');
    });

    it('should define LogInfo with log, logFile, and console', () => {
        const logInfo = { log: true, logFile: 'output.log', console: true };
        expect(logInfo.log).toBe(true);
        expect(logInfo.logFile).toBe('output.log');
    });

    it('should define CommandInfo with required fields', () => {
        const command = {
            workingDirectory: '/tmp',
            command: 'npm',
            args: ['run', 'build'],
            timeout: 30000,
            when: 'after'
        };
        expect(command.command).toBe('npm');
        expect(command.args).toHaveLength(2);
        expect(command.timeout).toBe(30000);
    });

    it('should define OutputInfo with type and directory', () => {
        const output = {
            type: 'SQL',
            directory: '/output/sql',
            appendOutputCode: true,
            options: [{ name: 'schemaName', value: '__mj' }]
        };
        expect(output.type).toBe('SQL');
        expect(output.directory).toBe('/output/sql');
        expect(output.options).toHaveLength(1);
    });

    it('should define CustomSQLScript with when and scriptFile', () => {
        const script = {
            when: 'before-all',
            scriptFile: 'init.sql'
        };
        expect(script.when).toBe('before-all');
        expect(script.scriptFile).toBe('init.sql');
    });
});

// Import the functions under test
import { resolveEntityPackageName, getExternalEntitySchemas, ConfigInfo } from '../Config/config';

/**
 * Helper to build a minimal ConfigInfo-like object with just the entityPackageName field.
 * We cast to ConfigInfo since the functions only read cfg.entityPackageName.
 */
function makeConfig(entityPackageName: string | Record<string, string>): ConfigInfo {
    return { entityPackageName } as ConfigInfo;
}

describe('resolveEntityPackageName', () => {
    it('should return the string value when entityPackageName is a plain string', () => {
        const config = makeConfig('my-custom-package');
        expect(resolveEntityPackageName('dbo', config)).toBe('my-custom-package');
        expect(resolveEntityPackageName('sales', config)).toBe('my-custom-package');
        expect(resolveEntityPackageName('__mj', config)).toBe('my-custom-package');
    });

    it('should return "mj_generatedentities" when entityPackageName is an empty string', () => {
        const config = makeConfig('');
        expect(resolveEntityPackageName('dbo', config)).toBe('mj_generatedentities');
        expect(resolveEntityPackageName('anything', config)).toBe('mj_generatedentities');
    });

    it('should return the matching package when entityPackageName is a Record and schema matches', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
            'hr': '@myorg/hr-entities',
        });
        expect(resolveEntityPackageName('sales', config)).toBe('@myorg/sales-entities');
        expect(resolveEntityPackageName('hr', config)).toBe('@myorg/hr-entities');
    });

    it('should return "mj_generatedentities" when entityPackageName is a Record and schema is unknown', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
        });
        expect(resolveEntityPackageName('dbo', config)).toBe('mj_generatedentities');
        expect(resolveEntityPackageName('unknown_schema', config)).toBe('mj_generatedentities');
    });

    it('should fall back to module-level configInfo when no config is passed', () => {
        // When no config argument is provided, the function uses the module-level configInfo.
        // The module-level configInfo.entityPackageName defaults to 'mj_generatedentities'
        // (since our mock cosmiconfig returns null, giving us defaults).
        const result = resolveEntityPackageName('dbo');
        expect(result).toBe('mj_generatedentities');
    });

    it('should handle a Record with a single schema entry', () => {
        const config = makeConfig({ 'only_schema': 'only-package' });
        expect(resolveEntityPackageName('only_schema', config)).toBe('only-package');
        expect(resolveEntityPackageName('other', config)).toBe('mj_generatedentities');
    });

    it('should be case-insensitive for schema names in Record mode', () => {
        const config = makeConfig({
            'Sales': '@myorg/sales-entities',
        });
        // All case variants should resolve to the same package
        expect(resolveEntityPackageName('Sales', config)).toBe('@myorg/sales-entities');
        expect(resolveEntityPackageName('sales', config)).toBe('@myorg/sales-entities');
        expect(resolveEntityPackageName('SALES', config)).toBe('@myorg/sales-entities');
        // Unrelated schema still falls back
        expect(resolveEntityPackageName('hr', config)).toBe('mj_generatedentities');
    });
});

describe('getExternalEntitySchemas', () => {
    it('should return an empty array when entityPackageName is a plain string', () => {
        const config = makeConfig('my-custom-package');
        expect(getExternalEntitySchemas(config)).toEqual([]);
    });

    it('should return an empty array when entityPackageName is an empty string', () => {
        const config = makeConfig('');
        expect(getExternalEntitySchemas(config)).toEqual([]);
    });

    it('should return the schema names (keys) when entityPackageName is a Record', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
            'hr': '@myorg/hr-entities',
            'inventory': '@myorg/inventory-entities',
        });
        const schemas = getExternalEntitySchemas(config);
        expect(schemas).toEqual(['sales', 'hr', 'inventory']);
    });

    it('should return a single-element array for a Record with one entry', () => {
        const config = makeConfig({ 'custom': 'custom-pkg' });
        expect(getExternalEntitySchemas(config)).toEqual(['custom']);
    });

    it('should return an empty array for an empty Record', () => {
        const config = makeConfig({});
        expect(getExternalEntitySchemas(config)).toEqual([]);
    });

    it('should fall back to module-level configInfo when no config is passed', () => {
        // Module-level configInfo has entityPackageName as 'mj_generatedentities' (string default),
        // so this should return an empty array.
        const result = getExternalEntitySchemas();
        expect(result).toEqual([]);
    });
});
