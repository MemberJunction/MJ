/**
 * Unit tests for the SHARED conversation auto-naming helper — the single
 * implementation behind both the composer's first-message naming and the realtime
 * session path (sessions that created their own conversation name it on call end).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationEngine } from '@memberjunction/core-entities';
import { GenerateAndApplyConversationName, NAME_CONVERSATION_PROMPT } from '../lib/services/conversation-naming';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER = {} as unknown as GraphQLDataProvider;

describe('GenerateAndApplyConversationName', () => {
  let saveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngineBase.Instance, 'Prompts', 'get').mockReturnValue([
      { ID: 'prompt-1', Name: NAME_CONVERSATION_PROMPT }
    ] as never);
    saveSpy = vi.spyOn(ConversationEngine.Instance, 'SaveConversation').mockResolvedValue(true as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the Name Conversation prompt, saves the parsed name + description, and returns them', async () => {
    const runPrompt = vi.fn().mockResolvedValue({
      success: true,
      parsedResult: { name: 'Ottawa Weather Briefing', description: 'Weather and stocks' }
    });

    const result = await GenerateAndApplyConversationName({
      ConversationId: 'conv-1',
      MessageText: 'whats the weather in ottawa?',
      Provider: PROVIDER,
      CurrentUser: USER,
      RunPrompt: runPrompt
    });

    expect(runPrompt).toHaveBeenCalledWith('prompt-1', 'whats the weather in ottawa?');
    expect(saveSpy).toHaveBeenCalledWith(
      'conv-1',
      { Name: 'Ottawa Weather Briefing', Description: 'Weather and stocks' },
      USER
    );
    expect(result).toEqual({ Name: 'Ottawa Weather Briefing', Description: 'Weather and stocks' });
  });

  it('parses fenced raw output when parsedResult is absent', async () => {
    const result = await GenerateAndApplyConversationName({
      ConversationId: 'conv-2',
      MessageText: 'hello',
      Provider: PROVIDER,
      CurrentUser: USER,
      RunPrompt: vi.fn().mockResolvedValue({
        success: true,
        output: '```json\n{"name":"Quick Hello"}\n```'
      })
    });

    expect(result).toEqual({ Name: 'Quick Hello', Description: '' });
    expect(saveSpy).toHaveBeenCalledWith('conv-2', { Name: 'Quick Hello', Description: '' }, USER);
  });

  it('returns null (no save) on timeout — the conversation keeps its default name', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const pending = GenerateAndApplyConversationName({
      ConversationId: 'conv-3',
      MessageText: 'slow',
      Provider: PROVIDER,
      CurrentUser: USER,
      TimeoutMs: 5000,
      RunPrompt: vi.fn().mockReturnValue(never)
    });
    await vi.advanceTimersByTimeAsync(5001);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('returns null when the Name Conversation prompt is not seeded', async () => {
    vi.spyOn(AIEngineBase.Instance, 'Prompts', 'get').mockReturnValue([] as never);
    const result = await GenerateAndApplyConversationName({
      ConversationId: 'conv-4',
      MessageText: 'x',
      Provider: PROVIDER,
      CurrentUser: USER,
      RunPrompt: vi.fn()
    });
    expect(result).toBeNull();
  });

  it.each([
    ['failed run', { success: false }],
    ['empty result', null],
    ['unparseable output', { success: true, output: 'not json at all {{{' }],
    ['parsed without a name', { success: true, parsedResult: { description: 'only desc' } }]
  ])('returns null (no save) for %s', async (_label, runResult) => {
    const result = await GenerateAndApplyConversationName({
      ConversationId: 'conv-5',
      MessageText: 'x',
      Provider: PROVIDER,
      CurrentUser: USER,
      RunPrompt: vi.fn().mockResolvedValue(runResult)
    });
    expect(result).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('returns null when the save fails (name generated but not applied)', async () => {
    saveSpy.mockResolvedValue(false as never);
    const result = await GenerateAndApplyConversationName({
      ConversationId: 'conv-6',
      MessageText: 'x',
      Provider: PROVIDER,
      CurrentUser: USER,
      RunPrompt: vi.fn().mockResolvedValue({ success: true, parsedResult: { name: 'N' } })
    });
    expect(result).toBeNull();
  });
});
