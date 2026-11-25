import { ChangeDetectionStrategy, Component, HostListener, ViewEncapsulation, signal } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IChoiceOption, IChoiceStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from './tour-step-chrome.component';

/**
 * `Choice` step renderer supporting 2–4+ branching cards with `1`–`9` keyboard selection
 * and optional `KnowledgeCheck` feedback before advancing (§5.3).
 */
@RegisterClass(BaseTourStepRenderer, 'Choice')
@Component({
  selector: 'mj-tour-choice-step',
  standalone: true,
  imports: [MJButtonDirective, TourStepHeaderComponent, TourProgressRailComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-step-content"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="QuestionText ? StepBodyId : null"
    >
      <mj-tour-step-header
        [Step]="Step"
        [HeadingId]="StepHeadingId"
        (Dismiss)="OnDismiss()"
      />

      @if (QuestionText) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(QuestionText)"></div>
      }

      <div class="mjt-choice-list" role="radiogroup" [attr.aria-labelledby]="StepHeadingId">
        @for (option of Options; track option.Key) {
          <button
            type="button"
            class="mjt-choice-option"
            [class.mjt-choice-option--selected]="selectedOption()?.Key === option.Key"
            [attr.aria-checked]="selectedOption()?.Key === option.Key"
            role="radio"
            (click)="OnSelectOption(option)"
          >
            <span class="mjt-choice-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="6" x2="6" y1="3" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </span>
            <span class="mjt-choice-copy">
              <strong>{{ option.Label }}</strong>
              @if (option.Description) {
                <span class="mjt-hint">{{ option.Description }}</span>
              }
            </span>
            @if ($index < 9) {
              <kbd class="mjt-kbd" aria-hidden="true">{{ $index + 1 }}</kbd>
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
        <div class="mjt-footer-meta">
          <mj-tour-progress-rail
            [Session]="Session"
            (StepSelected)="StepSelected.emit($event)"
          />
        </div>
        <div class="mjt-footer-actions">
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

  @HostListener('document:keydown', ['$event'])
  public OnDocumentKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const num = Number(event.key);
    if (Number.isInteger(num) && num >= 1 && num <= 9) {
      const option = this.Options[num - 1];
      if (option) {
        event.preventDefault();
        this.OnSelectOption(option);
      }
    }
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
