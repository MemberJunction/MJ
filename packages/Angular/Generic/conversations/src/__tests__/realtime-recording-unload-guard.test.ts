import { describe, it, expect, afterEach, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import {
  BrowserRecordingUnloadGuard,
  UnloadEventTarget,
} from '../lib/services/browser-recording-unload-guard';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';

type UnloadListener = (event: BeforeUnloadEvent) => void;

/** Fake window that records listeners so tests can fire and count them. */
class FakeTarget implements UnloadEventTarget {
  public Listeners = new Map<string, Set<UnloadListener>>();
  addEventListener(type: 'beforeunload', listener: UnloadListener): void {
    const set = this.Listeners.get(type) ?? new Set<UnloadListener>();
    set.add(listener);
    this.Listeners.set(type, set);
  }
  removeEventListener(type: 'beforeunload', listener: UnloadListener): void {
    this.Listeners.get(type)?.delete(listener);
  }
  Count(): number {
    return this.Listeners.get('beforeunload')?.size ?? 0;
  }
}

function fakeEvent(): { preventDefault: ReturnType<typeof vi.fn>; returnValue: unknown } {
  return { preventDefault: vi.fn(), returnValue: undefined };
}

describe('BrowserRecordingUnloadGuard (#5195)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('arming adds exactly one listener, and arming twice still leaves one', () => {
    const target = new FakeTarget();
    const guard = new BrowserRecordingUnloadGuard(target);
    guard.SetArmed(true);
    guard.SetArmed(true);
    expect(target.Count()).toBe(1);
    expect(guard.IsArmed).toBe(true);
  });

  it('the armed listener prevents default and sets returnValue to true', () => {
    const target = new FakeTarget();
    new BrowserRecordingUnloadGuard(target).SetArmed(true);
    const event = fakeEvent();
    const [listener] = [...(target.Listeners.get('beforeunload') ?? [])];
    listener(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe(true);
  });

  it('disarming removes the listener, and disarming when not armed is a no-op', () => {
    const target = new FakeTarget();
    const guard = new BrowserRecordingUnloadGuard(target);
    guard.SetArmed(false);
    expect(target.Count()).toBe(0);
    guard.SetArmed(true);
    guard.SetArmed(false);
    guard.SetArmed(false);
    expect(target.Count()).toBe(0);
    expect(guard.IsArmed).toBe(false);
  });

  it('a null target never throws and IsArmed tracks the requested state', () => {
    const guard = new BrowserRecordingUnloadGuard(null);
    expect(() => guard.SetArmed(true)).not.toThrow();
    expect(guard.IsArmed).toBe(true);
    expect(() => guard.SetArmed(false)).not.toThrow();
    expect(guard.IsArmed).toBe(false);
  });

  it('RealtimeSessionService arms the guard while the recording is saving', () => {
    const target = new FakeTarget();
    vi.stubGlobal('window', target);
    const service = new RealtimeSessionService();
    const subject = (service as unknown as { _savingRecording$: BehaviorSubject<boolean> })
      ._savingRecording$;
    expect(target.Count()).toBe(0);
    subject.next(true);
    expect(target.Count()).toBe(1);
    subject.next(false);
    expect(target.Count()).toBe(0);
  });
});
