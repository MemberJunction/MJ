import { CSP_NONCE, createComponent, provideZoneChangeDetection, type Injector } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  TourSignals,
  type TourDefinition,
  type TourNavigationIntent,
  type TourRunEvent,
  type TourSessionEventArgs,
  type TourSessionGuideMode,
} from '@memberjunction/tours-runtime';
import { AnchorRegistry } from '../anchors/anchor-registry';
import { ReadCspNonce, TOUR_HOST_TAG } from '../csp-nonce';
import { MJTourHostComponent } from './mj-tour-host.component';

export interface MountToursOptions {
  SurfaceKey?: string;
  ApiUrl?: string;
  Locale?: string;
  Definitions?: TourDefinition[];
  Store?: 'memory' | 'surface';
  OnNavigate?: (intent: TourNavigationIntent) => boolean | void | Promise<boolean | void>;
  OnRecordEvents?: (events: TourRunEvent[]) => void | Promise<void>;
  Container?: HTMLElement;
}

export interface MountedToursHandle {
  Start(tourKey: string, options?: { GuideMode?: TourSessionGuideMode; StartAtStepKey?: string }): Promise<boolean>;
  Pause(): Promise<void>;
  Resume(): Promise<void>;
  Stop(reason?: string): Promise<void>;
  Signal(signalKey: string, payload?: Record<string, unknown>): void;
  On(eventName: string, handler: (args: TourSessionEventArgs) => void): () => void;
  Dispose(): void;
}

/**
 * Registers `<mj-tour-host>` as a browser custom element using Angular Elements (idempotent).
 */
export async function RegisterTourElements(injector?: Injector): Promise<void> {
  if (
    typeof customElements === 'undefined' ||
    typeof HTMLElement === 'undefined' ||
    customElements.get(TOUR_HOST_TAG) !== undefined
  ) {
    return;
  }

  let resolvedInjector = injector;
  if (!resolvedInjector) {
    const app = await createApplication({
      providers: [provideZoneChangeDetection(), { provide: CSP_NONCE, useFactory: () => ReadCspNonce() }],
    });
    resolvedInjector = app.injector;
  }

  // Deferred load (AGENTS.md Rule #8 Category 3 — bundle/Node-test deferral): `@angular/elements`
  // evaluates `class NgElement extends HTMLElement` at module import time, which throws ReferenceError
  // in plain-Node test runners importing `@memberjunction/ng-tours` outside a DOM environment.
  // `@angular/elements` is explicitly declared in `@memberjunction/ng-tours/package.json`.
  const { createCustomElement } = await import('@angular/elements');
  const elementCtor = createCustomElement(MJTourHostComponent, { injector: resolvedInjector });
  customElements.define(TOUR_HOST_TAG, elementCtor);
}

/**
 * Registers a DOM element under an anchor key programmatically (`RegisterAnchor(key, el)`).
 */
export function RegisterAnchor(key: string, element: HTMLElement): () => void {
  return AnchorRegistry.Instance.RegisterAnchor(key, element);
}

/**
 * Programmatically mounts a Light DOM Guided Tours player in any web page or Angular app (§4.2).
 */
export async function MountTours(options: MountToursOptions): Promise<MountedToursHandle> {
  const nonce = ReadCspNonce();
  const app = await createApplication({
    providers: [provideZoneChangeDetection(), ...(nonce ? [{ provide: CSP_NONCE, useValue: nonce }] : [])],
  });

  const container = options.Container ?? (typeof document !== 'undefined' ? document.createElement('div') : null);
  if (container && !container.isConnected && typeof document !== 'undefined') {
    document.body.appendChild(container);
  }

  const ref = createComponent(MJTourHostComponent, {
    environmentInjector: app.injector,
    hostElement: container ?? undefined,
  });

  if (options.SurfaceKey) {
    ref.setInput('SurfaceKey', options.SurfaceKey);
  }
  if (options.ApiUrl) {
    ref.setInput('ApiUrl', options.ApiUrl);
  }
  if (options.Locale) {
    ref.setInput('Locale', options.Locale);
  }
  if (options.Definitions) {
    ref.setInput('Definitions', options.Definitions);
  }
  if (options.OnNavigate) {
    ref.setInput('OnNavigate', options.OnNavigate);
  }
  if (options.OnRecordEvents) {
    ref.setInput('OnRecordEvents', options.OnRecordEvents);
  }

  app.attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();

  return {
    Start: (tourKey, startOpts) => ref.instance.Start(tourKey, startOpts),
    Pause: () => ref.instance.Pause(),
    Resume: () => ref.instance.Resume(),
    Stop: (reason) => ref.instance.Stop(reason),
    Signal: (signalKey, payload) => TourSignals.Instance.Emit(signalKey, payload),
    On: (eventName, handler) => ref.instance.On(eventName, handler),
    Dispose: () => {
      app.detachView(ref.hostView);
      ref.destroy();
      if (container && !options.Container && container.isConnected) {
        container.remove();
      }
      app.destroy();
    },
  };
}
