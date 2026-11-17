import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DecisionAnswer } from '@memberjunction/ai';

// The resolver's decorators need build-time reflection vitest does not emit; this test covers the
// classification logic, not the GraphQL schema.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, ObjectType: noopDecorator,
    InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator, Ctx: noopDecorator,
  };
});

const state = vi.hoisted(() => ({
  feedbackSettings: { enabled: true, decisionMode: 'Decision' } as { enabled: boolean; decisionMode: string },
  prompts: [{ Name: 'Default Decision', Status: 'Active' }] as Array<{ Name: string; Status: string }>,
  executeDecision: vi.fn(),
  chatCompletion: vi.fn(),
}));

vi.mock('../config.js', () => ({ configInfo: { get feedbackSettings() { return state.feedbackSettings; } } }));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: {
    Instance: {
      Config: vi.fn(),
      get Prompts() { return state.prompts; },
      Models: [{ AIModelType: 'LLM', IsActive: true, DriverClass: 'GroqLLM', APIName: 'fast' }],
    },
  },
}));
vi.mock('@memberjunction/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ai')>()),
  GetAIAPIKey: () => 'key',
}));
vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: () => ({ ChatCompletion: state.chatCompletion }) } } },
  };
});

import { FeedbackResolver } from '../resolvers/FeedbackResolver.js';
import type { AppContext } from '../types.js';
import { SetFeedbackDecisionRunner } from '../services/FeedbackClassificationDecision.js';

function choice(value: string): DecisionAnswer {
  return { Kind: 'Choice', Value: value, Probabilities: { [value]: 1 }, Confidence: 1 };
}

const ctx = { userPayload: { userRecord: { ID: 'user-1', Name: 'User' } } } as unknown as AppContext;
const input = { Title: 'Save button broken', Description: 'Clicking save does nothing.' };

function chatAnswers(json: string) {
  state.chatCompletion.mockResolvedValue({ data: { choices: [{ message: { content: json } }] } });
}

describe('FeedbackResolver.ClassifyFeedback', () => {
  beforeEach(() => {
    // Feedback counts as enabled only with GitHub credentials configured.
    vi.stubEnv('GITHUB_APP_ID', '');
    vi.stubEnv('GITHUB_PAT', 'test-token');
    state.feedbackSettings = { enabled: true, decisionMode: 'Decision' };
    state.prompts = [{ Name: 'Default Decision', Status: 'Active' }];
    state.executeDecision.mockReset();
    state.chatCompletion.mockReset();
    SetFeedbackDecisionRunner({ ExecuteDecision: state.executeDecision, WaitForPendingPromptRunSaves: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    SetFeedbackDecisionRunner(null);
  });

  it('Decision mode: two Choices answer, as the requesting user, and the chat model is not called', async () => {
    state.executeDecision.mockResolvedValue({ success: true, Answers: { category: choice('bug'), severity: choice('minor') } });

    const result = await new FeedbackResolver().ClassifyFeedback(input, ctx);

    expect(result).toEqual({ Success: true, Category: 'bug', Severity: 'minor' });
    expect(state.chatCompletion).not.toHaveBeenCalled();
    const params = state.executeDecision.mock.calls[0][0];
    expect(params.contextUser.ID).toBe('user-1');
    expect(params.State).toBe('Title: Save button broken\nDescription: Clicking save does nothing.');
    expect(Object.keys(params.Questions)).toEqual(['category', 'severity']);
  });

  it('Decision mode: a failed decision falls back to the chat model, with the same response shape', async () => {
    state.executeDecision.mockResolvedValue({ success: false, Answers: {}, errorMessage: 'down' });
    chatAnswers('```json\n{"category":"feature","severity":"minor"}\n```');

    const result = await new FeedbackResolver().ClassifyFeedback(input, ctx);

    expect(result).toEqual({ Success: true, Category: 'feature', Severity: 'minor' });
    expect(state.executeDecision).toHaveBeenCalledTimes(1);
    expect(state.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('Decision mode: with no user the decision is not asked; the chat model answers', async () => {
    chatAnswers('{"category":"question","severity":"trivial"}');

    const result = await new FeedbackResolver().ClassifyFeedback(input, { userPayload: {} } as unknown as AppContext);

    expect(result).toEqual({ Success: true, Category: 'question', Severity: 'trivial' });
    expect(state.executeDecision).not.toHaveBeenCalled();
  });

  it('Prompt mode: only the chat model answers', async () => {
    state.feedbackSettings = { enabled: true, decisionMode: 'prompt' };
    chatAnswers('{"category":"bug","severity":"major"}');

    const result = await new FeedbackResolver().ClassifyFeedback(input, ctx);

    expect(result).toEqual({ Success: true, Category: 'bug', Severity: 'major' });
    expect(state.executeDecision).not.toHaveBeenCalled();
  });

  it('keeps the old failure result when the chat fallback cannot parse', async () => {
    state.prompts = [];
    chatAnswers('not json');

    const result = await new FeedbackResolver().ClassifyFeedback(input, ctx);

    expect(result).toEqual({ Success: false, Error: 'Classification failed' });
  });

  it('refuses when feedback is disabled', async () => {
    state.feedbackSettings = { enabled: false, decisionMode: 'Decision' };
    const result = await new FeedbackResolver().ClassifyFeedback(input, ctx);
    expect(result.Success).toBe(false);
    expect(state.executeDecision).not.toHaveBeenCalled();
  });
});
