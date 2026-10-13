/**
 * Unit tests for the SHARED conversation auto-naming helper — the single
 * implementation behind both the composer's first-message naming and the realtime
 * session path (sessions that created their own conversation name it on call end).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationEngine, type MJConversationBranchEntity } from '@memberjunction/core-entities';
import {
  GenerateAndApplyConversationName,
  GenerateAndApplyForkName,
  GenerateConversationName,
  NAME_CONVERSATION_PROMPT,
  SaveForkName
} from '../lib/services/conversation-naming';

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

/** A fork row stub: Load reads `stored` as the Name, Save keeps the Name it was given. */
function forkStub(stored: string | null, opts: { loads?: boolean; saves?: boolean } = {}) {
  const fork = {
    Name: null as string | null,
    LatestResult: { CompleteMessage: 'denied' },
    Load: vi.fn(async () => {
      fork.Name = stored;
      return opts.loads ?? true;
    }),
    Save: vi.fn(async () => opts.saves ?? true),
  };
  const provider = { GetEntityObject: vi.fn(async () => fork as unknown as MJConversationBranchEntity) };
  return { fork, provider: provider as unknown as GraphQLDataProvider };
}

describe('GenerateConversationName (the shared prompt run)', () => {
  beforeEach(() => {
    vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngineBase.Instance, 'Prompts', 'get').mockReturnValue([
      { ID: 'prompt-1', Name: NAME_CONVERSATION_PROMPT }
    ] as never);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the Name Conversation prompt and returns the trimmed name without saving anything', async () => {
    const save = vi.spyOn(ConversationEngine.Instance, 'SaveConversation');
    const runPrompt = vi.fn().mockResolvedValue({ success: true, parsedResult: { name: '  Launch Pricing  ', description: 'd' } });

    const result = await GenerateConversationName({ MessageText: 'price the launch', Provider: PROVIDER, RunPrompt: runPrompt });

    expect(runPrompt).toHaveBeenCalledWith('prompt-1', 'price the launch');
    expect(result).toEqual({ Name: 'Launch Pricing', Description: 'd' });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns null for a blank name, a failed run and a thrown error', async () => {
    expect(await GenerateConversationName({ MessageText: 'x', Provider: PROVIDER, RunPrompt: vi.fn().mockResolvedValue({ success: true, parsedResult: { name: '   ' } }) })).toBeNull();
    expect(await GenerateConversationName({ MessageText: 'x', Provider: PROVIDER, RunPrompt: vi.fn().mockResolvedValue({ success: false }) })).toBeNull();
    expect(await GenerateConversationName({ MessageText: 'x', Provider: PROVIDER, RunPrompt: vi.fn().mockRejectedValue(new Error('down')) })).toBeNull();
  });
});

describe('GenerateAndApplyForkName', () => {
  beforeEach(() => {
    vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngineBase.Instance, 'Prompts', 'get').mockReturnValue([
      { ID: 'prompt-1', Name: NAME_CONVERSATION_PROMPT }
    ] as never);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const named = () => vi.fn().mockResolvedValue({ success: true, parsedResult: { name: 'Annual Plans Only' } });

  it('saves the generated name on a fork that still has no name, reading the row fresh first', async () => {
    const { fork, provider } = forkStub(null);

    const result = await GenerateAndApplyForkName({ ForkId: 'FORK-1', MessageText: 'only annual plans', Provider: provider, CurrentUser: USER, RunPrompt: named() });

    expect(result).toBe('Annual Plans Only');
    expect(fork.Load).toHaveBeenCalledWith('FORK-1');
    expect(fork.Name).toBe('Annual Plans Only');
    expect(fork.Save).toHaveBeenCalledOnce();
  });

  it('keeps a name a person gave the fork meanwhile', async () => {
    const { fork, provider } = forkStub('My pricing fork');

    const result = await GenerateAndApplyForkName({ ForkId: 'FORK-1', MessageText: 'x', Provider: provider, CurrentUser: USER, RunPrompt: named() });

    expect(result).toBeNull();
    expect(fork.Name).toBe('My pricing fork');
    expect(fork.Save).not.toHaveBeenCalled();
  });

  it('reads and saves nothing when the prompt gives no name', async () => {
    const { fork, provider } = forkStub(null);

    const result = await GenerateAndApplyForkName({ ForkId: 'FORK-1', MessageText: 'x', Provider: provider, CurrentUser: USER, RunPrompt: vi.fn().mockResolvedValue({ success: false }) });

    expect(result).toBeNull();
    expect(fork.Load).not.toHaveBeenCalled();
  });

  it('returns null when the row cannot be read, the save fails or the read throws', async () => {
    expect(await GenerateAndApplyForkName({ ForkId: 'F', MessageText: 'x', Provider: forkStub(null, { loads: false }).provider, CurrentUser: USER, RunPrompt: named() })).toBeNull();
    expect(await GenerateAndApplyForkName({ ForkId: 'F', MessageText: 'x', Provider: forkStub(null, { saves: false }).provider, CurrentUser: USER, RunPrompt: named() })).toBeNull();
    const throwing = { GetEntityObject: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as GraphQLDataProvider;
    expect(await GenerateAndApplyForkName({ ForkId: 'F', MessageText: 'x', Provider: throwing, CurrentUser: USER, RunPrompt: named() })).toBeNull();
  });
});

describe('SaveForkName', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a trimmed name, and null for a blank one', async () => {
    const named = forkStub('Old');
    expect(await SaveForkName({ ForkId: 'F', Name: '  New name ', Provider: named.provider, CurrentUser: USER })).toBe(true);
    expect(named.fork.Name).toBe('New name');

    const cleared = forkStub('Old');
    expect(await SaveForkName({ ForkId: 'F', Name: '   ', Provider: cleared.provider, CurrentUser: USER })).toBe(true);
    expect(cleared.fork.Name).toBeNull();
  });

  it('cuts a name to the 255 characters the field holds', async () => {
    const { fork, provider } = forkStub(null);
    await SaveForkName({ ForkId: 'F', Name: 'x'.repeat(300), Provider: provider, CurrentUser: USER });
    expect(fork.Name).toHaveLength(255);
  });

  it('reports a failed save as false', async () => {
    expect(await SaveForkName({ ForkId: 'F', Name: 'N', Provider: forkStub(null, { saves: false }).provider, CurrentUser: USER })).toBe(false);
  });
});
