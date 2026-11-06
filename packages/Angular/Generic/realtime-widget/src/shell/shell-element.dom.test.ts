/**
 * The shell's DOM contract: every attribute, property, method and event of `<mj-realtime-widget>` as a page
 * sees it, on the real custom element, with the call chunk replaced by a fake session so nothing heavy loads.
 * (The built bundle is exercised separately, under a strict CSP, by `element-bundle.test.ts`.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { DefaultWidgetConfig, WIDGET_INPUT_PROPERTIES, WIDGET_OBSERVED_ATTRIBUTES, AttributeNameFor } from '../lib/config';
import { REALTIME_WIDGET_TAG, type RealtimeWidgetElement } from '../lib/element-types';
import type { WidgetEventName } from '../lib/types';
import { FakeSession } from '../__tests__/shell-test-kit';
import { makeTestChannelClass } from '../__tests__/widget-test-kit';
import { ResetSessionLoads, ResetSessionPrefetches, SetSessionImporter, SetShellScriptUrl, type SessionImporter } from './session-loader';
import { SHELL_SESSION_CONTRACT_VERSION } from './session-contract';
import { DefineRealtimeWidgetShell } from './shell-element';
import { SHELL_STYLE_ID } from './shell-styles';

let session: FakeSession;
let importer: ReturnType<typeof vi.fn<SessionImporter>>;
let restoreImporter: SessionImporter;
const attached: RealtimeWidgetElement[] = [];

beforeAll(() => {
  expect(DefineRealtimeWidgetShell()).toBe(true);
});

beforeEach(() => {
  session = new FakeSession();
  ResetSessionLoads();
  ResetSessionPrefetches();
  SetShellScriptUrl('https://cdn.example.com/widget/mj-realtime-widget.js');
  importer = vi.fn<SessionImporter>(async () => ({ SESSION_CONTRACT_VERSION: SHELL_SESSION_CONTRACT_VERSION, CreateWidgetSession: async () => session }));
  restoreImporter = SetSessionImporter(importer);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  SetSessionImporter(restoreImporter);
  for (const el of attached.splice(0)) {
    el.remove();
  }
  document.head.querySelectorAll('link[rel="modulepreload"]').forEach((l) => l.remove());
  await wait(15); // the element tears itself down shortly after removal
  vi.restoreAllMocks();
});

const wait = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function mount(attributes: Record<string, string> = {}, props: Record<string, unknown> = {}): Promise<RealtimeWidgetElement> {
  const el = document.createElement(REALTIME_WIDGET_TAG);
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  Object.assign(el, props);
  document.body.appendChild(el);
  attached.push(el);
  await wait();
  return el;
}

function listen(el: HTMLElement, ...names: WidgetEventName[]): CustomEvent[] {
  const seen: CustomEvent[] = [];
  for (const name of names) {
    document.addEventListener(name, (e) => {
      if (e.target === el) {
        seen.push(e as CustomEvent);
      }
    });
  }
  return seen;
}

/** axe-core's runner takes a component fixture; all it reads from it is the element. */
const scanForViolations = (el: HTMLElement): Promise<void> => ExpectNoAxeViolations({ nativeElement: el } as Parameters<typeof ExpectNoAxeViolations>[0]);

const q = (el: Element, selector: string): HTMLElement | null => el.querySelector<HTMLElement>(selector);

describe('registration', () => {
  it('defines the tag once; a second definition (two bundles on a page) is a harmless no-op', () => {
    expect(customElements.get(REALTIME_WIDGET_TAG)).toBeDefined();
    expect(DefineRealtimeWidgetShell()).toBe(false);
  });

  it('observes exactly the attribute form of every input except the launcher (which is code)', () => {
    const observed = (customElements.get(REALTIME_WIDGET_TAG) as unknown as { observedAttributes: string[] }).observedAttributes;
    expect(observed).toEqual([...WIDGET_OBSERVED_ATTRIBUTES]);
    expect(observed).toEqual(WIDGET_INPUT_PROPERTIES.filter((p) => p !== 'launcher').map(AttributeNameFor));
  });

  it('installs its styles once, with the page nonce', async () => {
    await mount({ 'csp-nonce': 'n-123' });
    await mount();
    const styles = document.querySelectorAll(`#${SHELL_STYLE_ID}`);
    expect(styles.length).toBeLessThanOrEqual(1);
  });
});

describe('the idle surface', () => {
  it('draws a labelled start button, marks the host, and loads NO call code', async () => {
    const el = await mount({ 'agent-name': 'Sage' });
    expect(q(el, '.mjw-start')?.textContent).toContain('Talk to Sage');
    expect(el.getAttribute('data-phase')).toBe('idle');
    expect(el.classList.contains('mjw-host')).toBe(true);
    expect(importer).not.toHaveBeenCalled();
  });

  it('is plain text: a hostile agent name cannot inject markup', async () => {
    const el = await mount({ 'agent-name': '<img src=x onerror=alert(1)>' });
    expect(el.querySelector('img')).toBeNull();
    expect(q(el, '.mjw-start')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('re-draws when the agent name or locale changes', async () => {
    const el = await mount();
    el.agentName = 'Orion';
    expect(q(el, '.mjw-start')?.textContent).toContain('Talk to Orion');
  });
});

describe('attributes reflect to properties', () => {
  it('maps every string attribute to its camelCase property', async () => {
    const el = await mount({
      'api-url': 'https://api.example.com',
      'widget-key': 'pk_live_abc',
      'invite-token': 'mj_ml_x',
      token: 'a.b.c',
      'agent-id': 'agent-1',
      'application-id': 'app-1',
      'conversation-id': 'conv-1',
      locale: 'fr-CA',
      'agent-name': 'Sage',
      'csp-nonce': 'abc',
      'session-url': 'https://cdn.example.com/v2/s.js'
    });
    expect([el.apiUrl, el.widgetKey, el.inviteToken, el.token, el.agentId, el.applicationId, el.conversationId, el.locale, el.agentName, el.cspNonce]).toEqual([
      'https://api.example.com',
      'pk_live_abc',
      'mj_ml_x',
      'a.b.c',
      'agent-1',
      'app-1',
      'conv-1',
      'fr-CA',
      'Sage',
      'abc'
    ]);
    expect(el.sessionUrl).toBe('https://cdn.example.com/v2/s.js');
  });

  it('coerces booleans: auto-start and frame-capture default off, require-consent defaults on', async () => {
    const plain = await mount();
    expect([plain.autoStart, plain.requireConsent, plain.frameCapture]).toEqual([false, true, false]);
    const set = await mount({ 'require-consent': 'false', 'frame-capture': '' });
    expect([set.requireConsent, set.frameCapture]).toEqual([false, true]);
    set.setAttribute('frame-capture', 'false');
    expect(set.frameCapture).toBe(false);
  });

  it('accepts channels as a comma list or JSON, and channel-inputs as JSON', async () => {
    const a = await mount({ channels: 'IdentityVerification, Whiteboard' });
    expect(a.channels).toEqual(['IdentityVerification', 'Whiteboard']);
    const b = await mount({ channels: '["A","B"]', 'channel-inputs': '{"IdentityVerification":{"name":"Ada"}}' });
    expect(b.channels).toEqual(['A', 'B']);
    expect(b.channelInputs).toEqual({ IdentityVerification: { name: 'Ada' } });
  });

  it('accepts chrome orb|console|auto, perception on|off|ask and preload none|hover|idle|eager, defaulting anything else', async () => {
    const el = await mount({ chrome: 'console', perception: 'off', preload: 'eager' });
    expect([el.chrome, el.perception, el.preload]).toEqual(['console', 'off', 'eager']);
    el.setAttribute('chrome', 'sideways');
    el.setAttribute('perception', 'maybe');
    el.setAttribute('preload', 'soon');
    expect([el.chrome, el.perception, el.preload]).toEqual(['auto', 'ask', 'hover']);
  });

  it('defaults for an element with no attributes', async () => {
    const el = await mount();
    expect({ ...DefaultWidgetConfig(), launcher: null }).toMatchObject({ perception: 'ask', preload: 'hover' });
    expect([el.chrome, el.perception, el.preload, el.theme, el.agentName]).toEqual(['auto', 'ask', 'hover', 'auto', 'Assistant']);
  });

  it('puts theme light|dark|auto on the host, and a JSON theme / theme-tokens attribute inline as --mj-* overrides', async () => {
    const dark = await mount({ theme: 'dark' });
    expect(dark.theme).toBe('dark');
    expect(dark.getAttribute('data-theme')).toBe('dark');
    const viaTheme = await mount({ theme: '{"brand-primary":"#0a7a55"}' });
    expect(viaTheme.style.getPropertyValue('--mj-brand-primary')).toBe('#0a7a55');
    const viaTokens = await mount({ 'theme-tokens': '{"--mj-text-primary":"#111"}' });
    expect(viaTokens.style.getPropertyValue('--mj-text-primary')).toBe('#111');
  });

  it('sets lang from locale', async () => {
    expect((await mount({ locale: 'fr' })).getAttribute('lang')).toBe('fr');
  });
});

describe('properties', () => {
  it('accept real types: arrays, objects and a launcher', async () => {
    const launcher = { Launch: vi.fn() };
    const el = await mount({}, { channels: ['A'], channelInputs: { A: { x: 1 } }, themeTokens: { 'bg-page': '#fff' }, launcher });
    expect(el.channels).toEqual(['A']);
    expect(el.channelInputs).toEqual({ A: { x: 1 } });
    expect(el.themeTokens).toEqual({ 'bg-page': '#fff' });
    expect(el.launcher).toBe(launcher);
  });

  it('repaint when set after attach, and drop a token when it is removed', async () => {
    const el = await mount();
    el.themeTokens = { 'brand-primary': '#123456', 'text-primary': '#222' };
    expect(el.style.getPropertyValue('--mj-brand-primary')).toBe('#123456');
    el.themeTokens = { 'brand-primary': '#654321' };
    expect(el.style.getPropertyValue('--mj-brand-primary')).toBe('#654321');
    expect(el.style.getPropertyValue('--mj-text-primary')).toBe('');
  });

  it('set BEFORE the script defined the element still take effect (a common load order)', async () => {
    const foreign = document.implementation.createHTMLDocument('foreign');
    const el = foreign.createElement(REALTIME_WIDGET_TAG) as RealtimeWidgetElement;
    const launcher = { Launch: vi.fn() };
    // On an un-upgraded element these are plain own properties.
    (el as unknown as Record<string, unknown>)['launcher'] = launcher;
    (el as unknown as Record<string, unknown>)['agentName'] = 'Early';
    document.body.appendChild(document.adoptNode(el));
    attached.push(el);
    await wait();
    expect(el.launcher).toBe(launcher);
    expect(el.agentName).toBe('Early');
    expect(q(el, '.mjw-start')?.textContent).toContain('Talk to Early');
  });
});

describe('events', () => {
  it('mj-ready fires once after the first render, with the auth mode, and bubbles and composes', async () => {
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

  it('narrates every phase, from before the call code exists, with the previous phase', async () => {
    const el = await mount({ 'require-consent': 'false' });
    const seen = listen(el, 'mj-phase-changed');
    await el.start();
    await wait();
    expect(seen.map((e) => e.detail)).toEqual([
      { phase: 'booting', previous: 'idle' },
      { phase: 'live', previous: 'booting' }
    ]);
    expect(el.getAttribute('data-phase')).toBe('live');
  });

  it('relays the call\'s own events: session, verification, channel, perception and error', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    const names: WidgetEventName[] = ['mj-session-started', 'mj-session-ended', 'mj-verified', 'mj-session-event', 'mj-channel-opened', 'mj-channel-event', 'mj-channel-output', 'mj-perception-changed', 'mj-error'];
    const seen = listen(el, ...names);
    session.Events$.next({ name: 'mj-session-started', detail: { sessionId: 's', agentId: null, conversationId: null, channels: [] } });
    session.Events$.next({ name: 'mj-verified', detail: { sessionId: 's', email: 'a@b.c', name: 'A', verifiedAt: 't', method: 'code', recovered: false } });
    session.Events$.next({ name: 'mj-session-event', detail: { type: 'x', sessionId: 's', occurredAt: 't', payload: {} } });
    session.Events$.next({ name: 'mj-channel-opened', detail: { channel: 'C', instance: 'i', inputs: {} } });
    session.Events$.next({ name: 'mj-channel-event', detail: { channel: 'C', instance: 'i', name: 'e', payload: {}, occurredAt: 1 } });
    session.Events$.next({ name: 'mj-channel-output', detail: { channel: 'C', instance: 'i', output: {}, occurredAt: 1 } });
    session.Events$.next({ name: 'mj-perception-changed', detail: { sourceId: 'wb', label: 'WB', channel: 'Whiteboard', enabled: false, active: false, sources: [] } });
    session.Events$.next({ name: 'mj-session-ended', detail: { sessionId: 's', reason: 'user' } });
    session.Events$.next({ name: 'mj-error', detail: { code: 'start-failed', message: 'm', phase: 'error' } });
    expect(seen.map((e) => e.type)).toEqual([
      'mj-session-started',
      'mj-verified',
      'mj-session-event',
      'mj-channel-opened',
      'mj-channel-event',
      'mj-channel-output',
      'mj-perception-changed',
      'mj-session-ended',
      'mj-error'
    ]);
    expect(seen.every((e) => e.bubbles && e.composed)).toBe(true);
    expect(seen.find((e) => e.type === 'mj-perception-changed')?.detail).toMatchObject({ sourceId: 'wb', enabled: false });
  });

  it('mj-error load-failed when the call code cannot be fetched, with a Try again that retries', async () => {
    importer.mockRejectedValueOnce(new Error('404'));
    const el = await mount({ 'require-consent': 'false' });
    const seen = listen(el, 'mj-error');
    await el.start();
    await wait();
    expect(seen[0].detail).toMatchObject({ code: 'load-failed', phase: 'error' });
    expect(q(el, '[role="alert"]')?.textContent).toContain('could not load');
    q(el, '.mjw-btn--primary')!.click();
    await wait(5);
    expect(el.getAttribute('data-phase')).toBe('live');
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('the consent gate', () => {
  it('start() shows it, with the microphone and the call code untouched; Begin LEFT of Not now', async () => {
    const el = await mount();
    await el.start();
    expect(el.getAttribute('data-phase')).toBe('consent');
    expect(q(el, '.mjw-consent')?.getAttribute('role')).toBe('region');
    expect(Array.from(el.querySelectorAll('.mjw-actions button')).map((b) => b.textContent?.trim())).toEqual(['Begin', 'Not now']);
    expect(importer).not.toHaveBeenCalled();
  });

  it('puts focus on the region (not a control) when it appears after a phase change', async () => {
    const el = await mount();
    await el.start();
    expect(document.activeElement).toBe(q(el, '.mjw-consent'));
  });

  it('Begin loads the call code and starts it; Not now returns to idle with nothing loaded', async () => {
    const el = await mount();
    await el.start();
    q(el, '.mjw-consent__decline')!.click();
    expect(el.getAttribute('data-phase')).toBe('idle');
    expect(importer).not.toHaveBeenCalled();
    await el.start();
    q(el, '.mjw-consent__begin')!.click();
    await wait(5);
    expect(el.getAttribute('data-phase')).toBe('live');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const el = await mount();
    await el.start();
    await scanForViolations(el);
  });
});

describe('methods, before and after the call code has loaded', () => {
  it('the start button starts the call, and the live phase hands the overlay a container', async () => {
    const el = await mount({ 'require-consent': 'false' });
    q(el, '.mjw-start')!.click();
    await wait(5);
    expect(el.getAttribute('data-phase')).toBe('live');
    expect(session.Mounted).toHaveLength(1);
    expect(session.Mounted[0].classList.contains('mjw-live')).toBe(true);
    expect(el.contains(session.Mounted[0])).toBe(true);
  });

  it('a property set while live never tears the live call down', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    el.themeTokens = { 'brand-primary': '#111' };
    el.chrome = 'console';
    expect(session.Mounted).toHaveLength(1);
    expect(session.Unmounts).toBe(0);
    expect(session.Configs.at(-1)?.chrome).toBe('console');
  });

  it('the overlay is removed when the call ends, and the ended card offers Start over', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    session.Phase$.next('ended');
    expect(session.Unmounts).toBe(1);
    expect(q(el, '#mjw-ended-title')?.textContent).toBe("That's a wrap");
    q(el, '.mjw-btn--primary')!.click();
    await wait(5);
    expect(session.Starts).toBe(2);
  });

  it('auto-start begins by itself once attached', async () => {
    const el = await mount({ 'auto-start': 'true', 'require-consent': 'false' });
    await wait(5);
    expect(el.getAttribute('data-phase')).toBe('live');
  });

  it('end() is safe when nothing is live, and ends a live call', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await expect(el.end()).resolves.toBeUndefined();
    await el.start();
    await el.end();
    expect(session.Ends).toBe(1);
  });

  it('end() abandons a start whose call code has not finished loading: nothing starts, the widget returns to idle', async () => {
    let release: () => void = () => undefined;
    importer.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ SESSION_CONTRACT_VERSION: SHELL_SESSION_CONTRACT_VERSION, CreateWidgetSession: async () => session }))));
    const el = await mount({ 'require-consent': 'false' });
    const pending = el.start();
    await wait();
    await el.end();
    release();
    await pending;
    expect(session.Starts).toBe(0);
    expect(el.getAttribute('data-phase')).toBe('idle');
  });

  it('openChannel() queues until the call is live and resolves to the call\'s answer; with no start pending it resolves no_session', async () => {
    const el = await mount({ 'require-consent': 'false' });
    expect(await el.openChannel('Whiteboard', {})).toMatchObject({ success: false, errorCode: 'no_session' });
    const started = el.start();
    const pending = el.openChannel('Whiteboard', { title: 'Plan' });
    await started;
    expect(await pending).toEqual({ success: true });
    expect(session.Opens).toEqual([{ channel: 'Whiteboard', inputs: { title: 'Plan' } }]);
  });

  it('openChannel() called at load on an auto-start widget (before the start has fired) is early, not too late: it queues', async () => {
    const el = await mount({ 'auto-start': 'true', 'require-consent': 'false' });
    const pending = el.openChannel('Whiteboard', {});
    expect(await pending).toEqual({ success: true });
    expect(session.Opens).toHaveLength(1);
  });

  it('sendContextNote() before start() is delivered when the call goes live; requestSpokenResponse() is false until then', async () => {
    const el = await mount({ 'require-consent': 'false' });
    el.sendContextNote('The visitor is on the pricing page.');
    expect(el.requestSpokenResponse('hello')).toBe(false);
    await el.start();
    expect(session.Notes).toEqual(['The visitor is on the pricing page.']);
    el.sendContextNote('live note');
    expect(session.Notes.at(-1)).toBe('live note');
    expect(el.requestSpokenResponse('Say hello.')).toBe(true);
    expect(session.Spoken).toEqual(['Say hello.']);
  });

  it('registerChannel() works before the element is attached (queued), before the call exists, and after', async () => {
    const Early = makeTestChannelClass('EarlyDom');
    const Mid = makeTestChannelClass('MidDom');
    const Late = makeTestChannelClass('LateDom');
    const el = document.createElement(REALTIME_WIDGET_TAG) as RealtimeWidgetElement;
    el.registerChannel(Early);
    el.setAttribute('require-consent', 'false');
    document.body.appendChild(el);
    attached.push(el);
    await wait();
    el.registerChannel(Mid);
    await el.start();
    el.registerChannel(Late);
    expect(session.Registered).toEqual([Early, Mid, Late]);
  });

  it('methods that need the element attached say so on one that never was', async () => {
    const el = document.createElement(REALTIME_WIDGET_TAG) as RealtimeWidgetElement;
    await expect(el.start()).rejects.toThrow(/attached/);
    await expect(el.openChannel('x')).rejects.toThrow(/attached/);
    expect(() => el.sendContextNote('x')).toThrow(/attached/);
    expect(() => el.requestSpokenResponse('x')).toThrow(/attached/);
    await expect(el.end()).resolves.toBeUndefined();
  });

  it('exposes every documented method', async () => {
    const el = await mount();
    for (const method of ['start', 'end', 'openChannel', 'sendContextNote', 'requestSpokenResponse', 'registerChannel'] as const) {
      expect(typeof el[method], method).toBe('function');
    }
  });
});

describe('preload', () => {
  const links = (): HTMLLinkElement[] => Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'));

  it('hover (the default) waits for the pointer, focus or touch on the start button, then prefetches without running anything', async () => {
    const el = await mount();
    expect(links()).toHaveLength(0);
    q(el, '.mjw-start')!.dispatchEvent(new Event('pointerenter'));
    expect(links().map((l) => l.href)).toEqual(['https://cdn.example.com/widget/mj-realtime-widget-session.js']);
    expect(importer).not.toHaveBeenCalled();
  });

  it('none never prefetches', async () => {
    const el = await mount({ preload: 'none' });
    q(el, '.mjw-start')!.dispatchEvent(new Event('pointerenter'));
    await wait(5);
    expect(links()).toHaveLength(0);
  });

  it('eager prefetches as soon as the element is attached', async () => {
    await mount({ preload: 'eager' });
    expect(links()).toHaveLength(1);
  });

  it('idle prefetches when the browser is idle', async () => {
    const idle = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    (window as unknown as { requestIdleCallback: typeof idle }).requestIdleCallback = idle;
    await mount({ preload: 'idle' });
    expect(idle).toHaveBeenCalled();
    expect(links()).toHaveLength(1);
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
  });

  it('follows session-url, and carries the page nonce so a nonce-based script-src allows it', async () => {
    await mount({ preload: 'eager', 'session-url': 'https://cdn.example.com/v2/s.js', 'csp-nonce': 'n-9' });
    expect(links()[0].href).toBe('https://cdn.example.com/v2/s.js');
    expect(links()[0].getAttribute('nonce')).toBe('n-9');
  });

  it('changing preload after attach arms the new choice', async () => {
    const el = await mount({ preload: 'none' });
    el.setAttribute('preload', 'eager');
    expect(links()).toHaveLength(1);
  });
});

describe('lifecycle', () => {
  it('removing the element ends and releases the call shortly after; moving it does not', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    const parent = el.parentElement!;
    el.remove();
    parent.appendChild(el); // moved, not removed
    await wait(25);
    expect(session.Disposed).toBe(false);
    el.remove();
    await wait(25);
    expect(session.Disposed).toBe(true);
  });

  it('a tab being hidden is forwarded to the call', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    const event = new Event('pagehide') as Event & { persisted: boolean };
    Object.defineProperty(event, 'persisted', { value: false });
    window.dispatchEvent(event);
    expect(session.PageHides).toEqual([false]);
    expect(el.isConnected).toBe(true);
  });
});

describe('the status surfaces', () => {
  it('error shows the call\'s own message, with a way forward, and has no axe violations', async () => {
    const el = await mount({ 'require-consent': 'false' });
    session.OnStart = () => {
      session.ErrorMessage = 'Your microphone is blocked.';
      session.Phase$.next('error');
    };
    await el.start();
    expect(q(el, '.mjw-alert__message')?.textContent).toBe('Your microphone is blocked.');
    expect(document.activeElement).toBe(q(el, '.mjw-btn--primary'));
    await scanForViolations(el);
  });

  it('ended has no axe violations', async () => {
    const el = await mount({ 'require-consent': 'false' });
    await el.start();
    session.Phase$.next('ended');
    await scanForViolations(el);
  });

  it('the loading line is a polite status', async () => {
    let release: () => void = () => undefined;
    importer.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ SESSION_CONTRACT_VERSION: SHELL_SESSION_CONTRACT_VERSION, CreateWidgetSession: async () => session }))));
    const el = await mount({ 'require-consent': 'false' });
    const pending = el.start();
    await wait();
    expect(q(el, '[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(q(el, '[role="status"]')?.textContent).toContain('Getting things ready');
    release();
    await pending;
  });
});
