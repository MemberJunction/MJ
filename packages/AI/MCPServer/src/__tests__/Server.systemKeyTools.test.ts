/**
 * The system API key authenticates as the system user, but it cannot run scope-checked tools over
 * MCP: it has no API-key record, so there are no scopes to check. The denial is explicit, with a
 * reason a client can act on, rather than a side effect of the key engine's hash format check.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserInfo } from '@memberjunction/core';
import type { MCPSessionContext, ToolConfig } from '../Server.js';

vi.mock('@memberjunction/server', () => ({}));
const engine = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ Authorize: engine.authorize, IsValidAPIKeyFormat: () => false }),
}));

import { CreateSessionToolRegistrar } from '../Server.js';

const systemUser = { ID: 'system', Name: 'System', Email: 'system@example.test' } as unknown as UserInfo;

/** Registers one scope-checked tool for `session` and returns its MCP handler. */
function handlerFor(session: MCPSessionContext, execute: ToolConfig['execute']) {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as McpServer;
    CreateSessionToolRegistrar(server, session, {})({
        name: 'Get_Entity_List',
        description: 'Lists entities',
        parameters: z.object({}),
        scopeInfo: { scopePath: 'entity:read', resource: '*' },
        execute,
    });
    return registerTool.mock.calls[0][2] as (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
}

describe('the system API key and scope-checked tools', () => {
    it('is refused with a clear reason, without asking the key engine and without running the tool', async () => {
        const execute = vi.fn(async () => 'ran');
        const handler = handlerFor({ user: systemUser, authMethod: 'apiKey', apiKeyId: 'system', apiKeyHash: 'system' }, execute);

        const result = await handler({});
        const body = JSON.parse(result.content[0].text) as { error: string; reason: string };

        expect(body.error).toBe('Authorization denied');
        expect(body.reason).toMatch(/system API key/);
        expect(execute).not.toHaveBeenCalled();
        expect(engine.authorize).not.toHaveBeenCalled();
    });
});
