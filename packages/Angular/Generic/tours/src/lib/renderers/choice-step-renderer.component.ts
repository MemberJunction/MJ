import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IChoiceOption, IChoiceStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

/**
 * `Choice` step renderer supporting 2–4 branching options and optional `KnowledgeCheck`
 * feedback before advancing (§5.3).
 */
@RegisterClass(BaseTourStepRenderer, 'Choice')
@Component({
  selector: 'mj-tour-choice-step',
  standalone: true,
  imports: [MJButtonDirective],
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

      @if (QuestionText) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(QuestionText)"></div>
      }

      <div class="mjt-choice-list" role="radiogroup" [attr.aria-labelledby]="StepHeadingId">
        @for (option of Options; track option.Key) {
          <button
            type="button"
            class="mjt-choice-option"
            [class.mjt-choice-option--selected]="selectedOption()?.Key === option.Key"
            (click)="OnSelectOption(option)"
          >
            <strong>{{ option.Label }}</strong>
            @if (option.Description) {
              <span class="mjt-hint">{{ option.Description }}</span>
            }
          </button>
        }
      </div>

      @if (IsKnowledgeCheck && selectedOption(); as picked) {
        <div
          class="mjt-choice-feedback"
          [class.mjt-choice-feedback--correct]="picked.IsCorrect === true"
          [class.mjt-choice-feedback--incorrect]="picked.IsCorrect === false"
          role="status"
          aria-live="polite"
        >
          <strong>{{ picked.IsCorrect ? 'Correct' : 'Not quite' }}</strong>
          @if (picked.Feedback) {
            <span> — {{ picked.Feedback }}</span>
          }
        </div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-actions">
          @if (ShowContinueButton) {
            <button
              type="button"
              mjButton
              variant="primary"
              (click)="OnConfirmChoice()"
            >
              Continue
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
export class ChoiceStepRenderer extends BaseTourStepRenderer<IChoiceStepConfig> {
  protected readonly selectedOption = signal<IChoiceOption | null>(null);

  public get QuestionText(): string {
    return this.Step?.Configuration?.Question ?? this.Step?.Body ?? '';
  }

  public get Options(): ReadonlyArray<IChoiceOption> {
    return this.Step?.Configuration?.Options ?? [];
  }

  public get IsKnowledgeCheck(): boolean {
    return Boolean(this.Step?.Configuration?.IsKnowledgeCheck);
  }

  public get ShowContinueButton(): boolean {
    return Boolean(
      this.selectedOption() &&
        (this.IsKnowledgeCheck || this.Step?.Configuration?.ShowFeedbackBeforeAdvance),
    );
  }

  public OnSelectOption(option: IChoiceOption): void {
    this.selectedOption.set(option);
    if (!this.IsKnowledgeCheck && !this.Step?.Configuration?.ShowFeedbackBeforeAdvance) {
      this.ChoiceMade.emit({
        StepKey: this.Step.StepKey,
        ChoiceKey: option.Key,
        IsCorrect: option.IsCorrect,
      });
    }
  }

  public OnConfirmChoice(): void {
    const picked = this.selectedOption();
    if (!picked) {
      return;
    }
    this.ChoiceMade.emit({
      StepKey: this.Step.StepKey,
      ChoiceKey: picked.Key,
      IsCorrect: picked.IsCorrect,
    });
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}
