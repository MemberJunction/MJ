import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { GetGlobalObjectStore, MJGlobal } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  InlineTourSource,
  MemoryProgressStore,
  TourSession,
  TourSignals,
  VisualTourDirector,
  type ITourDefinitionSource,
  type ITourHost,
  type ITourProgressStore,
  type ITourServerPredicateEvaluator,
  type TourAnchorResolution,
  type TourDefinition,
  type TourLaunchSource,
  type TourNavigationIntent,
  type TourSessionEventArgs,
  type TourSessionGuideMode,
  type TourSessionView,
  type TourStepView,
} from '@memberjunction/tours-runtime';
import { Subscription } from 'rxjs';
import { AnchorRegistry } from '../anchors/anchor-registry';
import { DomTourAnchorBridge } from '../anchors/dom-tour-anchor-bridge';
import { TourGlobalStylesComponent } from '../overlay/tour-global-styles.component';
import { BaseTourPresenter } from '../presenters/base-tour-presenter';
import { EnsureStandardTourPresentersRegistered } from '../presenters/register-standard-presenters';
import { EnsureStepRendererLoaded } from '../renderers/lazy-step-renderers';
import {
  MJ_TOUR_DEFINITION_SOURCE,
  MJ_TOUR_HOST,
  MJ_TOUR_PREDICATE_EVALUATOR,
  MJ_TOUR_PROGRESS_STORE,
} from './tour-host-tokens';
import { ProviderTourEngine } from './provider-tour-source';
import { SurfaceProgressStore, SurfaceTourSource } from './surface-client';
import { WebTourHost } from './web-tour-host';

EnsureStandardTourPresentersRegistered();

const TOUR_REALTIME_BRIDGE_KEY = '___MJ_TOUR_REALTIME_BRIDGE';

/**
 * Root Guided Tours player host (`<mj-tour-host>`).
 * Connects a host adapter (`MJ_TOUR_HOST` or `WebTourHost`), a definition source &
 * progress store (`TourEngine`/provider, `SurfaceTourSource`, or `InlineTourSource`),
 * a headless `TourSession`, and a Light DOM `BaseTourPresenter` (`Overlay` / `SidePanel` / `Embedded`).
 */
@Component({
  selector: 'mj-tour-host',
  standalone: true,
  imports: [TourGlobalStylesComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-tour-global-styles />
    <ng-container #presenterHost></ng-container>
  `,
})
export class MJTourHostComponent
  extends BaseAngularComponent
  implements OnInit, OnChanges, AfterViewChecked, OnDestroy
{
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injectedHost = inject(MJ_TOUR_HOST, { optional: true });
  private readonly injectedSource = inject(MJ_TOUR_DEFINITION_SOURCE, { optional: true });
  private readonly injectedStore = inject(MJ_TOUR_PROGRESS_STORE, { optional: true });
  private readonly injectedPredicates = inject(MJ_TOUR_PREDICATE_EVALUATOR, { optional: true });

  @ViewChild('presenterHost', { read: ViewContainerRef }) private presenterHost?: ViewContainerRef;

  /** External tour surface key (`MJ: Tour Surfaces.SurfaceKey`) for guest web embeds. */
  @Input() public SurfaceKey: string | null = null;
  /** MJAPI base URL for external web embeds. */
  @Input() public ApiUrl: string | null = null;
  /** Inline tour definitions for static / zero-backend mode. */
  @Input() public Definitions: TourDefinition[] | null = null;
  /** Optional BCP-47 locale override. */
  @Input() public Locale: string | null = null;
  /** Optional navigation handler for URL-based hosts. */
  @Input() public OnNavigate: ((intent: TourNavigationIntent) => boolean | void | Promise<boolean | void>) | null = null;
  /** Optional callback sink for in-memory telemetry events. */
  @Input() public OnRecordEvents: ((events: Parameters<ITourProgressStore['RecordEvents']>[0]) => void | Promise<void>) | null = null;
  /** Automatically starts a tour key once mounted when set. */
  @Input() public AutoStartTourKey: string | null = null;

  @Output() public TourEvent = new EventEmitter<TourSessionEventArgs>();
  @Output() public SessionChanged = new EventEmitter<TourSessionView | null>();

  protected readonly currentView = signal<TourSessionView | null>(null);

  private ownedWebHost: WebTourHost | null = null;
  private anchorBridge: DomTourAnchorBridge | null = null;
  private stopDomObserver: (() => void) | null = null;
  private activeSession: TourSession | null = null;
  private activeDirectorToken: string | null = null;
  private sessionSubs = new Subscription();
  private presenterRef: ComponentRef<BaseTourPresenter> | null = null;
  private mountedPresenterClass: string | null = null;
  private presenterSubs = new Subscription();
  private resolvedAnchorEl: HTMLElement | null = null;
  private resolvedExtraAnchorEls: HTMLElement[] = [];
  private pendingPresenterMount = false;
  private readonly eventListeners = new Map<string, Set<(args: TourSessionEventArgs) => void>>();

  public get ActiveSession(): TourSession | null {
    return this.activeSession;
  }

  public ngOnInit(): void {
    this.stopDomObserver = AnchorRegistry.Instance.ObserveDom();
    this.anchorBridge = new DomTourAnchorBridge({
      Registry: AnchorRegistry.Instance,
      OnHighlight: (el) => {
        this.resolvedAnchorEl = el;
        this.syncPresenterInputs();
      },
    });
    this.registerRealtimeBridge();

    if (this.AutoStartTourKey) {
      void this.Start(this.AutoStartTourKey);
    }
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if ('Definitions' in changes || 'SurfaceKey' in changes || 'ApiUrl' in changes) {
      if (this.AutoStartTourKey && !this.activeSession) {
        void this.Start(this.AutoStartTourKey);
      }
    }
  }

  public ngAfterViewChecked(): void {
    if (this.pendingPresenterMount && this.presenterHost && this.currentView()) {
      this.pendingPresenterMount = false;
      this.mountPresenter(this.currentView()?.PresenterClass ?? 'Overlay');
    }
  }

  public ngOnDestroy(): void {
    this.teardownSession();
    this.destroyPresenter();
    this.stopDomObserver?.();
    this.stopDomObserver = null;
    this.ownedWebHost?.Dispose();
    this.ownedWebHost = null;
    const store = GetGlobalObjectStore();
    if (store) {
      delete store[TOUR_REALTIME_BRIDGE_KEY];
    }
  }

  /**
   * Starts a tour by `tourKey` (or a supplied `TourDefinition`).
   */
  public async Start(
    tourOrKey: string | TourDefinition,
    options?: {
      GuideMode?: TourSessionGuideMode;
      LaunchSource?: TourLaunchSource;
      StartAtStepKey?: string;
    },
  ): Promise<boolean> {
    const host = this.resolveHost();
    const { source, store, predicates } = await this.resolveDataAdapters();

    const definition =
      typeof tourOrKey === 'string'
        ? (await source.GetTourByKey?.(tourOrKey)) ??
          (await source.GetTours(host.GetCurrentLocation?.() ?? {})).find((t) => t.TourKey === tourOrKey) ??
          null
        : tourOrKey;

    if (!definition) {
      return false;
    }

    await this.Stop();

    const session = new TourSession({
      Tour: definition,
      Host: host,
      ProgressStore: store,
      AnchorBridge: this.anchorBridge ?? undefined,
      ServerPredicateEvaluator: predicates ?? undefined,
      GuideMode: options?.GuideMode ?? 'Visual',
      LaunchSource: options?.LaunchSource ?? 'Launcher',
      Locale: this.Locale ?? undefined,
      InitialStepKey: options?.StartAtStepKey,
    });

    const director = new VisualTourDirector();
    const token = session.AttachDirector(director);

    this.activeSession = session;
    this.activeDirectorToken = token;

    this.sessionSubs.add(
      session.SessionView$.subscribe((view) => {
        void this.onSessionViewChanged(view);
      }),
    );

    this.sessionSubs.add(
      session.Events$.subscribe((evt) => {
        this.TourEvent.emit(evt);
        this.dispatchEventToListeners(evt);
        this.hostEl.dispatchEvent(
          new CustomEvent(`mj-tour-${evt.EventName}`, { detail: evt, bubbles: true, composed: true }),
        );
      }),
    );

    return session.Start();
  }

  public async Pause(): Promise<void> {
    await this.activeSession?.Pause();
  }

  public async Resume(): Promise<void> {
    await this.activeSession?.Resume();
  }

  public async Stop(reason?: string): Promise<void> {
    if (!this.activeSession) {
      return;
    }
    const s = this.activeSession;
    await s.Dismiss(reason);
    this.teardownSession();
  }

  public Signal(signalKey: string, payload?: Record<string, unknown>): void {
    TourSignals.Instance.Emit(signalKey, payload);
  }

  public On(eventName: string, handler: (args: TourSessionEventArgs) => void): () => void {
    const set = this.eventListeners.get(eventName) ?? new Set();
    set.add(handler);
    this.eventListeners.set(eventName, set);
    return () => {
      set.delete(handler);
    };
  }

  private async onSessionViewChanged(view: TourSessionView): Promise<void> {
    this.currentView.set(view);
    this.SessionChanged.emit(view);

    if (view.Status === 'Completed' || view.Status === 'Dismissed' || view.Status === 'Snoozed') {
      this.resolvedAnchorEl = null;
      this.resolvedExtraAnchorEls = [];
      this.syncPresenterInputs();
      this.destroyPresenter();
      this.SessionChanged.emit(null);
      return;
    }

    if (view.CurrentStep) {
      await EnsureStepRendererLoaded(view.CurrentStep.StepType);
      await this.resolveStepElements(view.CurrentStep);
    }

    const wantedPresenter = view.PresenterClass || 'Overlay';
    if (!this.presenterRef || this.mountedPresenterClass !== wantedPresenter) {
      if (this.presenterHost) {
        this.mountPresenter(wantedPresenter);
      } else {
        this.pendingPresenterMount = true;
      }
    } else {
      this.syncPresenterInputs();
    }
  }

  private async resolveStepElements(step: TourStepView): Promise<void> {
    if (!this.anchorBridge || !step.Anchor) {
      this.resolvedAnchorEl = null;
      this.resolvedExtraAnchorEls = [];
      return;
    }
    const primary = await this.anchorBridge.ResolveElement(step.Anchor, 250);
    this.resolvedAnchorEl = primary.Element;

    const extrasRaw = (step.Configuration as { ExtraAnchors?: TourStepView['Anchor'][] } | undefined)?.ExtraAnchors;
    const extras: HTMLElement[] = [];
    if (Array.isArray(extrasRaw)) {
      for (const extraAnchor of extrasRaw) {
        if (extraAnchor) {
          const res = await this.anchorBridge.ResolveElement(extraAnchor, 100);
          if (res.Element) {
            extras.push(res.Element);
          }
        }
      }
    }
    this.resolvedExtraAnchorEls = extras;
  }

  private mountPresenter(presenterKey: string): void {
    if (!this.presenterHost) {
      return;
    }
    this.destroyPresenter();
    this.mountedPresenterClass = presenterKey;

    const created = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourPresenter>(
      BaseTourPresenter,
      presenterKey,
    );
    const fallback =
      !created.Resolved && presenterKey !== 'Overlay'
        ? MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourPresenter>(BaseTourPresenter, 'Overlay')
        : null;
    const presenterCls =
      created.Resolved && created.Instance
        ? (created.Instance.constructor as typeof BaseTourPresenter & (new () => BaseTourPresenter))
        : fallback?.Resolved && fallback.Instance
          ? (fallback.Instance.constructor as typeof BaseTourPresenter & (new () => BaseTourPresenter))
          : null;

    if (!presenterCls) {
      return;
    }

    const ref = this.presenterHost.createComponent(presenterCls);
    this.presenterRef = ref;
    this.presenterSubs = new Subscription();
    this.presenterSubs.add(
      ref.instance.NextRequested.subscribe(() => {
        if (this.activeSession) {
          this.activeSession.RequestNext();
        }
      }),
    );
    this.presenterSubs.add(
      ref.instance.BackRequested.subscribe(() => {
        if (this.activeSession && this.activeDirectorToken) {
          void this.activeSession.GoBack(this.activeDirectorToken);
        }
      }),
    );
    this.presenterSubs.add(
      ref.instance.DismissRequested.subscribe(() => {
        void this.Stop('user');
      }),
    );
    this.presenterSubs.add(
      ref.instance.ChoiceMade.subscribe((evt) => {
        if (this.activeSession && this.activeDirectorToken) {
          void this.activeSession.SelectChoice(evt.ChoiceKey, this.activeDirectorToken);
        }
      }),
    );
    this.presenterSubs.add(
      ref.instance.NextTourRequested.subscribe((nextTourKey) => {
        void this.Start(nextTourKey);
      }),
    );

    this.syncPresenterInputs();
  }

  private syncPresenterInputs(): void {
    if (!this.presenterRef) {
      return;
    }
    this.presenterRef.setInput('Provider', this.Provider);
    this.presenterRef.setInput('Session', this.currentView());
    this.presenterRef.setInput('AnchorElement', this.resolvedAnchorEl);
    this.presenterRef.setInput('ExtraAnchorElements', this.resolvedExtraAnchorEls);
    this.presenterRef.changeDetectorRef.detectChanges();
  }

  private destroyPresenter(): void {
    this.presenterSubs.unsubscribe();
    this.presenterSubs = new Subscription();
    this.presenterRef?.destroy();
    this.presenterRef = null;
    this.mountedPresenterClass = null;
    this.presenterHost?.clear();
  }

  private teardownSession(): void {
    this.sessionSubs.unsubscribe();
    this.sessionSubs = new Subscription();
    this.activeSession = null;
    this.activeDirectorToken = null;
    this.currentView.set(null);
    this.resolvedAnchorEl = null;
    this.resolvedExtraAnchorEls = [];
  }

  private resolveHost(): ITourHost {
    if (this.injectedHost) {
      return this.injectedHost;
    }
    if (!this.ownedWebHost) {
      this.ownedWebHost = new WebTourHost({
        SurfaceKey: this.SurfaceKey ?? undefined,
        OnNavigate: this.OnNavigate ?? undefined,
      });
    }
    return this.ownedWebHost;
  }

  private async resolveDataAdapters(): Promise<{
    source: ITourDefinitionSource;
    store: ITourProgressStore;
    predicates: ITourServerPredicateEvaluator | null;
  }> {
    if (this.injectedSource && this.injectedStore) {
      return {
        source: this.injectedSource,
        store: this.injectedStore,
        predicates: this.injectedPredicates,
      };
    }

    if (this.Definitions) {
      return {
        source: this.injectedSource ?? new InlineTourSource(this.Definitions),
        store:
          this.injectedStore ??
          new MemoryProgressStore({ OnRecordEvents: this.OnRecordEvents ?? undefined }),
        predicates: this.injectedPredicates,
      };
    }

    if (this.SurfaceKey) {
      const surfaceSource = new SurfaceTourSource({
        SurfaceKey: this.SurfaceKey,
        ApiUrl: this.ApiUrl,
        Locale: this.Locale ?? undefined,
      });
      return {
        source: this.injectedSource ?? surfaceSource,
        store: this.injectedStore ?? new SurfaceProgressStore(surfaceSource),
        predicates: this.injectedPredicates,
      };
    }

    const engine = ProviderTourEngine.GetProviderInstance(
      this.ProviderToUse,
      ProviderTourEngine,
    ) as ProviderTourEngine;
    await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);

    return {
      source: this.injectedSource ?? engine,
      store: this.injectedStore ?? engine,
      predicates: this.injectedPredicates ?? engine,
    };
  }

  private dispatchEventToListeners(evt: TourSessionEventArgs): void {
    for (const handler of this.eventListeners.get(evt.EventName) ?? []) {
      handler(evt);
    }
    for (const handler of this.eventListeners.get('*') ?? []) {
      handler(evt);
    }
  }

  private registerRealtimeBridge(): void {
    const store = GetGlobalObjectStore();
    if (!store) {
      return;
    }
    store[TOUR_REALTIME_BRIDGE_KEY] = {
      GetActiveStep: () => {
        const view = this.currentView();
        const step = view?.CurrentStep;
        if (!view || !step) {
          return null;
        }
        return {
          TourKey: view.TourKey,
          TourName: view.TourName,
          StepKey: step.StepKey,
          StepTitle: step.Title,
          StepIndex: step.StepIndex,
          StepCount: view.StepCount,
          Mode: step.Mode,
          DirectorType: view.DirectorType,
          GuideNotes: step.GuideNotes,
          VoiceScript: step.VoiceScript,
        };
      },
      GetVisibleAnchors: () => AnchorRegistry.Instance.GetVisibleAnchors(),
      Highlight: async (anchorKey: string, caption?: string) => {
        if (!this.anchorBridge) {
          return { Success: false, ErrorMessage: 'Anchor bridge not ready.' };
        }
        return this.anchorBridge.HighlightAnchor(anchorKey, caption);
      },
      GoToStep: async (stepKey: string) => {
        if (!this.activeSession || !this.activeDirectorToken) {
          return { Success: false, ErrorMessage: 'No active tour session.' };
        }
        try {
          const ok = await this.activeSession.GoToStep(this.activeDirectorToken, stepKey);
          return { Success: ok };
        } catch (err) {
          return { Success: false, ErrorMessage: err instanceof Error ? err.message : String(err) };
        }
      },
      PrepareStep: async (consentGranted?: boolean) => {
        if (consentGranted && this.activeSession) {
          this.activeSession.GrantPrepareNavConsent();
        }
        return { Success: Boolean(this.activeSession) };
      },
      SubscribeEvents: (listener: (event: { Kind: string; TourKey: string; StepKey?: string; StepTitle?: string; VoiceScript?: string; Outcome?: string }) => void) =>
        this.On('*', (evt) => {
          if (evt.EventName === 'AfterTourStart') {
            listener({ Kind: 'tour_started', TourKey: evt.TourKey });
          } else if (evt.EventName === 'AfterTourStepEnter') {
            listener({
              Kind: 'step_entered',
              TourKey: evt.TourKey,
              StepKey: evt.Step.StepKey,
              StepTitle: evt.Step.Title,
            });
          } else if (evt.EventName === 'AfterTourStepComplete') {
            listener({
              Kind: 'step_completed',
              TourKey: evt.TourKey,
              StepKey: evt.StepKey,
              StepTitle: evt.Step.Title,
              Outcome: evt.Outcome.Outcome,
            });
          } else if (evt.EventName === 'AfterTourEnd') {
            listener({ Kind: 'tour_ended', TourKey: evt.TourKey, Outcome: evt.Outcome.Status });
          }
        }),
    };
  }
}
