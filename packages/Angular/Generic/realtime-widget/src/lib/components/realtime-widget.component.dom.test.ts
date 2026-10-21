/**
 * DOM spec for `RealtimeWidgetComponent` used the way an Angular host uses it: created from a template, configured
 * through its inputs, driven through its methods, observed through the DOM events it dispatches and the attributes it
 * puts on its own host element. (The custom-element contract — attributes reflecting to properties, registration, the
 * one-script bundle — is `realtime-widget.element.dom.test.ts`.)
 *
 * Only the edges are faked: the network (a GraphQL-shaped provider), the microphone and the realtime driver. The
 * runtime and the controller under the component are the real ones, and the hosted `<mj-realtime-session-overlay>`
 * is replaced by a stub that records what the widget hands it, because the real overlay needs the media stack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RenderComponentFixture, Query, QueryAll, Text, Attr, Click } from '@memberjunction/ng-test-utils';
import { RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  FakeAuthProvider,
  FakeGuestSessions,
  FakeMediaHost,
  FakeProvider,
  MemoryStorage,
  SESSION_ID,
  WidgetFakeClient,
  flush,
  makeJwt,
  makeTestChannelClass,
  spyConsole
} from '../../__tests__/widget-test-kit';
import { StubRealtimeSessionOverlayComponent } from '../../__tests__/stub-overlay.component';
import { WidgetAuthAdapter, type HttpPostPort } from '../auth/widget-auth.adapter';
import { WidgetPageClose } from '../lifecycle/widget-page-close';
import { WidgetResumeStore } from '../resume/widget-resume-store';
import type { RealtimeWidgetPorts } from '../session/widget-ports';
import { RegisterWidgetLocale } from '../strings';
import { WIDGET_EVENTS } from '../types';
import { GetRealtimeWidgetComponent, REALTIME_WIDGET_PORTS, REALTIME_WIDGET_RUNTIME, RealtimeWidgetComponent } from './realtime-widget.component';

vi.mock('@memberjunction/ng-conversations/dist/lib/components/realtime/realtime-session-overlay.component', () => ({
  RealtimeSessionOverlayComponent: StubRealtimeSessionOverlayComponent
}));

type WidgetFixture = ComponentFixture<RealtimeWidgetComponent>;

interface Fixture {
  provider: FakeProvider;
  authProvider: FakeAuthProvider;
  guest: FakeGuestSessions;
  storage: MemoryStorage;
  closes: Array<{ url: string; token: string; sessionId: string }>;
}

/** What a mounted widget gives a test: the fixture and every `mj-*` DOM event it dispatched, in order. */
interface Mounted {
  Fixture: WidgetFixture;
  Widget: RealtimeWidgetComponent;
  Host: HTMLElement;
  Events: CustomEvent[];
  EventNames: () => string[];
}

/** How long to wait after tearing a widget down for its asynchronous hang-up to finish before the environment goes. */
const ELEMENT_DESTROY_SETTLE_MS = 25;

let fx: Fixture;
let runtime: RealtimeSessionRuntime;
let mounted: Mounted | null = null;

/**
 * The runtime reads the session mint and event subscription off its provider with a GraphQL-shaped surface the
 * metadata-provider interface does not declare, so the fake (which implements exactly that surface) is given to it
 * through this one seam.
 */
function AsMetadataProvider(provider: FakeProvider): IMetadataProvider {
  return provider as unknown as IMetadataProvider;
}

function newFixture(): Fixture {
  return { provider: new FakeProvider(), authProvider: new FakeAuthProvider(), guest: new FakeGuestSessions(), storage: new MemoryStorage(), closes: [] };
}

function ports(): RealtimeWidgetPorts {
  const post: HttpPostPort = async () => ({ ok: true, json: { success: true, token: makeJwt(9_999_999_999) } });
  return {
    createAuth: (apiUrl, refresh) => new WidgetAuthAdapter({ apiUrl, provider: fx.authProvider, post, refresh }),
    createGuestSessions: () => fx.guest,
    createResumeStore: (scope) => new WidgetResumeStore(scope, fx.storage),
    pageClose: new WidgetPageClose({
      config: () => ({ url: 'https://api.example.com/', token: 'live-token' }),
      send: (url, token, sessionId) => fx.closes.push({ url, token, sessionId })
    })
  };
}

beforeEach(() => {
  fx = newFixture();
  runtime = new RealtimeSessionRuntime(new FakeMediaHost());
  runtime.Provider = AsMetadataProvider(fx.provider);
  WidgetFakeClient.Notes = [];
  WidgetFakeClient.Spoken = [];
  WidgetFakeClient.ConnectError = null;
  spyConsole();
});

afterEach(async () => {
  if (mounted) {
    await mounted.Widget.End();
    mounted.Fixture.destroy();
    mounted = null;
  }
  document.body.removeAttribute('data-theme');
  await flush();
  // The widget's teardown ends the call asynchronously; waiting past it keeps that work inside the test that caused it.
  await new Promise<void>((resolve) => setTimeout(resolve, ELEMENT_DESTROY_SETTLE_MS));
  vi.restoreAllMocks();
});

/** Lets the widget's microtasks (mj-ready, auto-start), its signals and the DOM catch up. */
async function settle(): Promise<void> {
  await flush();
  mounted?.Fixture.detectChanges();
  await flush();
  mounted?.Fixture.detectChanges();
}

/** Mounts the component with the given inputs. Event listeners are attached before the first render so `mj-ready` is heard. */
async function mount(inputs: Record<string, unknown> = {}): Promise<Mounted> {
  const events: CustomEvent[] = [];
  const fixture = RenderComponentFixture(RealtimeWidgetComponent, {
    providers: [
      { provide: REALTIME_WIDGET_RUNTIME, useValue: runtime },
      { provide: REALTIME_WIDGET_PORTS, useValue: ports() }
    ],
    inputs,
    setup: (_widget, ref) => {
      const host: HTMLElement = ref.location.nativeElement;
      for (const name of Object.values(WIDGET_EVENTS)) {
        host.addEventListener(name, (e) => events.push(e as CustomEvent));
      }
    }
  });
  mounted = {
    Fixture: fixture,
    Widget: fixture.componentInstance,
    Host: fixture.nativeElement,
    Events: events,
    EventNames: () => events.map((e) => e.type)
  };
  await settle();
  return mounted;
}

/** Inputs for a widget that can go live with no consent gate, authenticating by a held token. */
function liveInputs(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { apiUrl: 'https://api.example.com', token: makeJwt(9_999_999_999), agentId: 'agent-1', requireConsent: false, ...extra };
}

const eventsNamed = (m: Mounted, name: string): CustomEvent[] => m.Events.filter((e) => e.type === name);
const phase = (m: Mounted): string | null => m.Host.getAttribute('data-phase');
const stubOverlay = (m: Mounted): StubRealtimeSessionOverlayComponent =>
  m.Fixture.debugElement.query(By.directive(StubRealtimeSessionOverlayComponent)).componentInstance;

describe('RealtimeWidgetComponent (DOM)', () => {
  describe('the idle surface and the host element', () => {
    it('renders a single start button naming the agent, and marks its host as an idle widget', async () => {
      const m = await mount({ agentName: 'Sage' });
      expect(QueryAll(m.Fixture, '.mjw-start')).toHaveLength(1);
      expect(Text(m.Fixture, '.mjw-start')).toContain('Talk to Sage');
      expect(m.Host.classList.contains('mjw-host')).toBe(true);
      expect(phase(m)).toBe('idle');
    });

    it('falls back to a generic agent name, and re-labels the button when the name changes', async () => {
      const m = await mount();
      expect(Text(m.Fixture, '.mjw-start')).toContain('Talk to Assistant');
      m.Fixture.componentRef.setInput('agentName', 'Orion');
      await settle();
      expect(Text(m.Fixture, '.mjw-start')).toContain('Talk to Orion');
    });

    it("uses the page's copy for the configured locale, and says so with lang", async () => {
      RegisterWidgetLocale('xx-dom', { start: 'Parlez à {agent}' });
      const m = await mount({ locale: 'xx-dom', agentName: 'Sage' });
      expect(m.Host.getAttribute('lang')).toBe('xx-dom');
      expect(Text(m.Fixture, '.mjw-start')).toContain('Parlez à Sage');
    });

    it('falls back to English copy for a locale with no table', async () => {
      const m = await mount({ locale: 'zz-none', agentName: 'Sage' });
      expect(m.Host.getAttribute('lang')).toBe('zz-none');
      expect(Text(m.Fixture, '.mjw-start')).toContain('Talk to Sage');
    });

    it('leaves lang off the host when no locale is configured', async () => {
      const m = await mount();
      expect(m.Host.hasAttribute('lang')).toBe(false);
    });

    it('does not start anything by itself', async () => {
      await mount(liveInputs());
      expect(fx.provider.mints()).toHaveLength(0);
      expect(fx.guest.Mints).toBe(0);
    });
  });

  describe('inputs', () => {
    it('reads every string input as trimmed text, treating blank as unset', async () => {
      const m = await mount({
        apiUrl: ' https://api.example.com ',
        widgetKey: 'pk_live_abc',
        inviteToken: 'mj_ml_xyz',
        token: 'a.b.c',
        agentId: 'agent-1',
        applicationId: 'app-1',
        conversationId: 'conv-1',
        sessionUrl: 'https://cdn.example.com/session.js',
        cspNonce: 'abc123'
      });
      const w = m.Widget;
      expect([w.apiUrl, w.widgetKey, w.inviteToken, w.token, w.agentId, w.applicationId, w.conversationId, w.sessionUrl, w.cspNonce]).toEqual([
        'https://api.example.com',
        'pk_live_abc',
        'mj_ml_xyz',
        'a.b.c',
        'agent-1',
        'app-1',
        'conv-1',
        'https://cdn.example.com/session.js',
        'abc123'
      ]);
      m.Fixture.componentRef.setInput('widgetKey', '   ');
      expect(w.widgetKey).toBeNull();
    });

    it('defaults: consent required, no auto-start, auto chrome, ask for perception, no frame capture, hover preload', async () => {
      const w = (await mount()).Widget;
      expect([w.requireConsent, w.autoStart, w.chrome, w.perception, w.frameCapture, w.preload, w.theme]).toEqual([true, false, 'auto', 'ask', false, 'hover', 'auto']);
    });

    it('coerces booleans the way HTML would, from strings as well as real booleans', async () => {
      const m = await mount({ requireConsent: 'false', autoStart: false, frameCapture: 'yes' });
      expect([m.Widget.requireConsent, m.Widget.autoStart, m.Widget.frameCapture]).toEqual([false, false, true]);
    });

    it('accepts channels as an array or a comma list, and per-channel seed inputs as an object or JSON', async () => {
      const listed = await mount({ channels: 'IdentityVerification, Notes', channelInputs: '{"Notes":{"title":"Hi"}}' });
      expect(listed.Widget.channels).toEqual(['IdentityVerification', 'Notes']);
      expect(listed.Widget.channelInputs).toEqual({ Notes: { title: 'Hi' } });
      listed.Fixture.componentRef.setInput('channels', ['A', 'B']);
      listed.Fixture.componentRef.setInput('channelInputs', { A: { x: 1 } });
      expect(listed.Widget.channels).toEqual(['A', 'B']);
      expect(listed.Widget.channelInputs).toEqual({ A: { x: 1 } });
    });

    it('accepts chrome orb|console|auto and falls back to auto for anything else', async () => {
      const m = await mount({ chrome: 'console' });
      expect(m.Widget.chrome).toBe('console');
      m.Fixture.componentRef.setInput('chrome', 'sideways');
      expect(m.Widget.chrome).toBe('auto');
    });

    it('accepts perception on|off|ask and preload none|hover|idle|eager, defaulting otherwise', async () => {
      const m = await mount({ perception: 'on', preload: 'eager' });
      expect([m.Widget.perception, m.Widget.preload]).toEqual(['on', 'eager']);
      m.Fixture.componentRef.setInput('perception', 'maybe');
      m.Fixture.componentRef.setInput('preload', 'whenever');
      expect([m.Widget.perception, m.Widget.preload]).toEqual(['ask', 'hover']);
    });

    it('holds a page-supplied launcher as given, and clears it on null', async () => {
      const launcher = { Launch: vi.fn() };
      const m = await mount({ launcher });
      expect(m.Widget.launcher).toBe(launcher);
      m.Fixture.componentRef.setInput('launcher', null);
      expect(m.Widget.launcher).toBeNull();
    });
  });

  describe('theming', () => {
    it('puts an explicit light or dark theme on the host, and changes it when the input changes', async () => {
      const m = await mount({ theme: 'dark' });
      expect(m.Widget.theme).toBe('dark');
      expect(m.Host.getAttribute('data-theme')).toBe('dark');
      m.Fixture.componentRef.setInput('theme', 'light');
      await settle();
      expect(m.Host.getAttribute('data-theme')).toBe('light');
    });

    it('with theme auto follows the visitor\'s OS preference (light here) when the page declares no theme', async () => {
      const m = await mount();
      expect(m.Host.getAttribute('data-theme')).toBe('light');
    });

    it('with theme auto leaves the page in charge when an ancestor already declares a theme', async () => {
      document.body.setAttribute('data-theme', 'dark');
      const m = await mount();
      expect(m.Host.hasAttribute('data-theme')).toBe(false);
    });

    it('paints --mj-* token overrides on the host, accepting short keys, full keys, and a JSON object in theme', async () => {
      const m = await mount({ themeTokens: { 'brand-primary': '#0a7a55', '--mj-text-primary': '#111111' } });
      expect(m.Host.style.getPropertyValue('--mj-brand-primary')).toBe('#0a7a55');
      expect(m.Host.style.getPropertyValue('--mj-text-primary')).toBe('#111111');
      m.Fixture.componentRef.setInput('theme', '{"bg-page":"#fafafa"}');
      expect(m.Widget.themeTokens).toEqual({ 'bg-page': '#fafafa' });
      await settle();
      expect(m.Host.style.getPropertyValue('--mj-bg-page')).toBe('#fafafa');
    });

    it('ignores token keys outside the --mj- contract', async () => {
      const m = await mount({ themeTokens: { '--other-color': 'red', 'brand-primary': '#123456' } });
      expect(m.Host.style.getPropertyValue('--other-color')).toBe('');
      expect(m.Host.style.getPropertyValue('--mj-brand-primary')).toBe('#123456');
    });
  });

  describe('starting a call', () => {
    it('the start button goes straight to a live call when consent is not required, and hosts the overlay', async () => {
      const m = await mount(liveInputs({ agentName: 'Sage' }));
      Click(m.Fixture, '.mjw-start');
      await settle();
      expect(phase(m)).toBe('live');
      expect(Query(m.Fixture, '.mjw-start')).toBeNull();
      expect(Query(m.Fixture, 'mj-realtime-session-overlay')).not.toBeNull();
      expect(Attr(m.Fixture, '.stub-overlay', 'data-agent')).toBe('Sage');
    });

    it('shows the consent gate first when consent is required, and Begin starts the call', async () => {
      const m = await mount(liveInputs({ requireConsent: true }));
      Click(m.Fixture, '.mjw-start');
      await settle();
      expect(phase(m)).toBe('consent');
      expect(Query(m.Fixture, '.mjw-consent')).not.toBeNull();
      expect(fx.provider.mints()).toHaveLength(0);
      Click(m.Fixture, '.mjw-consent__begin');
      await settle();
      expect(phase(m)).toBe('live');
      expect(Query(m.Fixture, '.mjw-consent')).toBeNull();
      expect(fx.provider.mints()).toHaveLength(1);
    });

    it('Not now on the consent gate returns to the start button with nothing started', async () => {
      const m = await mount(liveInputs({ requireConsent: true }));
      Click(m.Fixture, '.mjw-start');
      await settle();
      Click(m.Fixture, '.mjw-consent__decline');
      await settle();
      expect(phase(m)).toBe('idle');
      expect(Query(m.Fixture, '.mjw-start')).not.toBeNull();
      expect(fx.provider.mints()).toHaveLength(0);
    });

    it('autoStart begins by itself once the first render is done', async () => {
      const m = await mount(liveInputs({ autoStart: true }));
      await settle();
      expect(phase(m)).toBe('live');
      expect(fx.provider.mints()).toHaveLength(1);
    });

    it('Start() is the programmatic equivalent of the button, and a second Start while live is ignored', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await settle();
      expect(phase(m)).toBe('live');
      await m.Widget.Start();
      expect(fx.provider.mints()).toHaveLength(1);
    });
  });

  describe('DOM events', () => {
    it('mj-ready fires once after the first render, with the auth mode, and bubbles composed through the document', async () => {
      const seen: CustomEvent[] = [];
      const grab = (e: Event): number => seen.push(e as CustomEvent);
      document.addEventListener('mj-ready', grab);
      const m = await mount({ apiUrl: 'https://api.example.com', widgetKey: 'pk' });
      document.removeEventListener('mj-ready', grab);
      expect(seen).toHaveLength(1);
      expect(seen[0].detail).toEqual({ mode: 'widget-key', autoStart: false });
      expect(seen[0].bubbles && seen[0].composed).toBe(true);
      expect(seen[0].target).toBe(m.Host);
      expect(eventsNamed(m, 'mj-ready')).toHaveLength(1);
    });

    it('walks the lifecycle: phase changes, session start with the agent, session end with a reason', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await settle();
      expect(eventsNamed(m, 'mj-phase-changed').map((e) => e.detail.phase)).toEqual(['booting', 'connecting', 'live']);
      expect(eventsNamed(m, 'mj-phase-changed').map((e) => e.detail.previous)).toEqual(['idle', 'booting', 'connecting']);
      expect(eventsNamed(m, 'mj-session-started')[0].detail).toMatchObject({ sessionId: SESSION_ID, agentId: 'agent-1' });
      await m.Widget.End();
      await settle();
      expect(eventsNamed(m, 'mj-session-ended')[0].detail).toEqual({ sessionId: SESSION_ID, reason: 'user' });
      expect(phase(m)).toBe('ended');
    });

    it('reports a credential-less start as mj-error with a stable code, the words, and the phase, and shows them', async () => {
      const m = await mount({ requireConsent: false, agentId: 'agent-1' });
      await m.Widget.Start();
      await settle();
      const errors = eventsNamed(m, 'mj-error');
      expect(errors).toHaveLength(1);
      expect(errors[0].detail.code).toBe('no-credential');
      expect(errors[0].detail.phase).toBe('error');
      expect(phase(m)).toBe('error');
      const alert = Query(m.Fixture, 'mj-alert');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain(errors[0].detail.message);
    });

    it('relays every server session event, and the typed mj-verified for identity.verified', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      fx.provider.Publish('identity.verified', { VerifiedEmail: 'ada@example.com', VerifiedName: 'Ada', VerifiedAt: '2030-01-01T00:00:00Z', Method: 'code' });
      fx.provider.Publish('acme.thing', { a: 1 });
      expect(eventsNamed(m, 'mj-session-event').map((e) => e.detail.type)).toEqual(['identity.verified', 'acme.thing']);
      expect(eventsNamed(m, 'mj-verified')[0].detail).toMatchObject({ sessionId: SESSION_ID, email: 'ada@example.com', name: 'Ada', method: 'code' });
    });

    it('relays a page channel\'s life as mj-channel-opened, mj-channel-event and mj-channel-output', async () => {
      const Panel = makeTestChannelClass('ComponentDomPanel');
      const m = await mount(liveInputs());
      m.Widget.RegisterChannel(Panel);
      await m.Widget.Start();
      const result = await m.Widget.OpenChannel('ComponentDomPanel', { title: 'Hi' });
      expect(result.success).toBe(true);
      Panel.Instances.at(-1)?.EmitForTest('thing_happened');
      Panel.Instances.at(-1)?.FinishForTest();
      expect(eventsNamed(m, 'mj-channel-opened')[0].detail).toMatchObject({ channel: 'ComponentDomPanel', inputs: { title: 'Hi' } });
      expect(eventsNamed(m, 'mj-channel-event').find((e) => e.detail.name === 'thing_happened')?.detail).toMatchObject({ channel: 'ComponentDomPanel' });
      expect(eventsNamed(m, 'mj-channel-output')[0].detail).toMatchObject({ channel: 'ComponentDomPanel', output: { done: true } });
    });
  });

  describe('the live surface: the hosted overlay', () => {
    it('hands the overlay the agent name and the configured chrome', async () => {
      const m = await mount(liveInputs({ agentName: 'Sage', chrome: 'orb' }));
      await m.Widget.Start();
      await settle();
      expect(Attr(m.Fixture, '.stub-overlay', 'data-agent')).toBe('Sage');
      expect(Attr(m.Fixture, '.stub-overlay', 'data-chrome')).toBe('orb');
    });

    it('moves an auto chrome to console while a channel that renders a surface is open, and back when the call ends', async () => {
      const Panel = makeTestChannelClass('ComponentSurfacePanel');
      Object.defineProperty(Panel.prototype, 'GetSurfaceComponent', { value: () => class FakeSurface {} });
      const m = await mount(liveInputs({ chrome: 'auto' }));
      m.Widget.RegisterChannel(Panel);
      await m.Widget.Start();
      await settle();
      expect(Attr(m.Fixture, '.stub-overlay', 'data-chrome')).toBe('auto');
      await m.Widget.OpenChannel('ComponentSurfacePanel', {});
      await settle();
      expect(Attr(m.Fixture, '.stub-overlay', 'data-chrome')).toBe('console');
      await m.Widget.End();
      await settle();
      expect(Query(m.Fixture, 'mj-realtime-session-overlay')).toBeNull();
    });

    it('never overrides an explicit orb chrome, even with a surface channel open', async () => {
      const Panel = makeTestChannelClass('ComponentOrbPanel');
      Object.defineProperty(Panel.prototype, 'GetSurfaceComponent', { value: () => class FakeSurface {} });
      const m = await mount(liveInputs({ chrome: 'orb' }));
      m.Widget.RegisterChannel(Panel);
      await m.Widget.Start();
      await m.Widget.OpenChannel('ComponentOrbPanel', {});
      await settle();
      expect(Attr(m.Fixture, '.stub-overlay', 'data-chrome')).toBe('orb');
    });

    it('records the visitor pressing End in the overlay, so the session is reported as ended by the user', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await settle();
      stubOverlay(m).Ended.emit();
      await runtime.EndRealtimeSession(); // what the real overlay has already done by the time it emits Ended
      await settle();
      expect(eventsNamed(m, 'mj-session-ended')[0].detail.reason).toBe('user');
    });

    it('reports a call that ended without the visitor pressing End as remote', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await settle();
      await runtime.EndRealtimeSession();
      await settle();
      expect(eventsNamed(m, 'mj-session-ended')[0].detail.reason).toBe('remote');
    });
  });

  describe('the ended and error surfaces', () => {
    it('after the call ends it shows the ended surface, and Restart starts a new call', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await m.Widget.End();
      await settle();
      expect(phase(m)).toBe('ended');
      expect(Query(m.Fixture, '#mjw-ended-title')).not.toBeNull();
      Click(m.Fixture, 'mj-realtime-widget-status button');
      await settle();
      expect(phase(m)).toBe('live');
      expect(eventsNamed(m, 'mj-session-started')).toHaveLength(2);
    });

    it('Try again on the error surface starts again, reporting the failure afresh if it persists', async () => {
      const m = await mount({ requireConsent: false, agentId: 'agent-1' });
      await m.Widget.Start();
      await settle();
      expect(phase(m)).toBe('error');
      Click(m.Fixture, 'mj-realtime-widget-status button');
      await settle();
      expect(eventsNamed(m, 'mj-error')).toHaveLength(2);
      expect(phase(m)).toBe('error');
    });

    it('a failed provider connect lands on the error surface and the next attempt can still succeed', async () => {
      WidgetFakeClient.ConnectError = new Error('provider is down');
      const m = await mount(liveInputs());
      await m.Widget.Start();
      await settle();
      expect(phase(m)).toBe('error');
      WidgetFakeClient.ConnectError = null;
      Click(m.Fixture, 'mj-realtime-widget-status button');
      await settle();
      expect(phase(m)).toBe('live');
    });
  });

  describe('methods', () => {
    it('End() is safe when nothing is live and leaves the widget idle', async () => {
      const m = await mount(liveInputs());
      await expect(m.Widget.End()).resolves.toBeUndefined();
      expect(phase(m)).toBe('idle');
      expect(eventsNamed(m, 'mj-session-ended')).toHaveLength(0);
    });

    it('End() during the consent gate abandons it without starting anything', async () => {
      const m = await mount(liveInputs({ requireConsent: true }));
      await m.Widget.Start();
      await settle();
      expect(phase(m)).toBe('consent');
      await m.Widget.End();
      await settle();
      expect(phase(m)).toBe('idle');
      expect(fx.provider.mints()).toHaveLength(0);
    });

    it('SendContextNote and RequestSpokenResponse reach the live agent, and say so when there is none', async () => {
      const m = await mount(liveInputs());
      expect(m.Widget.RequestSpokenResponse('too early')).toBe(false);
      await m.Widget.Start();
      m.Widget.SendContextNote('The user is on the pricing page.');
      expect(WidgetFakeClient.Notes).toContain('The user is on the pricing page.');
      expect(m.Widget.RequestSpokenResponse('Say hello.')).toBe(true);
      expect(WidgetFakeClient.Spoken).toContain('Say hello.');
    });

    it('OpenChannel resolves to a structured failure when no call is live, and seeds the channel once there is one', async () => {
      const Panel = makeTestChannelClass('ComponentSeedPanel');
      const m = await mount(liveInputs());
      m.Widget.RegisterChannel(Panel);
      expect((await m.Widget.OpenChannel('ComponentSeedPanel', {})).success).toBe(false);
      await m.Widget.Start();
      expect((await m.Widget.OpenChannel('ComponentSeedPanel', { title: 'Seeded' })).success).toBe(true);
      expect(Panel.Instances.at(-1)?.OpenedWith).toMatchObject({ title: 'Seeded' });
    });

    it('exposes the controller for hosts that need the raw streams, and it tracks the same phase as the host attribute', async () => {
      const m = await mount(liveInputs());
      expect(m.Widget.Controller.Phase).toBe('idle');
      await m.Widget.Start();
      await settle();
      expect(m.Widget.Controller.Phase).toBe('live');
      expect(phase(m)).toBe('live');
    });
  });

  describe('closing the page and removing the widget', () => {
    it('a terminal pagehide closes the live session on the server, exactly once', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      expect(fx.closes).toEqual([{ url: 'https://api.example.com/', token: 'live-token', sessionId: SESSION_ID }]);
    });

    it('a pagehide into the back/forward cache leaves the call alone, because the page may come back', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      expect(fx.closes).toEqual([]);
      expect(runtime.IsActive).toBe(true);
    });

    it('a pagehide with no call up sends nothing', async () => {
      await mount(liveInputs());
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      expect(fx.closes).toEqual([]);
    });

    it('destroying the component with a call up hangs it up, closes it server-side, and goes silent', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      const before = m.Events.length;
      m.Fixture.destroy();
      await flush();
      expect(runtime.IsActive).toBe(false);
      expect(fx.closes).toHaveLength(1);
      expect(m.Events.length).toBe(before);
    });

    it('stops listening for pagehide once destroyed', async () => {
      const m = await mount(liveInputs());
      await m.Widget.Start();
      m.Fixture.destroy();
      await flush();
      const closesAfterDestroy = fx.closes.length;
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      expect(fx.closes).toHaveLength(closesAfterDestroy);
    });
  });

  describe('the element registry', () => {
    it('finds the component behind a host element while it is alive, and not after it is destroyed', async () => {
      const m = await mount();
      expect(GetRealtimeWidgetComponent(m.Host)).toBe(m.Widget);
      expect(GetRealtimeWidgetComponent(document.createElement('div'))).toBeNull();
      m.Fixture.destroy();
      expect(GetRealtimeWidgetComponent(m.Host)).toBeNull();
    });
  });
});
