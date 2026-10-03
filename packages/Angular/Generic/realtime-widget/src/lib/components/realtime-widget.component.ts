/**
 * `<mj-realtime-widget>` — a realtime voice agent, droppable into any page.
 *
 * As an Angular component it is a standalone leaf you place in a template; as a custom element (see
 * `realtime-widget.element.ts`) it is one script tag and one HTML element. The component is thin: the
 * orchestration — authenticating, minting, connecting, ending, the phase machine, the DOM events — lives in
 * the framework-free {@link WidgetController}, and the call itself (voice orb, live thread, channels'
 * surfaces, mute, end) is MJ's own `<mj-realtime-session-overlay>`, hosted here and never rebuilt.
 *
 * Naming note: the `@Input()` members are camelCase on purpose. Angular Elements derives the DOM property from
 * the member name and the attribute from its dash-cased form (`apiUrl` ↔ `api-url`), so the member names ARE
 * the page-author-facing contract; MJ's PascalCase convention applies to everything else here.
 *
 * Light DOM, not Shadow DOM: the hosted overlay and MJ's `mjButton` styles are global/emulated-encapsulation
 * CSS, and `@font-face` does not register from inside a shadow root, so a shadow boundary would unstyle the
 * very controls the widget is made of. Isolation is by the `mjw-` prefix and a cascade layer instead.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  InjectionToken,
  Input,
  OnDestroy,
  AfterViewInit,
  ViewEncapsulation,
  computed,
  inject,
  signal
} from '@angular/core';
import { Subscription } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { IRealtimeSessionLauncher, RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
// ⚠️ DEEP IMPORTS, DELIBERATELY. The package barrel re-exports `ConversationsModule`, whose NgModule metadata
// references Explorer's whole component library; the overlay and the runtime service are standalone, so they
// need none of that. The path is version-coupled to ng-conversations' dist layout (the package publishes no
// `exports` map); `src/__tests__/deep-imports.test.ts` fails loudly if one moves or if the barrel creeps in.
import { RealtimeSessionOverlayComponent } from '@memberjunction/ng-conversations/dist/lib/components/realtime/realtime-session-overlay.component';
import { RealtimeSessionService } from '@memberjunction/ng-conversations/dist/lib/services/realtime-session.service';
import {
  DefaultWidgetConfig,
  ReadBoolean,
  ReadChannelInputs,
  ReadChannelList,
  ReadChrome,
  ReadString,
  ReadThemeMode,
  ReadThemeTokens
} from '../config';
import { FormatWidgetString, ResolveWidgetStrings, type WidgetStrings } from '../strings';
import { BuildThemeTokenMap, ResolveDataTheme } from '../theme/widget-theme';
import { WidgetController, type WidgetChannelClass, type WidgetChannelResult, type WidgetControllerDeps } from '../session/widget-controller';
import { EnsureBuiltInChannelsRegistered } from '../channels/built-in-channels';
import { CreateBrowserWidgetAuth } from '../auth/widget-auth.browser';
import { WidgetKeyClient } from '../auth/widget-key-client';
import { CreateBrowserPageClose } from '../lifecycle/widget-page-close.browser';
import { WidgetResumeStore } from '../resume/widget-resume-store';
import { type WidgetChrome, type WidgetConfig, type WidgetOutboundEvent, type WidgetPhase, type WidgetThemeMode } from '../types';
import { WidgetConsentGateComponent } from './widget-consent-gate.component';
import { WidgetGlobalStylesComponent } from './widget-global-styles.component';
import { WidgetStatusComponent } from './widget-status.component';

// The shipped channels are resolved through the ClassFactory by key; this pins their registration so a
// bundler cannot drop it (see built-in-channels.ts for why a bare Load call is not enough).
EnsureBuiltInChannelsRegistered();

/**
 * The component behind each live `<mj-realtime-widget>` host element. Angular Elements exposes inputs and
 * outputs but not methods, so the custom element looks its component up here to forward `start()`, `end()`
 * and friends — a typed registry, instead of reaching into the framework's private strategy object.
 */
const COMPONENTS_BY_ELEMENT = new WeakMap<HTMLElement, RealtimeWidgetComponent>();

/** Channel classes a page registered on an element before its component existed; claimed on creation. */
const PENDING_CHANNELS_BY_ELEMENT = new WeakMap<HTMLElement, WidgetChannelClass[]>();

/** Remembers a channel class registered on `element` before it was attached; the component registers it when it is created. */
export function QueueRealtimeWidgetChannel(element: HTMLElement, channelClass: WidgetChannelClass): void {
  PENDING_CHANNELS_BY_ELEMENT.set(element, [...(PENDING_CHANNELS_BY_ELEMENT.get(element) ?? []), channelClass]);
}

/** The component driving `element`, or `null` when it is not (or no longer) attached. */
export function GetRealtimeWidgetComponent(element: HTMLElement): RealtimeWidgetComponent | null {
  return COMPONENTS_BY_ELEMENT.get(element) ?? null;
}

/** The collaborators the widget builds its controller from. A host (or a test) replaces any of them. */
export type RealtimeWidgetPorts = Omit<WidgetControllerDeps, 'runtime'>;

/** Production wiring: the browser `fetch`, the real GraphQL provider, `sessionStorage`. */
export function DefaultRealtimeWidgetPorts(): RealtimeWidgetPorts {
  return {
    createAuth: (apiUrl, refresh) => CreateBrowserWidgetAuth(apiUrl, refresh),
    createGuestSessions: (apiUrl, widgetKey) => new WidgetKeyClient(apiUrl, widgetKey),
    createResumeStore: (scope) => new WidgetResumeStore(scope),
    pageClose: CreateBrowserPageClose()
  };
}

/** The ports the widget uses. Provide it to substitute any of them. */
export const REALTIME_WIDGET_PORTS = new InjectionToken<RealtimeWidgetPorts>('REALTIME_WIDGET_PORTS', {
  providedIn: 'root',
  factory: DefaultRealtimeWidgetPorts
});

/**
 * The runtime the widget drives. It MUST be the instance the hosted overlay injects (the root
 * `RealtimeSessionService`), so the default is exactly that; a test that stubs the overlay provides its own.
 */
export const REALTIME_WIDGET_RUNTIME = new InjectionToken<RealtimeSessionRuntime>('REALTIME_WIDGET_RUNTIME', {
  providedIn: 'root',
  factory: () => inject(RealtimeSessionService)
});

@Component({
  selector: 'mj-realtime-widget',
  standalone: true,
  imports: [RealtimeSessionOverlayComponent, WidgetConsentGateComponent, WidgetStatusComponent, WidgetGlobalStylesComponent, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './realtime-widget.component.html',
  styleUrls: ['./realtime-widget.component.css'],
  host: {
    class: 'mjw-host',
    '[attr.data-phase]': 'phase()',
    '[attr.data-theme]': 'dataTheme()',
    '[attr.lang]': 'lang()',
    '[style]': 'tokenStyle()'
  }
})
export class RealtimeWidgetComponent implements AfterViewInit, OnDestroy {
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly subs = new Subscription();
  private config: WidgetConfig = DefaultWidgetConfig();

  /** The orchestration. Public for hosts that need the raw streams; most never touch it. */
  public readonly Controller: WidgetController;

  protected readonly phase = signal<WidgetPhase>('idle');
  protected readonly errorMessage = signal('');
  protected readonly surfaceOpen = signal(false);
  private readonly configSignal = signal<WidgetConfig>(this.config);

  protected readonly strings = computed<WidgetStrings>(() => ResolveWidgetStrings(this.configSignal().locale));
  protected readonly lang = computed(() => this.configSignal().locale ?? null);
  protected readonly displayName = computed(() => this.configSignal().agentName);
  protected readonly startLabel = computed(() => FormatWidgetString(this.strings().start, this.configSignal().agentName));
  protected readonly tokenStyle = computed(() => BuildThemeTokenMap(this.configSignal().themeTokens));
  protected readonly dataTheme = computed(() => {
    const mode = this.configSignal().theme;
    return ResolveDataTheme(mode, this.pageDeclaresTheme(), this.prefersDark());
  });
  /** An `auto` chrome becomes `console` while a surface-bearing channel is open — see {@link WidgetController.SurfaceChannelOpen$}. */
  protected readonly effectiveChrome = computed<WidgetChrome>(() => {
    const chrome = this.configSignal().chrome;
    return chrome === 'auto' && this.surfaceOpen() ? 'console' : chrome;
  });

  constructor() {
    const ports = inject(REALTIME_WIDGET_PORTS);
    this.Controller = new WidgetController({ runtime: inject(REALTIME_WIDGET_RUNTIME), ...ports }, this.config);
    COMPONENTS_BY_ELEMENT.set(this.hostElement, this);
    for (const channelClass of PENDING_CHANNELS_BY_ELEMENT.get(this.hostElement) ?? []) {
      this.Controller.RegisterChannel(channelClass);
    }
    PENDING_CHANNELS_BY_ELEMENT.delete(this.hostElement);
    this.subs.add(
      this.Controller.Phase$.subscribe((p) => {
        this.errorMessage.set(this.Controller.ErrorMessage);
        this.phase.set(p);
      })
    );
    this.subs.add(this.Controller.Events$.subscribe((e) => this.dispatch(e)));
    this.subs.add(this.Controller.SurfaceChannelOpen$.subscribe((open) => this.surfaceOpen.set(open)));
  }

  // ── Inputs (attributes and properties) ─────────────────────────────────────

  /** MJAPI root — `api-url`. */
  @Input() set apiUrl(value: unknown) { this.patch({ apiUrl: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get apiUrl(): string | null { return this.config.apiUrl; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Public widget key (anonymous guest session) — `widget-key`. */
  @Input() set widgetKey(value: unknown) { this.patch({ widgetKey: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get widgetKey(): string | null { return this.config.widgetKey; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Magic-link invite token — `invite-token`. */
  @Input() set inviteToken(value: unknown) { this.patch({ inviteToken: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get inviteToken(): string | null { return this.config.inviteToken; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** A session JWT the page already holds — `token`. */
  @Input() set token(value: unknown) { this.patch({ token: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get token(): string | null { return this.config.token; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** The agent to talk to — `agent-id`. Ignored with a widget key (the server pins the agent). */
  @Input() set agentId(value: unknown) { this.patch({ agentId: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get agentId(): string | null { return this.config.agentId; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** The application the session runs in — `application-id`. */
  @Input() set applicationId(value: unknown) { this.patch({ applicationId: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get applicationId(): string | null { return this.config.applicationId; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** A conversation to continue — `conversation-id`. */
  @Input() set conversationId(value: unknown) { this.patch({ conversationId: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get conversationId(): string | null { return this.config.conversationId; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Channels the page brings, by name — `channels` (comma-separated or JSON) or an array property. */
  @Input() set channels(value: unknown) { this.patch({ channels: ReadChannelList(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get channels(): string[] | null { return this.config.channels; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Seed inputs per channel; each named channel opens with them once the call is live — `channel-inputs` (JSON) or an object property. */
  @Input() set channelInputs(value: unknown) { this.patch({ channelInputs: ReadChannelInputs(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get channelInputs(): Record<string, JSONObject> { return this.config.channelInputs; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** `orb`, `console` or `auto` — `chrome`. */
  @Input() set chrome(value: unknown) { this.patch({ chrome: ReadChrome(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get chrome(): WidgetChrome { return this.config.chrome; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Start by itself once configured — `auto-start`. */
  @Input() set autoStart(value: unknown) { this.patch({ autoStart: ReadBoolean(value, false) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get autoStart(): boolean { return this.config.autoStart; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** Show the consent gate before the microphone starts (default true) — `require-consent`. */
  @Input() set requireConsent(value: unknown) { this.patch({ requireConsent: ReadBoolean(value, true) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get requireConsent(): boolean { return this.config.requireConsent; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /**
   * `light`, `dark` or `auto` — `theme`. An attribute may instead carry a JSON object of `--mj-*` token
   * overrides, which is the same as setting {@link themeTokens}.
   */
  @Input() set theme(value: unknown) { // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
    const mode = ReadThemeMode(value);
    if (mode !== null) {
      this.patch({ theme: mode as WidgetThemeMode });
    } else if (typeof value === 'string' && value.trim().startsWith('{')) {
      this.patch({ themeTokens: ReadThemeTokens(value) });
    }
  }
  get theme(): WidgetThemeMode { return this.config.theme; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** `--mj-*` token overrides (an object property) — repaints the whole widget, overlay included. */
  @Input() set themeTokens(value: unknown) { this.patch({ themeTokens: ReadThemeTokens(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get themeTokens(): Record<string, string> { return this.config.themeTokens; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** BCP-47 locale for the widget's own copy — `locale`. */
  @Input() set locale(value: unknown) { this.patch({ locale: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get locale(): string | null { return this.config.locale; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** The agent's display name — `agent-name`. */
  @Input() set agentName(value: unknown) { this.patch({ agentName: ReadString(value) ?? 'Assistant' }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get agentName(): string { return this.config.agentName; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** The page's CSP nonce — `csp-nonce`. Read at bootstrap by the element bundle; kept here so it is observable. */
  @Input() set cspNonce(value: unknown) { this.patch({ cspNonce: ReadString(value) }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get cspNonce(): string | null { return this.config.cspNonce; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  /** A host-supplied way to mint the session (a JS property; there is no attribute form). */
  @Input() set launcher(value: IRealtimeSessionLauncher | null | undefined) { this.patch({ launcher: value ?? null }); } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)
  get launcher(): IRealtimeSessionLauncher | null { return this.config.launcher; } // case-violation-ok-legacy-back-compat: camelCase is the DOM attribute/property contract (api-url <-> apiUrl)

  // ── Methods ────────────────────────────────────────────────────────────────

  /** Starts the call (consent gate first, when required). */
  public Start(): Promise<void> {
    return this.Controller.Start();
  }

  /** Ends the call. Safe when none is live. */
  public End(): Promise<void> {
    return this.Controller.End('user');
  }

  /** Opens (and seeds) a channel in the live call. */
  public OpenChannel(channel: string, inputs: JSONObject = {}): Promise<WidgetChannelResult> {
    return this.Controller.OpenChannel(channel, inputs);
  }

  /** Tells the agent something in the background; it does not speak a reply. */
  public SendContextNote(text: string): void {
    this.Controller.SendContextNote(text);
  }

  /** Asks the agent to speak, now. Returns whether the request was delivered. */
  public RequestSpokenResponse(text: string): boolean {
    return this.Controller.RequestSpokenResponse(text);
  }

  /** Registers a channel class the page brings. */
  public RegisterChannel(channelClass: WidgetChannelClass): void {
    this.Controller.RegisterChannel(channelClass);
  }

  // ── Template handlers ──────────────────────────────────────────────────────

  protected onStart(): void {
    void this.Controller.Start();
  }

  protected onConsentAccepted(): void {
    void this.Controller.AcceptConsent(false);
  }

  protected onConsentDeclined(): void {
    this.Controller.DeclineConsent();
  }

  protected onOverlayEnded(): void {
    this.Controller.NotifyOverlayEnded();
  }

  @HostListener('window:pagehide', ['$event'])
  protected onPageHide(event: PageTransitionEvent): void {
    this.Controller.OnPageHide(event.persisted);
  }

  public ngAfterViewInit(): void {
    this.Controller.Ready();
  }

  public ngOnDestroy(): void {
    COMPONENTS_BY_ELEMENT.delete(this.hostElement);
    this.subs.unsubscribe();
    this.Controller.Dispose();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private patch(partial: Partial<WidgetConfig>): void {
    this.config = { ...this.config, ...partial };
    this.Controller.Configure(this.config);
    this.configSignal.set(this.config);
  }

  /** Dispatches a controller event as a bubbling, composed DOM event on the host element. */
  private dispatch(event: WidgetOutboundEvent): void {
    this.hostElement.dispatchEvent(new CustomEvent(event.name, { detail: event.detail, bubbles: true, composed: true }));
  }

  private pageDeclaresTheme(): boolean {
    return this.hostElement.parentElement?.closest('[data-theme]') != null;
  }

  private prefersDark(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
