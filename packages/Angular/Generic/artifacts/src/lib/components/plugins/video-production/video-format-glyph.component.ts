import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface ParsedVideoFormatDimensions {
  WidthRatio: number;
  HeightRatio: number;
  AspectRatioCss: string;
  WidthPx: number;
  HeightPx: number;
}

/**
 * Pure L1 film glyph component (`mj-video-format-glyph`).
 * Renders an outlined aspect-ratio box (`16:9`, `9:16`, `1:1`, `4:5`, or any `W:H`)
 * with longer side `14px` (`sm`) or `20px` (`md`), border `currentColor`, and optional label.
 * Unparseable formats show the label only.
 */
@Component({
  standalone: true,
  selector: 'mj-video-format-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mj-video-format-glyph" [attr.data-size]="Size" [attr.data-format]="Format">
      @if (ParsedDimensions; as dims) {
        <span
          class="mj-video-format-glyph__box"
          aria-hidden="true"
          [style.aspect-ratio]="dims.AspectRatioCss"
          [style.width.px]="dims.WidthPx"
          [style.height.px]="dims.HeightPx"
        ></span>
      }
      @if (ShouldShowLabel) {
        <span class="mj-video-format-glyph__label">{{ Format }}</span>
      }
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
      }

      .mj-video-format-glyph {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-1-5);
        color: inherit;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }

      .mj-video-format-glyph__box {
        display: inline-block;
        box-sizing: border-box;
        border: 1.5px solid currentColor;
        border-radius: 2px;
        flex-shrink: 0;
      }

      .mj-video-format-glyph__label {
        font-size: inherit;
        font-weight: inherit;
        color: inherit;
      }
    `,
  ],
})
export class MJVideoFormatGlyphComponent {
  @Input() Format = '';
  @Input() ShowLabel = true;
  @Input() Size: 'sm' | 'md' = 'sm';

  public get ParsedDimensions(): ParsedVideoFormatDimensions | null {
    const raw = (this.Format ?? '').trim();
    const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(raw);
    if (!match) {
      return null;
    }
    const w = Number.parseFloat(match[1]);
    const h = Number.parseFloat(match[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    const maxPx = this.Size === 'md' ? 20 : 14;
    const widthPx = w >= h ? maxPx : Math.round(((maxPx * w) / h) * 100) / 100;
    const heightPx = h >= w ? maxPx : Math.round(((maxPx * h) / w) * 100) / 100;
    return {
      WidthRatio: w,
      HeightRatio: h,
      AspectRatioCss: `${w} / ${h}`,
      WidthPx: widthPx,
      HeightPx: heightPx,
    };
  }

  public get ShouldShowLabel(): boolean {
    if (!this.ParsedDimensions) {
      return (this.Format ?? '').trim().length > 0;
    }
    return this.ShowLabel;
  }
}
