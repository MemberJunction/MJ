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
  templateUrl: './video-format-glyph.component.html',
  styleUrls: ['./video-format-glyph.component.css'],
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
