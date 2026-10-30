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
  LabelTier: 'sm' | 'md' | 'lg';
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
  templateUrl: './video-beat-strip.component.html',
  styleUrls: ['./video-beat-strip.component.css'],
})
export class MJVideoBeatStripComponent {
  @Input() Beats: readonly VideoBeatStripItem[] = [];
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

      const labelLength = (beat.Label ?? '').trim().length;
      const labelTier: 'sm' | 'md' | 'lg' =
        labelLength >= 18 ? 'lg' : labelLength >= 13 ? 'md' : 'sm';

      return {
        Key: beat.Key,
        Label: beat.Label,
        Seconds: secs,
        Detail: detail || undefined,
        StartSeconds: start,
        EndSeconds: end,
        TimeRangeText: timeRangeText,
        WidthPercent: widthPercent,
        ShowInnerLabel: Boolean(this.ShowLabels),
        LabelTier: labelTier,
        TooltipAndAria: tooltipAndAria,
      };
    });
  }

  public OnPickBeat(key: string, event?: Event): void {
    event?.stopPropagation();
    this.BeatPicked.emit(key);
  }
}
