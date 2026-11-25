import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';
import { Subscription } from 'rxjs';
import { BaseTourStepRenderer } from '../renderers/base-step-renderer';
import { EnsureStepRendererLoaded } from '../renderers/lazy-step-renderers';
import { EnsureStandardTourRenderersRegistered } from '../renderers/register-standard-renderers';
import { TourCardHairlineComponent } from '../renderers/tour-step-chrome.component';
import { BaseTourPresenter } from './base-tour-presenter';
import { TourVoiceDockComponent, type TourVoiceBarContext } from './tour-voice-dock.component';

EnsureStandardTourRenderersRegistered();

/**
 * Docked `'SidePanel'` tour presenter (§5.1): displays the step progress checklist above
 * the active step renderer in a non-blocking side drawer, plus the embedded Sage dock at bottom.
 */
@RegisterClass(BaseTourPresenter, 'SidePanel')
@Component({
  selector: 'mj-tour-side-panel-presenter',
  standalone: true,
  imports: [TourCardHairlineComponent, TourVoiceDockComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-live-region" aria-live="polite" aria-atomic="true">
      {{ LiveAnnouncement }}
    </div>

    @if (Session && Session.CurrentStep; as step) {
      <aside class="mjt-sidepanel" role="complementary" [attr.aria-label]="Session.TourName">
        <mj-tour-card-hairline [StepIndex]="step.StepIndex" [StepCount]="Session.StepCount" />
        <div class="mjt-sidepanel-header">
          <div>
            <div class="mjt-progress">Step {{ step.StepIndex + 1 }} of {{ Session.StepCount }}</div>
            <strong class="mjt-title">{{ Session.TourName }}</strong>
          </div>
          <button
            type="button"
            class="mjt-close-btn"
            tabindex="0"
            aria-label="Close tour panel"
            (click)="DismissRequested.emit({ StepKey: step.StepKey })"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div class="mjt-sidepanel-steps" role="navigation" aria-label="Tour path steps">
          @for (item of Session.PathTaken; track item) {
            <button
              type="button"
              class="mjt-sidepanel-step-item"
              [class.mjt-sidepanel-step-item--active]="item === step.StepKey"
              [class.mjt-sidepanel-step-item--clickable]="IsStepCompleted(item) && item !== step.StepKey"
              [disabled]="!IsStepCompleted(item) || item === step.StepKey"
              (click)="OnSelectCompletedStep(item)"
            >
              <span>{{ IsStepCompleted(item) ? '✓' : ($index + 1) }}</span>
              <span>{{ item }}</span>
            </button>
          }
        </div>

        <div class="mjt-sidepanel-body">
          <ng-container #stepHost></ng-container>
        </div>

        <div class="mjt-sidepanel-dock">
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
      </aside>
    }
  `,
})
export class SidePanelTourPresenterComponent
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

  @ViewChild('stepHost', { read: ViewContainerRef }) private stepHost?: ViewContainerRef;

  private mountedKey: string | null = null;
  private activeRendererRef: ComponentRef<BaseTourStepRenderer> | null = null;
  private subs = new Subscription();
  private pendingMount = false;

  public IsStepCompleted(stepKey: string): boolean {
    return Boolean(this.Session?.CompletedStepKeys.includes(stepKey));
  }

  public OnSelectCompletedStep(stepKey: string): void {
    if (this.IsStepCompleted(stepKey)) {
      this.StepSelected.emit(stepKey);
    }
  }

  public ngOnChanges(_changes: SimpleChanges): void {
    const step = this.Session?.CurrentStep ?? null;
    if (!step) {
      this.teardown();
      return;
    }
    if (step.StepKey !== this.mountedKey) {
      this.pendingMount = true;
    } else if (this.activeRendererRef && this.Session) {
      this.syncRendererInputs(this.activeRendererRef, step, this.Session);
    }
  }

  public ngAfterViewChecked(): void {
    if (this.pendingMount && this.stepHost && this.Session?.CurrentStep) {
      this.pendingMount = false;
      void this.mountStep(this.Session.CurrentStep, this.Session);
    }
  }

  public ngOnDestroy(): void {
    this.teardown();
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
  }

  private async mountStep(step: TourStepView, session: TourSessionView): Promise<void> {
    if (!this.stepHost) {
      return;
    }
    this.mountedKey = step.StepKey;
    await EnsureStepRendererLoaded(step.StepType);
    if (this.Session?.CurrentStep?.StepKey !== step.StepKey || !this.stepHost) {
      return;
    }
    this.teardownRenderer();

    const created = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepRenderer>(
      BaseTourStepRenderer,
      step.StepType,
    );
    if (!created.Resolved || !created.Instance) {
      return;
    }
    const cls = created.Instance.constructor as typeof BaseTourStepRenderer & (new () => BaseTourStepRenderer);
    const ref = this.stepHost.createComponent(cls);
    this.syncRendererInputs(ref, step, session);

    this.subs = new Subscription();
    this.subs.add(ref.instance.NextRequested.subscribe((e) => this.NextRequested.emit(e)));
    this.subs.add(ref.instance.BackRequested.subscribe((e) => this.BackRequested.emit(e)));
    this.subs.add(ref.instance.DismissRequested.subscribe((e) => this.DismissRequested.emit(e)));
    this.subs.add(ref.instance.ChoiceMade.subscribe((e) => this.ChoiceMade.emit(e)));
    this.subs.add(ref.instance.SignalEmitted.subscribe((e) => this.SignalEmitted.emit(e)));
    this.subs.add(ref.instance.NextTourRequested.subscribe((k) => this.NextTourRequested.emit(k)));
    this.subs.add(ref.instance.StepSelected.subscribe((k) => this.StepSelected.emit(k)));
    this.subs.add(ref.instance.VoiceGuideToggled.subscribe((v) => this.VoiceGuideRequested.emit(v)));
    this.subs.add(ref.instance.DemonstrateRequested.subscribe((d) => this.DemonstrateRequested.emit(d)));

    this.activeRendererRef = ref;
    ref.changeDetectorRef.detectChanges();
  }

  private teardownRenderer(): void {
    this.subs.unsubscribe();
    this.subs = new Subscription();
    this.activeRendererRef?.destroy();
    this.activeRendererRef = null;
    this.stepHost?.clear();
  }

  private teardown(): void {
    this.mountedKey = null;
    this.teardownRenderer();
  }
}
