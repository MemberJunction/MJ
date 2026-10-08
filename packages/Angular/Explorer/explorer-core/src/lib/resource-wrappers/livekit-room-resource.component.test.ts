/**
 * The past-meeting transcript reads the room conversation's Main rows (a bridge session writes
 * Main): the Main predicate over `MJ: Conversation Details` in `Sequence` order.
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

import { LiveKitRoomResource } from './livekit-room-resource.component';

const ROOM = { ConversationID: 'conv-1', Name: 'Standup' };

describe('LiveKitRoomResource.OpenTranscript', () => {
  let resource: LiveKitRoomResource;

  beforeEach(() => {
    hoisted.views.length = 0;
    hoisted.detailRows = [
      { Role: 'User', Message: 'hi', AgentID: null, Error: null },
      { Role: 'AI', Message: 'hello', AgentID: 'agent-1', Error: null },
    ];
    resource = new LiveKitRoomResource();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the Main rows in Sequence order', async () => {
    await resource.OpenTranscript(ROOM);

    expect(hoisted.views).toHaveLength(1);
    expect(hoisted.views[0].EntityName).toBe('MJ: Conversation Details');
    expect(hoisted.views[0].ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
    expect(hoisted.views[0].OrderBy).toBe('Sequence ASC');
    expect(resource.HistoryTranscript).toEqual([
      { Kind: 'human', Speaker: 'Participant', Message: 'hi' },
      { Kind: 'agent', Speaker: 'Sage', Message: 'hello' },
    ]);
    expect(resource.LoadingTranscript).toBe(false);
  });
});
