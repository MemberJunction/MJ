/**
 * The entity and agent handlers of an A2A task both run as the task's caller: never the system
 * user, the first cached user, or the API key's own user record without its roles.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { entityOpsArgs, agentOpsArgs } = vi.hoisted(() => ({
    entityOpsArgs: [] as Array<[IMetadataProvider, UserInfo]>,
    agentOpsArgs: [] as Array<[UserInfo, IMetadataProvider]>,
}));

vi.mock('../EntityOperations.js', () => ({
    EntityOperations: class {
        constructor(provider: IMetadataProvider, caller: UserInfo) { entityOpsArgs.push([provider, caller]); }
    },
}));

vi.mock('../AgentOperations.js', () => ({
    AgentOperations: class {
        constructor(caller: UserInfo, provider: IMetadataProvider) { agentOpsArgs.push([caller, provider]); }
    },
}));

import { CreateTaskOperations } from '../TaskOperations.js';

const SYSTEM = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'System', IsActive: true } as unknown as UserInfo;
const CALLER_CACHED = { ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'Caller', IsActive: true, UserRoles: [{ Role: 'Intern' }] } as unknown as UserInfo;
const CALLER_FROM_KEY = { ID: 'bbbbbbbb-0000-0000-0000-000000000002', Name: 'Caller' } as unknown as UserInfo;
const users = [SYSTEM, CALLER_CACHED];
const provider = { Entities: [] } as unknown as IMetadataProvider;

beforeEach(() => {
    entityOpsArgs.length = 0;
    agentOpsArgs.length = 0;
});

describe('CreateTaskOperations', () => {
    it('runs the agent operations as the cached caller, on the request provider', () => {
        CreateTaskOperations(CALLER_FROM_KEY, users, provider);
        expect(agentOpsArgs).toHaveLength(1);
        expect(agentOpsArgs[0][0]).toBe(CALLER_CACHED);
        expect(agentOpsArgs[0][1]).toBe(provider);
    });

    it('runs the entity operations as the cached caller, on the request provider', () => {
        CreateTaskOperations(CALLER_FROM_KEY, users, provider);
        expect(entityOpsArgs).toHaveLength(1);
        expect(entityOpsArgs[0][0]).toBe(provider);
        expect(entityOpsArgs[0][1]).toBe(CALLER_CACHED);
    });

    it('returns the caller it bound the handlers to', () => {
        expect(CreateTaskOperations(CALLER_FROM_KEY, users, provider).Caller).toBe(CALLER_CACHED);
    });

    it('builds no handlers when there is no caller, rather than running as another user', () => {
        expect(() => CreateTaskOperations(undefined, users, provider)).toThrow(/No authenticated caller/);
        expect(entityOpsArgs).toHaveLength(0);
        expect(agentOpsArgs).toHaveLength(0);
    });
});
