import { Component, Input } from '@angular/core';

/**
 * Gradient configuration for the logo.
 * When provided, creates a linear gradient fill instead of solid color.
 */
export interface LogoGradient {
  /** Starting color of the gradient */
  startColor: string;
  /** Ending color of the gradient */
  endColor: string;
  /** Gradient angle in degrees (0 = left to right, 90 = top to bottom). Default: 45 */
  angle?: number;
}

/**
 * MJ Loading Component - Displays an animated MJ logo with optional text.
 *
 * Features:
 * - SVG logo with customizable animations (pulse, spin, bounce)
 * - Sizes to fit container (use CSS on host element)
 * - Optional loading text
 * - Customizable text and logo colors
 * - Gradient support for logo fill
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
 * <!-- With custom colors -->
 * <mj-loading text="Loading..." textColor="#4CAF50" logoColor="#4CAF50"></mj-loading>
 *
 * <!-- With gradient colors (holiday theme) -->
 * <mj-loading [logoGradient]="{startColor: '#228B22', endColor: '#C41E3A'}"></mj-loading>
 *
 * <!-- With spinning animation -->
 * <mj-loading animation="spin"></mj-loading>
 *
 * <!-- Fixed size container -->
 * <div style="width: 200px; height: 150px;">
 *   <mj-loading text="Please wait..."></mj-loading>
 * </div>
 * ```
 */
@Component({
  standalone: false,
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

  /**
   * CSS color for the loading text.
   * Accepts any valid CSS color value.
   */
  @Input() textColor = '#757575';

  /**
   * CSS color for the logo (solid color).
   * Accepts any valid CSS color value.
   * Default is MJ blue (#264FAF).
   * Ignored if logoGradient is provided.
   */
  @Input() logoColor = '#264FAF';

  /**
   * Gradient configuration for the logo.
   * When provided, creates a linear gradient fill instead of solid color.
   * Takes precedence over logoColor.
   */
  @Input() logoGradient: LogoGradient | null = null;

  /**
   * Animation type for the logo.
   * - 'pulse': Fade in/out with subtle scale (default)
   * - 'spin': Rotate continuously
   * - 'bounce': Bounce up and down
   * - 'pulse-spin': Pulse while slowly spinning
   */
  @Input() animation: 'pulse' | 'spin' | 'bounce' | 'pulse-spin' = 'pulse';

  /** Unique ID for the gradient definition to avoid conflicts */
  readonly gradientId = `mj-logo-gradient-${Math.random().toString(36).substring(2, 11)}`;

  get logoClass(): string {
    return `mj-loading-logo size-${this.size} animation-${this.animation}`;
  }

  get logoStyle(): string {
    return `animation-duration: ${this.animationDuration}s`;
  }

  get textStyle(): string {
    return `color: ${this.textColor}`;
  }

  /**
   * Get the fill value for the SVG paths.
   * Returns a gradient URL reference if gradient is set, otherwise the solid color.
   */
  get logoFill(): string {
    if (this.logoGradient) {
      return `url(#${this.gradientId})`;
    }
    return this.logoColor;
  }

  /**
   * Calculate gradient transform based on angle.
   * Converts angle to x1, y1, x2, y2 coordinates for SVG linearGradient.
   */
  get gradientCoords(): { x1: string; y1: string; x2: string; y2: string } {
    const angle = this.logoGradient?.angle ?? 45;
    // Convert angle to radians and calculate coordinates
    // SVG gradientUnits="objectBoundingBox" uses 0-1 range
    const radians = (angle * Math.PI) / 180;
    const x1 = Math.round(50 - Math.cos(radians) * 50);
    const y1 = Math.round(50 + Math.sin(radians) * 50);
    const x2 = Math.round(50 + Math.cos(radians) * 50);
    const y2 = Math.round(50 - Math.sin(radians) * 50);

    return {
      x1: `${x1}%`,
      y1: `${y1}%`,
      x2: `${x2}%`,
      y2: `${y2}%`
    };
  }
}
