// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { ConversationScopeService } from '../lib/services/conversation-scope.service';

/**
 * The chat area's conversation reads use the scope of the current branch path: the pin count and
 * the pins panel, the most recent component artifact, and the agent-run poll. The branch rows it
 * loads are registered with `ConversationScopeService` with the chat area as owner; a conversation
 * change and destroy clear only the rows this chat area registered. A branch reload refreshes an
 * open artifact viewer in the new scope.
 *
 * Built via `Object.create(prototype)` so the real methods run against stubbed collaborators,
 * matching `chat-area-branch-switch.test.ts`.
 */

const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: 'alt' };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };
const TRUNK_PIN_FILTER = `[ConversationID]='CONV-1' AND [BranchID] IS NULL AND [IsPinned]=1`;
const BRANCH_PIN_FILTER = `${ConversationEngine.ScopeFilter(BRANCH_SCOPE)} AND [IsPinned]=1`;

interface RunViewCall {
  EntityName: string;
  ExtraFilter: string;
  ResultType: string;
}

interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  conversation: { ID: string; CurrentBranchID: string | null; Name: string };
  scopeService: ConversationScopeService;
  runView: ReturnType<typeof vi.fn>;
  windowStore: { SetPinnedCount: ReturnType<typeof vi.fn>; SetPinnedDetails: ReturnType<typeof vi.fn> };
  agentState: { startPolling: ReturnType<typeof vi.fn>; stopPolling: ReturnType<typeof vi.fn> };
}

function createHarness(currentBranchId: string | null): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const conversation = { ID: 'CONV-1', CurrentBranchID: currentBranchId, Name: 'Chat' };
  const scopeService = new ConversationScopeService();
  const runView = vi.fn(async () => ({ Success: true, Results: [], TotalRowCount: 3 }));
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
  const windowStore = { SetPinnedCount: vi.fn(), SetPinnedDetails: vi.fn() };
  const agentState = { startPolling: vi.fn(), stopPolling: vi.fn() };

  open['_conversationId'] = 'CONV-1';
  open['Conversation'] = conversation;
  open['CurrentUser'] = { ID: 'USER-1' };
  open['scopeService'] = scopeService;
  open['windowStore'] = windowStore;
  open['agentStateService'] = agentState;
  open['conversationLoadToken'] = 1;
  open['scopeFallbackLogged'] = null;
  open['cdr'] = { detectChanges: vi.fn() };

  return { component, open, conversation, scopeService, runView, windowStore, agentState };
}

function call<T>(h: Harness, method: string, ...args: unknown[]): Promise<T> {
  return (h.open[method] as (...a: unknown[]) => Promise<T>).apply(h.component, args);
}

function runViewCall(h: Harness, index: number): RunViewCall {
  return h.runView.mock.calls[index][0] as RunViewCall;
}

describe('ConversationChatAreaComponent conversation scope', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pins', () => {
    it('counts the pins on the current branch path', async () => {
      const h = createHarness('BRANCH-B');
      h.scopeService.SetBranches('CONV-1', [B], h.component);

      await call(h, 'loadPinnedMessageCount', 'CONV-1', 1);

      expect(runViewCall(h, 0)).toMatchObject({ EntityName: 'MJ: Conversation Details', ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.windowStore.SetPinnedCount).toHaveBeenCalledWith(3);
    });

    it('counts the pins on the trunk with the trunk predicate', async () => {
      const h = createHarness(null);

      await call(h, 'loadPinnedMessageCount', 'CONV-1', 1);

      expect(runViewCall(h, 0).ExtraFilter).toBe(TRUNK_PIN_FILTER);
    });

    it('loads the pins panel rows from the current branch path', async () => {
      const h = createHarness('BRANCH-B');
      h.scopeService.SetBranches('CONV-1', [B], h.component);

      await call(h, 'hydratePinnedMessages', 'CONV-1');

      expect(runViewCall(h, 0)).toMatchObject({ EntityName: 'MJ: Conversation Details', ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'entity_object' });
      expect(h.windowStore.SetPinnedDetails).toHaveBeenCalledWith([]);
    });

    it('loads the pins panel rows on the trunk with the trunk predicate', async () => {
      const h = createHarness(null);

      await call(h, 'hydratePinnedMessages', 'CONV-1');

      expect(runViewCall(h, 0).ExtraFilter).toBe(TRUNK_PIN_FILTER);
    });

    it('registers the branch rows before it counts the pins on open', async () => {
      const h = createHarness('BRANCH-B');
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['isActiveConversationLoad'] = () => true;

      const rows = await call<ConversationBranchRow[]>(h, 'loadBranchesAndPinCount', 'CONV-1', 1);

      expect(rows).toEqual([B]);
      expect(runViewCall(h, 0).ExtraFilter).toBe(BRANCH_PIN_FILTER);
      expect(h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toEqual(BRANCH_SCOPE);
    });

    it('does not register rows or count pins for a conversation load that is no longer current', async () => {
      const h = createHarness('BRANCH-B');
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['isActiveConversationLoad'] = () => false;

      await call(h, 'loadBranchesAndPinCount', 'CONV-1', 1);

      expect(h.runView).not.toHaveBeenCalled();
      expect(() => h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
    });
  });

  describe('conversation load', () => {
    it('registers the branch rows before the pin count runs', async () => {
      const h = createHarness('BRANCH-B');
      const register = vi.spyOn(h.scopeService, 'SetBranches');
      h.open['windowStore'] = {
        ...h.windowStore,
        LoadLatest: vi.fn(async () => undefined),
        GetSnapshot: vi.fn(() => ({})),
      };
      h.open['messages'] = [];
      h.open['isActiveConversationLoad'] = () => true;
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['applyWindowSnapshot'] = vi.fn();
      h.open['followTranscript'] = vi.fn();
      h.open['loadPeripheralData'] = vi.fn(async () => undefined);
      h.open['detectAndReconcileAgentRuns'] = vi.fn(async () => undefined);
      h.open['handlePendingArtifactNavigation'] = vi.fn(async () => undefined);

      await call(h, 'loadMessages', 'CONV-1', 1);

      expect(console.error).not.toHaveBeenCalled();
      expect(register).toHaveBeenCalledTimes(1);
      expect(h.runView).toHaveBeenCalledTimes(1);
      expect(register.mock.invocationCallOrder[0]).toBeLessThan(h.runView.mock.invocationCallOrder[0]);
      expect(runViewCall(h, 0)).toMatchObject({ ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.windowStore.SetPinnedCount).toHaveBeenCalledWith(3);
    });
  });

  describe('most recent component artifact', () => {
    it('reads the details of the current branch path', async () => {
      const h = createHarness('BRANCH-B');
      h.scopeService.SetBranches('CONV-1', [B], h.component);

      await call(h, 'findMostRecentComponentArtifactId');

      expect(runViewCall(h, 0)).toMatchObject({ EntityName: 'MJ: Conversation Details', ExtraFilter: ConversationEngine.ScopeFilter(BRANCH_SCOPE) });
    });

    it('reads the trunk details on the trunk', async () => {
      const h = createHarness(null);

      await call(h, 'findMostRecentComponentArtifactId');

      expect(runViewCall(h, 0).ExtraFilter).toBe(`[ConversationID]='CONV-1' AND [BranchID] IS NULL`);
    });
  });

  describe('scope fallback', () => {
    it('reads the trunk and warns once when the current branch rows are not registered', async () => {
      const h = createHarness('BRANCH-B');

      await call(h, 'loadPinnedMessageCount', 'CONV-1', 1);
      await call(h, 'loadPinnedMessageCount', 'CONV-1', 1);

      expect(runViewCall(h, 0).ExtraFilter).toBe(TRUNK_PIN_FILTER);
      expect(runViewCall(h, 1).ExtraFilter).toBe(TRUNK_PIN_FILTER);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('agent-run poll', () => {
    it('starts the poll with the scope of the current branch on open', async () => {
      const h = createHarness('BRANCH-B');
      h.open['conversationLoadToken'] = 0;
      h.open['currentlyLoadingConversationId'] = null;
      h.open['messageInputMetadataCache'] = new Map();
      h.open['messages'] = [];
      h.open['engine'] = { HasCachedDetails: () => true };
      h.open['resetConversationScopedViewState'] = vi.fn();
      h.open['loadMessages'] = vi.fn(async () => h.scopeService.SetBranches('CONV-1', [B], h.component));
      h.open['restoreActiveTasks'] = vi.fn(async () => undefined);

      await call(h, 'onConversationChanged', 'CONV-1');

      expect(h.agentState.startPolling).toHaveBeenCalledWith(expect.anything(), 'CONV-1', BRANCH_SCOPE);
    });
  });

  describe('branch reload', () => {
    function prepareReload(h: Harness, pinsHydrated: boolean): void {
      h.open['branchReloadToken'] = 0;
      h.open['pinsDuringBranchReload'] = null;
      h.open['pinsHydrated'] = pinsHydrated;
      h.open['windowStore'] = {
        ...h.windowStore,
        PinnedTotalCount: 5,
        PinnedDetails: [],
        LoadFailed: false,
        LoadLatest: vi.fn(async () => undefined),
        GetSnapshot: vi.fn(() => ({})),
      };
      h.open['isActiveConversationLoad'] = () => true;
      h.open['isActiveConversation'] = () => true;
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['applyWindowSnapshot'] = vi.fn();
      h.open['loadPeripheralData'] = vi.fn(async () => undefined);
    }

    function reload(h: Harness): Promise<boolean> {
      return call<boolean>(h, 'reloadWindowForBranch');
    }

    it('registers the new branch rows, counts the pins and restarts the poll in the new scope', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);

      expect(await reload(h)).toBe(true);

      expect(h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toEqual(BRANCH_SCOPE);
      expect(h.runView).toHaveBeenCalledTimes(1);
      expect(runViewCall(h, 0)).toMatchObject({ ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.windowStore.SetPinnedCount).toHaveBeenLastCalledWith(3);
      expect(h.agentState.startPolling).toHaveBeenCalledWith(expect.anything(), 'CONV-1', BRANCH_SCOPE);
    });

    it('reloads the open artifact viewer once, after the new branch rows are registered', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);
      const refresh = new Subject<{ artifactId: string; versionNumber: number }>();
      h.open['ArtifactViewerRefresh$'] = refresh;
      h.open['ShowArtifactPanel'] = true;
      h.open['SelectedArtifactId'] = 'ART-1';
      h.open['SelectedVersionNumber'] = 2;
      const detectChanges = (h.open['cdr'] as { detectChanges: ReturnType<typeof vi.fn> }).detectChanges;
      const seen: Array<{ Request: { artifactId: string; versionNumber: number }; Scope: ConversationScope | null; Rendered: boolean }> = [];
      refresh.subscribe(request => seen.push({
        Request: request,
        Scope: h.component.ArtifactViewerScope,
        Rendered: detectChanges.mock.calls.length > 0,
      }));

      expect(await reload(h)).toBe(true);

      expect(seen).toEqual([{ Request: { artifactId: 'ART-1', versionNumber: 2 }, Scope: BRANCH_SCOPE, Rendered: true }]);
    });

    it('asks the artifact viewer for its newest version when no version was selected', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);
      const refresh = new Subject<{ artifactId: string; versionNumber: number }>();
      h.open['ArtifactViewerRefresh$'] = refresh;
      h.open['ShowArtifactPanel'] = true;
      h.open['SelectedArtifactId'] = 'ART-1';
      h.open['SelectedVersionNumber'] = undefined;
      const requests: Array<{ artifactId: string; versionNumber: number }> = [];
      refresh.subscribe(request => requests.push(request));

      await reload(h);

      expect(requests).toEqual([{ artifactId: 'ART-1', versionNumber: 0 }]);
    });

    it('does not reload the artifact viewer when its pane is closed', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);
      const refresh = new Subject<{ artifactId: string; versionNumber: number }>();
      h.open['ArtifactViewerRefresh$'] = refresh;
      h.open['ShowArtifactPanel'] = false;
      h.open['SelectedArtifactId'] = 'ART-1';
      const requests: Array<{ artifactId: string; versionNumber: number }> = [];
      refresh.subscribe(request => requests.push(request));

      await reload(h);

      expect(requests).toEqual([]);
    });

    it('reads the loaded pins panel rows again in the new scope', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, true);

      expect(await reload(h)).toBe(true);

      const hydrate = h.runView.mock.calls.map(c => c[0] as RunViewCall).find(p => p.ResultType === 'entity_object');
      expect(hydrate?.ExtraFilter).toBe(BRANCH_PIN_FILTER);
    });
  });

  describe('branch row registration', () => {
    function register(h: Harness, rows: ConversationBranchRow[]): void {
      (h.open['registerBranchRows'] as (id: string, r: ConversationBranchRow[]) => void).call(h.component, 'CONV-1', rows);
    }

    function reset(h: Harness): void {
      (h.open['resetConversationScopedViewState'] as () => void).call(h.component);
    }

    /** Runs the real ngOnDestroy against stubs for the members it touches besides the rows. */
    function destroy(h: Harness): void {
      h.open['destroy$'] = new Subject<void>();
      h.open['clearTurnTracking'] = vi.fn();
      vi.stubGlobal('window', { removeEventListener: vi.fn() });
      try {
        h.component.ngOnDestroy();
      } finally {
        vi.unstubAllGlobals();
      }
    }

    it('registers the rows with the chat area as their owner', () => {
      const h = createHarness('BRANCH-B');
      const setBranches = vi.spyOn(h.scopeService, 'SetBranches');

      register(h, [B]);

      expect(setBranches).toHaveBeenCalledWith('CONV-1', [B], h.component);
    });

    it('clears the registered branch rows when the conversation changes', () => {
      const h = createHarness('BRANCH-B');
      register(h, [B]);
      expect(h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toEqual(BRANCH_SCOPE);

      reset(h);

      expect(() => h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
    });

    it('keeps the rows another chat area registered for the same conversation when it clears', () => {
      const other = createHarness('BRANCH-B');
      const h = createHarness('BRANCH-B');
      h.open['scopeService'] = other.scopeService;
      register(h, [B]);
      register(other, [B]);

      reset(h);

      expect(other.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toEqual(BRANCH_SCOPE);
      reset(other);
      expect(() => other.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
    });

    it('clears its own rows when destroyed', () => {
      const h = createHarness('BRANCH-B');
      register(h, [B]);

      destroy(h);

      expect(() => h.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toThrow();
      expect(h.agentState.stopPolling).toHaveBeenCalled();
    });

    it('keeps the rows another chat area registered when destroyed', () => {
      const other = createHarness('BRANCH-B');
      const h = createHarness('BRANCH-B');
      h.open['scopeService'] = other.scopeService;
      register(h, [B]);
      register(other, [B]);

      destroy(h);

      expect(other.scopeService.ForConversation('CONV-1', 'BRANCH-B')).toEqual(BRANCH_SCOPE);
    });
  });
});
