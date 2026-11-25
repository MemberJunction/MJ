/**
 * Memory-leak audit Round 22: async task loads that settle AFTER the component is destroyed must not
 * re-arm a polling interval.
 *
 * - `TasksFullViewComponent.LoadTasks()` always ran `updateLivePollingState()` from its `finally`.
 *   With an active workflow and the timer already cleared by `ngOnDestroy`, that started a fresh 4 s
 *   `setInterval(() => LoadTasks())` nothing ever cleared, pinning the destroyed view for the session.
 * - `MessageItemComponent.loadTasks()` restarted its 1 s elapsed-time interval after its `await` the
 *   same way, calling `detectChanges()` on a destroyed view forever.
 *
 * Built via `Object.create(prototype)` with stubbed collaborators, matching the other suites here.
 */
import '@angular/compiler'; // JIT support — the component modules evaluate Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { TasksFullViewComponent } from '../lib/components/task/tasks-full-view.component';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

const USER = { ID: 'user-1' } as unknown as UserInfo;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function okResult(rows: object[]): RunViewResult {
  return {
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
    UserViewRunID: '',
  } as RunViewResult;
}

/** Points `RunView.FromMetadataProvider` at a RunView whose single call resolves when the test says so. */
function stallRunView(): Deferred<RunViewResult> {
  const pending = deferred<RunViewResult>();
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(() => pending.promise),
  } as Partial<RunView> as RunView);
  return pending;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TasksFullViewComponent live polling after destroy', () => {
  function createView(): { view: TasksFullViewComponent; open: Record<string, unknown> } {
    const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
    const open = view as unknown as Record<string, unknown>;
    Object.assign(open, {
      Provider: {} as IMetadataProvider,
      CurrentUser: USER,
      BaseFilter: "Status='Running'",
      aiEngineConfigured: true,
      AllTasks: [],
      FilteredTasks: [],
      WorkflowGroups: [],
      livePollTimer: null,
      isLoadingTasks: false,
      pendingReload: false,
      isDestroyed: false,
      streamSubscription: null,
      cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() },
      loadChildTasksAndDependencies: vi.fn(async () => undefined),
      // An active workflow is what makes updateLivePollingState() want a poller.
      rebuildWorkflowCommandCenter: vi.fn(() => {
        open.WorkflowGroups = [{ NormalizedCategory: 'active' }];
      }),
    });
    return { view, open };
  }

  it('a load still in flight when the view is destroyed does not start a new poller', async () => {
    vi.useFakeTimers();
    const pending = stallRunView();
    const { view, open } = createView();

    const load = view.LoadTasks();
    view.ngOnDestroy();
    pending.resolve(okResult([{ ID: 'task-1' }]));
    await load;

    expect(open.livePollTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still starts the poller while the view is alive and a workflow is active', async () => {
    vi.useFakeTimers();
    const pending = stallRunView();
    const { view, open } = createView();

    const load = view.LoadTasks();
    pending.resolve(okResult([{ ID: 'task-1' }]));
    await load;

    expect(open.livePollTimer).not.toBeNull();
    view.ngOnDestroy();
    expect(open.livePollTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('LoadTasks is a no-op once destroyed', async () => {
    const fromProvider = vi.spyOn(RunView, 'FromMetadataProvider');
    const { view } = createView();
    view.ngOnDestroy();

    await view.LoadTasks();

    expect(fromProvider).not.toHaveBeenCalled();
  });
});

describe('MessageItemComponent elapsed-time interval after destroy', () => {
  function createItem(): { item: MessageItemComponent; open: Record<string, unknown> } {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const open = item as unknown as Record<string, unknown>;
    Object.assign(open, {
      Provider: {} as IMetadataProvider,
      CurrentUser: USER,
      message: { ID: 'msg-1', ParentID: null, Status: 'Complete', Role: 'AI' },
      DetailTasks: [],
      _elapsedTimeInterval: null,
      _isDestroyed: false,
      _tasksLoadInFlight: false,
      _tasksReloadQueued: false,
      _taskGraphSub: null,
      _stopRetryTimer: null,
      cdRef: { markForCheck: vi.fn(), detectChanges: vi.fn() },
      updateTimers: vi.fn(),
      computeWorkflowElapsedFormatted: vi.fn(() => '0:01'),
      disconnectMessageTextResizeObserver: vi.fn(),
      clearStopRetryTimer: vi.fn(),
    });
    // An active workflow task is what makes loadTasks() (re)start the interval.
    Object.defineProperty(item, 'HasActiveWorkflowTasks', { get: () => true, configurable: true });
    return { item, open };
  }

  it('a task load that settles after destroy does not restart the interval', async () => {
    vi.useFakeTimers();
    const pending = stallRunView();
    const { item, open } = createItem();

    const load = (item as unknown as { loadTasks(): Promise<void> }).loadTasks();
    item.ngOnDestroy();
    pending.resolve(okResult([{ ID: 'task-1', ConversationDetailID: 'msg-1', Status: 'In Progress' }]));
    await load;

    expect(open._elapsedTimeInterval).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts the interval for an active workflow while the row is alive', async () => {
    vi.useFakeTimers();
    const pending = stallRunView();
    const { item, open } = createItem();

    const load = (item as unknown as { loadTasks(): Promise<void> }).loadTasks();
    pending.resolve(okResult([{ ID: 'task-1', ConversationDetailID: 'msg-1', Status: 'In Progress' }]));
    await load;

    expect(open._elapsedTimeInterval).not.toBeNull();
    item.ngOnDestroy();
    expect(open._elapsedTimeInterval).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
