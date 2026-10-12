import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import { InMemoryChannelExposurePreferences, RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import {
  ExposureForPerception,
  FindPerceptionToggles,
  PerceptionBridge,
  ToPerceptionSource,
  WidgetExposurePreferences
} from '../lib/session/perception-bridge';
import type { WidgetOutboundEvent } from '../lib/types';
import { buildHarness, FakeMediaHost, makeJwt, makeTestChannelClass } from './widget-test-kit';

afterEach(() => vi.restoreAllMocks());

const source = (id: string, enabled: boolean, extra: Partial<VideoSourceState> = {}): VideoSourceState => ({
  SourceID: id,
  Label: id.toUpperCase(),
  Enabled: enabled,
  Active: false,
  FramesSent: 0,
  ...extra
});

describe('perception mapping', () => {
  it('maps on to pixels, off to state, and ask to no pre-set', () => {
    expect(ExposureForPerception('on')).toBe('pixels');
    expect(ExposureForPerception('off')).toBe('state');
    expect(ExposureForPerception('ask')).toBeUndefined();
  });

  it('describes a source for the page, with its channel or null', () => {
    expect(ToPerceptionSource(source('wb', true, { ChannelKey: 'Whiteboard', Active: true }))).toEqual({ sourceId: 'wb', label: 'WB', channel: 'Whiteboard', enabled: true, active: true });
    expect(ToPerceptionSource(source('screen', false)).channel).toBeNull();
  });

  it('finds only the sources whose Enabled flag flipped: new, removed and merely-active sources are not toggles', () => {
    const before = [source('a', true), source('b', true), source('c', false)];
    const after = [source('a', false), source('b', true, { Active: true }), source('c', false), source('d', false)];
    expect(FindPerceptionToggles(before, after).map((s) => s.SourceID)).toEqual(['a']);
    expect(FindPerceptionToggles(after, [])).toEqual([]);
  });
});

describe('WidgetExposurePreferences', () => {
  const build = (mode: 'on' | 'off' | 'ask') => {
    const inner = new InMemoryChannelExposurePreferences();
    let current = mode;
    const store = new WidgetExposurePreferences(inner, () => current);
    return { inner, store, setMode: (m: 'on' | 'off' | 'ask') => (current = m) };
  };

  it('ask defers entirely to the host\'s own store', () => {
    const { inner, store } = build('ask');
    inner.Set('Whiteboard', 'state');
    expect(store.Get('whiteboard')).toBe('state');
    expect(store.Get('Other')).toBeUndefined();
  });

  it('a page pre-set (on/off) answers for channels nobody has chosen for, and beats a remembered preference', () => {
    const { inner, store } = build('off');
    inner.Set('Whiteboard', 'pixels');
    expect(store.Get('Whiteboard')).toBe('state');
    expect(build('on').store.Get('X')).toBe('pixels');
  });

  it('the person\'s own choice wins over the pre-set — including choosing "no restriction"', () => {
    const { store } = build('off');
    store.Set('Whiteboard', undefined);
    expect(store.Get('whiteboard')).toBeUndefined();
    store.Set('Media', 'pixels');
    expect(store.Get('MEDIA')).toBe('pixels');
  });

  it('passes the person\'s choices through to the host\'s store, so a persisted preference still works', () => {
    const { inner, store } = build('ask');
    store.Set('Whiteboard', 'state');
    expect(inner.Get('Whiteboard')).toBe('state');
  });

  it('does not record the page\'s own re-application as the person\'s choice, and forgetting returns to the pre-set', () => {
    const { inner, store } = build('off');
    store.WhileApplying(() => store.Set('Whiteboard', 'state'));
    expect(inner.Get('Whiteboard')).toBeUndefined();
    store.Set('Whiteboard', 'pixels');
    store.ForgetChoices();
    expect(store.Get('Whiteboard')).toBe('state');
  });
});

describe('PerceptionBridge', () => {
  function setup() {
    const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
    const sources$ = new BehaviorSubject<readonly VideoSourceState[]>([]);
    Object.defineProperty(runtime, 'VideoSources$', { value: sources$.asObservable() });
    const events: WidgetOutboundEvent[] = [];
    const bridge = new PerceptionBridge(runtime, (e) => events.push(e));
    return { runtime, sources$, events, bridge };
  }

  it('ask installs nothing: the runtime keeps its own preference store', () => {
    const { runtime, bridge } = setup();
    const original = runtime.ExposurePreferences;
    bridge.Apply('ask');
    expect(runtime.ExposurePreferences).toBe(original);
  });

  it('on/off install the layer over the runtime\'s store, and dispose puts the original back', () => {
    const { runtime, bridge } = setup();
    const original = runtime.ExposurePreferences;
    bridge.Apply('off');
    expect(runtime.ExposurePreferences).not.toBe(original);
    expect(runtime.ExposurePreferences.Get('Whiteboard')).toBe('state');
    bridge.Apply('on');
    expect(runtime.ExposurePreferences.Get('Whiteboard')).toBe('pixels');
    bridge.Dispose();
    expect(runtime.ExposurePreferences).toBe(original);
  });

  it('going back to ask hands answers back to the original store', () => {
    const { runtime, bridge } = setup();
    runtime.ExposurePreferences.Set('Whiteboard', 'state');
    bridge.Apply('on');
    expect(runtime.ExposurePreferences.Get('Whiteboard')).toBe('pixels');
    bridge.Apply('ask');
    expect(runtime.ExposurePreferences.Get('Whiteboard')).toBe('state');
  });

  it('re-emits every flip of a source as mj-perception-changed, with all the sources, and nothing for presence changes', () => {
    const { sources$, events, bridge } = setup();
    bridge.Start();
    sources$.next([source('wb', true, { ChannelKey: 'Whiteboard' })]);
    expect(events).toEqual([]); // appearing is not a toggle
    sources$.next([source('wb', false, { ChannelKey: 'Whiteboard' }), source('scr', true)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      name: 'mj-perception-changed',
      detail: {
        sourceId: 'wb',
        label: 'WB',
        channel: 'Whiteboard',
        enabled: false,
        active: false,
        sources: [
          { sourceId: 'wb', label: 'WB', channel: 'Whiteboard', enabled: false, active: false },
          { sourceId: 'scr', label: 'SCR', channel: null, enabled: true, active: false }
        ]
      }
    });
    sources$.next([source('wb', true, { ChannelKey: 'Whiteboard' }), source('scr', true)]);
    expect(events).toHaveLength(2);
  });

  it('stops reporting when stopped, and starts each call from a clean slate', () => {
    const { sources$, events, bridge } = setup();
    bridge.Start();
    sources$.next([source('a', true)]);
    bridge.Stop();
    sources$.next([source('a', false)]);
    expect(events).toEqual([]);
    sources$.next([]); // the runtime clears the sources at teardown
    bridge.Start();
    sources$.next([source('a', true)]); // a source appearing in the next call is not a toggle
    expect(events).toEqual([]);
  });
});

describe('perception through a real runtime and a channel in the call', () => {
  const live = async (perception: 'on' | 'off' | 'ask') => {
    const Panel = makeTestChannelClass('SeePanel');
    const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com', perception });
    h.controller.RegisterChannel(Panel);
    await h.controller.Start();
    return { h, Panel };
  };

  it('off lowers what the model may perceive of a channel to its state, before the channel initializes', async () => {
    const { h } = await live('off');
    expect(h.runtime.GetChannelExposure('SeePanel')).toBe('state');
    await h.controller.End();
  });

  it('changing the pre-set mid-call re-applies it to the channels in the call', async () => {
    const { h } = await live('on');
    h.config({ perception: 'off' });
    expect(h.runtime.ExposurePreferences.Get('SeePanel')).toBe('state');
    h.config({ perception: 'ask' });
    expect(h.runtime.ExposurePreferences.Get('SeePanel')).toBeUndefined();
    await h.controller.End();
  });

  it('a choice the person makes afterwards wins over the page\'s pre-set', async () => {
    const { h } = await live('off');
    h.runtime.SetUserChannelExposure('SeePanel', undefined);
    expect(h.runtime.ExposurePreferences.Get('SeePanel')).toBeUndefined();
    await h.controller.End();
  });
});
