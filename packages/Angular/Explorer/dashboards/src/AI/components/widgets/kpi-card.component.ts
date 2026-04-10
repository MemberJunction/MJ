import { Component, Input, OnInit } from '@angular/core';

export interface KPICardData {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    period: string;
  };
  loading?: boolean;
}

@Component({
  standalone: false,
  selector: 'app-kpi-card',
  template: `
    <div class="kpi-card" [class]="'kpi-card--' + data.color">
      <div class="kpi-card__header">
        <div class="kpi-card__icon">
          <i [class]="'fa-solid ' + data.icon"></i>
        </div>
        <div class="kpi-card__title">{{ data.title }}</div>
      </div>
    
      <div class="kpi-card__content">
        @if (!data.loading) {
          <div class="kpi-card__value">
            {{ formatValue(data.value) }}
          </div>
        }
        @if (data.loading) {
          <div class="kpi-card__loading">
            <mj-loading [showText]="false" size="small"></mj-loading>
          </div>
        }
    
        @if (data.subtitle && !data.loading) {
          <div class="kpi-card__subtitle">
            {{ data.subtitle }}
          </div>
        }
    
        @if (data.trend && !data.loading) {
          <div class="kpi-card__trend">
            <i [class]="getTrendIcon()" [style.color]="getTrendColor()"></i>
            <span class="trend-percentage" [style.color]="getTrendColor()">
              {{ data.trend.percentage }}%
            </span>
            <span class="trend-period">{{ data.trend.period }}</span>
          </div>
        }
      </div>
    </div>
    `,
  styles: [`
    .kpi-card {
      background: var(--mj-bg-surface);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--mj-border-default);
      border-left: 4px solid transparent;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      min-height: 130px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .kpi-card:hover {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--mj-brand-primary) 25%, var(--mj-bg-surface));
    }

    .kpi-card--primary { border-left-color: var(--mj-brand-primary); }
    .kpi-card--success { border-left-color: var(--mj-status-success); }
    .kpi-card--warning { border-left-color: var(--mj-status-warning); }
    .kpi-card--danger { border-left-color: var(--mj-status-error); }
    .kpi-card--info { border-left-color: var(--mj-brand-accent); }

    .kpi-card__header {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }

    .kpi-card__icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      font-size: 15px;
    }

    .kpi-card--primary .kpi-card__icon {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }
    .kpi-card--success .kpi-card__icon {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }
    .kpi-card--warning .kpi-card__icon {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
    }
    .kpi-card--danger .kpi-card__icon {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }
    .kpi-card--info .kpi-card__icon {
      background: color-mix(in srgb, var(--mj-brand-accent) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-accent);
    }

    .kpi-card__title {
      font-size: 11px;
      font-weight: 700;
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-card__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .kpi-card__value {
      font-size: 26px;
      font-weight: 700;
      color: var(--mj-text-primary);
      margin-bottom: 4px;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .kpi-card__subtitle {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-bottom: 6px;
    }

    .kpi-card__trend {
      display: flex;
      align-items: center;
      font-size: 11px;
      gap: 4px;
    }

    .trend-percentage {
      font-weight: 600;
    }

    .trend-period {
      color: var(--mj-text-disabled);
    }

    .kpi-card__loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 60px;
    }

    @media (max-width: 768px) {
      .kpi-card {
        min-height: 110px;
        padding: 16px;
      }

      .kpi-card__value {
        font-size: 22px;
      }

      .kpi-card__icon {
        width: 32px;
        height: 32px;
        font-size: 13px;
      }
    }
  `]
})
export class KPICardComponent implements OnInit {
  @Input() data!: KPICardData;

  ngOnInit() {
    if (!this.data) {
      throw new Error('KPICardComponent requires data input');
    }
  }

  formatValue(value: string | number): string {
    if (typeof value === 'number') {
      // Format large numbers with appropriate suffixes
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
      } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
      } else if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    return value;
  }

  getTrendIcon(): string {
    if (!this.data.trend) return '';
    
    switch (this.data.trend.direction) {
      case 'up':
        return 'fa-solid fa-arrow-up';
      case 'down':
        return 'fa-solid fa-arrow-down';
      case 'stable':
        return 'fa-solid fa-minus';
      default:
        return '';
    }
  }

  getTrendColor(): string {
    if (!this.data.trend) return 'var(--mj-text-disabled)';

    switch (this.data.trend.direction) {
      case 'up':
        return 'var(--mj-status-success)';
      case 'down':
        return 'var(--mj-status-error)';
      case 'stable':
        return 'var(--mj-text-disabled)';
      default:
        return 'var(--mj-text-disabled)';
    }
  }
}