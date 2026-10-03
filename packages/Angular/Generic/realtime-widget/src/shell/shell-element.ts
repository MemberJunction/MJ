/**
 * `<mj-realtime-widget>` as a plain custom element: the small, framework-free shell of the one-script embed.
 *
 * It does everything a page needs BEFORE a call exists — defines the tag, parses the attributes, exposes the
 * whole property/method/event contract, draws the start button, the consent notice and the status surfaces —
 * and hands the call itself (Angular, the realtime overlay, drivers, channels) to a chunk it fetches only when a
 * call starts (see `session-loader.ts`). The phase machine, the queues for calls made early, and the DOM events
 * live in {@link ShellController}; this file is the DOM around it.
 *
 * Light DOM, deliberately: the hosted overlay's styles and the web fonts behind its icons cannot cross a shadow
 * boundary (`@font-face` does not register inside a shadow root). Isolation is by the `mjw-` prefix.
 */
import type { JSONObject } from '@memberjunction/ai';
import { ApplyWidgetInput, AttributeNameFor, DefaultWidgetConfig, PropertyForAttribute, WIDGET_INPUT_PROPERTIES, WIDGET_OBSERVED_ATTRIBUTES, type WidgetInputProperty } from '../lib/config';
import { ReadCspNonce } from '../lib/csp-nonce';
import { REALTIME_WIDGET_TAG } from '../lib/element-types';
import { ResolveWidgetStrings } from '../lib/strings';
import { BuildThemeTokenMap, ResolveDataTheme } from '../lib/theme/widget-theme';
import type { WidgetChannelClass, WidgetChannelResult } from '../lib/session/widget-controller';
import type { WidgetConfig, WidgetOutboundEvent, WidgetPhase } from '../lib/types';
import { CreateSessionFor, PrefetchSession, ResolveSessionUrl } from './session-loader';
import { ShellController } from './shell-controller';
import { SHELL_CSS, SHELL_STYLE_ID } from './shell-styles';
import { BuildConsentView, BuildEndedView, BuildErrorView, BuildLoadingView, BuildStartView } from './shell-view';

/** How long a detached element waits before it is torn down, so moving it in the DOM does not hang up a call. */
const TEARDOWN_DELAY_MS = 10;
/** The fallback delay for `preload="idle"` where `requestIdleCallback` does not exist. */
const IDLE_FALLBACK_MS = 2000;

const stylesInstalled = new WeakSet<Document | ShadowRoot>();

function notAttached(method: string): Error {
  return new Error(`mj-realtime-widget: ${method}() needs the element to be attached to the document first.`);
}

/** Puts the shell's CSS in the element's root once. A constructed stylesheet needs no CSP allowance; a `<style>` carries the nonce. */
function ensureStyles(root: Document | ShadowRoot, nonce: string | null): void {
  if (stylesInstalled.has(root)) {
    return;
  }
  stylesInstalled.add(root);
  if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in root) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(SHELL_CSS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
      // fall through to a <style> element
    }
  }
  const style = document.createElement('style');
  style.id = SHELL_STYLE_ID;
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  style.textContent = SHELL_CSS;
  (root instanceof Document ? root.head : root).appendChild(style);
}

/** The element's implementation, as a class built against a window (so tests can use jsdom's). */
export function CreateShellElementClass(win: Window & typeof globalThis = window): CustomElementConstructor {
  class RealtimeWidgetShellElement extends win.HTMLElement {
    public static get observedAttributes(): string[] {
      return [...WIDGET_OBSERVED_ATTRIBUTES];
    }

    private config: WidgetConfig = DefaultWidgetConfig();
    private controller: ShellController | null = null;
    private readonly pendingChannels: WidgetChannelClass[] = [];
    private teardownTimer: ReturnType<typeof setTimeout> | null = null;
    private renderedKey = '';
    private mountedLive: HTMLElement | null = null;
    private appliedTokens = new Set<string>();
    private themeApplied = false;
    private preloadArmed = false;
    private offPhase: (() => void) | null = null;
    private readonly onPageHide = (event: Event): void => this.controller?.OnPageHide((event as PageTransitionEvent).persisted);

    // ── Lifecycle ────────────────────────────────────────────────────────────

    public connectedCallback(): void {
      this.upgradeProperties();
      if (this.teardownTimer !== null) {
        clearTimeout(this.teardownTimer);
        this.teardownTimer = null;
      }
      if (this.controller === null) {
        this.controller = this.createController();
        this.offPhase = this.controller.OnPhase((phase) => this.onPhase(phase));
        for (const channelClass of this.pendingChannels.splice(0)) {
          this.controller.RegisterChannel(channelClass);
        }
      }
      ensureStyles(this.getRootNode() as Document | ShadowRoot, this.pageNonce());
      win.addEventListener('pagehide', this.onPageHide);
      this.applyHostState();
      this.render(false);
      this.controller.Ready();
      this.armPreload();
    }

    public disconnectedCallback(): void {
      win.removeEventListener('pagehide', this.onPageHide);
      this.teardownTimer = setTimeout(() => {
        this.teardownTimer = null;
        if (!this.isConnected) {
          this.teardown();
        }
      }, TEARDOWN_DELAY_MS);
    }

    public attributeChangedCallback(name: string, _previous: string | null, value: string | null): void {
      const property = PropertyForAttribute(name);
      if (property !== null) {
        this.SetInput(property, value);
      }
    }

    // ── Page-facing methods ──────────────────────────────────────────────────

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public start(): Promise<void> {
      return this.controller ? this.controller.Start() : Promise.reject(notAttached('start'));
    }

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public end(): Promise<void> {
      return this.controller ? this.controller.End() : Promise.resolve();
    }

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public openChannel(channel: string, inputs: JSONObject = {}): Promise<WidgetChannelResult> {
      return this.controller ? this.controller.OpenChannel(channel, inputs) : Promise.reject(notAttached('openChannel'));
    }

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public sendContextNote(text: string): void {
      if (!this.controller) {
        throw notAttached('sendContextNote');
      }
      this.controller.SendContextNote(text);
    }

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public requestSpokenResponse(text: string): boolean {
      if (!this.controller) {
        throw notAttached('requestSpokenResponse');
      }
      return this.controller.RequestSpokenResponse(text);
    }

    // case-violation-ok-legacy-back-compat: the DOM method contract is camelCase (el.openChannel(...))
    public registerChannel(channelClass: WidgetChannelClass): void {
      if (this.controller) {
        this.controller.RegisterChannel(channelClass);
      } else {
        this.pendingChannels.push(channelClass);
      }
    }

    // ── Inputs ───────────────────────────────────────────────────────────────

    /** The value of an input property, as the page reads it back. */
    public ReadInput(property: WidgetInputProperty): unknown {
      return this.config[property];
    }

    /** Applies one attribute or property value and brings everything that depends on it up to date. */
    public SetInput(property: WidgetInputProperty, value: unknown): void {
      const previous = this.config;
      this.config = ApplyWidgetInput(this.config, property, value);
      if (this.controller === null) {
        return;
      }
      this.controller.Configure();
      this.applyHostState();
      if (this.config.preload !== previous.preload || this.config.sessionUrl !== previous.sessionUrl) {
        this.preloadArmed = false;
        this.armPreload();
      }
      this.render(false);
    }

    /**
     * A property set on the element BEFORE this class was defined (the script loaded after the page's own
     * code did) is a plain own property that shadows the accessor. Re-applies each one through the accessor.
     */
    private upgradeProperties(): void {
      for (const property of WIDGET_INPUT_PROPERTIES) {
        if (Object.prototype.hasOwnProperty.call(this, property)) {
          const value = (this as unknown as Record<string, unknown>)[property];
          delete (this as unknown as Record<string, unknown>)[property];
          this.SetInput(property, value);
        }
      }
      for (const method of ['start', 'end', 'openChannel', 'sendContextNote', 'requestSpokenResponse', 'registerChannel'] as const) {
        if (Object.prototype.hasOwnProperty.call(this, method)) {
          delete (this as unknown as Record<string, unknown>)[method];
        }
      }
    }

    // ── Controller wiring ────────────────────────────────────────────────────

    private createController(): ShellController {
      return new ShellController({
        GetConfig: () => this.config,
        GetNonce: () => this.pageNonce(),
        Emit: (event) => this.dispatch(event),
        CreateSession: (options) => CreateSessionFor(ResolveSessionUrl(this.config.sessionUrl), options)
      });
    }

    private pageNonce(): string | null {
      return this.config.cspNonce ?? (ReadCspNonce() || null);
    }

    private dispatch(event: WidgetOutboundEvent): void {
      this.dispatchEvent(new win.CustomEvent(event.name, { detail: event.detail, bubbles: true, composed: true }));
    }

    private onPhase(phase: WidgetPhase): void {
      this.applyHostState();
      this.render(true);
      if (phase === 'idle') {
        this.armPreload();
      }
    }

    private teardown(): void {
      this.offPhase?.();
      this.offPhase = null;
      this.controller?.Dispose();
      this.controller = null;
      this.unmountLive();
      this.replaceChildren();
      this.renderedKey = '';
      this.preloadArmed = false;
    }

    // ── Host attributes (phase, theme, language, tokens) ─────────────────────

    private applyHostState(): void {
      const phase = this.controller?.Phase ?? 'idle';
      this.classList.add('mjw-host');
      this.setAttribute('data-phase', phase);
      const theme = ResolveDataTheme(this.config.theme, this.parentElement?.closest('[data-theme]') != null, this.prefersDark());
      if (theme !== null) {
        this.setAttribute('data-theme', theme);
        this.themeApplied = true;
      } else if (this.themeApplied) {
        this.removeAttribute('data-theme'); // the page now declares its own; defer to it
        this.themeApplied = false;
      }
      if (this.config.locale) {
        this.setAttribute('lang', this.config.locale);
      }
      this.applyTokens(BuildThemeTokenMap(this.config.themeTokens));
    }

    private applyTokens(tokens: Record<string, string>): void {
      for (const name of this.appliedTokens) {
        if (!(name in tokens)) {
          this.style.removeProperty(name);
        }
      }
      this.appliedTokens = new Set(Object.keys(tokens));
      for (const [name, value] of Object.entries(tokens)) {
        this.style.setProperty(name, value);
      }
    }

    private prefersDark(): boolean {
      return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    /**
     * Draws the current phase. Re-draws only when what is shown changed (phase, error text, copy), so a property
     * set while the live call is up never tears its UI down. `moveFocus` hands focus to the new surface's
     * primary action, as a screen-reader or keyboard visitor needs after a phase change.
     */
    private render(moveFocus: boolean): void {
      const controller = this.controller;
      if (controller === null) {
        return;
      }
      const phase = controller.Phase;
      const message = phase === 'error' ? controller.ErrorMessage : '';
      const key = `${phase}|${message}|${this.config.locale ?? ''}|${this.config.agentName}`;
      if (key === this.renderedKey) {
        return;
      }
      this.renderedKey = key;
      if (phase === 'live') {
        this.renderLive(controller);
        return;
      }
      this.unmountLive();
      const ctx = { Strings: ResolveWidgetStrings(this.config.locale), AgentName: this.config.agentName };
      const root = this.ensureRoot();
      switch (phase) {
        case 'idle': {
          const view = BuildStartView(ctx, () => void controller.Start());
          root.replaceChildren(view.root);
          this.armHoverPreload(view.button);
          break;
        }
        case 'consent': {
          const view = BuildConsentView(ctx, () => void controller.AcceptConsent(), () => controller.DeclineConsent());
          root.replaceChildren(view.root);
          if (moveFocus) {
            view.region.focus();
          }
          break;
        }
        case 'ended': {
          const view = BuildEndedView(ctx, () => void controller.Start());
          root.replaceChildren(view.root);
          if (moveFocus) {
            view.primary.focus();
          }
          break;
        }
        case 'error': {
          const view = BuildErrorView(ctx, message, () => void controller.Start());
          root.replaceChildren(view.root);
          if (moveFocus) {
            view.primary.focus();
          }
          break;
        }
        default:
          root.replaceChildren(BuildLoadingView(phase === 'connecting' ? ctx.Strings.connecting : ctx.Strings.booting));
      }
    }

    private ensureRoot(): HTMLElement {
      let root = this.querySelector<HTMLElement>(':scope > .mjw-root');
      if (root === null) {
        root = document.createElement('div');
        root.className = 'mjw-root';
        this.replaceChildren(root);
      }
      return root;
    }

    private renderLive(controller: ShellController): void {
      const session = controller.Session;
      if (session === null) {
        return;
      }
      const container = document.createElement('div');
      container.className = 'mjw-live';
      this.ensureRoot().replaceChildren(container);
      this.mountedLive = container;
      session.MountOverlay(container);
    }

    private unmountLive(): void {
      if (this.mountedLive !== null) {
        this.controller?.Session?.UnmountOverlay();
        this.mountedLive = null;
      }
    }

    // ── Preload ──────────────────────────────────────────────────────────────

    /** Arms the page's `preload` choice. `hover` is armed per start button as it renders. */
    private armPreload(): void {
      if (this.preloadArmed) {
        return;
      }
      this.preloadArmed = true;
      switch (this.config.preload) {
        case 'eager':
          this.prefetch();
          break;
        case 'idle': {
          const idle = (win as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
          if (typeof idle === 'function') {
            idle.call(win, () => this.prefetch());
          } else {
            setTimeout(() => this.prefetch(), IDLE_FALLBACK_MS);
          }
          break;
        }
        default:
          break; // `none` never; `hover` when the button is touched
      }
    }

    private armHoverPreload(button: HTMLButtonElement): void {
      if (this.config.preload !== 'hover') {
        return;
      }
      const once = (): void => this.prefetch();
      for (const type of ['pointerenter', 'focus', 'touchstart']) {
        button.addEventListener(type, once, { once: true, passive: true });
      }
    }

    private prefetch(): void {
      try {
        PrefetchSession(ResolveSessionUrl(this.config.sessionUrl), this.pageNonce());
      } catch (error) {
        console.warn('[mj-realtime-widget] Could not prefetch the call code:', error);
      }
    }
  }

  for (const property of WIDGET_INPUT_PROPERTIES) {
    Object.defineProperty(RealtimeWidgetShellElement.prototype, property, {
      configurable: true,
      enumerable: true,
      get(this: RealtimeWidgetShellElement): unknown {
        return this.ReadInput(property);
      },
      set(this: RealtimeWidgetShellElement, value: unknown): void {
        this.SetInput(property, value);
      }
    });
  }
  return RealtimeWidgetShellElement;
}

/** Defines `<mj-realtime-widget>`. Guarded: a second definition (two bundles on one page) is a no-op. */
export function DefineRealtimeWidgetShell(win: Window & typeof globalThis = window): boolean {
  if (win.customElements.get(REALTIME_WIDGET_TAG) !== undefined) {
    return false;
  }
  win.customElements.define(REALTIME_WIDGET_TAG, CreateShellElementClass(win));
  return true;
}

// Exposed so a test can assert the attribute <-> property naming without re-deriving it.
export { AttributeNameFor };
