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
import { EnsureStepRendererLoaded, ResolveTourStepRendererKey } from '../renderers/lazy-step-renderers';
import { EnsureStandardTourRenderersRegistered } from '../renderers/register-standard-renderers';
import { TourCardHairlineComponent } from '../renderers/tour-step-chrome.component';
import { BaseTourPresenter } from './base-tour-presenter';
import { TourVoiceDockComponent, type TourVoiceBarContext } from './tour-voice-dock.component';

EnsureStandardTourRenderersRegistered();

/**
 * Inline `'Embedded'` presenter (§5.1): renders the active step directly inside a host
 * container (e.g. an empty state or onboarding card) without a floating backdrop.
 */
@RegisterClass(BaseTourPresenter, 'Embedded')
@Component({
  selector: 'mj-tour-embedded-presenter',
  standalone: true,
  imports: [TourCardHairlineComponent, TourVoiceDockComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-live-region" aria-live="polite" aria-atomic="true">
      {{ LiveAnnouncement }}
    </div>

    @if (Session && Session.CurrentStep; as step) {
      <div class="mjt-embedded-card">
        <mj-tour-card-hairline [StepIndex]="step.StepIndex" [StepCount]="Session.StepCount" />
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
    }
  `,
})
export class EmbeddedTourPresenterComponent
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

  private mountedKey: string | null = null;
  private activeRendererRef: ComponentRef<BaseTourStepRenderer> | null = null;
  private subs = new Subscription();
  private pendingMount = false;

  public ngOnChanges(_changes: SimpleChanges): void {
    const step = this.Session?.CurrentStep ?? null;
    if (!step) {
      this.teardown();
      return;
    }
    if (step.StepKey !== this.mountedKey) {
      this.pendingMount = true;
    } else if (this.activeRendererRef && this.Session) {
      this.activeRendererRef.setInput('Step', step);
      this.activeRendererRef.setInput('Session', this.Session);
      this.activeRendererRef.setInput('Provider', this.Provider);
      this.activeRendererRef.setInput('VoiceGuideAvailable', this.VoiceGuideAvailable);
      this.activeRendererRef.setInput('VoiceGuideActive', this.VoiceGuideActive);
      this.activeRendererRef.setInput('EstimatedMinutes', this.EstimatedMinutes);
      this.activeRendererRef.setInput('AvailableTourKeys', this.AvailableTourKeys);
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

  private async mountStep(step: TourStepView, session: TourSessionView): Promise<void> {
    if (!this.stepHost) {
      return;
    }
    this.mountedKey = step.StepKey;
    const rendererKey = ResolveTourStepRendererKey(step);
    await EnsureStepRendererLoaded(rendererKey);
    if (this.Session?.CurrentStep?.StepKey !== step.StepKey || !this.stepHost) {
      return;
    }
    this.teardownRenderer();

    const created = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepRenderer>(
      BaseTourStepRenderer,
      rendererKey,
    );
    if (!created.Resolved || !created.Instance) {
      return;
    }
    const cls = created.Instance.constructor as typeof BaseTourStepRenderer & (new () => BaseTourStepRenderer);
    const ref = this.stepHost.createComponent(cls);
    ref.setInput('Step', step);
    ref.setInput('Session', session);
    ref.setInput('Provider', this.Provider);
    ref.setInput('VoiceGuideAvailable', this.VoiceGuideAvailable);
    ref.setInput('VoiceGuideActive', this.VoiceGuideActive);
    ref.setInput('EstimatedMinutes', this.EstimatedMinutes);
    ref.setInput('AvailableTourKeys', this.AvailableTourKeys);

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
