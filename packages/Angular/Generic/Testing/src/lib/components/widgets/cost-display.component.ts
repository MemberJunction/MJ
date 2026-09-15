import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-cost-display',
  template: `
    <div class="cost-display" [class]="getMagnitudeClass()">
      @if (showIcon) {
        <i class="fa-solid fa-dollar-sign cost-icon"></i>
      }
      <span class="cost-value">{{ formatCost(cost) }}</span>
      @if (label) {
        <span class="cost-label">{{ label }}</span>
      }
    </div>
    `,
  styles: [`
    .cost-display {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
    }

    .cost-icon {
      font-size: 10px;
      opacity: 0.7;
    }

    .cost-value {
      font-family: 'Courier New', monospace;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.3px;
    }

    .cost-label {
      font-size: 10px;
      opacity: 0.6;
      margin-left: 2px;
    }

    .cost-display--low {
      color: var(--mj-status-success);
    }

    .cost-display--medium {
      color: var(--mj-status-warning);
    }

    .cost-display--high {
      color: var(--mj-status-error);
    }

    .cost-display--normal {
      color: var(--mj-text-secondary);
    }

    @media (max-width: 768px) {
      .cost-value {
        font-size: 12px;
      }

      .cost-label {
        font-size: 9px;
      }
    }
  `]
})
export class CostDisplayComponent {
  @Input() Cost!: number;

  /** @deprecated Use {@link Cost}. */
  @Input() set cost(value: number) {
    this.Cost = value;
  }
  /** @deprecated Use {@link Cost}. */
  get cost(): number {
    return this.Cost;
  }
  @Input() ShowIcon = true;

  /** @deprecated Use {@link ShowIcon}. */
  @Input() set showIcon(value: CostDisplayComponent['ShowIcon']) {
    this.ShowIcon = value;
  }
  /** @deprecated Use {@link ShowIcon}. */
  get showIcon(): CostDisplayComponent['ShowIcon'] {
    return this.ShowIcon;
  }
  @Input() Label?: string;

  /** @deprecated Use {@link Label}. */
  @Input() set label(value: string | undefined) {
    this.Label = value;
  }
  /** @deprecated Use {@link Label}. */
  get label(): string | undefined {
    return this.Label;
  }
  @Input() Decimals = 6;

  /** @deprecated Use {@link Decimals}. */
  @Input() set decimals(value: CostDisplayComponent['Decimals']) {
    this.Decimals = value;
  }
  /** @deprecated Use {@link Decimals}. */
  get decimals(): CostDisplayComponent['Decimals'] {
    return this.Decimals;
  }
  @Input() Threshold = { low: 0.01, high: 1.0 };

  /** @deprecated Use {@link Threshold}. */
  @Input() set threshold(value: CostDisplayComponent['Threshold']) {
    this.Threshold = value;
  }
  /** @deprecated Use {@link Threshold}. */
  get threshold(): CostDisplayComponent['Threshold'] {
    return this.Threshold;
  } // Default thresholds in USD

  FormatCost(cost: number): string {
    if (cost == null) return '$0.00';

    // Format based on magnitude
    if (cost >= 1000) {
      return `$${(cost / 1000).toFixed(2)}K`;
    } else if (cost >= 1) {
      return `$${cost.toFixed(2)}`;
    } else if (cost >= 0.01) {
      return `$${cost.toFixed(4)}`;
    } else {
      return `$${cost.toFixed(this.Decimals)}`;
    }
  }

  /** @deprecated Use {@link FormatCost}. */
  formatCost(cost: number): string {
    return this.FormatCost(cost);
  }

  GetMagnitudeClass(): string {
    if (this.Cost < this.Threshold.low) return 'cost-display--low';
    if (this.Cost >= this.Threshold.high) return 'cost-display--high';
    if (this.Cost >= this.Threshold.low && this.Cost < this.Threshold.high) return 'cost-display--medium';
    return 'cost-display--normal';
  }

  /** @deprecated Use {@link GetMagnitudeClass}. */
  getMagnitudeClass(): string {
    return this.GetMagnitudeClass();
  }
}
