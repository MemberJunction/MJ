import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhiteboardWidgetBroker, WhiteboardWidgetBrokerHost } from '../lib/whiteboard-widget-broker';
import {
  WHITEBOARD_WIDGET_COMMAND_MARKER, WhiteboardWidgetCommandMessage, WhiteboardWidgetTarget
} from '../lib/whiteboard-widget-protocol';

/**
 * The widget request/reply broker: deadlines measured from enqueue, per-widget
 * serialization, generations (same-document repeats vs reloads), hello recovery, mount
 * bookkeeping, restore-before-state, and the agent window.
 */

class FakeFrame implements WhiteboardWidgetTarget {
  public readonly Sent: WhiteboardWidgetCommandMessage[] = [];
  postMessage(message: WhiteboardWidgetCommandMessage): void {
    this.Sent.push(message);
  }
  /** The most recent command of an op. */
  public Last(op: string): WhiteboardWidgetCommandMessage | undefined {
    return [...this.Sent].reverse().find((m) => m.op === op);
  }
}

interface HostLog {
  Mounts: Array<{ ItemID: string; Reveal: boolean }>;
  Releases: string[];
  States: Array<{ ItemID: string; Json: string }>;
}

function makeHost(restore?: (id: string) => string | null): { Host: WhiteboardWidgetBrokerHost; Log: HostLog } {
  const log: HostLog = { Mounts: [], Releases: [], States: [] };
  const host: WhiteboardWidgetBrokerHost = {
    RequestMount: (itemId, reveal) => log.Mounts.push({ ItemID: itemId, Reveal: reveal }),
    ReleaseMount: (itemId) => log.Releases.push(itemId),
    StateChanged: (itemId, json) => log.States.push({ ItemID: itemId, Json: json })
  };
  if (restore) {
    host.GetRestoreState = restore;
  }
  return { Host: host, Log: log };
}

/** Let queued promise continuations run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('WhiteboardWidgetBroker', () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
  });
  afterEach(() => vi.useRealTimers());

  function makeBroker(restore?: (id: string) => string | null) {
    const { Host, Log } = makeHost(restore);
    const broker = new WhiteboardWidgetBroker(Host, { Now: () => now });
    return { broker, Log };
  }

  it('posts to a ready widget and resolves with its reply', async () => {
    const { broker, Log } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    const cmd = frame.Last('inspect')!;
    expect(cmd[WHITEBOARD_WIDGET_COMMAND_MARKER]).toBe(true);
    expect(broker.OnReply('html-1', frame, { ID: cmd.id, Ok: true, Result: { outline: 'o' } })).toBe(true);
    await expect(outcome).resolves.toEqual({ Ok: true, Result: { outline: 'o' } });
    expect(Log.Mounts).toEqual([{ ItemID: 'html-1', Reveal: false }]);
    expect(Log.Releases).toEqual(['html-1']);
  });

  it('maps a failed reply to its code, defaulting to action_failed', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const a = broker.Send({ ItemID: 'html-1', Op: 'operate', Args: null });
    await flush();
    broker.OnReply('html-1', frame, { ID: frame.Last('operate')!.id, Ok: false, Error: 'nope', Code: 'stale_ref' });
    await expect(a).resolves.toEqual({ Ok: false, Code: 'stale_ref', Error: 'nope' });
    const b = broker.Send({ ItemID: 'html-1', Op: 'call', Args: null });
    await flush();
    broker.OnReply('html-1', frame, { ID: frame.Last('call')!.id, Ok: false });
    await expect(b).resolves.toMatchObject({ Ok: false, Code: 'action_failed' });
  });

  it('ignores replies from the wrong window, an unknown id, or another item', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    void broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    const id = frame.Last('inspect')!.id;
    expect(broker.OnReply('html-1', new FakeFrame(), { ID: id, Ok: true })).toBe(false);
    expect(broker.OnReply('html-1', frame, { ID: 'forged', Ok: true })).toBe(false);
    expect(broker.OnReply('html-9', frame, { ID: id, Ok: true })).toBe(false);
  });

  it('requests a mount and waits for ready when the widget is not mounted', async () => {
    const { broker, Log } = makeBroker();
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'operate', Args: null, Reveal: true });
    await flush();
    expect(Log.Mounts).toEqual([{ ItemID: 'html-1', Reveal: true }]);
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    await flush();
    broker.OnReply('html-1', frame, { ID: frame.Last('operate')!.id, Ok: true });
    await expect(outcome).resolves.toEqual({ Ok: true, Result: null });
  });

  it('sends one hello to a mounted frame that never reported ready', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnMounted('html-1', frame);
    void broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    expect(frame.Sent.map((m) => m.op)).toEqual(['hello']);
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    await flush();
    expect(frame.Sent.map((m) => m.op)).toEqual(['hello', 'inspect']);
  });

  it('times out as widget_not_ready when ready never comes', async () => {
    const { broker, Log } = makeBroker();
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null, DeadlineMs: 1000 });
    await flush();
    vi.advanceTimersByTime(1000);
    await expect(outcome).resolves.toMatchObject({ Ok: false, Code: 'widget_not_ready' });
    expect(Log.Releases).toEqual(['html-1']);
  });

  it('times out as widget_timeout when the reply never comes', async () => {
    const { broker } = makeBroker();
    broker.OnReady('html-1', new FakeFrame(), 'doc-a', [], false);
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'call', Args: null, DeadlineMs: 500 });
    await flush();
    vi.advanceTimersByTime(500);
    await expect(outcome).resolves.toMatchObject({ Ok: false, Code: 'widget_timeout' });
  });

  it('measures the deadline from enqueue: a call queued behind a slow one still times out on time', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const first = broker.Send({ ItemID: 'html-1', Op: 'call', Args: null, DeadlineMs: 5000 });
    const second = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null, DeadlineMs: 2000 });
    await flush();
    expect(frame.Sent.map((m) => m.op)).toEqual(['call']); // serialized: second waits
    vi.advanceTimersByTime(2000);
    await expect(second).resolves.toMatchObject({ Ok: false, Code: 'widget_not_ready' });
    vi.advanceTimersByTime(3000);
    await expect(first).resolves.toMatchObject({ Ok: false, Code: 'widget_timeout' });
    await flush();
    expect(frame.Sent.map((m) => m.op)).toEqual(['call']); // the expired one is never posted
  });

  it('serializes per widget but runs different widgets in parallel', async () => {
    const { broker } = makeBroker();
    const a = new FakeFrame();
    const b = new FakeFrame();
    broker.OnReady('html-1', a, 'doc-a', [], false);
    broker.OnReady('html-2', b, 'doc-b', [], false);
    const a1 = broker.Send({ ItemID: 'html-1', Op: 'operate', Args: 1 });
    void broker.Send({ ItemID: 'html-1', Op: 'operate', Args: 2 });
    void broker.Send({ ItemID: 'html-2', Op: 'operate', Args: 3 });
    await flush();
    expect(a.Sent.map((m) => m.args)).toEqual([1]);
    expect(b.Sent.map((m) => m.args)).toEqual([3]);
    broker.OnReply('html-1', a, { ID: a.Sent[0].id, Ok: true });
    await a1;
    await flush();
    expect(a.Sent.map((m) => m.args)).toEqual([1, 2]);
  });

  it('a repeated ready from the same document does not disturb an in-flight command', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    broker.OnReady('html-1', frame, 'doc-a', [{ Name: 'next' }], false);
    expect(broker.OnReply('html-1', frame, { ID: frame.Last('inspect')!.id, Ok: true })).toBe(true);
    await expect(outcome).resolves.toMatchObject({ Ok: true });
    expect(broker.GetActions('html-1')).toEqual([{ Name: 'next' }]);
  });

  it('a new document (same window) fails the in-flight command as widget_reloaded and ignores its late reply', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    const id = frame.Last('inspect')!.id;
    broker.OnReady('html-1', frame, 'doc-b', [], false);
    await expect(outcome).resolves.toMatchObject({ Ok: false, Code: 'widget_reloaded' });
    expect(broker.OnReply('html-1', frame, { ID: id, Ok: true })).toBe(false);
  });

  it('a content reload fails in-flight work and makes queued work wait for the new ready', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const first = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    const second = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: 'again' });
    await flush();
    broker.OnContentReloading('html-1');
    await expect(first).resolves.toMatchObject({ Ok: false, Code: 'widget_reloaded' });
    await flush();
    expect(broker.IsReady('html-1')).toBe(false);
    broker.OnReady('html-1', frame, 'doc-b', [], false);
    await flush();
    broker.OnReply('html-1', frame, { ID: frame.Last('inspect')!.id, Ok: true });
    await expect(second).resolves.toMatchObject({ Ok: true });
  });

  it('an unmount fails the in-flight command as widget_unmounted', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnMounted('html-1', frame);
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    const outcome = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    broker.OnUnmounted('html-1');
    await expect(outcome).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
    expect(broker.IsReady('html-1')).toBe(false);
  });

  it('delivers the stored state on ready, and accepts state only after that', () => {
    const { broker, Log } = makeBroker((id) => (id === 'html-1' ? '{"q":2}' : null));
    const frame = new FakeFrame();
    expect(broker.OnState('html-1', frame, '{"q":0}')).toBe(false); // before ready: ignored
    broker.OnReady('html-1', frame, 'doc-a', [], true);
    expect(frame.Last('restoreState')!.args).toEqual({ state: '{"q":2}' });
    expect(broker.OnState('html-1', frame, '{"q":3}')).toBe(true);
    expect(broker.OnState('html-1', new FakeFrame(), '{"q":9}')).toBe(false); // wrong window
    expect(Log.States).toEqual([{ ItemID: 'html-1', Json: '{"q":3}' }]);
  });

  it('opens the agent window for agent commands only, and closes it after the tail', async () => {
    const { broker } = makeBroker();
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    void broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    await flush();
    expect(broker.IsAgentWindowOpen('html-1')).toBe(false);
    broker.OnReply('html-1', frame, { ID: frame.Last('inspect')!.id, Ok: true });
    await flush();
    const op = broker.Send({ ItemID: 'html-1', Op: 'operate', Args: null, ByAgent: true });
    await flush();
    expect(broker.IsAgentWindowOpen('html-1')).toBe(true);
    now = 100;
    broker.OnReply('html-1', frame, { ID: frame.Last('operate')!.id, Ok: true });
    await op;
    now = 100 + 1750;
    expect(broker.IsAgentWindowOpen('html-1')).toBe(true);
    now = 100 + 1751;
    expect(broker.IsAgentWindowOpen('html-1')).toBe(false);
  });

  it('Dispose fails pending work and refuses new work', async () => {
    const { broker } = makeBroker();
    broker.OnReady('html-1', new FakeFrame(), 'doc-a', [], false);
    const inFlight = broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null });
    const waiting = broker.Send({ ItemID: 'html-2', Op: 'inspect', Args: null });
    await flush();
    broker.Dispose();
    await expect(inFlight).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
    // The command waiting for ready settles immediately, with the same code (no timer advance).
    await expect(waiting).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
    await expect(broker.Send({ ItemID: 'html-1', Op: 'inspect', Args: null })).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
  });

  it('Dispose settles queued and waiting commands immediately and releases every mount', async () => {
    const { broker, Log } = makeBroker();
    const frame = new FakeFrame();
    broker.OnMounted('html-2', frame);
    const waiting = broker.Send({ ItemID: 'html-2', Op: 'call', Args: null });
    const queued = broker.Send({ ItemID: 'html-2', Op: 'call', Args: null });
    await flush();
    broker.Dispose();
    await flush();
    await expect(waiting).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
    await expect(queued).resolves.toMatchObject({ Ok: false, Code: 'widget_unmounted' });
    expect(Log.Releases.length).toBe(Log.Mounts.length);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports actions only when they change (ready answers to hello and repeated lists stay quiet)', () => {
    const changes: string[][] = [];
    const { Host } = makeHost();
    Host.ActionsChanged = (_id, actions) => changes.push(actions.map((a) => a.Name));
    const broker = new WhiteboardWidgetBroker(Host, { Now: () => now });
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [{ Name: 'next' }], false);
    broker.OnReady('html-1', frame, 'doc-a', [{ Name: 'next' }], false); // hello answer
    broker.OnActions('html-1', frame, [{ Name: 'next' }]);
    broker.OnActions('html-1', frame, [{ Name: 'next', Description: 'Go on' }]);
    broker.OnActions('html-1', frame, [{ Name: 'next', Description: 'Go on' }]);
    expect(changes).toEqual([['next'], ['next']]);
  });

  it('accepts state only from the current document when the message names one', () => {
    const { broker, Log } = makeBroker(() => null);
    const frame = new FakeFrame();
    broker.OnReady('html-1', frame, 'doc-a', [], false);
    expect(broker.OnState('html-1', frame, '{"q":1}', 'doc-old')).toBe(false);
    expect(broker.OnState('html-1', frame, '{"q":2}', 'doc-a')).toBe(true);
    expect(broker.OnState('html-1', frame, '{"q":3}')).toBe(true); // no token: legacy helper
    broker.OnContentReloading('html-1');
    expect(broker.OnState('html-1', frame, '{"q":4}', 'doc-a')).toBe(false);
    expect(Log.States.map((s) => s.Json)).toEqual(['{"q":2}', '{"q":3}']);
  });
});
