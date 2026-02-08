import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('graphql-request', () => ({
  gql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: vi.fn(() => (target: Function) => target),
  SafeJSONParse: vi.fn((str: string) => {
    try { return JSON.parse(str); } catch { return null; }
  }),
}));

vi.mock('@memberjunction/core', () => {
  class MockTransactionGroupBase {
    PendingTransactions: Array<{
      BaseEntity: { EntityInfo: { Name: string }; GetDataObjectJSON: () => Promise<string> };
      OperationType: string;
    }> = [];
    Variables: Array<{
      Name: string;
      FieldName: string;
      Type: string;
    }> = [];
    MapVariableEntityObjectToPosition(variable: Record<string, unknown>): number {
      return 0;
    }
  }

  return {
    TransactionGroupBase: MockTransactionGroupBase,
    TransactionResult: vi.fn().mockImplementation(
      (item: unknown, result: unknown, success: boolean) => ({
        Item: item,
        Result: result,
        Success: success,
      })
    ),
  };
});

vi.mock('../graphQLDataProvider', () => ({
  GraphQLDataProvider: vi.fn(),
}));

import { GraphQLTransactionGroup } from '../graphQLTransactionGroup';
import { SafeJSONParse } from '@memberjunction/global';

describe('GraphQLTransactionGroup', () => {
  let mockProvider: { ExecuteGQL: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      ExecuteGQL: vi.fn(),
    };
  });

  it('should create an instance with a provider', () => {
    const group = new GraphQLTransactionGroup(mockProvider as never);
    expect(group).toBeInstanceOf(GraphQLTransactionGroup);
  });

  it('should throw when ExecuteTransactionGroup fails', async () => {
    mockProvider.ExecuteGQL.mockResolvedValue(null);

    const group = new GraphQLTransactionGroup(mockProvider as never);
    // Access the protected method through type assertion
    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);

    await expect(handleSubmit()).rejects.toThrow('Failed to execute transaction group');
  });

  it('should process transaction results when server responds', async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: true,
        ErrorMessages: [],
        ResultsJSON: [
          JSON.stringify({ ID: '123', Name: 'Created Entity' }),
          JSON.stringify({ ID: '456', Name: 'Updated Entity' }),
        ],
      },
    };

    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const group = new GraphQLTransactionGroup(mockProvider as never);

    // Set up pending transactions
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'TestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
        },
        OperationType: 'Create',
      },
      {
        BaseEntity: {
          EntityInfo: { Name: 'TestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
        },
        OperationType: 'Update',
      },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    const results = await handleSubmit();

    expect(results).toHaveLength(2);
    expect(mockProvider.ExecuteGQL).toHaveBeenCalledOnce();
  });

  it('should build correct variables for ExecuteGQL', async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: true,
        ErrorMessages: [],
        ResultsJSON: [JSON.stringify({ ID: '123' })],
      },
    };

    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'Users' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{"Name":"Test User"}'),
        },
        OperationType: 'Create',
      },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    await handleSubmit();

    const callArgs = mockProvider.ExecuteGQL.mock.calls[0];
    const vars = callArgs[1];

    expect(vars.group).toBeDefined();
    expect(vars.group.Items).toHaveLength(1);
    expect(vars.group.Items[0].EntityName).toBe('Users');
    expect(vars.group.Items[0].OperationType).toBe('Create');
  });

  it('should handle empty pending transactions', async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: true,
        ErrorMessages: [],
        ResultsJSON: [],
      },
    };

    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    const results = await handleSubmit();

    expect(results).toHaveLength(0);
  });

  it('should pass variables through correctly', async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: true,
        ErrorMessages: [],
        ResultsJSON: [JSON.stringify({ ID: '123' })],
      },
    };

    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'TestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
        },
        OperationType: 'Create',
      },
    ];

    group.Variables = [
      { Name: 'testVar', FieldName: 'TargetID', Type: 'output' },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    await handleSubmit();

    const callArgs = mockProvider.ExecuteGQL.mock.calls[0];
    const vars = callArgs[1];

    expect(vars.group.Variables).toHaveLength(1);
    expect(vars.group.Variables[0].Name).toBe('testVar');
    expect(vars.group.Variables[0].FieldName).toBe('TargetID');
    expect(vars.group.Variables[0].Type).toBe('output');
  });
});
