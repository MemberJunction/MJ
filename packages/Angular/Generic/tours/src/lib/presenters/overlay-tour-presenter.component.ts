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
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { ISpotlightStepConfig, TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { Subscription } from 'rxjs';
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
import { EnsureStepRendererLoaded } from '../renderers/lazy-step-renderers';
import { EnsureStandardTourRenderersRegistered } from '../renderers/register-standard-renderers';
import { BaseTourPresenter } from './base-tour-presenter';

EnsureStandardTourRenderersRegistered();

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
 * - Renders SVG `evenodd` spotlight mask (`aria-hidden="true"`) around target(s)
 * - Applies sibling-subtree `inert` ONLY on modal steps (keeping spotlighted target + live region active!)
 * - Positions anchored popovers via `PositionAnchoredOverlay` + `AutoUpdateOverlayPosition`
 * - Manages `Esc`, `F6` (non-modal target toggle), `Tab` cycling, and focus restoration
 * - Hosts a single polite `aria-live="polite"` region outside any `inert` subtree
 */
@RegisterClass(BaseTourPresenter, 'Overlay')
@Component({
  selector: 'mj-tour-overlay-presenter',
  standalone: true,
  imports: [TourSpotlightOverlayComponent],
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
          [Cutouts]="cutouts()"
          [ViewportWidth]="viewportWidth()"
          [ViewportHeight]="viewportHeight()"
        />
      }

      @if (isCenteredModal(step)) {
        <div #overlayRoot class="mjt-modal-backdrop">
          <div #floatingDialog class="mjt-dialog mjt-dialog--modal mjt-dialog--centered">
            <ng-container #stepHost></ng-container>
          </div>
        </div>
      } @else if (step.StepType === 'Banner') {
        <div #overlayRoot class="mjt-banner--floating">
          <div #floatingDialog>
            <ng-container #stepHost></ng-container>
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
        <div
          #overlayRoot
          #floatingDialog
          class="mjt-dialog"
          [class.mjt-dialog--modal]="isModalStep(step)"
          [class.mjt-dialog--popover]="!isModalStep(step)"
          [style.left.px]="posX()"
          [style.top.px]="posY()"
        >
          @if (arrowSide() !== 'center') {
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
  protected readonly viewportWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  protected readonly viewportHeight = signal(typeof window !== 'undefined' ? window.innerHeight : 720);
  protected readonly effectiveAnnouncement = signal('');

  private mountedStepKey: string | null = null;
  private mountedStepType: string | null = null;
  private activeRendererRef: ComponentRef<BaseTourStepRenderer> | null = null;
  private rendererSubs = new Subscription();
  private stopAutoUpdate: (() => void) | null = null;
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
      this.activeRendererRef.setInput('Step', step);
      this.activeRendererRef.setInput('Session', this.Session);
      this.activeRendererRef.setInput('Provider', this.Provider);
    }

    if ('AnchorElement' in changes || 'ExtraAnchorElements' in changes || 'Session' in changes) {
      this.refreshPositioningAndInert();
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
    if (step.StepType === 'Spotlight') {
      return true;
    }
    if (step.StepType === 'Action' || step.StepType === 'Beacon' || step.StepType === 'Banner') {
      return false;
    }
    return MODAL_STEP_TYPES.has(step.StepType);
  }

  protected isCenteredModal(step: TourStepView): boolean {
    if (step.StepType === 'Modal') {
      return true;
    }
    if (step.StepType === 'Banner' || step.StepType === 'Beacon') {
      return false;
    }
    return step.Placement === 'center' || (!this.AnchorElement && step.StepType !== 'Action');
  }

  private async mountStepRenderer(step: TourStepView, session: TourSessionView): Promise<void> {
    if (!this.stepHost) {
      return;
    }
    this.mountedStepKey = step.StepKey;
    this.mountedStepType = step.StepType;

    await EnsureStepRendererLoaded(step.StepType);

    // Guard against step changing while lazy chunk loaded
    if (this.Session?.CurrentStep?.StepKey !== step.StepKey || !this.stepHost) {
      return;
    }

    this.destroyRenderer();

    const rendererKey = resolveRendererKey(step);
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
    ref.setInput('Step', step);
    ref.setInput('Session', session);
    ref.setInput('Provider', this.Provider);

    this.rendererSubs = new Subscription();
    this.rendererSubs.add(ref.instance.NextRequested.subscribe((e) => this.NextRequested.emit(e)));
    this.rendererSubs.add(ref.instance.BackRequested.subscribe((e) => this.BackRequested.emit(e)));
    this.rendererSubs.add(ref.instance.DismissRequested.subscribe((e) => this.DismissRequested.emit(e)));
    this.rendererSubs.add(ref.instance.ChoiceMade.subscribe((e) => this.ChoiceMade.emit(e)));
    this.rendererSubs.add(ref.instance.SignalEmitted.subscribe((e) => this.SignalEmitted.emit(e)));
    this.rendererSubs.add(ref.instance.NextTourRequested.subscribe((k) => this.NextTourRequested.emit(k)));

    this.activeRendererRef = ref;
    ref.changeDetectorRef.detectChanges();

    this.refreshPositioningAndInert();
    this.focusManager.Attach({
      OnDismiss: () => this.DismissRequested.emit({ StepKey: step.StepKey }),
      IsModal: () => this.isModalStep(step),
      GetDialogElement: () => this.floatingDialogRef?.nativeElement ?? null,
      GetAnchorElement: () => this.AnchorElement,
    });
    this.focusManager.FocusStepDialog();
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
          Radius: 8,
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
    this.mountedStepKey = null;
    this.mountedStepType = null;
    this.cutouts.set([]);
    this.destroyRenderer();
    this.inertManager.Restore();
    this.focusManager.DetachAndRestore();
  }
}

function resolveRendererKey(step: TourStepView): string {
  const cfg = step.Configuration as Record<string, unknown> | undefined;
  const configuredRenderer = typeof cfg?.['RendererClass'] === 'string' ? cfg['RendererClass'] : null;
  return configuredRenderer || step.StepType;
}
