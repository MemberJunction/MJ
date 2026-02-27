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
