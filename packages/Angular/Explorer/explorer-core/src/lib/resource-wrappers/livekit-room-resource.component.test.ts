/**
 * The past-meeting transcript reads the room conversation's current branch path:
 * `ConversationEngine.ScopeFilter` over `MJ: Conversation Details` in `Sequence` order.
 * When the scope cannot be read, the transcript is empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ViewCall {
  EntityName: string;
  ExtraFilter?: string;
  OrderBy?: string;
}

const hoisted = vi.hoisted(() => {
  const user = { ID: 'user-1' };
  return {
    user,
    provider: { CurrentUser: user },
    views: [] as ViewCall[],
    detailRows: [] as Array<Record<string, unknown>>,
    logError: vi.fn(),
    detectChanges: vi.fn(),
  };
});

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  OnInit: class {},
  OnDestroy: class {},
  AfterViewInit: class {},
  ChangeDetectorRef: class {},
  inject: () => ({ detectChanges: hoisted.detectChanges, markForCheck: vi.fn() }),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: Function) => target,
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: hoisted.logError,
    RunView: {
      FromMetadataProvider: () => ({
        RunView: async (params: ViewCall) => {
          hoisted.views.push(params);
          return { Success: true, Results: hoisted.detailRows };
        },
      }),
    },
  };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public ProviderToUse = hoisted.provider;
    protected NotifyLoadComplete(): void {}
  },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  GraphQLLiveKitClient: class {},
}));

vi.mock('@memberjunction/ng-conversations', () => ({
  UserHoldsAuthorization: () => false,
  REALTIME_ADVANCED_SESSION_CONTROLS: 'Realtime: Advanced Session Controls',
}));

vi.mock('@memberjunction/ng-mj-livekit-room', () => ({
  ParseTurnAddressing: () => null,
  ParseTurnMode: () => null,
  TURN_ADDRESSING_OPTIONS: [],
  TURN_MODE_OPTIONS: [],
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: { Instance: { Agents: [{ ID: 'agent-1', Name: 'Sage' }] } },
}));

import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { LiveKitRoomResource } from './livekit-room-resource.component';

const ROOM = { ConversationID: 'conv-1', Name: 'Standup' };
const BRANCH: ConversationBranchRow = { ID: 'branch-2', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 3, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'conv-1', BranchID: 'branch-2', Branches: [BRANCH] };

describe('LiveKitRoomResource.OpenTranscript', () => {
  let resource: LiveKitRoomResource;

  beforeEach(() => {
    hoisted.views.length = 0;
    hoisted.detailRows = [
      { Role: 'User', Message: 'hi', AgentID: null, Error: null },
      { Role: 'AI', Message: 'hello', AgentID: 'agent-1', Error: null },
    ];
    hoisted.logError.mockReset();
    resource = new LiveKitRoomResource();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the details on the current branch path in Sequence order', async () => {
    const loadScope = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);

    await resource.OpenTranscript(ROOM);

    expect(loadScope).toHaveBeenCalledWith('conv-1', hoisted.user, hoisted.provider);
    expect(hoisted.views).toHaveLength(1);
    expect(hoisted.views[0].EntityName).toBe('MJ: Conversation Details');
    expect(hoisted.views[0].ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
    expect(hoisted.views[0].ExtraFilter).toContain("[BranchID]='branch-2'");
    expect(hoisted.views[0].OrderBy).toBe('Sequence ASC');
    expect(resource.HistoryTranscript).toEqual([
      { Kind: 'human', Speaker: 'Participant', Message: 'hi' },
      { Kind: 'agent', Speaker: 'Sage', Message: 'hello' },
    ]);
    expect(resource.LoadingTranscript).toBe(false);
  });

  it('reads only trunk rows when the conversation is on the trunk', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(ConversationEngine.TrunkScope('conv-1'));

    await resource.OpenTranscript(ROOM);

    expect(hoisted.views[0].ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
    expect(hoisted.views[0].OrderBy).toBe('Sequence ASC');
  });

  it('shows an empty transcript and logs when the scope cannot be read', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockRejectedValue(new Error('Conversation conv-1 not found'));

    await resource.OpenTranscript(ROOM);

    expect(hoisted.views).toHaveLength(0);
    expect(resource.HistoryTranscript).toEqual([]);
    expect(resource.LoadingTranscript).toBe(false);
    expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('conv-1'));
  });

  it('shows an empty transcript and logs when the scope filter cannot be built', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);
    vi.spyOn(ConversationEngine, 'ScopeFilter').mockImplementationOnce(() => {
      throw new Error('Branch branch-2 chain is broken');
    });

    await expect(resource.OpenTranscript(ROOM)).resolves.toBeUndefined();

    expect(hoisted.views).toHaveLength(0);
    expect(resource.HistoryTranscript).toEqual([]);
    expect(resource.LoadingTranscript).toBe(false);
    expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('chain is broken'));
  });
});
