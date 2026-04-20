/**
 * Unit tests for AICLI config
 */

import { describe, it, expect, vi } from 'vitest';

// Mock cosmiconfig
vi.mock('cosmiconfig', () => ({
    cosmiconfig: () => ({
        search: vi.fn().mockResolvedValue(null),
    }),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
    default: { config: vi.fn() },
}));

import type { AICliConfig } from '../config';

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

    it('should accept partial aiSettings', () => {
        const config: AICliConfig = {
            aiSettings: {
                outputFormat: 'compact',
            },
        };
        expect(config.aiSettings?.outputFormat).toBe('compact');
        expect(config.aiSettings?.defaultTimeout).toBeUndefined();
    });
});

describe('loadAIConfig', () => {
    it('should throw when no config found', async () => {
        const { loadAIConfig } = await import('../config');
        await expect(loadAIConfig()).rejects.toThrow('No mj.config.cjs configuration found');
    });
});
