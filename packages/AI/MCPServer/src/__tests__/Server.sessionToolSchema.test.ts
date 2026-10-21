/**
 * Each MCP session advertises the input schema built for its own user. A tool with
 * `parametersForUser` (the entity Create and Update tools) omits the fields that user may not
 * send, so the advertised schema is not itself a list of the columns the user is denied.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserInfo } from '@memberjunction/core';
import type { MCPSessionContext, ToolConfig } from '../Server.js';

vi.mock('@memberjunction/server', () => ({}));

import { CreateSessionToolRegistrar } from '../Server.js';

const intern = { ID: 'intern', Name: 'Intern', Email: 'intern@test.com' } as unknown as UserInfo;
const hr = { ID: 'hr', Name: 'HR', Email: 'hr@test.com' } as unknown as UserInfo;

/** A Create tool whose shared schema names every field and whose per-user schema drops Salary for the intern. */
function createTool(): ToolConfig {
    const full = z.object({ Name: z.string().optional(), Salary: z.number().optional() });
    return {
        name: 'Create_Employees_Record',
        description: 'Creates an employee',
        parameters: full,
        parametersForUser: (user) => (user.ID === 'intern' ? z.object({ Name: z.string().optional() }) : full),
        execute: async () => '',
    };
}

/** The input-schema keys a session's registrar advertises for `tool`. */
function advertisedKeys(user: UserInfo, tool: ToolConfig): string[] {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as McpServer;
    const session: MCPSessionContext = { user, authMethod: 'apiKey' };
    CreateSessionToolRegistrar(server, session, {})(tool);
    expect(registerTool).toHaveBeenCalledTimes(1);
    const definition = registerTool.mock.calls[0][1] as { inputSchema: Record<string, unknown> };
    return Object.keys(definition.inputSchema).sort();
}

describe('MCP session tool registration: per-user input schema', () => {
    it("REGRESSION: advertises the session user's schema, without the fields that user is denied", () => {
        expect(advertisedKeys(intern, createTool())).toEqual(['Name']);
    });

    it('advertises every field to a user who is denied nothing', () => {
        expect(advertisedKeys(hr, createTool())).toEqual(['Name', 'Salary']);
    });

    it('falls back to the shared schema for a tool without a per-user one', () => {
        const tool = { ...createTool(), parametersForUser: undefined };
        expect(advertisedKeys(intern, tool)).toEqual(['Name', 'Salary']);
    });
});
