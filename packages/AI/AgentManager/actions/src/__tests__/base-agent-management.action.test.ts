import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/core', () => {
  class MockMetadata {
    async GetEntityObject() {
      return {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        NewRecord: vi.fn(),
        ID: 'entity-1',
        Name: 'Test',
      };
    }
  }
  class MockRunView {
    RunView = vi.fn().mockResolvedValue({
      Success: true,
      Results: [{ ID: 'type-1' }],
    });
  }
  return {
    Metadata: MockMetadata,
    RunView: MockRunView,
    BaseEntity: {
      Provider: {
        BeginTransaction: vi.fn(),
        CommitTransaction: vi.fn(),
        RollbackTransaction: vi.fn(),
      },
    },
    UserInfo: class {},
    LogError: vi.fn(),
    DatabaseProviderBase: class {},
  };
});

vi.mock('@memberjunction/actions-base', () => ({
  ActionResultSimple: vi.fn(),
  RunActionParams: vi.fn(),
}));

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  AIAgentTypeEntity: vi.fn(),
  AIAgentPromptEntity: vi.fn(),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
  AIPromptEntityExtended: vi.fn(),
  AIAgentEntityExtended: vi.fn(),
}));

import { BaseAgentManagementAction } from '../actions/base-agent-management.action';

// Concrete subclass for testing
class TestAgentAction extends BaseAgentManagementAction {
  async RunAction(): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
    return { Success: true, ResultCode: 'OK', Message: 'Test' };
  }

  // Expose protected methods for testing
  public testValidatePermission(params: { ContextUser?: unknown; Params: Array<{ Name: string; Value: unknown }> }) {
    return this.validateAgentManagerPermission(params as never);
  }
  public testGetStringParam(params: { Params: Array<{ Name: string; Value: unknown }> }, name: string, required?: boolean) {
    return this.getStringParam(params as never, name, required);
  }
  public testGetObjectParam(params: { Params: Array<{ Name: string; Value: unknown }> }, name: string, required?: boolean) {
    return this.getObjectParam(params as never, name, required);
  }
  public testGetUuidParam(params: { Params: Array<{ Name: string; Value: unknown }> }, name: string, required?: boolean) {
    return this.getUuidParam(params as never, name, required);
  }
  public testIsValidUUID(uuid: string) {
    return this.isValidUUID(uuid);
  }
  public testGetTransactionProvider() {
    return this.getTransactionProvider();
  }
  public testHandleError(error: unknown, operation: string) {
    return this.handleError(error, operation);
  }
  public testLoadAgent(agentID: string, contextUser: unknown) {
    return this.loadAgent(agentID, contextUser as never);
  }
  public testValidateAgentType(typeID: string, contextUser: unknown) {
    return this.validateAgentType(typeID, contextUser as never);
  }
}

describe('BaseAgentManagementAction', () => {
  let action: TestAgentAction;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new TestAgentAction();
  });

  describe('validateAgentManagerPermission', () => {
    it('should return null (permission granted) when ContextUser is provided', async () => {
      const result = await action.testValidatePermission({
        ContextUser: { ID: 'user-1' },
        Params: [],
      });
      expect(result).toBeNull();
    });

    it('should return error when ContextUser is missing', async () => {
      const result = await action.testValidatePermission({
        ContextUser: undefined,
        Params: [],
      });
      expect(result).not.toBeNull();
      expect(result!.Success).toBe(false);
      expect(result!.ResultCode).toBe('PERMISSION_DENIED');
    });
  });

  describe('getStringParam', () => {
    it('should extract a string parameter', () => {
      const result = action.testGetStringParam(
        { Params: [{ Name: 'agentName', Value: 'TestAgent' }] },
        'agentName'
      );
      expect(result.value).toBe('TestAgent');
      expect(result.error).toBeUndefined();
    });

    it('should return error when required param is missing', () => {
      const result = action.testGetStringParam({ Params: [] }, 'agentName', true);
      expect(result.error).toBeDefined();
      expect(result.error!.ResultCode).toBe('VALIDATION_ERROR');
    });

    it('should return undefined value when optional param is missing', () => {
      const result = action.testGetStringParam({ Params: [] }, 'agentName', false);
      expect(result.value).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should match param names case-insensitively', () => {
      const result = action.testGetStringParam(
        { Params: [{ Name: 'AgentName', Value: 'Test' }] },
        'agentname'
      );
      expect(result.value).toBe('Test');
    });
  });

  describe('getObjectParam', () => {
    it('should extract an object parameter', () => {
      const obj = { key: 'value' };
      const result = action.testGetObjectParam(
        { Params: [{ Name: 'config', Value: obj }] },
        'config'
      );
      expect(result.value).toEqual(obj);
    });

    it('should return error when required object param is missing', () => {
      const result = action.testGetObjectParam({ Params: [] }, 'config', true);
      expect(result.error).toBeDefined();
    });
  });

  describe('isValidUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(action.testIsValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(action.testIsValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(action.testIsValidUUID('not-a-uuid')).toBe(false);
      expect(action.testIsValidUUID('')).toBe(false);
      expect(action.testIsValidUUID('12345')).toBe(false);
    });
  });

  describe('getUuidParam', () => {
    it('should extract a valid UUID parameter', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = action.testGetUuidParam(
        { Params: [{ Name: 'agentId', Value: uuid }] },
        'agentId'
      );
      expect(result.value).toBe(uuid);
    });

    it('should return error for invalid UUID format', () => {
      const result = action.testGetUuidParam(
        { Params: [{ Name: 'agentId', Value: 'not-a-uuid' }] },
        'agentId'
      );
      expect(result.error).toBeDefined();
      expect(result.error!.Message).toContain('Invalid agentId format');
    });

    it('should reject NULL string as UUID', () => {
      const result = action.testGetUuidParam(
        { Params: [{ Name: 'agentId', Value: 'NULL' }] },
        'agentId'
      );
      expect(result.error).toBeDefined();
    });

    it('should return error when required UUID param is missing', () => {
      const result = action.testGetUuidParam({ Params: [] }, 'agentId', true);
      expect(result.error).toBeDefined();
    });
  });

  describe('getTransactionProvider', () => {
    it('should return provider when available and supports transactions', () => {
      const result = action.testGetTransactionProvider();
      expect(result.provider).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe('handleError', () => {
    it('should format Error instances', () => {
      const result = action.testHandleError(new Error('test error'), 'create agent');
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('test error');
      expect(result.Message).toContain('create agent');
    });

    it('should handle non-Error objects', () => {
      const result = action.testHandleError('string error', 'delete agent');
      expect(result.Success).toBe(false);
      expect(result.Message).toContain('Unknown error');
    });
  });

  describe('loadAgent', () => {
    it('should return agent when loaded successfully', async () => {
      const result = await action.testLoadAgent('agent-1', { ID: 'user-1' });
      // The mock Metadata.GetEntityObject returns an entity with Load returning true,
      // so the agent property should be set
      expect(result.error).toBeUndefined();
      expect(result.agent).toBeDefined();
      expect(result.agent!.ID).toBe('entity-1');
    });
  });

  describe('validateAgentType', () => {
    it('should return type when loaded successfully', async () => {
      const result = await action.testValidateAgentType('type-1', { ID: 'user-1' });
      expect(result.error).toBeUndefined();
      expect(result.type).toBeDefined();
    });
  });
});
