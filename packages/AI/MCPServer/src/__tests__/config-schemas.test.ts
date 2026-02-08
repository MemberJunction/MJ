/**
 * Unit tests for MCP Server configuration Zod schemas and utility functions.
 *
 * Tests:
 * - Zod schema parsing and defaults for all config sub-schemas
 * - resolveAuthSettings logic (tested indirectly via schema shapes)
 * - validateJwtSigningSecret logic patterns
 * - Type exports
 *
 * We do NOT import config.ts directly (it has side effects: dotenv, cosmiconfig,
 * console.log). Instead we replicate the Zod schemas and pure functions to
 * unit-test the parsing logic in isolation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ========================================================================
// Replicate the Zod schemas from config.ts for isolated testing
// (importing config.ts directly triggers dotenv side-effects)
// ========================================================================

const mcpServerEntityToolInfoSchema = z.object({
    entityName: z.string().optional(),
    schemaName: z.string().optional(),
    get: z.boolean().optional().default(false),
    create: z.boolean().optional().default(false),
    update: z.boolean().optional().default(false),
    delete: z.boolean().optional().default(false),
    runView: z.boolean().optional().default(false),
});

const mcpServerActionToolInfoSchema = z.object({
    actionName: z.string().optional(),
    actionCategory: z.string().optional(),
    discover: z.boolean().optional().default(false),
    execute: z.boolean().optional().default(false),
});

const mcpServerQueryToolInfoSchema = z.object({
    enabled: z.boolean().optional().default(false),
    allowedSchemas: z.array(z.string()).optional(),
    blockedSchemas: z.array(z.string()).optional(),
});

const mcpServerPromptToolInfoSchema = z.object({
    promptName: z.string().optional(),
    promptCategory: z.string().optional(),
    discover: z.boolean().optional().default(false),
    execute: z.boolean().optional().default(false),
});

const mcpServerCommunicationToolInfoSchema = z.object({
    enabled: z.boolean().optional().default(false),
    allowedProviders: z.array(z.string()).optional(),
});

const mcpServerAgentToolInfoSchema = z.object({
    agentName: z.string().optional(),
    discover: z.boolean().optional().default(false),
    execute: z.boolean().optional().default(false),
    status: z.boolean().optional().default(false),
    cancel: z.boolean().optional().default(false),
});

const oauthProxySettingsSchema = z.object({
    enabled: z.boolean().default(false),
    upstreamProvider: z.string().optional(),
    clientTtlMs: z.number().default(24 * 60 * 60 * 1000),
    stateTtlMs: z.number().default(10 * 60 * 1000),
    jwtSigningSecret: z.string().optional(),
    jwtExpiresIn: z.string().default('1h'),
    jwtIssuer: z.string().default('urn:mj:mcp-server'),
    enableConsentScreen: z.boolean().default(false),
});

const mcpServerAuthSettingsSchema = z.object({
    mode: z.enum(['apiKey', 'oauth', 'both', 'none']).default('both'),
    resourceIdentifier: z.string().optional(),
    tokenAudience: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    autoResourceIdentifier: z.boolean().default(true),
    proxy: oauthProxySettingsSchema.optional(),
});

const mcpServerInfoSchema = z.object({
    port: z.coerce.number().optional().default(3100),
    entityTools: z.array(mcpServerEntityToolInfoSchema).optional(),
    actionTools: z.array(mcpServerActionToolInfoSchema).optional(),
    agentTools: z.array(mcpServerAgentToolInfoSchema).optional(),
    queryTools: mcpServerQueryToolInfoSchema.optional(),
    promptTools: z.array(mcpServerPromptToolInfoSchema).optional(),
    communicationTools: mcpServerCommunicationToolInfoSchema.optional(),
    enableMCPServer: z.boolean().optional().default(false),
    systemApiKey: z.string().optional(),
    auth: mcpServerAuthSettingsSchema.optional(),
});

// Replicate validateJwtSigningSecret
const MIN_JWT_SECRET_LENGTH = 32;

function validateJwtSigningSecret(secret: string | undefined): {
    valid: boolean;
    error?: string;
    decodedSecret?: string;
} {
    if (!secret) {
        return { valid: false, error: 'JWT signing secret is not configured' };
    }
    let secretBytes: Buffer;
    try {
        if (/^[A-Za-z0-9+/=]+$/.test(secret) && secret.length % 4 === 0) {
            secretBytes = Buffer.from(secret, 'base64');
            if (secretBytes.length >= MIN_JWT_SECRET_LENGTH) {
                return { valid: true, decodedSecret: secret };
            }
        }
        secretBytes = Buffer.from(secret, 'utf-8');
    } catch {
        secretBytes = Buffer.from(secret, 'utf-8');
    }
    if (secretBytes.length < MIN_JWT_SECRET_LENGTH) {
        return {
            valid: false,
            error: `JWT signing secret is too short (${secretBytes.length} bytes). Minimum required: ${MIN_JWT_SECRET_LENGTH} bytes (256 bits). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
        };
    }
    return { valid: true, decodedSecret: secret };
}

// Replicate resolveAuthSettings
type MCPServerAuthSettingsInfo = z.infer<typeof mcpServerAuthSettingsSchema>;

function resolveAuthSettings(
    authConfig: MCPServerAuthSettingsInfo | undefined,
    port: number | undefined,
): MCPServerAuthSettingsInfo {
    const defaults: MCPServerAuthSettingsInfo = {
        mode: 'both',
        autoResourceIdentifier: true,
    };
    if (!authConfig) return defaults;

    const resolved: MCPServerAuthSettingsInfo = {
        mode: authConfig.mode ?? defaults.mode,
        resourceIdentifier: authConfig.resourceIdentifier,
        tokenAudience: authConfig.tokenAudience,
        scopes: authConfig.scopes,
        autoResourceIdentifier: authConfig.autoResourceIdentifier ?? defaults.autoResourceIdentifier,
        proxy: authConfig.proxy,
    };

    if (!resolved.resourceIdentifier && resolved.autoResourceIdentifier) {
        const serverPort = port ?? 3100;
        resolved.resourceIdentifier = `http://localhost:${serverPort}`;
    }

    return resolved;
}

// ========================================================================
// Tests
// ========================================================================

describe('Entity Tool Schema', () => {
    it('should parse minimal entity tool config with defaults', () => {
        const result = mcpServerEntityToolInfoSchema.parse({});
        expect(result.get).toBe(false);
        expect(result.create).toBe(false);
        expect(result.update).toBe(false);
        expect(result.delete).toBe(false);
        expect(result.runView).toBe(false);
    });

    it('should parse full entity tool config', () => {
        const result = mcpServerEntityToolInfoSchema.parse({
            entityName: 'Users',
            schemaName: '__mj',
            get: true,
            create: false,
            update: true,
            delete: false,
            runView: true,
        });
        expect(result.entityName).toBe('Users');
        expect(result.schemaName).toBe('__mj');
        expect(result.get).toBe(true);
        expect(result.runView).toBe(true);
    });
});

describe('Action Tool Schema', () => {
    it('should parse with defaults', () => {
        const result = mcpServerActionToolInfoSchema.parse({});
        expect(result.discover).toBe(false);
        expect(result.execute).toBe(false);
    });

    it('should parse with action name and category', () => {
        const result = mcpServerActionToolInfoSchema.parse({
            actionName: 'Send Email',
            actionCategory: 'Communication',
            discover: true,
            execute: true,
        });
        expect(result.actionName).toBe('Send Email');
        expect(result.actionCategory).toBe('Communication');
    });
});

describe('Agent Tool Schema', () => {
    it('should parse with defaults', () => {
        const result = mcpServerAgentToolInfoSchema.parse({});
        expect(result.discover).toBe(false);
        expect(result.execute).toBe(false);
        expect(result.status).toBe(false);
        expect(result.cancel).toBe(false);
    });

    it('should parse full agent tool config', () => {
        const result = mcpServerAgentToolInfoSchema.parse({
            agentName: 'SkipAgent',
            discover: true,
            execute: true,
            status: true,
            cancel: false,
        });
        expect(result.agentName).toBe('SkipAgent');
        expect(result.status).toBe(true);
    });
});

describe('Query Tool Schema', () => {
    it('should parse with defaults', () => {
        const result = mcpServerQueryToolInfoSchema.parse({});
        expect(result.enabled).toBe(false);
    });

    it('should parse with schema filters', () => {
        const result = mcpServerQueryToolInfoSchema.parse({
            enabled: true,
            allowedSchemas: ['__mj', 'dbo'],
            blockedSchemas: ['sys'],
        });
        expect(result.enabled).toBe(true);
        expect(result.allowedSchemas).toEqual(['__mj', 'dbo']);
        expect(result.blockedSchemas).toEqual(['sys']);
    });
});

describe('Communication Tool Schema', () => {
    it('should parse with defaults', () => {
        const result = mcpServerCommunicationToolInfoSchema.parse({});
        expect(result.enabled).toBe(false);
    });

    it('should parse with providers', () => {
        const result = mcpServerCommunicationToolInfoSchema.parse({
            enabled: true,
            allowedProviders: ['email', 'sms'],
        });
        expect(result.allowedProviders).toEqual(['email', 'sms']);
    });
});

describe('Prompt Tool Schema', () => {
    it('should parse with defaults', () => {
        const result = mcpServerPromptToolInfoSchema.parse({});
        expect(result.discover).toBe(false);
        expect(result.execute).toBe(false);
    });
});

describe('OAuth Proxy Settings Schema', () => {
    it('should parse empty object with all defaults', () => {
        const result = oauthProxySettingsSchema.parse({});
        expect(result.enabled).toBe(false);
        expect(result.clientTtlMs).toBe(86400000); // 24h
        expect(result.stateTtlMs).toBe(600000); // 10m
        expect(result.jwtExpiresIn).toBe('1h');
        expect(result.jwtIssuer).toBe('urn:mj:mcp-server');
        expect(result.enableConsentScreen).toBe(false);
    });

    it('should accept custom values', () => {
        const result = oauthProxySettingsSchema.parse({
            enabled: true,
            upstreamProvider: 'azure-ad',
            clientTtlMs: 3600000,
            jwtSigningSecret: 'a-long-enough-secret-that-passes-validation-ok',
            jwtExpiresIn: '2h',
            jwtIssuer: 'urn:custom:issuer',
            enableConsentScreen: true,
        });
        expect(result.enabled).toBe(true);
        expect(result.upstreamProvider).toBe('azure-ad');
        expect(result.clientTtlMs).toBe(3600000);
        expect(result.jwtExpiresIn).toBe('2h');
        expect(result.enableConsentScreen).toBe(true);
    });
});

describe('Auth Settings Schema', () => {
    it('should parse empty object with defaults', () => {
        const result = mcpServerAuthSettingsSchema.parse({});
        expect(result.mode).toBe('both');
        expect(result.autoResourceIdentifier).toBe(true);
    });

    it('should accept all valid modes', () => {
        const modes = ['apiKey', 'oauth', 'both', 'none'] as const;
        for (const mode of modes) {
            const result = mcpServerAuthSettingsSchema.parse({ mode });
            expect(result.mode).toBe(mode);
        }
    });

    it('should reject invalid mode', () => {
        const parseResult = mcpServerAuthSettingsSchema.safeParse({ mode: 'invalid' });
        expect(parseResult.success).toBe(false);
    });

    it('should accept scopes array', () => {
        const result = mcpServerAuthSettingsSchema.parse({
            scopes: ['openid', 'profile', 'api://client-id/.default'],
        });
        expect(result.scopes).toHaveLength(3);
    });
});

describe('MCP Server Info Schema', () => {
    it('should parse empty object with defaults', () => {
        const result = mcpServerInfoSchema.parse({});
        expect(result.port).toBe(3100);
        expect(result.enableMCPServer).toBe(false);
    });

    it('should coerce port from string', () => {
        const result = mcpServerInfoSchema.parse({ port: '4000' });
        expect(result.port).toBe(4000);
    });

    it('should parse full config with entity and action tools', () => {
        const result = mcpServerInfoSchema.parse({
            port: 5000,
            enableMCPServer: true,
            systemApiKey: 'test-key-123',
            entityTools: [
                { entityName: 'Users', get: true, runView: true },
                { entityName: 'AI Agents', get: true },
            ],
            actionTools: [
                { actionCategory: 'Communication', discover: true, execute: true },
            ],
            agentTools: [
                { agentName: '*', discover: true, execute: true, status: true },
            ],
        });
        expect(result.port).toBe(5000);
        expect(result.enableMCPServer).toBe(true);
        expect(result.entityTools).toHaveLength(2);
        expect(result.actionTools).toHaveLength(1);
        expect(result.agentTools).toHaveLength(1);
    });
});

describe('validateJwtSigningSecret', () => {
    it('should reject undefined secret', () => {
        const result = validateJwtSigningSecret(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not configured');
    });

    it('should reject short secret', () => {
        const result = validateJwtSigningSecret('short');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too short');
    });

    it('should accept 32+ byte UTF-8 secret', () => {
        const secret = 'this-is-a-long-enough-secret-key!!'; // 34 chars
        const result = validateJwtSigningSecret(secret);
        expect(result.valid).toBe(true);
        expect(result.decodedSecret).toBe(secret);
    });

    it('should accept base64-encoded 32-byte secret', () => {
        // 32 bytes in base64 is 44 characters
        const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        const result = validateJwtSigningSecret(secret);
        expect(result.valid).toBe(true);
    });

    it('should reject base64 that decodes to less than 32 bytes', () => {
        // 8 bytes base64 -> short
        const result = validateJwtSigningSecret('AQIDBA==');
        // This is short in base64 decode (4 bytes), so should try as utf-8
        // 'AQIDBA==' is 8 chars utf-8 -> still short
        expect(result.valid).toBe(false);
    });
});

describe('resolveAuthSettings', () => {
    it('should return defaults when config is undefined', () => {
        const result = resolveAuthSettings(undefined, undefined);
        expect(result.mode).toBe('both');
        expect(result.autoResourceIdentifier).toBe(true);
    });

    it('should auto-generate resourceIdentifier from port', () => {
        const result = resolveAuthSettings(
            { mode: 'oauth', autoResourceIdentifier: true },
            4000,
        );
        expect(result.resourceIdentifier).toBe('http://localhost:4000');
    });

    it('should use default port 3100 when port is undefined', () => {
        const result = resolveAuthSettings(
            { mode: 'both', autoResourceIdentifier: true },
            undefined,
        );
        expect(result.resourceIdentifier).toBe('http://localhost:3100');
    });

    it('should not auto-generate resourceIdentifier when already set', () => {
        const result = resolveAuthSettings(
            {
                mode: 'oauth',
                autoResourceIdentifier: true,
                resourceIdentifier: 'https://mcp.example.com',
            },
            4000,
        );
        expect(result.resourceIdentifier).toBe('https://mcp.example.com');
    });

    it('should not auto-generate when autoResourceIdentifier is false', () => {
        const result = resolveAuthSettings(
            { mode: 'both', autoResourceIdentifier: false },
            4000,
        );
        expect(result.resourceIdentifier).toBeUndefined();
    });

    it('should preserve scopes from config', () => {
        const result = resolveAuthSettings(
            {
                mode: 'oauth',
                autoResourceIdentifier: true,
                scopes: ['openid', 'profile'],
            },
            3100,
        );
        expect(result.scopes).toEqual(['openid', 'profile']);
    });
});
