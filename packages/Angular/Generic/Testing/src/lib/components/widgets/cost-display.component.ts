import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-cost-display',
  template: `
    <div class="cost-display" [class]="getMagnitudeClass()">
      <i class="fa-solid fa-dollar-sign cost-icon" *ngIf="showIcon"></i>
      <span class="cost-value">{{ formatCost(cost) }}</span>
      <span class="cost-label" *ngIf="label">{{ label }}</span>
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
      color: #4caf50;
    }

    .cost-display--medium {
      color: #ff9800;
    }

    .cost-display--high {
      color: #f44336;
    }

    .cost-display--normal {
      color: #666;
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
  @Input() cost!: number;
  @Input() showIcon = true;
  @Input() label?: string;
  @Input() decimals = 6;
  @Input() threshold = { low: 0.01, high: 1.0 }; // Default thresholds in USD

  formatCost(cost: number): string {
    if (cost == null) return '$0.00';

    // Format based on magnitude
    if (cost >= 1000) {
      return `$${(cost / 1000).toFixed(2)}K`;
    } else if (cost >= 1) {
      return `$${cost.toFixed(2)}`;
    } else if (cost >= 0.01) {
      return `$${cost.toFixed(4)}`;
    } else {
      return `$${cost.toFixed(this.decimals)}`;
    }
  }

  getMagnitudeClass(): string {
    if (this.cost < this.threshold.low) return 'cost-display--low';
    if (this.cost >= this.threshold.high) return 'cost-display--high';
    if (this.cost >= this.threshold.low && this.cost < this.threshold.high) return 'cost-display--medium';
    return 'cost-display--normal';
  }
}
