import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { WordCloudItem, WordCloudItemEvent, WordCloudLayoutItem } from './word-cloud.types';
import { computeWordCloudLayout, WordCloudLayoutConfig } from './word-cloud.layout';

/** Fixed palette for categorical color mode, using MJ design-token-friendly CSS values. */
const CATEGORICAL_PALETTE: string[] = [
  'var(--mj-brand-primary)',
  'var(--mj-status-success)',
  'var(--mj-status-warning)',
  'var(--mj-status-error)',
  'var(--mj-status-info)',
  'var(--mj-brand-primary-hover)',
  'var(--mj-status-success-text)',
  'var(--mj-status-warning-text)',
];

/**
 * A reusable, SVG-based word cloud component.
 *
 * Renders weighted text items in a spiral or rectangular layout with
 * collision detection. Supports multiple color modes using MJ design tokens,
 * optional entry animation, and click/hover interaction.
 *
 * @example
 * ```html
 * <mj-word-cloud
 *   [Items]="words"
 *   [MaxFontSize]="56"
 *   ColorMode="categorical"
 *   (ItemClick)="onWordClick($event)">
 * </mj-word-cloud>
 * ```
 */
@Component({
  selector: 'mj-word-cloud',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="ViewBox"
      class="mj-word-cloud"
      [class.mj-word-cloud-animated]="Animate"
      preserveAspectRatio="xMidYMid meet">
      @for (item of LayoutItems; track item.Text) {
        <text
          [attr.x]="item.X"
          [attr.y]="item.Y"
          [attr.font-size]="item.FontSize + 'px'"
          [attr.transform]="'rotate(' + item.Rotation + ' ' + item.X + ' ' + item.Y + ')'"
          [style.fill]="item.Color"
          [style.opacity]="item.Opacity"
          [style.animation-delay]="Animate ? (item.Index * 30) + 'ms' : '0ms'"
          class="mj-word-cloud-item"
          [class.mj-word-cloud-interactive]="Interactive"
          text-anchor="middle"
          dominant-baseline="central"
          (click)="OnItemClick(item, $event)"
          (mouseenter)="OnItemHover(item, $event)"
          (mouseleave)="OnItemLeave(item, $event)">
          {{ item.Text }}
        </text>
      }
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .mj-word-cloud {
      width: 100%;
      height: 100%;
    }

    .mj-word-cloud-item {
      font-family: var(--mj-font-family, inherit);
      transition: opacity 0.2s ease, filter 0.2s ease;
      user-select: none;
    }

    .mj-word-cloud-interactive {
      cursor: pointer;
    }

    .mj-word-cloud-interactive:hover {
      opacity: 0.8 !important;
      filter: brightness(1.2);
    }

    .mj-word-cloud-animated .mj-word-cloud-item {
      animation: mj-word-cloud-fade-in 0.4s ease-out both;
    }

    @keyframes mj-word-cloud-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `],
})
export class MJWordCloudComponent implements OnChanges {
  // --------------- Inputs ---------------

  /** Data items to display in the cloud. */
  @Input() Items: WordCloudItem[] = [];

  /** Minimum font size in pixels for the lowest-weighted item. */
  @Input() MinFontSize = 12;

  /** Maximum font size in pixels for the highest-weighted item. */
  @Input() MaxFontSize = 48;

  /** Layout algorithm used for word placement. */
  @Input() Layout: 'spiral' | 'rectangular' = 'spiral';

  /**
   * How colors are assigned to words.
   * - `brand`: all words use --mj-brand-primary with opacity based on weight.
   * - `categorical`: distinct colors from a fixed palette, assigned by Category.
   * - `weight-gradient`: interpolates from muted to brand-primary based on weight.
   */
  @Input() ColorMode: 'brand' | 'categorical' | 'weight-gradient' = 'brand';

  /** Whether words are clickable / hoverable. */
  @Input() Interactive = true;

  /** Maximum number of items to display (heaviest are kept). */
  @Input() MaxItems = 100;

  /** Whether to animate words in with a staggered fade. */
  @Input() Animate = true;

  // --------------- Outputs ---------------

  /** Emitted when a word is clicked. */
  @Output() ItemClick = new EventEmitter<WordCloudItemEvent>();

  /** Emitted when the pointer enters a word. */
  @Output() ItemHover = new EventEmitter<WordCloudItemEvent>();

  /** Emitted when the pointer leaves a word. */
  @Output() ItemLeave = new EventEmitter<WordCloudItemEvent>();

  // --------------- Public computed state ---------------

  /** Positioned items ready for rendering. */
  LayoutItems: WordCloudLayoutItem[] = [];

  /** SVG viewBox attribute value. */
  ViewBox = '0 0 100 100';

  // --------------- Lifecycle ---------------

  ngOnChanges(_changes: SimpleChanges): void {
    this.recomputeLayout();
  }

  // --------------- Event handlers ---------------

  OnItemClick(item: WordCloudLayoutItem, event: MouseEvent): void {
    if (this.Interactive) {
      this.ItemClick.emit({ Item: item, Event: event });
    }
  }

  OnItemHover(item: WordCloudLayoutItem, event: MouseEvent): void {
    if (this.Interactive) {
      this.ItemHover.emit({ Item: item, Event: event });
    }
  }

  OnItemLeave(item: WordCloudLayoutItem, event: MouseEvent): void {
    if (this.Interactive) {
      this.ItemLeave.emit({ Item: item, Event: event });
    }
  }

  // --------------- Private helpers ---------------

  private recomputeLayout(): void {
    const config: WordCloudLayoutConfig = {
      MinFontSize: this.MinFontSize,
      MaxFontSize: this.MaxFontSize,
      Layout: this.Layout,
      MaxItems: this.MaxItems,
    };

    const result = computeWordCloudLayout(this.Items, config);
    this.ViewBox = result.ViewBox;
    this.LayoutItems = this.applyColors(result.Items);
  }

  /**
   * Applies color and opacity to each layout item based on the current ColorMode.
   */
  private applyColors(items: WordCloudLayoutItem[]): WordCloudLayoutItem[] {
    switch (this.ColorMode) {
      case 'brand':
        return this.applyBrandColors(items);
      case 'categorical':
        return this.applyCategoricalColors(items);
      case 'weight-gradient':
        return this.applyWeightGradientColors(items);
      default:
        return items;
    }
  }

  /**
   * Brand mode: all words use --mj-brand-primary; opacity varies with weight.
   */
  private applyBrandColors(items: WordCloudLayoutItem[]): WordCloudLayoutItem[] {
    return items.map(item => ({
      ...item,
      Color: 'var(--mj-brand-primary)',
      Opacity: 0.4 + item.Weight * 0.6, // range 0.4 - 1.0
    }));
  }

  /**
   * Categorical mode: words with the same Category share a color from the palette.
   */
  private applyCategoricalColors(items: WordCloudLayoutItem[]): WordCloudLayoutItem[] {
    const categoryIndex = new Map<string, number>();
    let nextIndex = 0;

    return items.map(item => {
      const key = item.Category ?? item.Text;
      if (!categoryIndex.has(key)) {
        categoryIndex.set(key, nextIndex);
        nextIndex++;
      }
      const colorIdx = categoryIndex.get(key)! % CATEGORICAL_PALETTE.length;
      return {
        ...item,
        Color: CATEGORICAL_PALETTE[colorIdx],
        Opacity: 1,
      };
    });
  }

  /**
   * Weight-gradient mode: low-weight words use --mj-text-muted, high-weight
   * words use --mj-brand-primary, interpolated via color-mix().
   */
  private applyWeightGradientColors(items: WordCloudLayoutItem[]): WordCloudLayoutItem[] {
    return items.map(item => {
      const pct = Math.round(item.Weight * 100);
      return {
        ...item,
        Color: `color-mix(in srgb, var(--mj-brand-primary) ${pct}%, var(--mj-text-muted))`,
        Opacity: 1,
      };
    });
  }
}
