/**
 * The CALL chunk of the one-script embed: everything heavy, loaded only when a call starts (or is prefetched).
 *
 * The shell (`shell-entry.ts`) is a few tens of KB and imports none of this. It reaches this module through one
 * dynamic `import()` (`shell/session-loader.ts`) and speaks to it through the types in
 * `shell/session-contract.ts`. This file builds the pieces a call needs on first use — an Angular application
 * (so the realtime overlay can render), MemberJunction's default style layer, the runtime and the controller —
 * and hands the shell a {@link WidgetSessionHandle}.
 *
 * zone.js is imported here, not in the shell: it patches the page's timers and promises, and a page that never
 * starts a call must never see that.
 */
import 'zone.js';
import { CSP_NONCE, NgZone, createComponent, provideZoneChangeDetection, type ApplicationRef, type ComponentRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import type { JSONObject } from '@memberjunction/ai';
// ⚠️ DEEP IMPORTS, DELIBERATELY: see `components/realtime-widget.component.ts` for why the barrel is avoided.
import { RealtimeSessionOverlayComponent } from '@memberjunction/ng-conversations/dist/lib/components/realtime/realtime-session-overlay.component';
import { RealtimeSessionService } from '@memberjunction/ng-conversations/dist/lib/services/realtime-session.service';
import { WidgetGlobalStylesComponent } from './lib/components/widget-global-styles.component';
import { EnsureBuiltInChannelsRegistered } from './lib/channels/built-in-channels';
import { CreateChannelClassLoader } from './lib/channels/lazy-channels';
import { WidgetController, type WidgetChannelClass, type WidgetChannelResult } from './lib/session/widget-controller';
import { DefaultRealtimeWidgetPorts } from './lib/session/widget-ports';
import type { WidgetChrome, WidgetConfig } from './lib/types';
import type { WidgetSessionHandle, WidgetSessionOptions } from './shell/session-contract';

/** Bumped with `SHELL_SESSION_CONTRACT_VERSION` when the shell/call contract changes incompatibly. */
export const SESSION_CONTRACT_VERSION = 1;

EnsureBuiltInChannelsRegistered();

let applicationPromise: Promise<ApplicationRef> | null = null;
let stylesRef: ComponentRef<WidgetGlobalStylesComponent> | null = null;

/** One Angular application serves every widget on the page; the first call's nonce styles it. */
function GetApplication(nonce: string | null): Promise<ApplicationRef> {
  if (applicationPromise === null) {
    applicationPromise = createApplication({
      providers: [provideZoneChangeDetection(), ...(nonce ? [{ provide: CSP_NONCE, useValue: nonce }] : [])]
    });
    applicationPromise.catch(() => {
      applicationPromise = null; // retried by the next call
    });
  }
  return applicationPromise;
}

/** Creates the default style layer once, which puts it in the document. */
function EnsureGlobalStyles(app: ApplicationRef): void {
  if (stylesRef === null) {
    stylesRef = createComponent(WidgetGlobalStylesComponent, { environmentInjector: app.injector });
  }
}

/** An `auto` chrome becomes `console` while a surface-bearing channel is open, so a narrow embed never hides it. */
export function EffectiveChrome(chrome: WidgetChrome, surfaceOpen: boolean): WidgetChrome {
  return chrome === 'auto' && surfaceOpen ? 'console' : chrome;
}

/** One element's call: the controller, plus the overlay it renders into the shell's live container. */
class WidgetSession implements WidgetSessionHandle {
  private overlay: ComponentRef<RealtimeSessionOverlayComponent> | null = null;
  private overlayHost: HTMLElement | null = null;
  private overlaySubs: Array<{ unsubscribe(): void }> = [];
  private surfaceOpen = false;

  constructor(
    private readonly app: ApplicationRef,
    private readonly controller: WidgetController,
    private config: WidgetConfig
  ) {}

  public get ErrorMessage(): string {
    return this.controller.ErrorMessage;
  }
  public get Phase$() {
    return this.controller.Phase$;
  }
  public get Events$() {
    return this.controller.Events$;
  }

  public Configure(config: WidgetConfig): void {
    this.config = config;
    this.controller.Configure(config);
    this.applyOverlayInputs();
  }

  public Start(): Promise<void> {
    return this.controller.Start();
  }
  public End(): Promise<void> {
    return this.controller.End('user');
  }
  public OpenChannel(channel: string, inputs: JSONObject): Promise<WidgetChannelResult> {
    return this.controller.OpenChannel(channel, inputs);
  }
  public SendContextNote(text: string): void {
    this.controller.SendContextNote(text);
  }
  public RequestSpokenResponse(text: string): boolean {
    return this.controller.RequestSpokenResponse(text);
  }
  public RegisterChannel(channelClass: WidgetChannelClass): void {
    this.controller.RegisterChannel(channelClass);
  }
  public OnPageHide(persisted: boolean): void {
    this.controller.OnPageHide(persisted);
  }

  public MountOverlay(container: HTMLElement): void {
    if (this.overlay !== null && this.overlayHost === container) {
      return;
    }
    this.UnmountOverlay();
    this.app.injector.get(NgZone).run(() => {
      const ref = createComponent(RealtimeSessionOverlayComponent, { environmentInjector: this.app.injector, hostElement: container });
      this.overlay = ref;
      this.overlayHost = container;
      this.applyOverlayInputs();
      this.overlaySubs.push(
        ref.instance.Ended.subscribe(() => this.controller.NotifyOverlayEnded()),
        this.controller.SurfaceChannelOpen$.subscribe((open) => {
          this.surfaceOpen = open;
          this.applyOverlayInputs();
        })
      );
      this.app.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
    });
  }

  public UnmountOverlay(): void {
    for (const sub of this.overlaySubs.splice(0)) {
      sub.unsubscribe();
    }
    if (this.overlay !== null) {
      const ref = this.overlay;
      this.overlay = null;
      this.overlayHost = null;
      this.app.detachView(ref.hostView);
      ref.destroy();
    }
  }

  public Dispose(): void {
    this.UnmountOverlay();
    this.controller.Dispose();
  }

  private applyOverlayInputs(): void {
    if (this.overlay === null) {
      return;
    }
    this.app.injector.get(NgZone).run(() => {
      this.overlay?.setInput('AgentName', this.config.agentName);
      this.overlay?.setInput('Chrome', EffectiveChrome(this.config.chrome, this.surfaceOpen));
    });
  }
}

/** Creates one element's call. The shell calls this once per element, after the call code has loaded. */
export async function CreateWidgetSession(options: WidgetSessionOptions): Promise<WidgetSessionHandle> {
  const app = await GetApplication(options.Nonce);
  EnsureGlobalStyles(app);
  const runtime = app.injector.get(RealtimeSessionService);
  const controller = new WidgetController({ runtime, ...DefaultRealtimeWidgetPorts(), loadChannelClasses: CreateChannelClassLoader() }, options.Config);
  return new WidgetSession(app, controller, options.Config);
}
