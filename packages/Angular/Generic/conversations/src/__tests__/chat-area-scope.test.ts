// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW } from '../lib/utils/conversation-forks';

/**
 * The chat area's conversation reads use the scope of the open view's path: the pin count and the
 * pins panel, the most recent component artifact, and the agent-run poll. The scope is built from
 * the chat area's own fork rows: a conversation change clears them, and another chat area on the
 * same conversation never reads, replaces or clears them. A view reload refreshes an open artifact
 * viewer in the new scope.
 *
 * Built via `Object.create(prototype)` so the real methods run against stubbed collaborators,
 * matching `chat-area-open-view.test.ts`.
 */

const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: 'alt' };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };
const TRUNK_PIN_FILTER = `[ConversationID]='CONV-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL AND [IsPinned]=1`;
const BRANCH_PIN_FILTER = `${ConversationEngine.LiveRowsFilter(ConversationEngine.ScopeFilter(BRANCH_SCOPE))} AND [IsPinned]=1`;
const TRUNK_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: null, Branches: [] };

interface RunViewCall {
  EntityName: string;
  ExtraFilter: string;
  ResultType: string;
}

interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  runView: ReturnType<typeof vi.fn>;
  windowStore: { SetPinnedCount: ReturnType<typeof vi.fn>; SetPinnedDetails: ReturnType<typeof vi.fn> };
  agentState: { startPolling: ReturnType<typeof vi.fn>; stopPolling: ReturnType<typeof vi.fn> };
}

function createHarness(forkId: string | null): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const runView = vi.fn(async () => ({ Success: true, Results: [], TotalRowCount: 3 }));
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
  const windowStore = { SetPinnedCount: vi.fn(), SetPinnedDetails: vi.fn() };
  const agentState = { startPolling: vi.fn(), stopPolling: vi.fn() };

  open['_conversationId'] = 'CONV-1';
  open['openView'] = forkId ? { Kind: 'Fork', BranchID: forkId } : MAIN_OPEN_VIEW;
  open['CurrentUser'] = { ID: 'USER-1' };
  open['windowStore'] = windowStore;
  open['agentStateService'] = agentState;
  open['conversationLoadToken'] = 1;
  open['scopeFallbackLogged'] = null;
  open['cdr'] = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  open['loadForkSummaries'] = vi.fn(async () => undefined);

  return { component, open, runView, windowStore, agentState };
}

/** Gives the chat area fork rows of CONV-1, as its loaders do. */
function setRows(h: Harness, rows: ConversationBranchRow[]): void {
  (h.open['setBranchRows'] as (id: string, r: ConversationBranchRow[]) => void).call(h.component, 'CONV-1', rows);
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
      setRows(h, [B]);

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
      setRows(h, [B]);

      await call(h, 'hydratePinnedMessages', 'CONV-1');

      expect(runViewCall(h, 0)).toMatchObject({ EntityName: 'MJ: Conversation Details', ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'entity_object' });
      expect(h.windowStore.SetPinnedDetails).toHaveBeenCalledWith([]);
    });

    it('loads the pins panel rows on the trunk with the trunk predicate', async () => {
      const h = createHarness(null);

      await call(h, 'hydratePinnedMessages', 'CONV-1');

      expect(runViewCall(h, 0).ExtraFilter).toBe(TRUNK_PIN_FILTER);
    });

    it('keeps the branch rows before it counts the pins on open', async () => {
      const h = createHarness('BRANCH-B');
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['isActiveConversationLoad'] = () => true;

      const rows = await call<ConversationBranchRow[]>(h, 'loadBranchesAndPinCount', 'CONV-1', 1);

      expect(rows).toEqual([B]);
      expect(runViewCall(h, 0).ExtraFilter).toBe(BRANCH_PIN_FILTER);
      expect(h.component.ExportScope).toEqual(BRANCH_SCOPE);
    });

    it('does not keep rows or count pins for a conversation load that is no longer current', async () => {
      const h = createHarness('BRANCH-B');
      h.open['loadBranchesOrEmpty'] = vi.fn(async () => [B]);
      h.open['isActiveConversationLoad'] = () => false;

      await call(h, 'loadBranchesAndPinCount', 'CONV-1', 1);

      expect(h.runView).not.toHaveBeenCalled();
      expect(h.open['branches']).toBeUndefined();
      expect(h.component.ExportScope).toEqual(TRUNK_SCOPE);
    });
  });

  describe('conversation load', () => {
    it('keeps the branch rows before the pin count runs', async () => {
      const h = createHarness('BRANCH-B');
      const keep = vi.spyOn(h.open as { setBranchRows: (id: string, r: ConversationBranchRow[]) => void }, 'setBranchRows');
      const loadLatest = vi.fn(async () => undefined);
      h.open['windowStore'] = {
        ...h.windowStore,
        LoadLatest: loadLatest,
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
      expect(keep).toHaveBeenCalledWith('CONV-1', [B]);
      expect(h.runView).toHaveBeenCalledTimes(1);
      expect(keep.mock.invocationCallOrder[0]).toBeLessThan(h.runView.mock.invocationCallOrder[0]);
      expect(runViewCall(h, 0)).toMatchObject({ ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.windowStore.SetPinnedCount).toHaveBeenCalledWith(3);
      expect(loadLatest).toHaveBeenCalledWith('CONV-1', { ID: 'USER-1' }, 'BRANCH-B');
    });
  });

  describe('most recent component artifact', () => {
    it('reads the details of the current branch path', async () => {
      const h = createHarness('BRANCH-B');
      setRows(h, [B]);

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
    it("reads Main and warns once when the open fork's rows are not loaded", async () => {
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
      h.open['loadMessages'] = vi.fn(async () => setRows(h, [B]));
      h.open['restoreActiveTasks'] = vi.fn(async () => undefined);

      await call(h, 'onConversationChanged', 'CONV-1');

      expect(h.agentState.startPolling).toHaveBeenCalledWith(expect.anything(), 'CONV-1', BRANCH_SCOPE);
    });
  });

  describe('view reload', () => {
    function prepareReload(h: Harness, pinsHydrated: boolean): void {
      h.open['viewReloadToken'] = 0;
      h.open['pinsDuringViewReload'] = null;
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
      h.open['loadBranchesOrNull'] = vi.fn(async () => [B]);
      h.open['applyWindowSnapshot'] = vi.fn();
      h.open['loadPeripheralData'] = vi.fn(async () => undefined);
    }

    function reload(h: Harness): Promise<boolean> {
      return call<boolean>(h, 'reloadWindowForView');
    }

    it('keeps the new branch rows, counts the pins and restarts the poll in the new scope', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);

      expect(await reload(h)).toBe(true);

      expect(h.component.ExportScope).toEqual(BRANCH_SCOPE);
      expect(h.runView).toHaveBeenCalledTimes(1);
      expect(runViewCall(h, 0)).toMatchObject({ ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.windowStore.SetPinnedCount).toHaveBeenLastCalledWith(3);
      expect(h.agentState.startPolling).toHaveBeenCalledWith(expect.anything(), 'CONV-1', BRANCH_SCOPE);
    });

    it('loads the newest page of the open fork path, as in Main', async () => {
      type Loads = { LoadLatest: ReturnType<typeof vi.fn> };
      const fork = createHarness('BRANCH-B');
      prepareReload(fork, false);
      expect(await reload(fork)).toBe(true);
      expect((fork.open['windowStore'] as Loads).LoadLatest).toHaveBeenCalledWith('CONV-1', { ID: 'USER-1' }, 'BRANCH-B');

      const main = createHarness(null);
      prepareReload(main, false);
      expect(await reload(main)).toBe(true);
      expect((main.open['windowStore'] as Loads).LoadLatest).toHaveBeenCalledWith('CONV-1', { ID: 'USER-1' }, null);
    });

    it('reloads the open artifact viewer once, after the new branch rows are kept', async () => {
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

    it('keeps the earlier fork rows and the fork scope when the fork rows cannot be read', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, false);
      setRows(h, [B]);
      delete h.open['loadBranchesOrNull'];
      const read = vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockRejectedValue(new Error('offline'));

      expect(await reload(h)).toBe(true);

      expect(read).toHaveBeenCalledWith('CONV-1', expect.anything(), undefined);
      expect(h.open['branches']).toEqual([B]);
      expect(h.component.ExportScope).toEqual(BRANCH_SCOPE);
      expect(runViewCall(h, 0)).toMatchObject({ ExtraFilter: BRANCH_PIN_FILTER, ResultType: 'count_only' });
      expect(h.agentState.startPolling).toHaveBeenCalledWith(expect.anything(), 'CONV-1', BRANCH_SCOPE);
      expect(warn).not.toHaveBeenCalled();
    });

    it('reads the loaded pins panel rows again in the new scope', async () => {
      const h = createHarness('BRANCH-B');
      prepareReload(h, true);

      expect(await reload(h)).toBe(true);

      const hydrate = h.runView.mock.calls.map(c => c[0] as RunViewCall).find(p => p.ResultType === 'entity_object');
      expect(hydrate?.ExtraFilter).toBe(BRANCH_PIN_FILTER);
    });
  });

  describe('branch rows', () => {
    function reset(h: Harness): void {
      (h.open['resetConversationScopedViewState'] as () => void).call(h.component);
    }

    it('builds the open fork scope from its own rows', () => {
      const h = createHarness('BRANCH-B');

      setRows(h, [B]);

      expect(h.component.ExportScope).toEqual(BRANCH_SCOPE);
      expect(h.component.ArtifactViewerScope).toEqual(BRANCH_SCOPE);
    });

    it('does not use rows of another conversation', () => {
      const h = createHarness('BRANCH-B');
      (h.open['setBranchRows'] as (id: string, r: ConversationBranchRow[]) => void).call(h.component, 'CONV-2', [B]);

      expect(h.component.ExportScope).toEqual(TRUNK_SCOPE);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('clears its rows when the conversation changes', () => {
      const h = createHarness('BRANCH-B');
      setRows(h, [B]);

      reset(h);

      expect(h.open['branches']).toEqual([]);
      expect(h.open['branchRowsConversationId']).toBeNull();
    });

    it('stops the agent-run poll when destroyed', () => {
      const h = createHarness('BRANCH-B');
      setRows(h, [B]);

      destroy(h);

      expect(h.agentState.stopPolling).toHaveBeenCalled();
    });
  });

  describe('two chat areas on one conversation', () => {
    const C: ConversationBranchRow = { ID: 'BRANCH-C', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 1, Name: 'other' };

    /** Loads the fork rows the way the chat area does on a refresh, with the read stubbed. */
    async function loadRows(h: Harness, rows: ConversationBranchRow[]): Promise<void> {
      h.open['loadBranchesOrNull'] = vi.fn(async () => rows);
      h.open['isActiveConversation'] = () => true;
      await h.component.RefreshForkSummaries();
    }

    it("keeps the other chat area's fork scope when the one that loaded rows last is destroyed", async () => {
      const first = createHarness('BRANCH-B');
      const second = createHarness('BRANCH-B');
      await loadRows(first, [B]);
      await loadRows(second, [B]);

      destroy(second);

      expect(first.component.ExportScope).toEqual(BRANCH_SCOPE);
      expect(first.component.ArtifactViewerScope).toEqual(BRANCH_SCOPE);
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps the other chat area's fork scope when one changes conversation", async () => {
      const first = createHarness('BRANCH-B');
      const second = createHarness('BRANCH-B');
      await loadRows(first, [B]);
      await loadRows(second, [B]);

      (second.open['resetConversationScopedViewState'] as () => void).call(second.component);

      expect(first.component.ExportScope).toEqual(BRANCH_SCOPE);
    });

    it("does not replace the other chat area's rows when one loads different rows", async () => {
      const first = createHarness('BRANCH-B');
      const second = createHarness('BRANCH-C');
      await loadRows(first, [B]);
      await loadRows(second, [C]);

      expect(first.component.ExportScope).toEqual(BRANCH_SCOPE);
      expect(second.component.ExportScope).toEqual({ ConversationID: 'CONV-1', BranchID: 'BRANCH-C', Branches: [C] });
    });
  });
});
