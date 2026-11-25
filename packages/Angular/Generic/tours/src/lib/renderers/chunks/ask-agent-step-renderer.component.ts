import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TourSignals, type IAskAgentStepConfig } from '@memberjunction/tours-runtime';
import { MJ_TOUR_AGENT_DISPATCHER } from '../../host/tour-host-tokens';
import { BaseTourStepRenderer } from '../base-step-renderer';

/**
 * Lazy-chunked `AskAgent` step renderer (§5.3 & §18 Phase 3).
 * Bridges a visual tour step to a host agent surface with a seeded prompt.
 */
@RegisterClass(BaseTourStepRenderer, 'AskAgent')
@Component({
  selector: 'mj-tour-ask-agent-step',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-step-content"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="Step.Body ? StepBodyId : null"
    >
      <div class="mjt-header">
        <div>
          <div class="mjt-progress">{{ ProgressLabel }}</div>
          <h2 class="mjt-title" [id]="StepHeadingId">{{ Step.Title }}</h2>
        </div>
        <button
          type="button"
          class="mjt-close-btn"
          aria-label="Close tour"
          (click)="OnDismiss()"
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      <label class="mjt-hint" [attr.for]="PromptInputId">Prompt for assistant</label>
      <textarea
        [id]="PromptInputId"
        class="mjt-agent-input"
        rows="3"
        [ngModel]="promptText()"
        (ngModelChange)="promptText.set($event)"
      ></textarea>

      @if (dispatched()) {
        <div class="mjt-waiting" role="status" aria-live="polite">
          <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
          <span>Prompt sent to assistant.</span>
        </div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-actions">
          <button
            type="button"
            mjButton
            variant="primary"
            [disabled]="!promptText().trim()"
            (click)="OnAsk()"
          >
            <i class="fa-solid fa-sparkles" aria-hidden="true"></i>
            <span>{{ PreferVoice ? 'Ask with Voice' : 'Ask Assistant' }}</span>
          </button>
          @if (AllowNextButtonFallback) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnNext()"
            >
              {{ NextLabel }}
            </button>
          }
          @if (Session.CanGoBack) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnBack()"
            >
              Back
            </button>
          }
        </div>
        <button
          type="button"
          mjButton
          variant="flat"
          (click)="OnDismiss()"
        >
          Dismiss
        </button>
      </div>
    </div>
  `,
})
export class AskAgentStepRenderer extends BaseTourStepRenderer<IAskAgentStepConfig> implements OnInit {
  private readonly dispatcher = inject(MJ_TOUR_AGENT_DISPATCHER, { optional: true });
  protected readonly promptText = signal('');
  protected readonly dispatched = signal(false);

  public get PromptInputId(): string {
    return `mjt-ask-input-${this.Step?.StepKey ?? 'step'}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  public get PreferVoice(): boolean {
    return Boolean(this.Step?.Configuration?.PreferVoice);
  }

  public get AllowNextButtonFallback(): boolean {
    return this.Step?.Configuration?.AllowNextButtonFallback !== false;
  }

  public get NextLabel(): string {
    return this.Step?.Configuration?.NextButtonText ?? 'Continue';
  }

  public ngOnInit(): void {
    this.promptText.set(this.Step?.Configuration?.SeedPrompt ?? '');
  }

  public async OnAsk(): Promise<void> {
    const prompt = this.promptText().trim();
    if (!prompt) {
      return;
    }
    const payload = {
      StepKey: this.Step.StepKey,
      TourKey: this.Session.TourKey,
      Prompt: prompt,
      AgentID: this.Step?.Configuration?.AgentID,
      PreferVoice: this.PreferVoice,
    };

    if (this.dispatcher) {
      await this.dispatcher.DispatchAskAgent(payload);
    }

    const signalKey = 'tours.agent.ask';
    TourSignals.Instance.Emit(signalKey, payload);
    this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: signalKey, Payload: payload });
    this.dispatched.set(true);
  }

  public OnNext(): void {
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

export function EnsureAskAgentStepRendererRegistered(): void {
  // Keeps @RegisterClass side effect intact in the lazy chunk
}
