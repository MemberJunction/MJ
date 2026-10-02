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
    BaseEntityResult: class {
      Success = false;
      Type = '';
      Message: string | null = null;
      Error: unknown = null;
      Errors: unknown[] = [];
      StartedAt: Date | null = null;
      EndedAt: Date | null = null;
    },
    TransactionResult: class {
      Item: unknown;
      Result: unknown;
      Success: boolean;
      constructor(item: unknown, result: unknown, success: boolean) {
        this.Item = item;
        this.Result = result;
        this.Success = success;
      }
    },
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
          EntityInfo: { Name: 'MJTestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: vi.fn(),
        },
        OperationType: 'Create',
      },
      {
        BaseEntity: {
          EntityInfo: { Name: 'MJTestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: vi.fn(),
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

  it('should mark every item failed when the server reports Success=false (rollback)', async () => {
    // On a server-side rollback, PrepareReturnValue still serializes each entity's in-memory
    // state into ResultsJSON — non-null payloads. Per-item success must therefore be gated on
    // the transaction-level Success flag, not on payload presence.
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: false,
        ErrorMessages: ['{"Success":false}', '{"Success":false}'],
        ResultsJSON: [
          JSON.stringify({ ID: '123', Name: 'Would-be Created (rolled back)' }),
          JSON.stringify({ ID: '456', Name: 'Would-be Updated (rolled back)' }),
        ],
      },
    };

    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'MJTestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: vi.fn(),
        },
        OperationType: 'Create',
      },
      {
        BaseEntity: {
          EntityInfo: { Name: 'MJTestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: vi.fn(),
        },
        OperationType: 'Update',
      },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    const results = (await handleSubmit()) as Array<{ Success: boolean }>;

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.Success).toBe(false);
    }
  });

  /**
   * #4309: the server already returns WHY each row was refused — PrepareReturnValue maps
   * `ErrorMessages` from every entity's `LatestResult` — and the client threw it away, so a UI
   * could only report the generic "all changes have been rolled back". `TransactionResult`'s own
   * docstring points consumers at `BaseEntity.LatestResult`, so that is where the reason belongs.
   */
  it("registers the server's per-item refusal reason on the entity's result history", async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: false,
        ErrorMessages: [
          JSON.stringify({
            Success: false,
            Type: 'create',
            Message: 'You may only assign a role that you hold yourself',
            Errors: [{ Source: 'RoleID', Message: 'You may only assign a role that you hold yourself' }],
          }),
        ],
        ResultsJSON: [JSON.stringify({ ID: '123', RoleID: null })],
      },
    };
    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const registered: Array<{ Message: string | null; Success: boolean }> = [];
    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'MJ: User Roles' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: (r: { Message: string | null; Success: boolean }) => registered.push(r),
        },
        OperationType: 'Create',
      },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    await handleSubmit();

    expect(registered).toHaveLength(1);
    expect(registered[0].Success).toBe(false);
    expect(registered[0].Message).toContain('You may only assign a role that you hold yourself');
  });

  it('registers nothing for an item the server did NOT refuse, so no phantom failure is invented', async () => {
    // A partially-refused group: item 0 was ACCEPTED, item 1 was refused. Only the refusal has a
    // reason to report.
    //
    // Item 0's wire shape is taken from a live capture, not guessed, and it is the whole point of
    // this test: an accepted row still serializes as `Success: false` with an EMPTY message,
    // because `DatabaseProviderBase` registers its result before enrolling the row and only flips
    // it to true in the transaction callback — which never runs when the group is abandoned. So
    // `Success === false` cannot be the predicate; carrying an actual reason has to be. Keying on
    // the flag would overwrite `BaseEntity`'s own "Transaction group failed" with a blank message,
    // making the report WORSE for every non-refused row in a failed group.
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: false,
        ErrorMessages: [
          JSON.stringify({ Success: false, Type: 'create', Message: '', Errors: [] }),
          JSON.stringify({ Success: false, Type: 'create', Message: 'Name cannot be null' }),
        ],
        ResultsJSON: [JSON.stringify({ ID: '123' }), JSON.stringify({ ID: '456' })],
      },
    };
    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const registeredPerItem: Array<Array<{ Message: string | null }>> = [[], []];
    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [0, 1].map((i) => ({
      BaseEntity: {
        EntityInfo: { Name: 'MJ: Lists' },
        GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
        RegisterResultHistoryEntry: (r: { Message: string | null }) => registeredPerItem[i].push(r),
      },
      OperationType: 'Create',
    }));

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    await handleSubmit();

    expect(registeredPerItem[0]).toHaveLength(0);
    expect(registeredPerItem[1]).toHaveLength(1);
    expect(registeredPerItem[1][0].Message).toContain('Name cannot be null');
  });

  it('registers nothing when the transaction SUCCEEDED', async () => {
    const mockResults = {
      ExecuteTransactionGroup: {
        Success: true,
        ErrorMessages: ['null'],
        ResultsJSON: [JSON.stringify({ ID: '123', Name: 'Created' })],
      },
    };
    mockProvider.ExecuteGQL.mockResolvedValue(mockResults);

    const registered: unknown[] = [];
    const group = new GraphQLTransactionGroup(mockProvider as never);
    group.PendingTransactions = [
      {
        BaseEntity: {
          EntityInfo: { Name: 'MJ: Lists' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: (r: unknown) => registered.push(r),
        },
        OperationType: 'Create',
      },
    ];

    const handleSubmit = (group as Record<string, Function>)['HandleSubmit'].bind(group);
    await handleSubmit();

    expect(registered).toHaveLength(0);
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
          EntityInfo: { Name: 'MJTestEntity' },
          GetDataObjectJSON: vi.fn().mockResolvedValue('{}'),
          RegisterResultHistoryEntry: vi.fn(),
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
