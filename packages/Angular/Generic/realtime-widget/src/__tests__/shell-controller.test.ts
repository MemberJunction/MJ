import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOAD_FAILED_MESSAGE, MAX_QUEUED_NOTES, SessionConfigFrom } from '../shell/shell-controller';
import { DefaultWidgetConfig } from '../lib/config';
import { buildShell, flushMicrotasks, FakeSession } from './shell-test-kit';
import { makeTestChannelClass } from './widget-test-kit';

afterEach(() => vi.restoreAllMocks());

describe('ShellController — the pre-call phase machine', () => {
  it('announces ready once, on a microtask, with the resolved auth mode', async () => {
    const h = buildShell({ widgetKey: 'pk' });
    h.controller.Ready();
    h.controller.Ready();
    expect(h.events).toEqual([]);
    await flushMicrotasks();
    expect(h.events).toEqual([{ name: 'mj-ready', detail: { mode: 'widget-key', autoStart: false } }]);
  });

  it('auto-start begins the call by itself, after announcing ready', async () => {
    const h = buildShell({ autoStart: true });
    h.controller.Ready();
    await flushMicrotasks();
    expect(h.events[0].name).toBe('mj-ready');
    expect(h.session.Starts).toBe(1);
  });

  it('downloads NOTHING until a call starts: idle and consent cost the page no call code', async () => {
    const h = buildShell({ requireConsent: true });
    h.controller.Ready();
    await flushMicrotasks();
    await h.controller.Start();
    expect(h.controller.Phase).toBe('consent');
    expect(h.loads()).toBe(0);
    h.controller.DeclineConsent();
    expect(h.controller.Phase).toBe('idle');
    expect(h.loads()).toBe(0);
  });

  it('accepting consent loads the call code, then starts the call with consent already asked', async () => {
    const h = buildShell({ requireConsent: true });
    await h.controller.Start();
    await h.controller.AcceptConsent();
    expect(h.loads()).toBe(1);
    expect(h.session.Starts).toBe(1);
    expect(h.phases()).toEqual(['consent', 'booting', 'live']);
    // The call itself is told not to ask again, and not to auto-start.
    expect(h.session.Configs.at(-1)).toMatchObject({ requireConsent: false, autoStart: false });
  });

  it('without a consent gate, start() loads and goes live, and resolves when the call is live', async () => {
    const h = buildShell();
    await h.controller.Start();
    expect(h.phases()).toEqual(['booting', 'live']);
    expect(h.controller.Phase).toBe('live');
  });

  it('ignores a start while one is in flight or live, and a consent answer outside the consent phase', async () => {
    const h = buildShell();
    const hold = h.hold();
    const first = h.controller.Start();
    const second = h.controller.Start();
    hold.release();
    await Promise.all([first, second]);
    expect(h.loads()).toBe(1);
    expect(h.session.Starts).toBe(1);
    await h.controller.Start();
    await h.controller.AcceptConsent();
    h.controller.DeclineConsent();
    expect(h.session.Starts).toBe(1);
  });

  it('shows the booting phase while the code downloads', async () => {
    const h = buildShell();
    const hold = h.hold();
    const started = h.controller.Start();
    await flushMicrotasks();
    expect(h.controller.Phase).toBe('booting');
    hold.release();
    await started;
  });

  it('mirrors the call\'s own phases and forwards its events, but narrates phases itself (no duplicates, no second ready)', async () => {
    const h = buildShell();
    await h.controller.Start();
    h.session.Events$.next({ name: 'mj-ready', detail: { mode: 'token', autoStart: false } });
    h.session.Events$.next({ name: 'mj-phase-changed', detail: { phase: 'live', previous: 'connecting' } });
    h.session.Events$.next({ name: 'mj-session-started', detail: { sessionId: 's1', agentId: null, conversationId: null, channels: [] } });
    h.session.Phase$.next('connecting'); // not a regression the shell hides; it is reported
    const names = h.events.map((e) => e.name);
    expect(names.filter((n) => n === 'mj-ready')).toHaveLength(0);
    expect(names.filter((n) => n === 'mj-session-started')).toHaveLength(1);
    expect(h.phases()).toEqual(['booting', 'live', 'connecting']);
  });

  it('ended returns control: start() again reuses the loaded call (no second download)', async () => {
    const h = buildShell();
    await h.controller.Start();
    h.session.Phase$.next('ended');
    expect(h.controller.Phase).toBe('ended');
    await h.controller.Start();
    expect(h.loads()).toBe(1);
    expect(h.session.Starts).toBe(2);
  });

  it('the call failing surfaces its message in the error phase', async () => {
    const h = buildShell();
    h.session.OnStart = () => {
      h.session.ErrorMessage = 'Your microphone is blocked.';
      h.session.Phase$.next('error');
    };
    await h.controller.Start();
    expect(h.controller.Phase).toBe('error');
    expect(h.controller.ErrorMessage).toBe('Your microphone is blocked.');
  });
});

describe('ShellController — the call code failing to load', () => {
  it('reports load-failed in words, and a retry downloads again (a failure is never cached)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = buildShell();
    h.hold().fail(new Error('404'));
    await h.controller.Start();
    expect(h.controller.Phase).toBe('error');
    expect(h.controller.ErrorMessage).toBe(LOAD_FAILED_MESSAGE);
    expect(h.events.find((e) => e.name === 'mj-error')?.detail).toEqual({ code: 'load-failed', message: LOAD_FAILED_MESSAGE, phase: 'error' });
    await flushMicrotasks();
    await h.controller.Start();
    expect(h.loads()).toBe(2);
    expect(h.controller.Phase).toBe('live');
  });
});

describe('ShellController — end()', () => {
  it('is safe with nothing happening', async () => {
    const h = buildShell();
    await expect(h.controller.End()).resolves.toBeUndefined();
    expect(h.controller.Phase).toBe('idle');
  });

  it('ends a live call', async () => {
    const h = buildShell();
    await h.controller.Start();
    await h.controller.End();
    expect(h.session.Ends).toBe(1);
  });

  it('abandons a start whose code is still downloading: nothing starts, the phase returns to idle', async () => {
    const h = buildShell();
    const hold = h.hold();
    const started = h.controller.Start();
    await flushMicrotasks();
    await h.controller.End();
    expect(h.controller.Phase).toBe('idle');
    hold.release();
    await started;
    expect(h.session.Starts).toBe(0);
    expect(h.controller.Phase).toBe('idle');
  });

  it('the call returning to idle while it was still starting (its own end) settles the shell', async () => {
    const h = buildShell();
    h.session.OnStart = () => h.session.Phase$.next('connecting');
    await h.controller.Start();
    expect(h.controller.Phase).toBe('connecting');
    h.session.Phase$.next('idle');
    expect(h.controller.Phase).toBe('idle');
  });
});

describe('ShellController — calls made before the call exists', () => {
  describe('openChannel', () => {
    it('on an auto-start widget, before the start has fired, is early rather than too late: it queues', async () => {
      const h = buildShell({ autoStart: true });
      h.controller.Ready();
      const pending = h.controller.OpenChannel('A', { n: 1 });
      await flushMicrotasks();
      expect(await pending).toEqual({ success: true });
      expect(h.session.Opens).toEqual([{ channel: 'A', inputs: { n: 1 } }]);
    });

    it('with no start pending resolves at once to no_session', async () => {
      const h = buildShell();
      expect(await h.controller.OpenChannel('Anything', {})).toMatchObject({ success: false, errorCode: 'no_session' });
      expect(h.session.Opens).toEqual([]);
    });

    it('while the code downloads is queued, and runs, in order, with its inputs, when the call goes live', async () => {
      const h = buildShell();
      const hold = h.hold();
      const started = h.controller.Start();
      const first = h.controller.OpenChannel('A', { n: 1 });
      const second = h.controller.OpenChannel('B', { n: 2 });
      await flushMicrotasks();
      expect(h.session.Opens).toEqual([]);
      hold.release();
      await started;
      expect(await first).toEqual({ success: true });
      expect(await second).toEqual({ success: true });
      expect(h.session.Opens).toEqual([
        { channel: 'A', inputs: { n: 1 } },
        { channel: 'B', inputs: { n: 2 } }
      ]);
    });

    it('while the consent gate is showing is queued for after the visitor accepts', async () => {
      const h = buildShell({ requireConsent: true });
      await h.controller.Start();
      const pending = h.controller.OpenChannel('A', {});
      await h.controller.AcceptConsent();
      expect((await pending).success).toBe(true);
      expect(h.session.Opens).toHaveLength(1);
    });

    it('resolves to a failure, never hangs, when the call never gets there (declined, failed to load, ended, or ended early)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const declined = buildShell({ requireConsent: true });
      await declined.controller.Start();
      const a = declined.controller.OpenChannel('A', {});
      declined.controller.DeclineConsent();
      expect(await a).toMatchObject({ success: false, errorCode: 'no_session' });

      const failed = buildShell();
      failed.hold().fail(new Error('404'));
      const startFailed = failed.controller.Start();
      const b = failed.controller.OpenChannel('A', {});
      await startFailed;
      expect(await b).toMatchObject({ success: false, errorCode: 'no_session' });

      const ended = buildShell();
      const hold = ended.hold();
      const startEnded = ended.controller.Start();
      const c = ended.controller.OpenChannel('A', {});
      await flushMicrotasks();
      await ended.controller.End();
      hold.release();
      await startEnded;
      expect(await c).toMatchObject({ success: false, errorCode: 'no_session' });
    });

    it('with a live call goes straight to the call', async () => {
      const h = buildShell();
      await h.controller.Start();
      h.session.OpenResult = { success: false, error: 'bad inputs', errorCode: 'invalid_params' };
      expect(await h.controller.OpenChannel('A', { x: 1 })).toMatchObject({ errorCode: 'invalid_params' });
    });
  });

  describe('sendContextNote', () => {
    it('is queued from any phase before the call is live and delivered, in order, when it goes live', async () => {
      const h = buildShell();
      h.controller.SendContextNote('on page load');
      const hold = h.hold();
      const started = h.controller.Start();
      h.controller.SendContextNote('while booting');
      hold.release();
      await started;
      expect(h.session.Notes).toEqual(['on page load', 'while booting']);
      h.controller.SendContextNote('now live');
      expect(h.session.Notes).toEqual(['on page load', 'while booting', 'now live']);
    });

    it('keeps at most MAX_QUEUED_NOTES, dropping the OLDEST', async () => {
      const h = buildShell();
      for (let i = 0; i < MAX_QUEUED_NOTES + 5; i++) {
        h.controller.SendContextNote(`n${i}`);
      }
      await h.controller.Start();
      expect(h.session.Notes).toHaveLength(MAX_QUEUED_NOTES);
      expect(h.session.Notes[0]).toBe('n5');
      expect(h.session.Notes.at(-1)).toBe(`n${MAX_QUEUED_NOTES + 4}`);
    });

    it('never replays one call\'s context into the next: notes still queued when a call ends are dropped', async () => {
      const h = buildShell();
      h.controller.SendContextNote('stale');
      const hold = h.hold();
      const started = h.controller.Start();
      await flushMicrotasks();
      h.session.OnStart = () => h.session.Phase$.next('ended');
      hold.release();
      await started;
      h.session.Notes.length = 0;
      h.session.OnStart = () => h.session.Phase$.next('live');
      await h.controller.Start();
      expect(h.session.Notes).toEqual([]);
    });

    it('a note sent after a call ended is held for the next call', async () => {
      const h = buildShell();
      await h.controller.Start();
      h.session.Phase$.next('ended');
      h.controller.SendContextNote('for next time');
      await h.controller.Start();
      expect(h.session.Notes).toEqual(['for next time']);
    });
  });

  describe('requestSpokenResponse', () => {
    it('is about NOW: never queued, false unless the call is live', async () => {
      const h = buildShell();
      expect(h.controller.RequestSpokenResponse('too early')).toBe(false);
      const hold = h.hold();
      const started = h.controller.Start();
      expect(h.controller.RequestSpokenResponse('still early')).toBe(false);
      hold.release();
      await started;
      expect(h.session.Spoken).toEqual([]);
      expect(h.controller.RequestSpokenResponse('now')).toBe(true);
      expect(h.session.Spoken).toEqual(['now']);
    });
  });

  describe('registerChannel', () => {
    it('is remembered and registered with the call when it is created, and straight away once it exists', async () => {
      const Early = makeTestChannelClass('Early');
      const Late = makeTestChannelClass('Late');
      const h = buildShell();
      h.controller.RegisterChannel(Early);
      await h.controller.Start();
      expect(h.session.Registered).toEqual([Early]);
      h.controller.RegisterChannel(Late);
      expect(h.session.Registered).toEqual([Early, Late]);
    });
  });
});

describe('ShellController — configuration and teardown', () => {
  it('pushes configuration changes to the call once it exists', async () => {
    const h = buildShell();
    h.controller.Configure(); // no call yet: nothing to push, no throw
    await h.controller.Start();
    h.config = { ...h.config, agentName: 'Orion' };
    h.controller.Configure();
    expect(h.session.Configs.at(-1)?.agentName).toBe('Orion');
  });

  it('forwards the page being hidden', async () => {
    const h = buildShell();
    h.controller.OnPageHide(true);
    await h.controller.Start();
    h.controller.OnPageHide(false);
    expect(h.session.PageHides).toEqual([false]);
  });

  it('dispose releases the call, goes silent, and resolves anything still queued', async () => {
    const h = buildShell();
    const hold = h.hold();
    const started = h.controller.Start();
    const pending = h.controller.OpenChannel('A', {});
    await flushMicrotasks();
    h.controller.Dispose();
    hold.release();
    await started;
    expect(await pending).toMatchObject({ success: false });
    expect(h.session.Starts).toBe(0);
    h.controller.Dispose(); // idempotent
    const before = h.events.length;
    await h.controller.Start();
    expect(h.events.length).toBe(before);
  });

  it('dispose after a call exists disposes it exactly once', async () => {
    const h = buildShell();
    await h.controller.Start();
    h.controller.Dispose();
    expect(h.session.Disposed).toBe(true);
  });

  it('SessionConfigFrom turns the shell-owned settings off for the call', () => {
    expect(SessionConfigFrom({ ...DefaultWidgetConfig(), requireConsent: true, autoStart: true })).toMatchObject({ requireConsent: false, autoStart: false });
  });

  it('a session that arrives after the element was removed is released, not adopted', async () => {
    const h = buildShell();
    const hold = h.hold();
    void h.controller.Start();
    await flushMicrotasks();
    h.controller.Dispose();
    hold.release();
    await flushMicrotasks();
    expect(h.session.Disposed).toBe(true);
    expect(h.controller.Session).toBeNull();
    expect(h.session instanceof FakeSession).toBe(true);
  });
});
