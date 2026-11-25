/**
 * @fileoverview Stage-1 framework-free `<mj-tour-host>` custom element shell,
 * `RegisterTourElements()`, `MountTours()`, and `RegisterAnchor()`.
 *
 * ZERO `@angular/*`, `rxjs`, `zone.js`, or `@memberjunction/*` runtime imports.
 * Enforces idempotent `connectedCallback`, clean `disconnectedCallback`, `oldVal !== newVal`
 * attribute guard, and `:host([hidden]) { display: none; }` (`WCAG` + Custom Elements best practices).
 */

import type {
  TourDefinition,
  TourSessionEventArgs,
  TourSessionGuideMode,
} from '@memberjunction/tours-runtime';
import type { TourSessionModule } from './session-contract';
import { LoadTourSessionModule, ResolveTourSessionUrl } from './session-loader';
import { SharedShellAnchorObserver } from './shell-anchor-observer';
import {
  MatchesShellUrlPattern,
  type TourShellFirstVisitRule,
  type TourShellHandle,
  type TourShellMountOptions,
} from './shell-types';

const TOUR_HOST_TAG = 'mj-tour-host';
const SHELL_STYLE_ID = 'mj-tours-shell-styles';
const SHELL_CSS = `
${TOUR_HOST_TAG}{display:block}
${TOUR_HOST_TAG}([hidden]),${TOUR_HOST_TAG}[hidden]{display:none}
`.trim();

const OBSERVED_ATTRS = [
  'surface-key',
  'api-url',
  'locale',
  'tour-key',
  'auto-start',
  'session-url',
  'csp-nonce',
] as const;

const stylesInstalled = new WeakSet<Document | ShadowRoot>();

function ensureShellStyles(root: Document | ShadowRoot, nonce: string | null): void {
  if (stylesInstalled.has(root)) {
    return;
  }
  stylesInstalled.add(root);
  if (typeof document === 'undefined') {
    return;
  }
  const style = document.createElement('style');
  style.id = SHELL_STYLE_ID;
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  style.textContent = SHELL_CSS;
  (root instanceof Document ? root.head : root).appendChild(style);
}

/**
 * Registers a DOM element under an anchor key in Stage-1 (forwarded to Stage-2 when loaded).
 */
export function RegisterAnchor(key: string, element: HTMLElement): () => void {
  return SharedShellAnchorObserver.RegisterAnchor(key, element);
}

/**
 * Builds the Stage-1 `<mj-tour-host>` custom element constructor.
 */
export function CreateTourShellElementClass(win: Window & typeof globalThis = window): CustomElementConstructor {
  class MJTourHostShellElement extends win.HTMLElement {
    public static get observedAttributes(): string[] {
      return [...OBSERVED_ATTRS];
    }

    private _connected = false;
    private _sessionHandle: TourShellHandle | null = null;
    private _sessionPromise: Promise<TourShellHandle> | null = null;
    private _mountContainer: HTMLElement | null = null;
    private _options: TourShellMountOptions = {};
    private _firstVisitTriggered = new Set<string>();
    private readonly _pendingSignals: Array<{ Key: string; Payload?: Record<string, unknown> }> = [];
    private readonly _pendingListeners = new Map<string, Set<(args: TourSessionEventArgs) => void>>();

    public get SurfaceKey(): string | undefined {
      return this._options.SurfaceKey ?? (this.getAttribute('surface-key') || undefined);
    }
    public set SurfaceKey(val: string | undefined) {
      this._options.SurfaceKey = val;
    }

    public get ApiUrl(): string | undefined {
      return this._options.ApiUrl ?? (this.getAttribute('api-url') || undefined);
    }
    public set ApiUrl(val: string | undefined) {
      this._options.ApiUrl = val;
    }

    public get Definitions(): TourDefinition[] | undefined {
      return this._options.Definitions;
    }
    public set Definitions(val: TourDefinition[] | undefined) {
      this._options.Definitions = val;
    }

    public connectedCallback(): void {
      if (this._connected) {
        return;
      }
      this._connected = true;
      this.upgradeOwnProperties();
      ensureShellStyles(this.getRootNode() as Document | ShadowRoot, this.getAttribute('csp-nonce'));
      SharedShellAnchorObserver.Start(win.document.body);

      const tourKey = this.getAttribute('tour-key');
      const autoStart = this.hasAttribute('auto-start') && this.getAttribute('auto-start') !== 'false';
      if (tourKey && autoStart) {
        void this.Start(tourKey);
      }
    }

    public disconnectedCallback(): void {
      this._connected = false;
      this._sessionHandle?.Dispose();
      this._sessionHandle = null;
      this._sessionPromise = null;
      if (this._mountContainer && this._mountContainer.parentElement === this) {
        this._mountContainer.remove();
      }
      this._mountContainer = null;
    }

    public attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
      if (oldVal === newVal) {
        return;
      }
      if (name === 'surface-key') this._options.SurfaceKey = newVal ?? undefined;
      if (name === 'api-url') this._options.ApiUrl = newVal ?? undefined;
      if (name === 'locale') this._options.Locale = newVal ?? undefined;
      if (name === 'session-url') this._options.SessionUrl = newVal ?? undefined;
      if (name === 'csp-nonce') this._options.CspNonce = newVal ?? undefined;
      if (name === 'tour-key') this._options.AutoStartTourKey = newVal ?? undefined;
    }

    public async Start(
      tourOrKey: string | TourDefinition,
      options?: { GuideMode?: TourSessionGuideMode; StartAtStepKey?: string },
    ): Promise<boolean> {
      const handle = await this.EnsureSession();
      return handle.Start(tourOrKey, options);
    }

    public async Pause(): Promise<void> {
      if (this._sessionHandle) {
        await this._sessionHandle.Pause();
      }
    }

    public async Resume(): Promise<void> {
      if (this._sessionHandle) {
        await this._sessionHandle.Resume();
      }
    }

    public async Stop(reason?: string): Promise<void> {
      if (this._sessionHandle) {
        await this._sessionHandle.Stop(reason);
      }
    }

    public Signal(signalKey: string, payload?: Record<string, unknown>): void {
      if (this._sessionHandle) {
        this._sessionHandle.Signal(signalKey, payload);
      } else {
        this._pendingSignals.push({ Key: signalKey, Payload: payload });
      }
    }

    public On(eventName: string, handler: (args: TourSessionEventArgs) => void): () => void {
      if (this._sessionHandle) {
        return this._sessionHandle.On(eventName, handler);
      }
      const set = this._pendingListeners.get(eventName) ?? new Set();
      set.add(handler);
      this._pendingListeners.set(eventName, set);
      return () => set.delete(handler);
    }

    public EvaluateFirstVisitRules(rules: ReadonlyArray<TourShellFirstVisitRule>): string | null {
      const currentUrl = win.location?.href ?? '';
      for (const rule of rules) {
        if (this._firstVisitTriggered.has(rule.TourKey)) {
          continue;
        }
        if (MatchesShellUrlPattern(rule.UrlPattern ?? '', currentUrl, rule.UrlMatchMode ?? 'glob')) {
          this._firstVisitTriggered.add(rule.TourKey);
          return rule.TourKey;
        }
      }
      return null;
    }

    public async EnsureSession(): Promise<TourShellHandle> {
      if (this._sessionHandle) {
        return this._sessionHandle;
      }
      if (this._sessionPromise) {
        return this._sessionPromise;
      }

      const url = ResolveTourSessionUrl(this._options.SessionUrl ?? this.getAttribute('session-url'), win.document);
      this._sessionPromise = LoadTourSessionModule(url).then(async (mod: TourSessionModule) => {
        if (!this._mountContainer) {
          this._mountContainer = win.document.createElement('div');
          this.appendChild(this._mountContainer);
        }
        const initialAnchors = SharedShellAnchorObserver.GetAnchorKeys()
          .map((key) => {
            const el = SharedShellAnchorObserver.GetElement(key);
            return el ? { Key: key, Element: el } : null;
          })
          .filter((x): x is { Key: string; Element: HTMLElement } => x !== null);

        const handle = await mod.MountToursSession({
          ...this._options,
          SurfaceKey: this.SurfaceKey,
          ApiUrl: this.ApiUrl,
          Locale: this._options.Locale ?? (this.getAttribute('locale') || undefined),
          CspNonce: this._options.CspNonce ?? (this.getAttribute('csp-nonce') || undefined),
          Container: this._mountContainer,
          InitialAnchors: initialAnchors,
        });

        this._sessionHandle = handle;

        for (const [evt, handlers] of this._pendingListeners.entries()) {
          for (const h of handlers) {
            handle.On(evt, h);
          }
        }
        this._pendingListeners.clear();

        for (const sig of this._pendingSignals.splice(0)) {
          handle.Signal(sig.Key, sig.Payload);
        }

        return handle;
      });

      this._sessionPromise.catch(() => {
        this._sessionPromise = null;
      });

      return this._sessionPromise;
    }

    public Configure(options: TourShellMountOptions): void {
      this._options = { ...this._options, ...options };
    }

    private upgradeOwnProperties(): void {
      for (const prop of ['SurfaceKey', 'ApiUrl', 'Definitions'] as const) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
          const val = (this as unknown as Record<string, unknown>)[prop];
          delete (this as unknown as Record<string, unknown>)[prop];
          (this as unknown as Record<string, unknown>)[prop] = val;
        }
      }
    }
  }

  return MJTourHostShellElement;
}

/**
 * Defines `<mj-tour-host>` as a browser custom element if not already registered (idempotent).
 */
export function RegisterTourElements(win: Window & typeof globalThis = window): void {
  if (typeof win.customElements === 'undefined' || win.customElements.get(TOUR_HOST_TAG) !== undefined) {
    return;
  }
  win.customElements.define(TOUR_HOST_TAG, CreateTourShellElementClass(win));
}

interface InternalHostElement extends HTMLElement {
  Configure(options: TourShellMountOptions): void;
  Start(
    tourOrKey: string | TourDefinition,
    options?: { GuideMode?: TourSessionGuideMode; StartAtStepKey?: string },
  ): Promise<boolean>;
  Pause(): Promise<void>;
  Resume(): Promise<void>;
  Stop(reason?: string): Promise<void>;
  Signal(signalKey: string, payload?: Record<string, unknown>): void;
  On(eventName: string, handler: (args: TourSessionEventArgs) => void): () => void;
  EnsureSession(): Promise<TourShellHandle>;
}

/**
 * Programmatic Stage-1 mount API (`MountTours()`): creates or reuses `<mj-tour-host>`,
 * observes `[data-mj-tour-anchor]`, and lazy-loads Stage-2 Angular renderers only when
 * a tour starts or inline/surface definitions require UI.
 */
export async function MountTours(options: TourShellMountOptions = {}): Promise<TourShellHandle> {
  RegisterTourElements();
  SharedShellAnchorObserver.Start();

  let hostEl = document.querySelector<InternalHostElement>(TOUR_HOST_TAG);
  let createdByUs = false;
  if (!hostEl) {
    hostEl = document.createElement(TOUR_HOST_TAG) as InternalHostElement;
    createdByUs = true;
    const parent = options.Container ?? document.body;
    parent.appendChild(hostEl);
  }

  hostEl.Configure(options);

  const handle: TourShellHandle = {
    Start: (tourOrKey, startOpts) => hostEl.Start(tourOrKey, startOpts),
    Pause: () => hostEl.Pause(),
    Resume: () => hostEl.Resume(),
    Stop: (reason) => hostEl.Stop(reason),
    Signal: (key, payload) => hostEl.Signal(key, payload),
    On: (eventName, handler) => hostEl.On(eventName, handler),
    Dispose: () => {
      if (createdByUs && hostEl.isConnected) {
        hostEl.remove();
      }
    },
  };

  if (options.AutoStartTourKey) {
    await handle.Start(options.AutoStartTourKey);
  }

  return handle;
}
