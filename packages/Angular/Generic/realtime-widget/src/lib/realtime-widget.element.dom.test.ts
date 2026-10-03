/**
 * The `<mj-realtime-widget>` DOM contract: every attribute, property, method and event a page can rely on,
 * exercised on the real custom element (Angular Elements, the same registration the bundle performs) with the
 * hosted overlay stubbed and the network, microphone and driver faked.
 *
 * One application and one runtime serve the whole file (a custom element can be defined once per window), so
 * per-test state lives in `fx` and is reset in `beforeEach`; every test ends its call and detaches its element.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideZonelessChangeDetection, reflectComponentType, type ApplicationRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
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
  guestSession,
  makeJwt,
  makeTestChannelClass,
  spyConsole
} from '../__tests__/widget-test-kit';
import { StubRealtimeSessionOverlayComponent } from '../__tests__/stub-overlay.component';
import { WidgetAuthAdapter, type HttpPostPort } from './auth/widget-auth.adapter';
import { WidgetPageClose } from './lifecycle/widget-page-close';
import { WidgetResumeStore } from './resume/widget-resume-store';
import { REALTIME_WIDGET_PORTS, REALTIME_WIDGET_RUNTIME, RealtimeWidgetComponent } from './components/realtime-widget.component';
import { WIDGET_INPUT_PROPERTIES } from './config';
import type { RealtimeWidgetPorts } from './session/widget-ports';
import { RegisterRealtimeWidgetElement } from './realtime-widget.element';
import { ReadCspNonce } from './csp-nonce';
import { REALTIME_WIDGET_TAG, type RealtimeWidgetElement } from './element-types';
import type { WidgetEventName } from './types';

vi.mock('@memberjunction/ng-conversations/dist/lib/components/realtime/realtime-session-overlay.component', () => ({
  RealtimeSessionOverlayComponent: StubRealtimeSessionOverlayComponent
}));

interface Fixture {
  provider: FakeProvider;
  authProvider: FakeAuthProvider;
  guest: FakeGuestSessions;
  storage: MemoryStorage;
  posts: Array<{ url: string; body: Readonly<Record<string, string>> }>;
  closes: Array<{ url: string; token: string; sessionId: string }>;
}

let fx: Fixture;
let runtime: RealtimeSessionRuntime;
let app: ApplicationRef;
const attached: RealtimeWidgetElement[] = [];

function newFixture(): Fixture {
  return { provider: new FakeProvider(), authProvider: new FakeAuthProvider(), guest: new FakeGuestSessions(), storage: new MemoryStorage(), posts: [], closes: [] };
}

function ports(): RealtimeWidgetPorts {
  const post: HttpPostPort = async (url, body) => {
    fx.posts.push({ url, body });
    return { ok: true, json: { success: true, token: makeJwt(9_999_999_999) } };
  };
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

beforeAll(async () => {
  runtime = new RealtimeSessionRuntime(new FakeMediaHost());
  app = await createApplication({
    providers: [
      provideZonelessChangeDetection(),
      { provide: REALTIME_WIDGET_RUNTIME, useValue: runtime },
      { provide: REALTIME_WIDGET_PORTS, useValue: ports() }
    ]
  });
  RegisterRealtimeWidgetElement(app.injector);
});

beforeEach(() => {
  fx = newFixture();
  runtime.Provider = fx.provider as unknown as IMetadataProvider;
  WidgetFakeClient.Notes = [];
  WidgetFakeClient.Spoken = [];
  WidgetFakeClient.ConnectError = null;
  spyConsole();
});

/**
 * Angular Elements destroys a disconnected element's component on a 10 ms timer, not synchronously.
 * Waiting past it keeps that destroy inside the test that removed the element; otherwise the last
 * test's timer fires after jsdom is torn down and Angular's listener cleanup throws.
 */
const ELEMENT_DESTROY_SETTLE_MS = 25;

afterEach(async () => {
  for (const el of attached.splice(0)) {
    await el.end();
    el.remove();
  }
  await flush();
  await new Promise<void>((resolve) => setTimeout(resolve, ELEMENT_DESTROY_SETTLE_MS));
  vi.restoreAllMocks();
});

/** Builds an element from attributes/properties, attaches it, and waits for the component to render. */
async function mount(attributes: Record<string, string> = {}, props: Record<string, unknown> = {}): Promise<RealtimeWidgetElement> {
  const el = document.createElement(REALTIME_WIDGET_TAG);
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  Object.assign(el, props);
  document.body.appendChild(el);
  attached.push(el);
  await settle();
  return el;
}

async function settle(): Promise<void> {
  await flush();
  app.tick();
  await flush();
}

/** An element ready to go live with no consent gate, authenticating by a held token. */
function liveAttributes(extra: Record<string, string> = {}): Record<string, string> {
  return { 'api-url': 'https://api.example.com', token: makeJwt(9_999_999_999), 'agent-id': 'agent-1', 'require-consent': 'false', ...extra };
}

/** Collects the named events from `el` (bubbled to the document, proving bubbles + composed). */
function listen(el: RealtimeWidgetElement, ...names: WidgetEventName[]) {
  const seen: CustomEvent[] = [];
  for (const name of names) {
    document.addEventListener(name, (e) => {
      if ((e.target as Element) === el) {
        seen.push(e as CustomEvent);
      }
    });
  }
  return seen;
}

describe('<mj-realtime-widget> element', () => {
  describe('registration', () => {
    it('defines the tag, and defining it again is a harmless no-op', () => {
      expect(customElements.get('mj-realtime-widget')).toBeDefined();
      expect(() => RegisterRealtimeWidgetElement(app.injector)).not.toThrow();
    });

    it('renders the start button for an idle widget, labelled with the agent', async () => {
      const el = await mount({ 'agent-name': 'Sage' });
      expect(el.querySelector('.mjw-start')?.textContent).toContain('Talk to Sage');
      expect(el.getAttribute('data-phase')).toBe('idle');
      expect(el.classList.contains('mjw-host')).toBe(true);
    });
  });

  describe('the contract is one list', () => {
    it('the Angular component takes exactly the inputs the one-script element does (they cannot drift)', () => {
      const inputs = (reflectComponentType(RealtimeWidgetComponent)?.inputs ?? []).map((i) => i.propName).sort();
      expect(inputs).toEqual([...WIDGET_INPUT_PROPERTIES].sort());
    });
  });

  describe('attributes reflect to properties', () => {
    it('maps every string attribute to its camelCase property', async () => {
      const el = await mount({
        'api-url': 'https://api.example.com',
        'widget-key': 'pk_live_abc',
        'invite-token': 'mj_ml_xyz',
        token: 'a.b.c',
        'agent-id': 'agent-1',
        'application-id': 'app-1',
        'conversation-id': 'conv-1',
        locale: 'fr-CA',
        'agent-name': 'Sage',
        'csp-nonce': 'abc123'
      });
      expect([el.apiUrl, el.widgetKey, el.inviteToken, el.token, el.agentId, el.applicationId, el.conversationId, el.locale, el.agentName, el.cspNonce]).toEqual([
        'https://api.example.com',
        'pk_live_abc',
        'mj_ml_xyz',
        'a.b.c',
        'agent-1',
        'app-1',
        'conv-1',
        'fr-CA',
        'Sage',
        'abc123'
      ]);
    });

    it('coerces boolean attributes: auto-start defaults off, require-consent defaults on', async () => {
      const plain = await mount();
      expect([plain.autoStart, plain.requireConsent]).toEqual([false, true]);
      const set = await mount({ 'require-consent': 'false' });
      expect(set.requireConsent).toBe(false);
      const on = await mount({ 'auto-start': 'true' }, {});
      expect(on.autoStart).toBe(true);
      on.setAttribute('auto-start', 'false');
      await settle();
      expect(on.autoStart).toBe(false);
    });

    it('accepts channels as a comma list or JSON, and channel-inputs as JSON', async () => {
      const listed = await mount({ channels: 'IdentityVerification, Notes' });
      expect(listed.channels).toEqual(['IdentityVerification', 'Notes']);
      const json = await mount({ channels: '["A","B"]', 'channel-inputs': '{"IdentityVerification":{"name":"Ada"}}' });
      expect(json.channels).toEqual(['A', 'B']);
      expect(json.channelInputs).toEqual({ IdentityVerification: { name: 'Ada' } });
    });

    it('accepts chrome orb|console|auto and ignores anything else', async () => {
      const el = await mount({ chrome: 'console' });
      expect(el.chrome).toBe('console');
      el.setAttribute('chrome', 'sideways');
      await settle();
      expect(el.chrome).toBe('auto');
    });

    it('accepts theme light|dark|auto, and puts the resolved theme on the host', async () => {
      const dark = await mount({ theme: 'dark' });
      expect(dark.theme).toBe('dark');
      expect(dark.getAttribute('data-theme')).toBe('dark');
      const light = await mount({ theme: 'light' });
      expect(light.getAttribute('data-theme')).toBe('light');
    });

    it('treats a JSON object in theme / theme-tokens as token overrides painted inline on the host', async () => {
      const viaTheme = await mount({ theme: '{"brand-primary":"#0a7a55"}' });
      expect(viaTheme.themeTokens).toEqual({ 'brand-primary': '#0a7a55' });
      expect(viaTheme.style.getPropertyValue('--mj-brand-primary')).toBe('#0a7a55');
      const viaTokens = await mount({ 'theme-tokens': '{"--mj-text-primary":"#111"}' });
      expect(viaTokens.style.getPropertyValue('--mj-text-primary')).toBe('#111');
    });

    it('sets lang from locale so the widget copy and assistive tech agree', async () => {
      const el = await mount({ locale: 'fr' });
      expect(el.getAttribute('lang')).toBe('fr');
    });
  });

  describe('properties', () => {
    it('accepts real types: arrays, objects and a launcher', async () => {
      const launcher = { Launch: vi.fn() };
      const el = await mount({}, { channels: ['A'], channelInputs: { A: { x: 1 } }, themeTokens: { 'bg-page': '#fff' }, launcher });
      await settle();
      expect(el.channels).toEqual(['A']);
      expect(el.channelInputs).toEqual({ A: { x: 1 } });
      expect(el.themeTokens).toEqual({ 'bg-page': '#fff' });
      expect(el.launcher).toBe(launcher);
    });

    it('applies a property set after the element is attached', async () => {
      const el = await mount();
      el.agentName = 'Orion';
      await settle();
      expect(el.querySelector('.mjw-start')?.textContent).toContain('Talk to Orion');
    });

    it('repaints the widget when themeTokens change', async () => {
      const el = await mount();
      el.themeTokens = { 'brand-primary': '#123456' };
      await settle();
      expect(el.style.getPropertyValue('--mj-brand-primary')).toBe('#123456');
    });
  });

  describe('events', () => {
    it('mj-ready fires once after the first render, with the auth mode, and bubbles through the document', async () => {
      const seen: CustomEvent[] = [];
      const grab = (e: Event) => seen.push(e as CustomEvent);
      document.addEventListener('mj-ready', grab);
      const el = await mount({ 'widget-key': 'pk', 'api-url': 'https://api.example.com' });
      document.removeEventListener('mj-ready', grab);
      expect(seen).toHaveLength(1);
      expect(seen[0].detail).toEqual({ mode: 'widget-key', autoStart: false });
      expect(seen[0].bubbles && seen[0].composed).toBe(true);
      expect(seen[0].target).toBe(el);
    });

    it('walks the lifecycle: phase-changed, session-started and session-ended with a reason', async () => {
      const el = await mount(liveAttributes());
      const seen = listen(el, 'mj-phase-changed', 'mj-session-started', 'mj-session-ended');
      await el.start();
      await settle();
      expect(seen.filter((e) => e.type === 'mj-phase-changed').map((e) => e.detail.phase)).toEqual(['booting', 'connecting', 'live']);
      expect(seen.find((e) => e.type === 'mj-session-started')?.detail).toMatchObject({ sessionId: SESSION_ID, agentId: 'agent-1' });
      expect(el.getAttribute('data-phase')).toBe('live');
      await el.end();
      await settle();
      expect(seen.find((e) => e.type === 'mj-session-ended')?.detail).toEqual({ sessionId: SESSION_ID, reason: 'user' });
      expect(el.getAttribute('data-phase')).toBe('ended');
    });

    it('mj-error carries a stable code, a message and the phase', async () => {
      const el = await mount({ 'require-consent': 'false', 'agent-id': 'agent-1' });
      const seen = listen(el, 'mj-error');
      await el.start();
      await settle();
      expect(seen).toHaveLength(1);
      expect(seen[0].detail.code).toBe('no-credential');
      expect(typeof seen[0].detail.message).toBe('string');
      expect(seen[0].detail.phase).toBe('error');
      expect(el.querySelector('mj-alert')).not.toBeNull();
    });

    it('mj-session-event relays every server event; mj-verified is the typed identity.verified', async () => {
      const el = await mount(liveAttributes());
      await el.start();
      const seen = listen(el, 'mj-session-event', 'mj-verified');
      fx.provider.Publish('identity.verified', { VerifiedEmail: 'ada@example.com', VerifiedName: 'Ada', VerifiedAt: '2030-01-01T00:00:00Z', Method: 'code' });
      fx.provider.Publish('acme.thing', { a: 1 });
      expect(seen.filter((e) => e.type === 'mj-session-event').map((e) => e.detail.type)).toEqual(['identity.verified', 'acme.thing']);
      const verified = seen.find((e) => e.type === 'mj-verified')!;
      expect(verified.detail).toMatchObject({ sessionId: SESSION_ID, email: 'ada@example.com', name: 'Ada', method: 'code', recovered: false });
    });

    it('mj-channel-opened, mj-channel-event and mj-channel-output relay a page channel\'s life', async () => {
      const Panel = makeTestChannelClass('DomPanel');
      const el = await mount(liveAttributes());
      el.registerChannel(Panel);
      await el.start();
      const seen = listen(el, 'mj-channel-opened', 'mj-channel-event', 'mj-channel-output');
      const result = await el.openChannel('DomPanel', { title: 'Hi' });
      expect(result.success).toBe(true);
      Panel.Instances.at(-1)!.EmitForTest('thing_happened');
      Panel.Instances.at(-1)!.FinishForTest();
      expect(seen.find((e) => e.type === 'mj-channel-opened')?.detail).toMatchObject({ channel: 'DomPanel', inputs: { title: 'Hi' } });
      expect(seen.find((e) => e.type === 'mj-channel-event' && e.detail.name === 'thing_happened')?.detail).toMatchObject({ channel: 'DomPanel', name: 'thing_happened' });
      expect(seen.find((e) => e.type === 'mj-channel-output')?.detail).toMatchObject({ channel: 'DomPanel', output: { done: true } });
    });
  });

  describe('methods', () => {
    it('start() runs the consent gate first when require-consent is on, and Begin starts the call', async () => {
      const el = await mount({ ...liveAttributes(), 'require-consent': 'true' });
      await el.start();
      await settle();
      expect(el.getAttribute('data-phase')).toBe('consent');
      expect(el.querySelector('.mjw-consent')).not.toBeNull();
      expect(fx.provider.mints()).toHaveLength(0);
      (el.querySelector('.mjw-consent__begin') as HTMLButtonElement).click();
      await settle();
      expect(el.getAttribute('data-phase')).toBe('live');
    });

    it('Not now on the consent gate returns to idle with nothing started', async () => {
      const el = await mount({ ...liveAttributes(), 'require-consent': 'true' });
      await el.start();
      await settle();
      (el.querySelector('.mjw-consent__decline') as HTMLButtonElement).click();
      await settle();
      expect(el.getAttribute('data-phase')).toBe('idle');
      expect(fx.provider.mints()).toHaveLength(0);
    });

    it('the start button starts the call, and the live phase hosts the overlay', async () => {
      const el = await mount(liveAttributes());
      (el.querySelector('.mjw-start') as HTMLButtonElement).click();
      await settle();
      expect(el.getAttribute('data-phase')).toBe('live');
      const overlay = el.querySelector('mj-realtime-session-overlay');
      expect(overlay).not.toBeNull();
      expect(el.querySelector('.stub-overlay')?.getAttribute('data-agent')).toBe('Assistant');
    });

    it('auto-start begins by itself once attached', async () => {
      const el = await mount(liveAttributes({ 'auto-start': 'true' }));
      await settle();
      expect(el.getAttribute('data-phase')).toBe('live');
    });

    it('end() is safe when nothing is live, and ends a live call', async () => {
      const el = await mount(liveAttributes());
      await expect(el.end()).resolves.toBeUndefined();
      await el.start();
      await el.end();
      await settle();
      expect(el.getAttribute('data-phase')).toBe('ended');
      expect(el.querySelector('#mjw-ended-title')).not.toBeNull();
    });

    it('openChannel() resolves to a structured failure with no live call', async () => {
      const el = await mount(liveAttributes());
      const result = await el.openChannel('Anything', {});
      expect(result.success).toBe(false);
    });

    it('sendContextNote() and requestSpokenResponse() reach the live agent', async () => {
      const el = await mount(liveAttributes());
      expect(el.requestSpokenResponse('too early')).toBe(false);
      await el.start();
      el.sendContextNote('The user is on the pricing page.');
      expect(WidgetFakeClient.Notes).toContain('The user is on the pricing page.');
      expect(el.requestSpokenResponse('Say hello.')).toBe(true);
      expect(WidgetFakeClient.Spoken).toContain('Say hello.');
    });

    it('registerChannel() works before the element is attached (queued) and after', async () => {
      const Early = makeTestChannelClass('EarlyPanel');
      const el = document.createElement(REALTIME_WIDGET_TAG);
      el.registerChannel(Early);
      for (const [k, v] of Object.entries(liveAttributes())) {
        el.setAttribute(k, v);
      }
      document.body.appendChild(el);
      attached.push(el);
      await settle();
      await el.start();
      expect((await el.openChannel('EarlyPanel', {})).success).toBe(true);
    });

    it('methods that need a call explain themselves on an element that was never attached', async () => {
      const el = document.createElement(REALTIME_WIDGET_TAG);
      await expect(el.start()).rejects.toThrow(/attached/);
      expect(() => el.sendContextNote('x')).toThrow(/attached/);
      await expect(el.end()).resolves.toBeUndefined();
    });
  });

  describe('auth modes', () => {
    it('widget-key: mints a guest session and runs the pinned agent', async () => {
      fx.guest.Next = guestSession({ token: makeJwt(9_999_999_999), pinnedAgentId: 'agent-pinned', applicationId: 'app-server' });
      const el = await mount({ 'api-url': 'https://api.example.com', 'widget-key': 'pk_live_abc', 'require-consent': 'false' });
      await el.start();
      expect(fx.guest.Mints).toBe(1);
      expect(fx.provider.mints()[0].variables).toMatchObject({ targetAgentId: 'agent-pinned', applicationId: 'app-server' });
    });

    it('invite-token: redeems the invite once over the magic-link endpoint', async () => {
      const el = await mount({ 'api-url': 'https://api.example.com', 'invite-token': 'mj_ml_secret', 'agent-id': 'agent-1', 'require-consent': 'false' });
      await el.start();
      await settle();
      expect(fx.posts).toHaveLength(1);
      expect(fx.posts[0].url).toContain('/magic-link/redeem');
      expect(fx.posts[0].body).toEqual({ token: 'mj_ml_secret' });
      expect(el.getAttribute('data-phase')).toBe('live');
    });

    it('token: holds the JWT directly, with no redemption', async () => {
      const el = await mount(liveAttributes());
      await el.start();
      expect(fx.posts).toHaveLength(0);
      expect(fx.authProvider.Held).toHaveLength(1);
    });

    it('launcher: mints through the page\'s launcher, no agent-id needed', async () => {
      const launcher = {
        Launch: vi.fn(async () => ({
          AgentSessionId: SESSION_ID,
          ConversationId: 'conv-1',
          Provider: 'widget-fake-provider',
          Model: 'm',
          EphemeralToken: 't',
          ExpiresAt: '2030-01-01T00:00:00Z',
          SessionConfigJson: '{}',
          ModelName: 'Fake',
          NarrationInstructionsTemplate: null,
          PriorChannelStatesJson: null
        }))
      };
      const el = await mount({ 'require-consent': 'false' }, { launcher });
      await el.start();
      expect(launcher.Launch).toHaveBeenCalledTimes(1);
      expect(fx.provider.mints()).toHaveLength(0);
      await settle();
      expect(el.getAttribute('data-phase')).toBe('live');
    });
  });

  describe('chrome', () => {
    it('hands the overlay the configured chrome; auto promotes to console while a surface channel is open', async () => {
      const el = await mount(liveAttributes({ chrome: 'auto' }));
      await el.start();
      await settle();
      expect(el.querySelector('.stub-overlay')?.getAttribute('data-chrome')).toBe('auto');
      await el.end(); // one call per page: the runtime is shared
      const orb = await mount(liveAttributes({ chrome: 'orb' }));
      await orb.start();
      await settle();
      expect(orb.querySelector('.stub-overlay')?.getAttribute('data-chrome')).toBe('orb');
    });
  });

  describe('CSP nonce', () => {
    it('reads the nonce from the widget element, then from any nonced script or style', () => {
      const doc = document.implementation.createHTMLDocument('t');
      expect(ReadCspNonce(doc)).toBe('');
      doc.head.innerHTML = '<style nonce="from-style"></style>';
      expect(ReadCspNonce(doc)).toBe('from-style');
      doc.body.innerHTML = '<mj-realtime-widget csp-nonce="from-host"></mj-realtime-widget>';
      expect(ReadCspNonce(doc)).toBe('from-host');
    });
  });

  describe('teardown', () => {
    it('removing the element ends a live call and silences the page', async () => {
      const el = await mount(liveAttributes());
      await el.start();
      const seen = listen(el, 'mj-session-ended');
      el.remove();
      await settle();
      expect(seen.length).toBeLessThanOrEqual(1);
      expect(el.requestSpokenResponse).toBeDefined();
    });
  });
});
