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
const { MockGraphQLDataProvider, mockProviderInstance, mockRunView, mockScoreExecute } = vi.hoisted(() => {
  class MockGraphQLDataProvider {}
  return {
    // Mock the GraphQL provider so `BaseEntity.Provider instanceof GraphQLDataProvider` is true.
    MockGraphQLDataProvider,
    mockProviderInstance: new MockGraphQLDataProvider(),
    // Controllable RunView mock.
    mockRunView: vi.fn(),
    // Controllable Remote Operation mock.
    mockScoreExecute: vi.fn()
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    BaseEntity: { Provider: mockProviderInstance },
    Metadata: class {
      Entities = [];
      GetEntityObject = vi.fn();
    },
    RunView: class {
      RunView = mockRunView;
      RunViews = vi.fn();
    },
    RunQuery: class {
      RunQuery = vi.fn();
    }
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: MockGraphQLDataProvider
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
  });

  it('exposes an `ml` capability when a GraphQL provider is present', () => {
    const u = new RuntimeUtilities().buildUtilities();
    expect(u.ml).toBeDefined();
    expect(typeof u.ml!.listModels).toBe('function');
    expect(typeof u.ml!.score).toBe('function');
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
});
