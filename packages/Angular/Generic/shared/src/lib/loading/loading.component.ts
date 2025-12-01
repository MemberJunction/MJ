import { Component, Input } from '@angular/core';

/**
 * MJ Loading Component - Displays an animated MJ logo with optional text.
 *
 * Features:
 * - SVG logo with pulse animation
 * - Sizes to fit container (use CSS on host element)
 * - Optional loading text
 * - Customizable animation
 *
 * @example
 * ```html
 * <!-- Basic usage (fills container) -->
 * <mj-loading></mj-loading>
 *
 * <!-- With custom text -->
 * <mj-loading text="Loading data..."></mj-loading>
 *
 * <!-- No text -->
 * <mj-loading [showText]="false"></mj-loading>
 *
 * <!-- Fixed size container -->
 * <div style="width: 200px; height: 150px;">
 *   <mj-loading text="Please wait..."></mj-loading>
 * </div>
 * ```
 */
@Component({
  selector: 'mj-loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.css']
})
export class LoadingComponent {
  /**
   * Text to display below the loading animation.
   * Set to empty string or use showText=false to hide text.
   */
  @Input() text = 'Loading...';

  /**
   * Whether to show the text below the logo.
   * When false, only the animated logo is shown.
   */
  @Input() showText = true;

  /**
   * Animation duration in seconds.
   * Default is 1.5 seconds for the pulse animation.
   */
  @Input() animationDuration = 1.5;

  /**
   * Size preset for quick sizing.
   * - 'small': 40x22px logo
   * - 'medium': 80x45px logo (default)
   * - 'large': 120x67px logo
   * - 'auto': fills container
   */
  @Input() size: 'small' | 'medium' | 'large' | 'auto' = 'auto';

  get logoClass(): string {
    return `mj-loading-logo size-${this.size}`;
  }

  get animationStyle(): string {
    return `animation-duration: ${this.animationDuration}s`;
  }
}
