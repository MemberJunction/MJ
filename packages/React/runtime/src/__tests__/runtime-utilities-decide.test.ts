/**
 * @vitest-environment jsdom
 *
 * Tests for `utilities.ai.Decide`, the typed-decision tool RuntimeUtilities gives interactive
 * components. The GraphQL provider is mocked so we can check what reaches the `RunDecision` client
 * and how its result, or a transport failure, comes back to the component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SimpleDecideParams } from '@memberjunction/interactive-component-types';

const { MockGraphQLDataProvider, mockProviderInstance, mockRunDecision } = vi.hoisted(() => {
  const runDecision = vi.fn();
  class MockGraphQLDataProvider {
    AI = { RunDecision: runDecision, ExecuteSimplePrompt: vi.fn(), EmbedText: vi.fn() };
  }
  return {
    // `BaseEntity.Provider instanceof GraphQLDataProvider` must hold for the AI tools to be built.
    MockGraphQLDataProvider,
    mockProviderInstance: new MockGraphQLDataProvider(),
    mockRunDecision: runDecision
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    BaseEntity: { Provider: mockProviderInstance },
    Metadata: Object.assign(
      class {
        Entities = [];
        GetEntityObject = vi.fn();
      },
      { Provider: mockProviderInstance },
    ),
    RunView: Object.assign(
      class {
        RunView = vi.fn();
        RunViews = vi.fn();
      },
      { FromMetadataProvider: () => ({ RunView: vi.fn(), RunViews: vi.fn() }) },
    ),
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
    Execute = vi.fn();
  }
}));

vi.mock('@memberjunction/ai-vectors-memory', () => ({
  SimpleVectorService: class {}
}));

import { RuntimeUtilities } from '../utilities/runtime-utilities';

const PARAMS: SimpleDecideParams = {
  State: { subject: 'Card charged twice', body: 'I was billed twice for my March invoice.' },
  Questions: {
    urgent: { Kind: 'Likelihood', Instructions: 'Does the customer report an outage or data loss?' },
    team: {
      Kind: 'Choice',
      Instructions: 'Which team should handle this ticket?',
      Options: [
        { Value: 'billing', Description: 'Invoices, payments, refunds or pricing.' },
        { Value: 'support', Description: 'How to use the product, or a bug report.' }
      ]
    },
    severity: { Kind: 'Score', Instructions: 'How severe is the problem?', Levels: ['Minor', 'Moderate', 'Severe'] }
  },
  PromptName: 'Ticket Triage Decision',
  TimeoutMS: 2000
};

function decide(params: SimpleDecideParams = PARAMS) {
  const ai = new RuntimeUtilities().BuildUtilities().ai;
  expect(ai?.Decide).toBeTypeOf('function');
  return ai!.Decide!(params);
}

describe('RuntimeUtilities — utilities.ai.Decide', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRunDecision.mockReset();
  });

  it('sends the state, the typed questions, the prompt name and the timeout to RunDecision', async () => {
    mockRunDecision.mockResolvedValue({ Success: true, Answers: {} });

    await decide();

    expect(mockRunDecision).toHaveBeenCalledTimes(1);
    expect(mockRunDecision).toHaveBeenCalledWith({
      State: PARAMS.State,
      Questions: PARAMS.Questions,
      PromptName: 'Ticket Triage Decision',
      TimeoutMS: 2000
    });
  });

  it('returns every answer kind with the model that answered', async () => {
    const answers = {
      urgent: { Kind: 'Likelihood', Probability: 0.07 },
      team: { Kind: 'Choice', Value: 'billing', Probabilities: { billing: 0.94, support: 0.06 }, Confidence: 0.94 },
      severity: { Kind: 'Score', Value: 1.2, Probabilities: { Minor: 0.1, Moderate: 0.6, Severe: 0.3 }, Confidence: 0.6 }
    };
    mockRunDecision.mockResolvedValue({
      Success: true,
      Answers: answers,
      ModelName: 'Jev',
      ResolvedModel: 'typesafe/jev-1.13-20260917',
      ExecutionTimeMs: 212,
      PromptRunID: 'run-1'
    });

    const result = await decide();

    expect(result).toEqual({
      Success: true,
      ErrorMessage: undefined,
      Answers: answers,
      ModelName: 'Jev',
      ResolvedModel: 'typesafe/jev-1.13-20260917',
      ExecutionTimeMs: 212
    });
  });

  it('passes a failed decision through with empty answers, even if the server sent some', async () => {
    mockRunDecision.mockResolvedValue({
      Success: false,
      ErrorMessage: 'No Decision model has credentials available',
      Answers: { urgent: { Kind: 'Likelihood', Probability: 0.5 } },
      ModelName: 'Jev'
    });

    const result = await decide();

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe('No Decision model has credentials available');
    expect(result.Answers).toEqual({});
    expect(result.ModelName).toBe('Jev');
  });

  it('never throws: a transport error becomes a failed result', async () => {
    mockRunDecision.mockRejectedValue(new Error('Network down'));

    const result = await decide();

    expect(result).toEqual({ Success: false, ErrorMessage: 'Failed to run decision: Network down', Answers: {} });
  });
});
