import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';

export interface TourStepIntentEventArgs {
  StepKey: string;
  Data?: Record<string, unknown>;
}

export interface TourChoiceEventArgs {
  StepKey: string;
  ChoiceKey: string;
  IsCorrect?: boolean;
}

export interface TourStepSignalEventArgs {
  StepKey: string;
  SignalKey: string;
  Payload?: Record<string, unknown>;
}

/**
 * Base Angular UX component for all Guided Tour step renderers (`@memberjunction/ng-tours`).
 * Subclasses register with `@RegisterClass(BaseTourStepRenderer, '<StepType>')`.
 */
@Directive()
export abstract class BaseTourStepRenderer<TConfig extends object = object> extends BaseAngularComponent {
  @Input() public Step!: TourStepView<TConfig>;
  @Input() public Session!: TourSessionView;

  @Output() public NextRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public BackRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public DismissRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public ChoiceMade = new EventEmitter<TourChoiceEventArgs>();
  @Output() public SignalEmitted = new EventEmitter<TourStepSignalEventArgs>();
  @Output() public NextTourRequested = new EventEmitter<string>();

  public get StepHeadingId(): string {
    return `mjt-heading-${sanitizeIdSegment(this.Step?.StepKey ?? 'step')}`;
  }

  public get StepBodyId(): string {
    return `mjt-body-${sanitizeIdSegment(this.Step?.StepKey ?? 'step')}`;
  }

  public get ProgressLabel(): string {
    if (!this.Step) {
      return '';
    }
    return `${this.Step.StepIndex + 1} of ${Math.max(1, this.Step.TotalSteps)}`;
  }

  public FormatBodyHtml(body: string | undefined): string {
    return FormatSafeTourMarkdown(body ?? '');
  }
}

/**
 * Escapes raw HTML and renders lightweight safe inline markdown (`**bold**`, `*italic*`,
 * `` `code` ``, `[label](https://...)`, and paragraph breaks) without pulling a heavy runtime parser.
 */
export function FormatSafeTourMarkdown(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const paragraphs = escaped.split(/\n{2,}/);
  return paragraphs
    .map((para) => {
      const inline = para
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      return `<p>${inline}</p>`;
    })
    .join('');
}

function sanitizeIdSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
}
