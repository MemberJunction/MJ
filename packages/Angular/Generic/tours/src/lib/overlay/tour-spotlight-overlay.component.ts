import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, computed } from '@angular/core';

export interface SpotlightCutoutRect {
  X: number;
  Y: number;
  Width: number;
  Height: number;
  Radius?: number;
}

/**
 * Renders the Light DOM full-viewport SVG `evenodd` backdrop mask around 1 or more
 * rounded spotlight cutouts. Strictly `aria-hidden="true"` so screen readers never see
 * the decorative mask.
 */
@Component({
  selector: 'mj-tour-spotlight-overlay',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Visible) {
      <div class="mjt-spotlight-backdrop" aria-hidden="true">
        <svg
          class="mjt-spotlight-svg"
          [attr.viewBox]="'0 0 ' + ViewportWidth + ' ' + ViewportHeight"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path class="mjt-spotlight-path" [attr.d]="maskPath()" />
          @for (hole of Cutouts; track $index) {
            <rect
              class="mjt-spotlight-ring"
              [attr.x]="hole.X"
              [attr.y]="hole.Y"
              [attr.width]="hole.Width"
              [attr.height]="hole.Height"
              [attr.rx]="hole.Radius ?? 8"
              [attr.ry]="hole.Radius ?? 8"
            />
          }
        </svg>
      </div>
    }
  `,
})
export class TourSpotlightOverlayComponent {
  @Input() public Visible = false;
  @Input() public Cutouts: ReadonlyArray<SpotlightCutoutRect> = [];
  @Input() public ViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  @Input() public ViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

  protected readonly maskPath = computed(() =>
    BuildSpotlightEvenOddPath(this.ViewportWidth, this.ViewportHeight, this.Cutouts),
  );
}

/**
 * Generates an SVG `evenodd` path covering `(0,0)-(vw,vh)` with rounded rectangular
 * cutouts for every target rect.
 */
export function BuildSpotlightEvenOddPath(
  vw: number,
  vh: number,
  cutouts: ReadonlyArray<SpotlightCutoutRect>,
): string {
  const outer = `M0,0 H${vw} V${vh} H0 Z`;
  if (cutouts.length === 0) {
    return outer;
  }

  const holes = cutouts.map((c) => {
    const x = Math.max(0, c.X);
    const y = Math.max(0, c.Y);
    const w = Math.max(0, c.Width);
    const h = Math.max(0, c.Height);
    const r = Math.min(c.Radius ?? 8, w / 2, h / 2);
    return (
      `M${x + r},${y} ` +
      `H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} ` +
      `V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} ` +
      `H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
      `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
    );
  });

  return `${outer} ${holes.join(' ')}`;
}
