import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormatVideoTime, FormatVideoTimeRange } from './video-time-format';

export interface VideoBeatStripItem {
  Key: string;
  Label: string;
  Seconds: number;
  Detail?: string;
}

export interface VideoBeatStripComputedBlock {
  Key: string;
  Label: string;
  Seconds: number;
  Detail?: string;
  StartSeconds: number;
  EndSeconds: number;
  TimeRangeText: string;
  WidthPercent: number;
  ShowInnerLabel: boolean;
  TooltipAndAria: string;
}

/**
 * Pure L1 film beat strip component (`mj-video-beat-strip`).
 * Renders horizontal beat blocks sized proportionally by `Seconds`, one neutral fill,
 * separated by a `1px` gap; active beat brand-tinted. Shows total length at the right, tabular.
 */
@Component({
  standalone: true,
  selector: 'mj-video-beat-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-video-beat-strip">
      <div class="mj-video-beat-strip__track" role="list">
        @for (block of ComputedBlocks; track block.Key) {
          <div
            class="mj-video-beat-strip__block"
            [class.mj-video-beat-strip__block--active]="ActiveKey === block.Key"
            role="listitem"
            tabindex="0"
            [attr.data-beat-key]="block.Key"
            [attr.title]="block.TooltipAndAria"
            [attr.aria-label]="block.TooltipAndAria"
            [style.width.%]="block.WidthPercent"
            [style.flex-grow]="block.Seconds"
            (click)="OnPickBeat(block.Key, $event)"
            (keydown.enter)="OnPickBeat(block.Key, $event)"
            (keydown.space)="OnPickBeat(block.Key, $event)"
          >
            @if (block.ShowInnerLabel) {
              <span class="mj-video-beat-strip__label">{{ block.Label }}</span>
            }
          </div>
        }
      </div>
      <span class="mj-video-beat-strip__total" data-testid="beat-strip-total">{{ TotalTimeText }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .mj-video-beat-strip {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
        width: 100%;
      }

      .mj-video-beat-strip__track {
        display: flex;
        align-items: stretch;
        flex: 1;
        min-width: 0;
        height: 24px;
        gap: 1px;
        background: var(--mj-border-default);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-sm);
        overflow: hidden;
      }

      .mj-video-beat-strip__block {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 0 var(--mj-space-1-5);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        cursor: pointer;
        user-select: none;
        transition: var(--mj-transition-colors);
      }

      .mj-video-beat-strip__block:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }

      .mj-video-beat-strip__block:focus-visible {
        outline: 2px solid var(--mj-border-focus);
        outline-offset: -2px;
      }

      .mj-video-beat-strip__block--active {
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface-card));
        color: var(--mj-brand-primary);
        font-weight: var(--mj-font-semibold);
      }

      .mj-video-beat-strip__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }

      .mj-video-beat-strip__total {
        flex-shrink: 0;
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-muted);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class MJVideoBeatStripComponent {
  @Input() Beats: VideoBeatStripItem[] = [];
  @Input() ShowLabels = true;
  @Input() ActiveKey: string | null = null;
  @Output() BeatPicked = new EventEmitter<string>();

  public get TotalSeconds(): number {
    const list = Array.isArray(this.Beats) ? this.Beats : [];
    return list.reduce(
      (sum, b) => sum + (Number.isFinite(b.Seconds) && b.Seconds > 0 ? b.Seconds : 0),
      0,
    );
  }

  public get TotalTimeText(): string {
    return FormatVideoTime(this.TotalSeconds);
  }

  public get ComputedBlocks(): VideoBeatStripComputedBlock[] {
    const list = Array.isArray(this.Beats) ? this.Beats : [];
    if (list.length === 0) {
      return [];
    }
    const total = this.TotalSeconds;
    const fallbackPercent = 100 / list.length;
    let cursor = 0;

    return list.map((beat) => {
      const secs = Number.isFinite(beat.Seconds) && beat.Seconds > 0 ? beat.Seconds : 0;
      const start = cursor;
      const end = start + secs;
      cursor = end;

      const widthPercent =
        total > 0 ? Math.round(((secs / total) * 100) * 100) / 100 : fallbackPercent;
      const timeRangeText = FormatVideoTimeRange(start, end);
      const detail = (beat.Detail ?? '').trim();
      const tooltipAndAria = detail
        ? `${beat.Label} \u00B7 ${timeRangeText} \u00B7 ${detail}`
        : `${beat.Label} \u00B7 ${timeRangeText}`;

      // Show label inside the block only when ShowLabels is enabled and the block has enough width to fit text
      const showInnerLabel = Boolean(this.ShowLabels && widthPercent >= 8);

      return {
        Key: beat.Key,
        Label: beat.Label,
        Seconds: secs,
        Detail: detail || undefined,
        StartSeconds: start,
        EndSeconds: end,
        TimeRangeText: timeRangeText,
        WidthPercent: widthPercent,
        ShowInnerLabel: showInnerLabel,
        TooltipAndAria: tooltipAndAria,
      };
    });
  }

  public OnPickBeat(key: string, event?: Event): void {
    event?.stopPropagation();
    if (event?.type === 'keydown') {
      event.preventDefault();
    }
    this.BeatPicked.emit(key);
  }
}
