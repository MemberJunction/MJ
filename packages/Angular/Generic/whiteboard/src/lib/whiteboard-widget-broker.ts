import type { WhiteboardToolJSONValue } from './whiteboard-tools';
import {
  BuildWidgetCommandMessage, WHITEBOARD_WIDGET_AGENT_WINDOW_MS, WHITEBOARD_WIDGET_DEADLINES_MS,
  WhiteboardWidgetActionInfo, WhiteboardWidgetCommandOp, WhiteboardWidgetErrorCode, WhiteboardWidgetReply,
  WhiteboardWidgetTarget
} from './whiteboard-widget-protocol';

/** What the broker needs from the board it serves. */
export interface WhiteboardWidgetBrokerHost {
  /**
   * Keep the item's frame mounted while a command needs it. With `reveal`, also bring it
   * into view (only when it is off-screen); without, never move the viewport. Calls nest:
   * every call is matched by one {@link ReleaseMount}.
   */
  RequestMount(itemId: string, reveal: boolean): void;
  /** Release one {@link RequestMount}. */
  ReleaseMount(itemId: string): void;
  /** Stored state to hand a widget when it reports ready (`null` = none). Optional. */
  GetRestoreState?(itemId: string): string | null;
  /** A widget's registered actions changed (on a new document's ready, or when the list differs from the last one). Optional. */
  ActionsChanged?(itemId: string, actions: WhiteboardWidgetActionInfo[]): void;
  /** A widget saved state (only accepted after its restore was delivered). Optional. */
  StateChanged?(itemId: string, stateJson: string): void;
}

/** One request to {@link WhiteboardWidgetBroker.Send}. */
export interface WhiteboardWidgetCommandRequest {
  /** Target widget item ID. */
  ItemID: string;
  /** Operation. */
  Op: Exclude<WhiteboardWidgetCommandOp, 'hello' | 'restoreState'>;
  /** Operation arguments. */
  Args: WhiteboardToolJSONValue;
  /** Bring the widget into view if it is off-screen (operate / call). Default false. */
  Reveal?: boolean;
  /** True when an agent issued this command (opens the agent window). Default false. */
  ByAgent?: boolean;
  /** Override the op's default deadline (ms). */
  DeadlineMs?: number;
}

/** What {@link WhiteboardWidgetBroker.Send} resolves to. */
export type WhiteboardWidgetCommandOutcome =
  | { Ok: true; Result: WhiteboardToolJSONValue | null }
  | { Ok: false; Code: WhiteboardWidgetErrorCode; Error: string };

/** Options for {@link WhiteboardWidgetBroker}. */
export interface WhiteboardWidgetBrokerOptions {
  /** Per-op deadlines (ms). Defaults to {@link WHITEBOARD_WIDGET_DEADLINES_MS}. */
  DeadlinesMs?: Partial<Record<WhiteboardWidgetCommandOp, number>>;
  /** Agent-window tail (ms). Defaults to {@link WHITEBOARD_WIDGET_AGENT_WINDOW_MS}. */
  AgentWindowMs?: number;
  /** Clock (tests). Defaults to `Date.now`. */
  Now?: () => number;
}

interface WidgetEntry {
  Target: WhiteboardWidgetTarget;
  Generation: number;
  DocumentToken: string | null;
  Ready: boolean;
  Restored: boolean;
  Actions: WhiteboardWidgetActionInfo[];
  HasState: boolean;
}

interface PendingCommand {
  ItemID: string;
  Target: WhiteboardWidgetTarget;
  Generation: number;
  Settle: (outcome: WhiteboardWidgetCommandOutcome) => void;
}

interface AgentWindow {
  Active: number;
  EndedAt: number;
}

/** True when two action lists name the same actions with the same descriptions, in order. */
export function SameWhiteboardWidgetActions(a: readonly WhiteboardWidgetActionInfo[], b: readonly WhiteboardWidgetActionInfo[]): boolean {
  return a.length === b.length && a.every((action, i) => action.Name === b[i].Name && (action.Description ?? '') === (b[i].Description ?? ''));
}

/** A failure outcome. */
function failure(code: WhiteboardWidgetErrorCode, error: string): WhiteboardWidgetCommandOutcome {
  return { Ok: false, Code: code, Error: error };
}

/**
 * LIVE WHITEBOARD — the host-side REQUEST/REPLY broker for sandboxed HTML widgets.
 *
 * Angular-free. The board component feeds it what it observes (frames mounting and
 * unmounting, validated ready / actions / state / reply messages, content reloads) and
 * supplies a {@link WhiteboardWidgetBrokerHost} for the few things only the board can do
 * (mount or reveal an item). Callers ask for work with {@link WhiteboardWidgetBroker.Send}
 * and always get an outcome back, never an exception.
 *
 * Guarantees:
 *  - **One deadline per call, measured from enqueue.** Queue wait, mount, the ready
 *    handshake and the operation all count, so a call never outlives
 *    {@link WHITEBOARD_WIDGET_DEADLINES_MS} for its op.
 *  - **Per-widget serialization.** Commands to one widget run one at a time, in order;
 *    different widgets run in parallel.
 *  - **Generations.** A widget's document can reload in place (a new `srcdoc` keeps the
 *    same window object), so every ready carries a per-document token. A new token, a
 *    content reload or an unmount fails the in-flight command with a specific code, and a
 *    reply is only accepted from the window it was sent to, for its pending id, in the
 *    generation it was sent in.
 *  - **Missed-ready recovery.** A mounted frame that never reported ready gets one `hello`.
 *  - **Agent window.** While an agent command runs, and for
 *    {@link WHITEBOARD_WIDGET_AGENT_WINDOW_MS} after, {@link IsAgentWindowOpen} is true;
 *    the board uses it as the host-side gate on `agent` tags the frame reports.
 */
export class WhiteboardWidgetBroker {
  private readonly host: WhiteboardWidgetBrokerHost;
  private readonly deadlines: Record<WhiteboardWidgetCommandOp, number>;
  private readonly agentWindowMs: number;
  private readonly now: () => number;

  private readonly entries = new Map<string, WidgetEntry>();
  private readonly mounted = new Map<string, WhiteboardWidgetTarget>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly readyWaiters = new Map<string, Set<() => void>>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly agentWindows = new Map<string, AgentWindow>();
  private generationSeq = 0;
  private commandSeq = 0;
  private disposed = false;

  constructor(host: WhiteboardWidgetBrokerHost, options: WhiteboardWidgetBrokerOptions = {}) {
    this.host = host;
    this.deadlines = { ...WHITEBOARD_WIDGET_DEADLINES_MS, ...(options.DeadlinesMs ?? {}) };
    this.agentWindowMs = options.AgentWindowMs ?? WHITEBOARD_WIDGET_AGENT_WINDOW_MS;
    this.now = options.Now ?? (() => Date.now());
  }

  // ─────────────────────────────────────────────── commands

  /**
   * Run one command against a widget. Always resolves (never rejects): either the
   * widget's result or a failure with a {@link WhiteboardWidgetErrorCode} and a message
   * the model can act on.
   */
  public Send(request: WhiteboardWidgetCommandRequest): Promise<WhiteboardWidgetCommandOutcome> {
    if (this.disposed) {
      return Promise.resolve(failure('widget_unmounted', 'The whiteboard is closing.'));
    }
    const deadline = request.DeadlineMs ?? this.deadlines[request.Op];
    return new Promise<WhiteboardWidgetCommandOutcome>((resolve) => {
      const run = new CommandRun(this.ports, request, deadline, resolve);
      this.enqueue(request.ItemID, () => run.Start());
    });
  }

  /** The actions a widget currently offers (empty when unknown or not ready). */
  public GetActions(itemId: string): WhiteboardWidgetActionInfo[] {
    return this.entries.get(itemId)?.Actions ?? [];
  }

  /** True when the widget's helper has reported ready and nothing has invalidated it since. */
  public IsReady(itemId: string): boolean {
    return this.entries.get(itemId)?.Ready === true;
  }

  /**
   * True while an agent command for this widget is running, or ended within the agent
   * window. The board accepts a frame's `agent` tag only while this holds.
   */
  public IsAgentWindowOpen(itemId: string): boolean {
    const agentWindow = this.agentWindows.get(itemId);
    if (!agentWindow) {
      return false;
    }
    return agentWindow.Active > 0 || this.now() - agentWindow.EndedAt <= this.agentWindowMs;
  }

  // ─────────────────────────────────────────────── what the board observes

  /** A frame for `itemId` was rendered (or replaced by a new frame). */
  public OnMounted(itemId: string, target: WhiteboardWidgetTarget): void {
    const previous = this.mounted.get(itemId);
    if (previous === target) {
      return;
    }
    if (previous) {
      this.invalidate(itemId, 'widget_unmounted', 'The widget was re-created while the command ran. Try again.');
    }
    this.mounted.set(itemId, target);
  }

  /** The frame for `itemId` was removed from the DOM. */
  public OnUnmounted(itemId: string): void {
    if (!this.mounted.delete(itemId)) {
      return;
    }
    this.invalidate(itemId, 'widget_unmounted', 'The widget left the screen while the command ran. Try again.');
  }

  /** The item's HTML is being replaced; its document will reload. */
  public OnContentReloading(itemId: string): void {
    const entry = this.entries.get(itemId);
    if (!entry) {
      return;
    }
    entry.Ready = false;
    entry.DocumentToken = null;
    this.failInFlight(itemId, 'widget_reloaded', 'The widget reloaded (its content changed) while the command ran. Inspect it again.');
  }

  /** A validated ready message arrived from `target`. */
  public OnReady(
    itemId: string,
    target: WhiteboardWidgetTarget,
    documentToken: string,
    actions: WhiteboardWidgetActionInfo[],
    hasState: boolean
  ): void {
    if (this.disposed) {
      return;
    }
    this.mounted.set(itemId, target);
    const existing = this.entries.get(itemId);
    const sameDocument = existing !== undefined && existing.Target === target && existing.DocumentToken === documentToken;
    let actionsChanged = true;
    if (sameDocument) {
      actionsChanged = !SameWhiteboardWidgetActions(existing.Actions, actions);
      existing.Ready = true;
      existing.Actions = actions;
      existing.HasState = hasState;
    }
    else {
      if (existing) {
        this.failInFlight(itemId, 'widget_reloaded', 'The widget reloaded while the command ran. Inspect it again.');
      }
      this.entries.set(itemId, {
        Target: target, Generation: ++this.generationSeq, DocumentToken: documentToken,
        Ready: true, Restored: false, Actions: actions, HasState: hasState
      });
      this.deliverRestore(itemId);
    }
    if (actionsChanged) {
      this.host.ActionsChanged?.(itemId, actions);
    }
    this.wakeReadyWaiters(itemId);
  }

  /** A validated actions message arrived. Reported to the host only when the list changed. */
  public OnActions(itemId: string, target: WhiteboardWidgetTarget, actions: WhiteboardWidgetActionInfo[]): void {
    const entry = this.entries.get(itemId);
    if (!entry || entry.Target !== target || SameWhiteboardWidgetActions(entry.Actions, actions)) {
      return;
    }
    entry.Actions = actions;
    this.host.ActionsChanged?.(itemId, actions);
  }

  /**
   * A validated state message arrived. Accepted only after the widget's restore was
   * delivered, so a widget that writes defaults at load can't clobber saved state. When the
   * message names its document (`documentToken`), it must be the widget's CURRENT document:
   * a save from a document that has since reloaded (or is reloading) is dropped. Returns
   * whether it was accepted.
   */
  public OnState(itemId: string, target: WhiteboardWidgetTarget, stateJson: string, documentToken?: string): boolean {
    const entry = this.entries.get(itemId);
    if (!entry || entry.Target !== target || !entry.Restored) {
      return false;
    }
    if (documentToken !== undefined && documentToken !== entry.DocumentToken) {
      return false;
    }
    this.host.StateChanged?.(itemId, stateJson);
    return true;
  }

  /**
   * A validated reply arrived from `target`. Returns whether it matched a pending command
   * (same window, pending id, current generation); anything else is ignored.
   */
  public OnReply(itemId: string, target: WhiteboardWidgetTarget, reply: WhiteboardWidgetReply): boolean {
    const pending = this.pending.get(reply.ID);
    const entry = this.entries.get(itemId);
    if (!pending || pending.ItemID !== itemId || pending.Target !== target || !entry || entry.Generation !== pending.Generation) {
      return false;
    }
    pending.Settle(reply.Ok
      ? { Ok: true, Result: reply.Result ?? null }
      : failure(reply.Code ?? 'action_failed', reply.Error ?? 'The widget reported a failure.'));
    return true;
  }

  /**
   * Fail everything pending and stop accepting work. Call from the board's `ngOnDestroy`.
   * Every live command settles now with `widget_unmounted`: posted ones through their
   * pending entry, ones waiting for ready when they are woken here, queued ones as they
   * reach the front of their (now fast-draining) queue.
   */
  public Dispose(): void {
    this.disposed = true;
    for (const pending of Array.from(this.pending.values())) {
      pending.Settle(failure('widget_unmounted', 'The whiteboard closed while the command ran.'));
    }
    this.pending.clear();
    for (const itemId of Array.from(this.readyWaiters.keys())) {
      this.wakeReadyWaiters(itemId);
    }
    this.entries.clear();
    this.mounted.clear();
    this.queues.clear();
    this.agentWindows.clear();
  }

  // ─────────────────────────────────────────────── ports handed to CommandRun

  /** The narrow internal surface a {@link CommandRun} drives (keeps the broker's API small). */
  private readonly ports: CommandRunPorts = {
    IsDisposed: () => this.disposed,
    Host: () => this.host,
    ReadyEntry: (itemId) => {
      const entry = this.entries.get(itemId);
      return entry?.Ready ? { Target: entry.Target, Generation: entry.Generation } : null;
    },
    MountedTarget: (itemId) => this.mounted.get(itemId) ?? null,
    WaitForReady: (itemId, wake) => this.waitForReady(itemId, wake),
    PostCommand: (itemId, target, generation, op, args, settle) => {
      const id = `wbc-${++this.commandSeq}-${Math.random().toString(36).slice(2, 10)}`;
      this.pending.set(id, { ItemID: itemId, Target: target, Generation: generation, Settle: settle });
      this.safePost(target, id, op, args);
      return id;
    },
    PostHello: (target) => this.safePost(target, `wbh-${++this.commandSeq}`, 'hello', null),
    ForgetPending: (id) => {
      this.pending.delete(id);
    },
    MarkAgentCommand: (itemId, active) => this.markAgentCommand(itemId, active)
  };

  // ─────────────────────────────────────────────── private

  /** Chain `start` behind the item's queue; `start` resolves when the command settles. */
  private enqueue(itemId: string, start: () => Promise<void>): void {
    const previous = this.queues.get(itemId) ?? Promise.resolve();
    const mine = previous.then(start, start);
    this.queues.set(itemId, mine);
    void mine.then(() => {
      if (this.queues.get(itemId) === mine) {
        this.queues.delete(itemId);
      }
    });
  }

  private waitForReady(itemId: string, wake: () => void): () => void {
    let waiters = this.readyWaiters.get(itemId);
    if (!waiters) {
      waiters = new Set();
      this.readyWaiters.set(itemId, waiters);
    }
    const set = waiters;
    set.add(wake);
    return () => {
      set.delete(wake);
      if (set.size === 0 && this.readyWaiters.get(itemId) === set) {
        this.readyWaiters.delete(itemId);
      }
    };
  }

  private markAgentCommand(itemId: string, active: boolean): void {
    const agentWindow = this.agentWindows.get(itemId) ?? { Active: 0, EndedAt: 0 };
    if (active) {
      agentWindow.Active++;
    }
    else {
      agentWindow.Active = Math.max(0, agentWindow.Active - 1);
      agentWindow.EndedAt = this.now();
    }
    this.agentWindows.set(itemId, agentWindow);
  }

  private deliverRestore(itemId: string): void {
    const entry = this.entries.get(itemId);
    if (!entry) {
      return;
    }
    if (this.host.GetRestoreState) {
      this.safePost(entry.Target, `wbr-${++this.commandSeq}`, 'restoreState', { state: this.host.GetRestoreState(itemId) });
    }
    entry.Restored = true;
  }

  private invalidate(itemId: string, code: WhiteboardWidgetErrorCode, error: string): void {
    this.entries.delete(itemId);
    this.failInFlight(itemId, code, error);
  }

  private failInFlight(itemId: string, code: WhiteboardWidgetErrorCode, error: string): void {
    for (const pending of Array.from(this.pending.values())) {
      if (pending.ItemID === itemId) {
        pending.Settle(failure(code, error));
      }
    }
  }

  private wakeReadyWaiters(itemId: string): void {
    const waiters = this.readyWaiters.get(itemId);
    if (!waiters) {
      return;
    }
    this.readyWaiters.delete(itemId);
    for (const wake of Array.from(waiters)) {
      wake();
    }
  }

  private safePost(target: WhiteboardWidgetTarget, id: string, op: WhiteboardWidgetCommandOp, args: WhiteboardToolJSONValue): void {
    try {
      // The frame runs in an opaque origin, so there is no origin to name; we address a
      // window object we hold, and the helper accepts commands only from its parent.
      target.postMessage(BuildWidgetCommandMessage(id, op, args), '*');
    }
    catch {
      // A frame torn down mid-post: the deadline or the unmount path reports it.
    }
  }
}

/** Internal broker surface used by {@link CommandRun}. */
interface CommandRunPorts {
  IsDisposed(): boolean;
  Host(): WhiteboardWidgetBrokerHost;
  ReadyEntry(itemId: string): { Target: WhiteboardWidgetTarget; Generation: number } | null;
  MountedTarget(itemId: string): WhiteboardWidgetTarget | null;
  WaitForReady(itemId: string, wake: () => void): () => void;
  PostCommand(
    itemId: string,
    target: WhiteboardWidgetTarget,
    generation: number,
    op: WhiteboardWidgetCommandOp,
    args: WhiteboardToolJSONValue,
    settle: (outcome: WhiteboardWidgetCommandOutcome) => void
  ): string;
  PostHello(target: WhiteboardWidgetTarget): void;
  ForgetPending(id: string): void;
  MarkAgentCommand(itemId: string, active: boolean): void;
}

/**
 * One command's lifecycle: deadline timer, mount request, wait-for-ready (with one
 * `hello`), post, await the reply. Settles exactly once.
 */
class CommandRun {
  private settled = false;
  private posted = false;
  private pendingId: string | null = null;
  private cancelWait: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mountRequested = false;
  private finished!: () => void;

  constructor(
    private readonly broker: CommandRunPorts,
    private readonly request: WhiteboardWidgetCommandRequest,
    private readonly deadlineMs: number,
    private readonly resolve: (outcome: WhiteboardWidgetCommandOutcome) => void
  ) {
    this.timer = setTimeout(() => this.onDeadline(), deadlineMs);
    if (request.ByAgent) {
      broker.MarkAgentCommand(request.ItemID, true);
    }
  }

  /** Begin once this command reaches the front of its widget's queue. */
  public Start(): Promise<void> {
    const done = new Promise<void>((finish) => {
      this.finished = finish;
    });
    if (this.settled) {
      this.finished();
      return done;
    }
    if (this.broker.IsDisposed()) {
      this.settle(failure('widget_unmounted', 'The whiteboard is closing.'));
      return done;
    }
    this.broker.Host().RequestMount(this.request.ItemID, this.request.Reveal === true);
    this.mountRequested = true;
    this.attempt(true);
    return done;
  }

  /** Post if ready; otherwise wait for ready (sending one hello to a mounted frame). */
  private attempt(firstTry: boolean): void {
    if (this.settled) {
      return;
    }
    if (this.broker.IsDisposed()) {
      this.settle(failure('widget_unmounted', 'The whiteboard closed while the command ran.'));
      return;
    }
    const ready = this.broker.ReadyEntry(this.request.ItemID);
    if (ready) {
      this.post(ready.Target, ready.Generation);
      return;
    }
    this.cancelWait = this.broker.WaitForReady(this.request.ItemID, () => {
      this.cancelWait = null;
      this.attempt(false);
    });
    const mountedTarget = firstTry ? this.broker.MountedTarget(this.request.ItemID) : null;
    if (mountedTarget) {
      this.broker.PostHello(mountedTarget);
    }
  }

  private post(target: WhiteboardWidgetTarget, generation: number): void {
    this.posted = true;
    this.pendingId = this.broker.PostCommand(
      this.request.ItemID, target, generation, this.request.Op, this.request.Args,
      (outcome) => this.settle(outcome)
    );
  }

  private onDeadline(): void {
    const seconds = Math.round(this.deadlineMs / 100) / 10;
    if (this.posted) {
      this.settle(failure('widget_timeout', `The widget did not answer within ${seconds}s. It may be busy or broken; try again or rebuild it.`));
    }
    else if (this.broker.ReadyEntry(this.request.ItemID)) {
      // Ready, but the call spent its whole budget queued behind an earlier command to this widget.
      this.settle(failure('widget_busy', `The widget was still handling an earlier command after ${seconds}s. Try again in a moment.`));
    }
    else {
      this.settle(failure('widget_not_ready', `The widget did not become ready within ${seconds}s. It may still be loading or its script failed; try again.`));
    }
  }

  private settle(outcome: WhiteboardWidgetCommandOutcome): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.cancelWait?.();
    this.cancelWait = null;
    if (this.pendingId) {
      this.broker.ForgetPending(this.pendingId);
    }
    if (this.mountRequested) {
      this.broker.Host().ReleaseMount(this.request.ItemID);
    }
    if (this.request.ByAgent) {
      this.broker.MarkAgentCommand(this.request.ItemID, false);
    }
    this.resolve(outcome);
    this.finished?.();
  }
}
