/**
 * @vitest-environment jsdom
 *
 * Focused tests for the ML tools surface (`ComponentUtilities.ml`) built by RuntimeUtilities.
 * The provider statics and the Predictive Studio Remote Operation are mocked so we can exercise
 * the listModels RunView mapping and the score Remote-Op marshalling without a live backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the `vi.mock` factories (which are themselves hoisted above the imports) can
// safely reference these without a "before initialization" error.
const { MockGraphQLDataProvider, mockProviderInstance, mockRunView, mockScoreExecute, mockRunAction, mockActions } =
  vi.hoisted(() => {
    class MockGraphQLDataProvider {}
    return {
      // Mock the GraphQL provider so `BaseEntity.Provider instanceof GraphQLDataProvider` is true.
      MockGraphQLDataProvider,
      mockProviderInstance: new MockGraphQLDataProvider(),
      // Controllable RunView mock.
      mockRunView: vi.fn(),
      // Controllable Remote Operation mock.
      mockScoreExecute: vi.fn(),
      // Controllable action-invocation mock — the signal methods run server-side actions.
      mockRunAction: vi.fn(),
      // The action catalogue the runtime looks a driver up in.
      mockActions: [] as Array<{ ID: string; Name: string }>
    };
  });

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    BaseEntity: { Provider: mockProviderInstance },
    // RuntimeUtilities now reads through a provider rather than constructing a global RunView,
    // so the mock has to answer the static factory and the global-provider fallback.
    Metadata: Object.assign(
      class {
        Entities = [];
        GetEntityObject = vi.fn();
      },
      { Provider: mockProviderInstance },
    ),
    RunView: Object.assign(
      class {
        RunView = mockRunView;
        RunViews = vi.fn();
      },
      { FromMetadataProvider: () => ({ RunView: mockRunView, RunViews: vi.fn() }) },
    ),
    RunQuery: class {
      RunQuery = vi.fn();
    }
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: MockGraphQLDataProvider,
  GraphQLActionClient: class {
    RunAction = mockRunAction;
  }
}));

// Mocked wholesale: the real module reaches into core-entities, which is itself mocked here.
vi.mock('@memberjunction/actions-base', () => ({
  ActionEngineBase: {
    Instance: {
      get Actions() {
        return mockActions;
      }
    }
  }
}));

vi.mock('@memberjunction/core-entities', () => ({
  GeoDataEngine: { Instance: undefined },
  MJMLModelEntity: class {},
  PredictiveStudioScoreRecordSetOperation: class {
    Execute = mockScoreExecute;
  }
}));

vi.mock('@memberjunction/ai-vectors-memory', () => ({
  SimpleVectorService: class {}
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual };
});

import { RuntimeUtilities } from '../lib/utilities/runtime-utilities';

describe('RuntimeUtilities — SimpleMLTools', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRunView.mockReset();
    mockScoreExecute.mockReset();
    mockRunAction.mockReset();
    mockActions.length = 0;
  });

  it('exposes an `ml` capability when a GraphQL provider is present', () => {
    const u = new RuntimeUtilities().buildUtilities();
    expect(u.ml).toBeDefined();
    expect(typeof u.ml!.listModels).toBe('function');
    expect(typeof u.ml!.score).toBe('function');
    expect(typeof u.ml!.listSignals).toBe('function');
    expect(typeof u.ml!.computeSignal).toBe('function');
  });

  it('listModels maps MJ: ML Models rows and parses JSON metrics', async () => {
    mockRunView.mockResolvedValue({
      Success: true,
      Results: [
        {
          ID: 'M1',
          Pipeline: 'Renewal Pipeline',
          Version: 3,
          TargetVariable: 'Renewed',
          ProblemType: 'classification',
          Status: 'Published',
          Metrics: '{"auc":0.91}',
          HoldoutMetrics: 'not-json'
        }
      ]
    });

    const u = new RuntimeUtilities().buildUtilities();
    const models = await u.ml!.listModels();

    expect(mockRunView).toHaveBeenCalledTimes(1);
    const params = mockRunView.mock.calls[0][0];
    expect(params.EntityName).toBe('MJ: ML Models');
    expect(params.ExtraFilter).toBe("Status='Published'");
    expect(params.OrderBy).toBe('Version DESC');

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'M1',
      pipeline: 'Renewal Pipeline',
      version: 3,
      targetVariable: 'Renewed',
      problemType: 'classification',
      status: 'Published',
      metrics: { auc: 0.91 }
    });
    // Invalid JSON is defensively dropped to undefined.
    expect(models[0].holdoutMetrics).toBeUndefined();
  });

  it('listModels applies status/targetVariable/maxResults filter and returns [] on failure', async () => {
    mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'boom', Results: [] });

    const u = new RuntimeUtilities().buildUtilities();
    const models = await u.ml!.listModels({ status: 'Validated', targetVariable: "O'Brien", maxResults: 5 });

    const params = mockRunView.mock.calls[0][0];
    expect(params.ExtraFilter).toBe("Status='Validated' AND TargetVariable='O''Brien'");
    expect(params.MaxRows).toBe(5);
    expect(models).toEqual([]);
  });

  it('score normalizes record keys, requests ephemeral predictions, and maps the result', async () => {
    mockScoreExecute.mockResolvedValue({
      Success: true,
      Output: {
        scored: 2,
        failed: 0,
        skipped: 1,
        wroteBack: false,
        predictions: [
          { recordId: 'R1', score: 0.8, class: 'Yes' },
          { recordId: 'R2', score: 0.2, class: 'No' }
        ]
      }
    });

    const u = new RuntimeUtilities().buildUtilities();
    const result = await u.ml!.score('M1', ['R1', { ID: 'R2' }, { Other: 'R3' }], { primaryKeyField: 'ID' });

    expect(mockScoreExecute).toHaveBeenCalledTimes(1);
    const [input, ctx] = mockScoreExecute.mock.calls[0];
    expect(input.modelId).toBe('M1');
    expect(input.scope).toEqual({ records: ['R1', 'R2'] }); // Other-keyed object dropped (no ID)
    expect(input.writeBack).toBeUndefined(); // ephemeral
    expect(ctx.provider).toBe(mockProviderInstance);

    expect(result).toEqual({
      scoredCount: 2,
      failedCount: 0,
      skippedCount: 1,
      predictions: [
        { recordId: 'R1', score: 0.8, class: 'Yes' },
        { recordId: 'R2', score: 0.2, class: 'No' }
      ]
    });
  });

  it('score returns a zeroed result with records counted as failed on error', async () => {
    mockScoreExecute.mockResolvedValue({ Success: false, ErrorMessage: 'no model' });

    const u = new RuntimeUtilities().buildUtilities();
    const result = await u.ml!.score('M1', ['R1', 'R2']);

    expect(result).toEqual({ scoredCount: 0, failedCount: 2, skippedCount: 0, predictions: [] });
  });

  it('listSignals runs the List Signals action and maps its entries', async () => {
    mockActions.push({ ID: 'A-LIST', Name: 'List Signals' });
    mockRunAction.mockResolvedValue({
      Success: true,
      Params: [
        {
          Name: 'Signals',
          Value: [
            {
              ID: 'S1',
              Name: 'Days Since Last Activity',
              TypeName: 'As-Of Recency',
              Story: 'How long ago someone last did anything.',
              Rebindable: true
            },
            { ID: 'S2', Name: 'Bio Embedding', TypeName: 'Embedding', Story: null, Rebindable: false }
          ]
        }
      ]
    });

    const u = new RuntimeUtilities().buildUtilities();
    const signals = await u.ml!.listSignals!({ search: 'engagement recency', maxRows: 5 });

    const [actionId, params] = mockRunAction.mock.calls[0];
    expect(actionId).toBe('A-LIST');
    expect(params).toEqual([
      { Name: 'QueryText', Value: 'engagement recency', Type: 'Input' },
      { Name: 'MaxRows', Value: 5, Type: 'Input' }
    ]);
    // rebindableOnly was not supplied, so it is not sent — the action's own default stands.
    expect(params.some((p: { Name: string }) => p.Name === 'RebindableOnly')).toBe(false);

    expect(signals).toEqual([
      {
        id: 'S1',
        name: 'Days Since Last Activity',
        type: 'As-Of Recency',
        story: 'How long ago someone last did anything.',
        rebindable: true
      },
      { id: 'S2', name: 'Bio Embedding', type: 'Embedding', story: null, rebindable: false }
    ]);
  });

  it('listSignals returns [] when the action is not in metadata', async () => {
    const u = new RuntimeUtilities().buildUtilities();
    const signals = await u.ml!.listSignals!();

    expect(mockRunAction).not.toHaveBeenCalled();
    expect(signals).toEqual([]);
  });

  it('computeSignal sends the binding substitutions flat and maps the values', async () => {
    mockActions.push({ ID: 'A-COMPUTE', Name: 'Compute Signal' });
    mockRunAction.mockResolvedValue({
      Success: true,
      Params: [
        { Name: 'OutputColumn', Value: 'Days Since Last Activity' },
        {
          Name: 'Values',
          Value: [
            { RecordID: 'D1', Value: 12 },
            { RecordID: 'D2', Value: null },
            // A shape the contract does not admit degrades to null rather than leaking through.
            { RecordID: 'D3', Value: { nested: true } }
          ]
        }
      ]
    });

    const u = new RuntimeUtilities().buildUtilities();
    const result = await u.ml!.computeSignal!('S1', 'Donors', {
      filter: "Status='Active'",
      asOfColumn: 'RenewalDate',
      binding: { sourceEntity: 'Donations', foreignKeyField: 'DonorID', dateField: 'GiftDate' }
    });

    const [, params] = mockRunAction.mock.calls[0];
    expect(params).toEqual([
      { Name: 'SignalID', Value: 'S1', Type: 'Input' },
      { Name: 'TargetEntity', Value: 'Donors', Type: 'Input' },
      { Name: 'Filter', Value: "Status='Active'", Type: 'Input' },
      { Name: 'AsOfColumn', Value: 'RenewalDate', Type: 'Input' },
      { Name: 'SourceEntity', Value: 'Donations', Type: 'Input' },
      { Name: 'ForeignKeyField', Value: 'DonorID', Type: 'Input' },
      { Name: 'DateField', Value: 'GiftDate', Type: 'Input' }
    ]);
    // ValueField/Column were not overridden, so the signal keeps the binding it was born with.
    expect(params.some((p: { Name: string }) => p.Name === 'ValueField')).toBe(false);

    expect(result).toEqual({
      success: true,
      outputColumn: 'Days Since Last Activity',
      values: [
        { recordId: 'D1', value: 12 },
        { recordId: 'D2', value: null },
        { recordId: 'D3', value: null }
      ],
      errorMessage: null
    });
  });

  it('computeSignal surfaces a refusal as a failure rather than as empty values', async () => {
    mockActions.push({ ID: 'A-COMPUTE', Name: 'Compute Signal' });
    mockRunAction.mockResolvedValue({
      Success: false,
      Message: "The foreign key 'NoSuchColumn' does not exist on 'Activities'."
    });

    const u = new RuntimeUtilities().buildUtilities();
    const result = await u.ml!.computeSignal!('S1', 'Members', {
      binding: { foreignKeyField: 'NoSuchColumn' }
    });

    // The distinction that matters: a refused binding must never look like "nobody had any activity".
    expect(result.success).toBe(false);
    expect(result.values).toEqual([]);
    expect(result.errorMessage).toContain('NoSuchColumn');
  });
});
