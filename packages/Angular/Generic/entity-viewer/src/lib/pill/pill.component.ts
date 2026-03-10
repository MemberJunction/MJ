import { Component, Input } from '@angular/core';
import { PillColorType } from '../types';

/**
 * Utility class to determine pill colors based on value semantics
 */
export class PillColorUtil {
  /** Positive/success values - green */
  private static readonly successPatterns = [
    'active', 'approved', 'complete', 'completed', 'success', 'successful',
    'enabled', 'yes', 'true', 'verified', 'confirmed', 'published',
    'accepted', 'valid', 'available', 'open', 'live', 'running', 'healthy',
    'done', 'resolved', 'paid', 'shipped', 'delivered'
  ];

  /** Warning/attention values - yellow/amber */
  private static readonly warningPatterns = [
    'pending', 'waiting', 'review', 'in review', 'in progress', 'processing',
    'draft', 'scheduled', 'queued', 'on hold', 'paused', 'partial',
    'incomplete', 'warning', 'attention', 'moderate', 'medium'
  ];

  /** Negative/danger values - red */
  private static readonly dangerPatterns = [
    'failed', 'failure', 'error', 'rejected', 'declined', 'denied',
    'expired', 'inactive', 'disabled', 'no', 'false', 'invalid',
    'cancelled', 'canceled', 'closed', 'blocked', 'suspended',
    'deleted', 'removed', 'terminated', 'critical', 'high', 'urgent',
    'overdue', 'unpaid', 'refunded', 'returned'
  ];

  /** Informational values - blue */
  private static readonly infoPatterns = [
    'new', 'info', 'information', 'note', 'update', 'updated',
    'created', 'modified', 'changed', 'low', 'minor'
  ];

  /**
   * Determine the appropriate color type for a given value
   * @param value The value to analyze
   * @returns The semantic color type
   */
  static getColorType(value: string | null | undefined): PillColorType {
    if (!value) return 'neutral';

    const normalizedValue = value.toLowerCase().trim();

    if (this.matchesAnyPattern(normalizedValue, this.successPatterns)) {
      return 'success';
    }
    if (this.matchesAnyPattern(normalizedValue, this.dangerPatterns)) {
      return 'danger';
    }
    if (this.matchesAnyPattern(normalizedValue, this.warningPatterns)) {
      return 'warning';
    }
    if (this.matchesAnyPattern(normalizedValue, this.infoPatterns)) {
      return 'info';
    }

    return 'neutral';
  }

  private static matchesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some(pattern =>
      value === pattern ||
      value.includes(pattern) ||
      value.replace(/[_-]/g, ' ').includes(pattern)
    );
  }
}

/**
 * PillComponent - displays categorical values as colored pills
 *
 * Automatically determines color based on semantic meaning of the value.
 * Works for status, type, category, priority, or any enum-like field.
 *
 * @example
 * ```html
 * <!-- Auto-color based on value semantics -->
 * <mj-pill [value]="record.Status"></mj-pill>
 *
 * <!-- Force a specific color -->
 * <mj-pill [value]="record.Type" color="info"></mj-pill>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-pill',
  template: `
    <span class="pill" [class]="'pill-' + effectiveColorType">
      {{ displayValue }}
    </span>
  `,
  styles: [`
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      text-transform: capitalize;
    }

    .pill-success {
      background-color: var(--mj-status-success-bg);
      color: var(--mj-status-success);
    }

    .pill-warning {
      background-color: var(--mj-status-warning-bg);
      color: var(--mj-status-warning);
    }

    .pill-danger {
      background-color: var(--mj-status-error-bg);
      color: var(--mj-status-error);
    }

    .pill-info {
      background-color: color-mix(in srgb, var(--mj-color-info-500) 10%, var(--mj-bg-surface));
      color: var(--mj-color-info-500);
    }

    .pill-neutral {
      background-color: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
    }
  `]
})
export class PillComponent {
  /**
   * The value to display in the pill
   */
  @Input() value: string | null | undefined = '';

  /**
   * Optional: Force a specific color instead of auto-detecting
   */
  @Input() color: PillColorType | null = null;

  /**
   * Get the display value
   */
  get displayValue(): string {
    return this.value || '';
  }

  /**
   * Get the effective color type (forced or auto-detected)
   */
  get effectiveColorType(): PillColorType {
    if (this.color) {
      return this.color;
    }
    return PillColorUtil.getColorType(this.value);
  }
}
