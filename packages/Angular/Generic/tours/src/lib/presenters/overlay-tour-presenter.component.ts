import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { ISpotlightStepConfig, TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { Subscription } from 'rxjs';
import { AnchorRegistry } from '../anchors/anchor-registry';
import { TourFocusManager } from '../overlay/focus-manager';
import {
  AutoUpdateOverlayPosition,
  PositionAnchoredOverlay,
  type OverlayPlacementSide,
} from '../overlay/positioning';
import { SiblingInertManager } from '../overlay/sibling-inert';
import {
  TourSpotlightOverlayComponent,
  type SpotlightCutoutRect,
} from '../overlay/tour-spotlight-overlay.component';
import { BaseTourStepRenderer } from '../renderers/base-step-renderer';
import { EnsureStepRendererLoaded, ResolveTourStepRendererKey } from '../renderers/lazy-step-renderers';
import { EnsureStandardTourRenderersRegistered } from '../renderers/register-standard-renderers';
import { TourCardHairlineComponent } from '../renderers/tour-step-chrome.component';
import { BaseTourPresenter } from './base-tour-presenter';
import { TourVoiceDockComponent, type TourVoiceBarContext } from './tour-voice-dock.component';

EnsureStandardTourRenderersRegistered();

export interface PointerHighlightRect {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
  CaptionTop: number;
  CaptionLeft: number;
  Caption?: string;
}

const MODAL_STEP_TYPES = new Set([
  'Spotlight',
  'Modal',
  'Choice',
  'Media',
  'EmbeddedComponent',
  'InteractiveComponent',
  'AskAgent',
]);

/**
 * Default `'Overlay'` presenter (§5.1 & §15):
 * - Renders Precision Glass card with magnetic double-halo SVG `evenodd` spotlight mask (`aria-hidden="true"`)
 * - Renders secondary Sage Pointer Highlight ring (`Session.PointerHighlight`) without disturbing primary spotlight
 * - Hosts embedded Sage voice dock (`VoiceBarTemplate` + inline `PendingDemonstrationConfirmation` gate)
 * - Applies sibling-subtree `inert` ONLY on modal steps (keeping spotlighted target + live region active!)
 * - Positions anchored popovers via `PositionAnchoredOverlay` + `AutoUpdateOverlayPosition`
 * - Manages `Esc`, `F6` (non-modal target toggle), `Tab` cycling, and focus restoration
 */
@RegisterClass(BaseTourPresenter, 'Overlay')
@Component({
  selector: 'mj-tour-overlay-presenter',
  standalone: true,
  imports: [TourSpotlightOverlayComponent, TourCardHairlineComponent, TourVoiceDockComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #liveRegion class="mjt-live-region" aria-live="polite" aria-atomic="true">
      {{ effectiveAnnouncement() }}
    </div>

    @if (Session && Session.CurrentStep; as step) {
      @if (showSpotlightMask()) {
        <mj-tour-spotlight-overlay
          [Visible]="true"
          [GuideTone]="step.Mode === 'Guide' || step.WaitingForCompletion"
          [Cutouts]="cutouts()"
          [ViewportWidth]="viewportWidth()"
          [ViewportHeight]="viewportHeight()"
        />
      }

      @if (pointerHighlight(); as ptr) {
        <div
          class="mjt-pointer-ring"
          aria-hidden="true"
          [style.left.px]="ptr.Left"
          [style.top.px]="ptr.Top"
          [style.width.px]="ptr.Width"
          [style.height.px]="ptr.Height"
        ></div>
        @if (ptr.Caption) {
          <div
            class="mjt-pointer-caption"
            role="status"
            [style.left.px]="ptr.CaptionLeft"
            [style.top.px]="ptr.CaptionTop"
          >
            <div class="mjt-pointer-caption-eyebrow">
              <span class="mjt-pointer-dot" aria-hidden="true"></span>
              <span>Sage Highlight</span>
            </div>
            <div>{{ ptr.Caption }}</div>
          </div>
        }
      }

      @if (step.StepType === 'Banner') {
        <div #overlayRoot class="mjt-banner--floating">
          <div #floatingDialog>
            <ng-container #stepHost></ng-container>
            <mj-tour-voice-dock
              [Session]="Session"
              [VoiceBarTemplate]="VoiceBarTemplate"
              [VoiceGuideAvailable]="VoiceGuideAvailable"
              [VoiceGuideActive]="VoiceGuideActive"
              (VoiceGuideRequested)="VoiceGuideRequested.emit($event)"
              (DemonstrateRequested)="DemonstrateRequested.emit($event)"
              (ConfirmMutation)="ConfirmDemonstration.emit()"
              (CancelMutation)="CancelDemonstration.emit()"
            />
          </div>
        </div>
      } @else if (step.StepType === 'Beacon') {
        <div
          #overlayRoot
          #floatingDialog
          class="mjt-beacon-wrap"
          [style.left.px]="posX()"
          [style.top.px]="posY()"
        >
          <ng-container #stepHost></ng-container>
        </div>
      } @else {
        <div #overlayRoot [class.mjt-modal-backdrop]="isCenteredModal(step)">
          <div
            #floatingDialog
            class="mjt-dialog"
            [class.mjt-dialog--modal]="isModalStep(step)"
            [class.mjt-dialog--centered]="isCenteredModal(step)"
            [class.mjt-dialog--popover]="!isModalStep(step) && !isCenteredModal(step)"
            [style.left.px]="isCenteredModal(step) ? null : posX()"
            [style.top.px]="isCenteredModal(step) ? null : posY()"
          >
            <mj-tour-card-hairline [StepIndex]="step.StepIndex" [StepCount]="Session.StepCount" />
            @if (!isCenteredModal(step) && arrowSide() !== 'center') {
              <div
                class="mjt-arrow"
                [class.mjt-arrow--top]="arrowSide() === 'top'"
                [class.mjt-arrow--bottom]="arrowSide() === 'bottom'"
                [class.mjt-arrow--left]="arrowSide() === 'left'"
                [class.mjt-arrow--right]="arrowSide() === 'right'"
                [style.left.px]="arrowX()"
                [style.top.px]="arrowY()"
                aria-hidden="true"
              ></div>
            }
            <ng-container #stepHost></ng-container>
            <mj-tour-voice-dock
              [Session]="Session"
              [VoiceBarTemplate]="VoiceBarTemplate"
              [VoiceGuideAvailable]="VoiceGuideAvailable"
              [VoiceGuideActive]="VoiceGuideActive"
              (VoiceGuideRequested)="VoiceGuideRequested.emit($event)"
              (DemonstrateRequested)="DemonstrateRequested.emit($event)"
              (ConfirmMutation)="ConfirmDemonstration.emit()"
              (CancelMutation)="CancelDemonstration.emit()"
            />
          </div>
        </div>
      }
    }
  `,
})
export class OverlayTourPresenterComponent
  extends BaseTourPresenter
  implements OnChanges, AfterViewChecked, OnDestroy
{
  @Input() public override Session: TourSessionView | null = null;
  @Input() public override AnchorElement: HTMLElement | null = null;
  @Input() public override ExtraAnchorElements: ReadonlyArray<HTMLElement> = [];
  @Input() public override LiveAnnouncement = '';
  @Input() public override VoiceBarTemplate: TemplateRef<TourVoiceBarContext> | null = null;
  @Input() public override VoiceGuideAvailable = false;
  @Input() public override VoiceGuideActive = false;
  @Input() public override EstimatedMinutes: number | undefined = undefined;
  @Input() public override AvailableTourKeys: ReadonlySet<string> | null = null;

  @ViewChild('stepHost', { read: ViewContainerRef }) private stepHost?: ViewContainerRef;
  @ViewChild('floatingDialog', { read: ElementRef }) private floatingDialogRef?: ElementRef<HTMLElement>;
  @ViewChild('overlayRoot', { read: ElementRef }) private overlayRootRef?: ElementRef<HTMLElement>;
  @ViewChild('liveRegion', { read: ElementRef }) private liveRegionRef?: ElementRef<HTMLElement>;

  protected readonly posX = signal(24);
  protected readonly posY = signal(24);
  protected readonly arrowSide = signal<OverlayPlacementSide>('center');
  protected readonly arrowX = signal<number | null>(null);
  protected readonly arrowY = signal<number | null>(null);
  protected readonly cutouts = signal<ReadonlyArray<SpotlightCutoutRect>>([]);
  protected readonly pointerHighlight = signal<PointerHighlightRect | null>(null);
  protected readonly viewportWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  protected readonly viewportHeight = signal(typeof window !== 'undefined' ? window.innerHeight : 720);
  protected readonly effectiveAnnouncement = signal('');

  private mountedStepKey: string | null = null;
  private mountedStepType: string | null = null;
  private activeRendererRef: ComponentRef<BaseTourStepRenderer> | null = null;
  private rendererSubs = new Subscription();
  private stopAutoUpdate: (() => void) | null = null;
  private stopPointerAutoUpdate: (() => void) | null = null;
  private pendingMount = false;
  private readonly inertManager = new SiblingInertManager();
  private readonly focusManager = new TourFocusManager();

  public ngOnChanges(changes: SimpleChanges): void {
    const step = this.Session?.CurrentStep ?? null;

    if ('LiveAnnouncement' in changes && this.LiveAnnouncement) {
      this.effectiveAnnouncement.set(this.LiveAnnouncement);
    } else if ('Session' in changes && step) {
      const navMsg = step.StatusMessage ? `${step.StatusMessage}. ` : '';
      this.effectiveAnnouncement.set(
        `${navMsg}Step ${step.StepIndex + 1} of ${Math.max(1, step.TotalSteps)}: ${step.Title}`,
      );
    } else if ('Session' in changes && this.Session?.Status === 'Completed') {
      this.effectiveAnnouncement.set(`Tour completed: ${this.Session.TourName}`);
    }

    if (!step) {
      this.teardownStep();
      return;
    }

    if (step.StepKey !== this.mountedStepKey || step.StepType !== this.mountedStepType) {
      this.pendingMount = true;
    } else if (this.activeRendererRef && this.Session) {
      this.syncRendererInputs(this.activeRendererRef, step, this.Session);
    }

    if ('AnchorElement' in changes || 'ExtraAnchorElements' in changes || 'Session' in changes) {
      this.refreshPositioningAndInert();
      this.refreshPointerHighlight();
    }
  }

  public ngAfterViewChecked(): void {
    if (this.pendingMount && this.stepHost && this.Session?.CurrentStep) {
      this.pendingMount = false;
      void this.mountStepRenderer(this.Session.CurrentStep, this.Session);
    }
  }

  public ngOnDestroy(): void {
    this.teardownStep();
  }

  protected showSpotlightMask(): boolean {
    const step = this.Session?.CurrentStep;
    return Boolean(step?.StepType === 'Spotlight' && this.cutouts().length > 0);
  }

  protected isModalStep(step: TourStepView): boolean {
    const key = ResolveTourStepRendererKey(step);
    if (key === 'Spotlight') {
      return true;
    }
    if (key === 'Action' || key === 'Beacon' || key === 'Banner') {
      return false;
    }
    return MODAL_STEP_TYPES.has(key);
  }

  protected isCenteredModal(step: TourStepView): boolean {
    const key = ResolveTourStepRendererKey(step);
    if (key === 'Modal') {
      return true;
    }
    if (key === 'Banner' || key === 'Beacon') {
      return false;
    }
    return step.Placement === 'center' || (!this.AnchorElement && key !== 'Action');
  }

  private async mountStepRenderer(step: TourStepView, session: TourSessionView): Promise<void> {
    if (!this.stepHost) {
      return;
    }
    this.mountedStepKey = step.StepKey;
    this.mountedStepType = step.StepType;

    const rendererKey = ResolveTourStepRendererKey(step);
    await EnsureStepRendererLoaded(rendererKey);

    // Guard against step changing while lazy chunk loaded
    if (this.Session?.CurrentStep?.StepKey !== step.StepKey || !this.stepHost) {
      return;
    }

    this.destroyRenderer();

    const created = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepRenderer>(
      BaseTourStepRenderer,
      rendererKey,
    );
    const fallback =
      !created.Resolved && rendererKey !== step.StepType
        ? MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepRenderer>(
            BaseTourStepRenderer,
            step.StepType,
          )
        : null;
    const rendererClass =
      created.Resolved && created.Instance
        ? (created.Instance.constructor as typeof BaseTourStepRenderer & (new () => BaseTourStepRenderer))
        : fallback?.Resolved && fallback.Instance
          ? (fallback.Instance.constructor as typeof BaseTourStepRenderer & (new () => BaseTourStepRenderer))
          : null;

    if (!rendererClass) {
      return;
    }

    const ref = this.stepHost.createComponent(rendererClass);
    this.syncRendererInputs(ref, step, session);

    this.rendererSubs = new Subscription();
    this.rendererSubs.add(ref.instance.NextRequested.subscribe((e) => this.NextRequested.emit(e)));
    this.rendererSubs.add(ref.instance.BackRequested.subscribe((e) => this.BackRequested.emit(e)));
    this.rendererSubs.add(ref.instance.DismissRequested.subscribe((e) => this.DismissRequested.emit(e)));
    this.rendererSubs.add(ref.instance.ChoiceMade.subscribe((e) => this.ChoiceMade.emit(e)));
    this.rendererSubs.add(ref.instance.SignalEmitted.subscribe((e) => this.SignalEmitted.emit(e)));
    this.rendererSubs.add(ref.instance.NextTourRequested.subscribe((k) => this.NextTourRequested.emit(k)));
    this.rendererSubs.add(ref.instance.StepSelected.subscribe((k) => this.StepSelected.emit(k)));
    this.rendererSubs.add(ref.instance.VoiceGuideToggled.subscribe((v) => this.VoiceGuideRequested.emit(v)));
    this.rendererSubs.add(ref.instance.DemonstrateRequested.subscribe((d) => this.DemonstrateRequested.emit(d)));

    this.activeRendererRef = ref;
    ref.changeDetectorRef.detectChanges();

    this.refreshPositioningAndInert();
    this.refreshPointerHighlight();
    this.focusManager.Attach({
      OnDismiss: () => this.DismissRequested.emit({ StepKey: step.StepKey }),
      IsModal: () => this.isModalStep(step),
      GetDialogElement: () => this.floatingDialogRef?.nativeElement ?? null,
      GetAnchorElement: () => this.AnchorElement,
    });
    this.focusManager.FocusStepDialog();
  }

  private syncRendererInputs(
    ref: ComponentRef<BaseTourStepRenderer>,
    step: TourStepView,
    session: TourSessionView,
  ): void {
    ref.setInput('Step', step);
    ref.setInput('Session', session);
    ref.setInput('Provider', this.Provider);
    ref.setInput('VoiceGuideAvailable', this.VoiceGuideAvailable);
    ref.setInput('VoiceGuideActive', this.VoiceGuideActive);
    ref.setInput('EstimatedMinutes', this.EstimatedMinutes);
    ref.setInput('AvailableTourKeys', this.AvailableTourKeys);
  }

  private refreshPositioningAndInert(): void {
    this.stopAutoUpdate?.();
    this.stopAutoUpdate = null;

    const step = this.Session?.CurrentStep ?? null;
    if (!step) {
      this.inertManager.Restore();
      return;
    }

    const floatingEl = this.floatingDialogRef?.nativeElement ?? null;
    const overlayEl = this.overlayRootRef?.nativeElement ?? null;
    const liveEl = this.liveRegionRef?.nativeElement ?? null;

    if (this.isModalStep(step)) {
      this.inertManager.Apply([overlayEl, liveEl, this.AnchorElement, ...this.ExtraAnchorElements]);
    } else {
      this.inertManager.Restore();
    }

    if (!floatingEl) {
      this.updateCutouts(step);
      return;
    }

    this.stopAutoUpdate = AutoUpdateOverlayPosition(this.AnchorElement, floatingEl, () => {
      if (typeof window !== 'undefined') {
        this.viewportWidth.set(window.innerWidth);
        this.viewportHeight.set(window.innerHeight);
      }
      this.updateCutouts(step);
      if (step.StepType !== 'Banner' && !this.isCenteredModal(step)) {
        const result = PositionAnchoredOverlay(this.AnchorElement, floatingEl, {
          Placement: step.StepType === 'Beacon' ? 'top-end' : step.Placement,
          OffsetPx: step.StepType === 'Beacon' ? -14 : 14,
        });
        this.posX.set(result.X);
        this.posY.set(result.Y);
        this.arrowSide.set(result.Side);
        this.arrowX.set(result.ArrowX);
        this.arrowY.set(result.ArrowY);
      }
    });
  }

  private refreshPointerHighlight(): void {
    this.stopPointerAutoUpdate?.();
    this.stopPointerAutoUpdate = null;

    const highlight = this.Session?.PointerHighlight;
    if (!highlight?.AnchorKey) {
      this.pointerHighlight.set(null);
      return;
    }

    const target = AnchorRegistry.Instance.GetElement(highlight.AnchorKey);
    if (!target || typeof target.getBoundingClientRect !== 'function') {
      this.pointerHighlight.set(null);
      return;
    }

    const compute = (): void => {
      const r = target.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
      const pad = 5;
      const left = Math.max(4, r.left - pad);
      const top = Math.max(4, r.top - pad);
      const width = Math.max(16, r.width + pad * 2);
      const height = Math.max(16, r.height + pad * 2);
      const fitsBelow = top + height + 64 < vh;
      const captionTop = fitsBelow ? top + height + 10 : Math.max(8, top - 58);
      const captionLeft = Math.max(12, Math.min(vw - 270, left));

      this.pointerHighlight.set({
        Left: left,
        Top: top,
        Width: width,
        Height: height,
        CaptionTop: captionTop,
        CaptionLeft: captionLeft,
        Caption: highlight.Caption,
      });
    };

    compute();
    const floatingEl = this.floatingDialogRef?.nativeElement ?? target;
    this.stopPointerAutoUpdate = AutoUpdateOverlayPosition(target, floatingEl, compute);
  }

  private updateCutouts(step: TourStepView): void {
    if (step.StepType !== 'Spotlight') {
      this.cutouts.set([]);
      return;
    }
    const padding = (step.Configuration as ISpotlightStepConfig | undefined)?.PaddingPx ?? 8;
    const targets: HTMLElement[] = [];
    if (this.AnchorElement) {
      targets.push(this.AnchorElement);
    }
    for (const extra of this.ExtraAnchorElements) {
      if (extra && !targets.includes(extra)) {
        targets.push(extra);
      }
    }
    const rects: SpotlightCutoutRect[] = targets
      .filter((el) => typeof el.getBoundingClientRect === 'function')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          X: Math.max(0, r.left - padding),
          Y: Math.max(0, r.top - padding),
          Width: Math.max(0, r.width + padding * 2),
          Height: Math.max(0, r.height + padding * 2),
          Radius: 10,
        };
      });
    this.cutouts.set(rects);
  }

  private destroyRenderer(): void {
    this.rendererSubs.unsubscribe();
    this.rendererSubs = new Subscription();
    if (this.activeRendererRef) {
      this.activeRendererRef.destroy();
      this.activeRendererRef = null;
    }
    this.stepHost?.clear();
  }

  private teardownStep(): void {
    this.stopAutoUpdate?.();
    this.stopAutoUpdate = null;
    this.stopPointerAutoUpdate?.();
    this.stopPointerAutoUpdate = null;
    this.mountedStepKey = null;
    this.mountedStepType = null;
    this.cutouts.set([]);
    this.pointerHighlight.set(null);
    this.destroyRenderer();
    this.inertManager.Restore();
    this.focusManager.DetachAndRestore();
  }
}
