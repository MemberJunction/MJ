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
    SeverityType: { Info: 'Info', Warning: 'Warning', Critical: 'Critical' },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn().mockReturnValue(null)
            }
        }
    },
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    resolveDbPlatformFromEnv: vi.fn().mockReturnValue(undefined),
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
import { ResolveEntityPackageName, GetExternalEntitySchemas, ResolveEntityImportPackage, ThisEmitEntityPackageName, ConfigInfo, Commands } from '../Config/config';

/**
 * Helper to build a minimal ConfigInfo-like object with just the entityPackageName field.
 * We cast to ConfigInfo since the functions only read cfg.entityPackageName / entityImportPackages.
 */
function makeConfig(
    entityPackageName: string | Record<string, string>,
    extra: Partial<ConfigInfo> = {},
): ConfigInfo {
    return { entityPackageName, mjCoreSchema: '__mj', ...extra } as ConfigInfo;
}

describe('resolveEntityPackageName', () => {
    it('should return the string value when entityPackageName is a plain string', () => {
        const config = makeConfig('my-custom-package');
        expect(ResolveEntityPackageName('dbo', config)).toBe('my-custom-package');
        expect(ResolveEntityPackageName('sales', config)).toBe('my-custom-package');
        expect(ResolveEntityPackageName('__mj', config)).toBe('my-custom-package');
    });

    it('should return "mj_generatedentities" when entityPackageName is an empty string', () => {
        const config = makeConfig('');
        expect(ResolveEntityPackageName('dbo', config)).toBe('mj_generatedentities');
        expect(ResolveEntityPackageName('anything', config)).toBe('mj_generatedentities');
    });

    it('should return the matching package when entityPackageName is a Record and schema matches', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
            'hr': '@myorg/hr-entities',
        });
        expect(ResolveEntityPackageName('sales', config)).toBe('@myorg/sales-entities');
        expect(ResolveEntityPackageName('hr', config)).toBe('@myorg/hr-entities');
    });

    it('should return "mj_generatedentities" when entityPackageName is a Record and schema is unknown', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
        });
        expect(ResolveEntityPackageName('dbo', config)).toBe('mj_generatedentities');
        expect(ResolveEntityPackageName('unknown_schema', config)).toBe('mj_generatedentities');
    });

    it('should fall back to module-level configInfo when no config is passed', () => {
        // When no config argument is provided, the function uses the module-level configInfo.
        // The module-level configInfo.entityPackageName defaults to 'mj_generatedentities'
        // (since our mock cosmiconfig returns null, giving us defaults).
        const result = ResolveEntityPackageName('dbo');
        expect(result).toBe('mj_generatedentities');
    });

    it('should handle a Record with a single schema entry', () => {
        const config = makeConfig({ 'only_schema': 'only-package' });
        expect(ResolveEntityPackageName('only_schema', config)).toBe('only-package');
        expect(ResolveEntityPackageName('other', config)).toBe('mj_generatedentities');
    });

    it('should be case-insensitive for schema names in Record mode', () => {
        const config = makeConfig({
            'Sales': '@myorg/sales-entities',
        });
        // All case variants should resolve to the same package
        expect(ResolveEntityPackageName('Sales', config)).toBe('@myorg/sales-entities');
        expect(ResolveEntityPackageName('sales', config)).toBe('@myorg/sales-entities');
        expect(ResolveEntityPackageName('SALES', config)).toBe('@myorg/sales-entities');
        // Unrelated schema still falls back
        expect(ResolveEntityPackageName('hr', config)).toBe('mj_generatedentities');
    });
});

describe('thisEmitEntityPackageName', () => {
    it('returns the string entityPackageName for any owning schema', () => {
        const config = makeConfig('@mj-biz-apps/orders-entities');
        expect(ThisEmitEntityPackageName('__mj_BizAppsOrders', config)).toBe('@mj-biz-apps/orders-entities');
        expect(ThisEmitEntityPackageName('__mj_BizAppsCommon', config)).toBe('@mj-biz-apps/orders-entities');
    });

    it('returns the Record entry for the owning schema, else mj_generatedentities', () => {
        const config = makeConfig({
            sales: '@myorg/sales-entities',
        });
        expect(ThisEmitEntityPackageName('sales', config)).toBe('@myorg/sales-entities');
        expect(ThisEmitEntityPackageName('dbo', config)).toBe('mj_generatedentities');
    });

    it('treats an empty string entityPackageName as mj_generatedentities', () => {
        expect(ThisEmitEntityPackageName('dbo', makeConfig(''))).toBe('mj_generatedentities');
        expect(ThisEmitEntityPackageName('dbo', makeConfig('   '))).toBe('mj_generatedentities');
    });
});

describe('resolveEntityImportPackage', () => {
    const ordersPublisher = () =>
        makeConfig('@mj-biz-apps/orders-entities', {
            entityImportPackages: {
                '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
                '__mj_BizAppsAccounting': '@mj-biz-apps/accounting-entities',
            },
        });

    it('Orders Address embed: Common schema maps to common-entities, not orders-entities', () => {
        expect(
            ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', ordersPublisher()),
        ).toBe('@mj-biz-apps/common-entities');
    });

    it('is case-insensitive on entityImportPackages keys', () => {
        expect(
            ResolveEntityImportPackage('__MJ_BIZAPPSCOMMON', '__mj_BizAppsOrders', ordersPublisher()),
        ).toBe('@mj-biz-apps/common-entities');
    });

    it('Orders Address embed without a map throws — the current production failure mode', () => {
        const config = makeConfig('@mj-biz-apps/orders-entities');
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).toThrow(
            /entityImportPackages/,
        );
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).toThrow(
            /@mj-biz-apps\/orders-entities/,
        );
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).not.toThrow(
            /mj_generatedentities/,
        );
    });

    it('never self-imports this emit\'s package for a foreign schema even when the map says so', () => {
        const config = makeConfig('@mj-biz-apps/orders-entities', {
            entityImportPackages: {
                '__mj_BizAppsCommon': '@mj-biz-apps/orders-entities',
            },
        });
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).toThrow(
            /this emit's own package/,
        );
    });

    it('core schema always resolves to @memberjunction/core-entities', () => {
        expect(ResolveEntityImportPackage('__mj', '__mj_BizAppsOrders', ordersPublisher())).toBe(
            '@memberjunction/core-entities',
        );
        expect(ResolveEntityImportPackage('__MJ', '__mj_BizAppsOrders', makeConfig('mj_generatedentities'))).toBe(
            '@memberjunction/core-entities',
        );
    });

    it('same-schema peers resolve to this emit\'s package', () => {
        expect(
            ResolveEntityImportPackage('__mj_BizAppsOrders', '__mj_BizAppsOrders', ordersPublisher()),
        ).toBe('@mj-biz-apps/orders-entities');
    });

    it('falls back to Record entityPackageName (host installer map) after entityImportPackages', () => {
        const config = makeConfig({
            '__mj_BizAppsOrders': '@mj-biz-apps/orders-entities',
            '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
        });
        expect(ResolveEntityImportPackage('__mj_BizAppsCommon', 'dbo', config)).toBe('@mj-biz-apps/common-entities');
    });

    it('entityImportPackages wins over Record entityPackageName when both list the schema', () => {
        const config = makeConfig(
            {
                '__mj_BizAppsCommon': '@old/common-entities',
            },
            {
                entityImportPackages: {
                    '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
                },
            },
        );
        expect(ResolveEntityImportPackage('__mj_BizAppsCommon', 'dbo', config)).toBe('@mj-biz-apps/common-entities');
    });

    it('throws when related or owning schema is empty', () => {
        const config = ordersPublisher();
        expect(() => ResolveEntityImportPackage('', '__mj_BizAppsOrders', config)).toThrow(/empty SchemaName/);
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '', config)).toThrow(/empty SchemaName/);
    });

    it('treats an empty or whitespace entityImportPackages value as missing and throws', () => {
        const config = makeConfig('@mj-biz-apps/orders-entities', {
            entityImportPackages: {
                '__mj_BizAppsCommon': '   ',
            },
        });
        expect(() => ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).toThrow(
            /not listed in entityImportPackages/,
        );
    });

    it('honors a custom mjCoreSchema instead of assuming __mj', () => {
        const config = makeConfig('mj_generatedentities', { mjCoreSchema: 'mj_core' });
        expect(ResolveEntityImportPackage('mj_core', 'dbo', config)).toBe('@memberjunction/core-entities');
        expect(ResolveEntityImportPackage('MJ_CORE', 'dbo', config)).toBe('@memberjunction/core-entities');
        expect(() => ResolveEntityImportPackage('__mj', 'dbo', config)).toThrow(/not listed in entityImportPackages/);
    });

    it('Record entityPackageName with an unmapped foreign schema throws (does not silently resolve)', () => {
        const config = makeConfig({
            sales: '@myorg/sales-entities',
        });
        expect(() => ResolveEntityImportPackage('hr', 'dbo', config)).toThrow(/entityPackageName schema map/);
        expect(() => ResolveEntityImportPackage('hr', 'dbo', config)).toThrow(
            /cannot import entity classes from schema 'hr'/,
        );
    });

    it('Record entityPackageName that maps a foreign schema to this emit\'s package throws', () => {
        const config = makeConfig({
            dbo: 'mj_generatedentities',
            sales: 'mj_generatedentities',
        });
        expect(() => ResolveEntityImportPackage('sales', 'dbo', config)).toThrow(/this emit's own package/);
    });

    it('trims package names from the import map', () => {
        const config = makeConfig('@mj-biz-apps/orders-entities', {
            entityImportPackages: {
                '__mj_BizAppsCommon': '  @mj-biz-apps/common-entities  ',
            },
        });
        expect(ResolveEntityImportPackage('__mj_BizAppsCommon', '__mj_BizAppsOrders', config)).toBe(
            '@mj-biz-apps/common-entities',
        );
    });
});

describe('getExternalEntitySchemas', () => {
    it('should return an empty array when entityPackageName is a plain string', () => {
        const config = makeConfig('my-custom-package');
        expect(GetExternalEntitySchemas(config)).toEqual([]);
    });

    it('should return an empty array when entityPackageName is an empty string', () => {
        const config = makeConfig('');
        expect(GetExternalEntitySchemas(config)).toEqual([]);
    });

    it('should return the schema names (keys) when entityPackageName is a Record', () => {
        const config = makeConfig({
            'sales': '@myorg/sales-entities',
            'hr': '@myorg/hr-entities',
            'inventory': '@myorg/inventory-entities',
        });
        const schemas = GetExternalEntitySchemas(config);
        expect(schemas).toEqual(['sales', 'hr', 'inventory']);
    });

    it('should return a single-element array for a Record with one entry', () => {
        const config = makeConfig({ 'custom': 'custom-pkg' });
        expect(GetExternalEntitySchemas(config)).toEqual(['custom']);
    });

    it('should return an empty array for an empty Record', () => {
        const config = makeConfig({});
        expect(GetExternalEntitySchemas(config)).toEqual([]);
    });

    it('should fall back to module-level configInfo when no config is passed', () => {
        // Module-level configInfo has entityPackageName as 'mj_generatedentities' (string default),
        // so this should return an empty array.
        const result = GetExternalEntitySchemas();
        expect(result).toEqual([]);
    });
});

describe('commands', () => {
    it('should return empty array when MJ_CODEGEN_SKIP_COMMANDS is set to 1 or true', () => {
        const originalEnv = process.env.MJ_CODEGEN_SKIP_COMMANDS;
        try {
            process.env.MJ_CODEGEN_SKIP_COMMANDS = '1';
            expect(Commands('after')).toEqual([]);
            expect(Commands('before')).toEqual([]);

            process.env.MJ_CODEGEN_SKIP_COMMANDS = 'true';
            expect(Commands('after')).toEqual([]);
        } finally {
            if (originalEnv !== undefined) {
                process.env.MJ_CODEGEN_SKIP_COMMANDS = originalEnv;
            } else {
                delete process.env.MJ_CODEGEN_SKIP_COMMANDS;
            }
        }
    });
});


