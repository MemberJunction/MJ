import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';

export interface TourProgressSegmentItem {
  Index: number;
  State: 'done' | 'active' | 'upcoming';
  TargetStepKey: string | null;
}

/**
 * Shared Direction C step header: step-type icon tile, uppercase eyebrow (`STEP X OF Y · CATEGORY`),
 * heading, and subtle `×` close button (`tabindex="0"`, never steals initial dialog focus).
 */
@Component({
  selector: 'mj-tour-step-header',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-header">
      <div class="mjt-header-main">
        <span class="mjt-step-badge-icon" aria-hidden="true">
          @switch (IconKind) {
            @case ('search') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            }
            @case ('action') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            }
            @case ('choice') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="6" x2="6" y1="3" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            }
            @case ('widget') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" x2="4" y1="21" y2="14" />
                <line x1="4" x2="4" y1="10" y2="3" />
                <line x1="12" x2="12" y1="21" y2="12" />
                <line x1="12" x2="12" y1="8" y2="3" />
                <line x1="20" x2="20" y1="21" y2="16" />
                <line x1="20" x2="20" y1="12" y2="3" />
                <line x1="2" x2="6" y1="14" y2="14" />
                <line x1="10" x2="14" y1="8" y2="8" />
                <line x1="18" x2="22" y1="16" y2="16" />
              </svg>
            }
            @case ('media') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            }
            @case ('sage') {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            }
            @default {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            }
          }
        </span>
        <div>
          @if (ShowProgress) {
            <div class="mjt-progress">{{ EyebrowLabel }}</div>
          }
          <h2 class="mjt-title" [id]="HeadingId">{{ Step.Title }}</h2>
        </div>
      </div>
      <button
        type="button"
        class="mjt-close-btn"
        tabindex="0"
        aria-label="Close tour"
        (click)="Dismiss.emit()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  `,
})
export class TourStepHeaderComponent {
  @Input({ required: true }) public Step!: TourStepView<object>;
  @Input({ required: true }) public HeadingId!: string;
  @Input() public ShowProgress = true;
  @Output() public Dismiss = new EventEmitter<void>();

  public get EyebrowLabel(): string {
    const stepNum = (this.Step?.StepIndex ?? 0) + 1;
    const total = Math.max(1, this.Step?.TotalSteps ?? 1);
    const category = this.CategoryLabel;
    return `Step ${stepNum} of ${total} · ${category}`;
  }

  public get CategoryLabel(): string {
    const stepType = this.Step?.StepType ?? 'Spotlight';
    if (stepType === 'Action') return 'Interactive Guide';
    if (stepType === 'Choice') return 'Choose Your Path';
    if (stepType === 'EmbeddedComponent' || stepType === 'InteractiveComponent') return 'Workspace Setup';
    if (stepType === 'AskAgent') return 'Ask Sage';
    if (stepType === 'Media') return 'Walkthrough';
    if (stepType === 'Modal') return 'Overview';
    if (this.Step?.Anchor?.Strategy === 'Omnibar') return 'Global Search';
    return stepType;
  }

  public get IconKind(): 'search' | 'action' | 'choice' | 'widget' | 'media' | 'sage' | 'spotlight' {
    if (this.Step?.Anchor?.Strategy === 'Omnibar') return 'search';
    const stepType = this.Step?.StepType;
    if (stepType === 'Action') return 'action';
    if (stepType === 'Choice') return 'choice';
    if (stepType === 'EmbeddedComponent' || stepType === 'InteractiveComponent') return 'widget';
    if (stepType === 'Media') return 'media';
    if (stepType === 'AskAgent' || stepType === 'Modal') return 'sage';
    return 'spotlight';
  }
}

/**
 * Shared clickable segmented progress rail (`.mjt-progress-rail`) rendered in card footers.
 * Completed segments can be clicked to jump back to visited steps via `Session.GoToStep`.
 */
@Component({
  selector: 'mj-tour-progress-rail',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-progress-rail" role="navigation" aria-label="Tour step progress">
      @for (seg of Segments; track seg.Index) {
        <button
          type="button"
          class="mjt-progress-segment"
          [class.mjt-progress-segment--done]="seg.State === 'done'"
          [class.mjt-progress-segment--active]="seg.State === 'active'"
          [class.mjt-progress-segment--clickable]="seg.TargetStepKey !== null"
          [disabled]="seg.TargetStepKey === null"
          [attr.aria-label]="seg.TargetStepKey ? 'Go to step ' + (seg.Index + 1) : 'Step ' + (seg.Index + 1)"
          [attr.aria-current]="seg.State === 'active' ? 'step' : null"
          (click)="OnSelect(seg)"
        >
          <span class="mjt-progress-segment-pill" aria-hidden="true"></span>
        </button>
      }
    </div>
  `,
})
export class TourProgressRailComponent {
  @Input({ required: true }) public Session!: TourSessionView;
  @Output() public StepSelected = new EventEmitter<string>();

  public get Segments(): TourProgressSegmentItem[] {
    const count = Math.max(1, this.Session?.StepCount ?? 1);
    const activeIdx = this.Session?.StepIndex ?? 0;
    const completed = this.Session?.CompletedStepKeys ?? [];
    const path = this.Session?.PathTaken ?? [];
    const out: TourProgressSegmentItem[] = [];

    for (let i = 0; i < count; i++) {
      const candidateKey = path[i] ?? completed[i] ?? null;
      const isCompletedKey = Boolean(candidateKey && completed.includes(candidateKey));
      if (i === activeIdx) {
        out.push({ Index: i, State: 'active', TargetStepKey: null });
      } else if (isCompletedKey || i < activeIdx) {
        out.push({
          Index: i,
          State: 'done',
          TargetStepKey: candidateKey && (isCompletedKey || i < activeIdx) ? candidateKey : null,
        });
      } else {
        out.push({ Index: i, State: 'upcoming', TargetStepKey: null });
      }
    }
    return out;
  }

  public OnSelect(seg: TourProgressSegmentItem): void {
    if (seg.TargetStepKey) {
      this.StepSelected.emit(seg.TargetStepKey);
    }
  }
}

/**
 * Shared top hairline progress bar for Direction C cards and SidePanel.
 */
@Component({
  selector: 'mj-tour-card-hairline',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-card-hairline" aria-hidden="true">
      <div class="mjt-card-hairline-fill" [style.width.%]="Percent"></div>
    </div>
  `,
})
export class TourCardHairlineComponent {
  @Input() public StepIndex = 0;
  @Input() public StepCount = 1;

  public get Percent(): number {
    const total = Math.max(1, this.StepCount);
    return Math.min(100, Math.max(0, Math.round(((this.StepIndex + 1) / total) * 100)));
  }
}
