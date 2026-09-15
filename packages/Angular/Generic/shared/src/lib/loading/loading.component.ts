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
  @Input() Text = 'Loading...';

  /** @deprecated Use {@link Text}. */
  @Input() set text(value: LoadingComponent['Text']) {
    this.Text = value;
  }
  /** @deprecated Use {@link Text}. */
  get text(): LoadingComponent['Text'] {
    return this.Text;
  }

  /**
   * Whether to show the text below the logo.
   * When false, only the animated logo is shown.
   */
  @Input() ShowText = true;

  /** @deprecated Use {@link ShowText}. */
  @Input() set showText(value: LoadingComponent['ShowText']) {
    this.ShowText = value;
  }
  /** @deprecated Use {@link ShowText}. */
  get showText(): LoadingComponent['ShowText'] {
    return this.ShowText;
  }

  /**
   * Animation duration in seconds.
   * Default is 1.5 seconds for the pulse animation.
   */
  @Input() AnimationDuration = 1.5;

  /** @deprecated Use {@link AnimationDuration}. */
  @Input() set animationDuration(value: LoadingComponent['AnimationDuration']) {
    this.AnimationDuration = value;
  }
  /** @deprecated Use {@link AnimationDuration}. */
  get animationDuration(): LoadingComponent['AnimationDuration'] {
    return this.AnimationDuration;
  }

  /**
   * Size preset for quick sizing.
   * - 'small': 40x22px logo
   * - 'medium': 80x45px logo (default)
   * - 'large': 120x67px logo
   * - 'auto': fills container
   */
  @Input() Size: 'small' | 'medium' | 'large' | 'auto' = 'auto';

  /** @deprecated Use {@link Size}. */
  @Input() set size(value: 'small' | 'medium' | 'large' | 'auto') {
    this.Size = value;
  }
  /** @deprecated Use {@link Size}. */
  get size(): 'small' | 'medium' | 'large' | 'auto' {
    return this.Size;
  }

  /**
   * CSS color for the loading text.
   * Accepts any valid CSS color value.
   */
  @Input() TextColor = '';

  /** @deprecated Use {@link TextColor}. */
  @Input() set textColor(value: LoadingComponent['TextColor']) {
    this.TextColor = value;
  }
  /** @deprecated Use {@link TextColor}. */
  get textColor(): LoadingComponent['TextColor'] {
    return this.TextColor;
  }

  /**
   * CSS color for the logo (solid color).
   * Accepts any valid CSS color value.
   * When empty, uses --mj-logo-color CSS variable (adapts to light/dark theme).
   * Ignored if logoGradient is provided.
   */
  @Input() LogoColor = '';

  /** @deprecated Use {@link LogoColor}. */
  @Input() set logoColor(value: LoadingComponent['LogoColor']) {
    this.LogoColor = value;
  }
  /** @deprecated Use {@link LogoColor}. */
  get logoColor(): LoadingComponent['LogoColor'] {
    return this.LogoColor;
  }

  /**
   * Gradient configuration for the logo.
   * When provided, creates a linear gradient fill instead of solid color.
   * Takes precedence over logoColor.
   */
  @Input() LogoGradient: LogoGradient | null = null;

  /** @deprecated Use {@link LogoGradient}. */
  @Input() set logoGradient(value: LogoGradient | null) {
    this.LogoGradient = value;
  }
  /** @deprecated Use {@link LogoGradient}. */
  get logoGradient(): LogoGradient | null {
    return this.LogoGradient;
  }

  /**
   * Animation type for the logo.
   * - 'pulse': Fade in/out with subtle scale (default)
   * - 'spin': Rotate continuously
   * - 'bounce': Bounce up and down
   * - 'pulse-spin': Pulse while slowly spinning
   */
  @Input() Animation: 'pulse' | 'spin' | 'bounce' | 'pulse-spin' = 'pulse';

  /** @deprecated Use {@link Animation}. */
  @Input() set animation(value: 'pulse' | 'spin' | 'bounce' | 'pulse-spin') {
    this.Animation = value;
  }
  /** @deprecated Use {@link Animation}. */
  get animation(): 'pulse' | 'spin' | 'bounce' | 'pulse-spin' {
    return this.Animation;
  }

  /** Unique ID for the gradient definition to avoid conflicts */
  readonly gradientId = `mj-logo-gradient-${Math.random().toString(36).substring(2, 11)}`;

  get logoClass(): string {
    return `mj-loading-logo size-${this.Size} animation-${this.Animation}`;
  }

  get logoStyle(): string {
    return `animation-duration: ${this.AnimationDuration}s`;
  }

  get textStyle(): string {
    return this.TextColor ? `color: ${this.TextColor}` : '';
  }

  /**
   * Get the fill value for the SVG paths.
   * Returns a gradient URL reference if gradient is set, the explicit logoColor if provided,
   * or null to let the CSS variable (--mj-logo-color) take effect.
   */
  get logoFill(): string | null {
    if (this.LogoGradient) {
      return `url(#${this.gradientId})`;
    }
    return this.LogoColor || null;
  }

  /**
   * Calculate gradient transform based on angle.
   * Converts angle to x1, y1, x2, y2 coordinates for SVG linearGradient.
   */
  get gradientCoords(): { x1: string; y1: string; x2: string; y2: string } {
    const angle = this.LogoGradient?.angle ?? 45;
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
