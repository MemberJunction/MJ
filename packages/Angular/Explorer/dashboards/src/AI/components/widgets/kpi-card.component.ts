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
        <div class="kpi-card__value" *ngIf="!data.loading">
          {{ formatValue(data.value) }}
        </div>
        <div class="kpi-card__loading" *ngIf="data.loading">
          <mj-loading [showText]="false" size="small"></mj-loading>
        </div>
        
        <div class="kpi-card__subtitle" *ngIf="data.subtitle && !data.loading">
          {{ data.subtitle }}
        </div>
        
        <div class="kpi-card__trend" *ngIf="data.trend && !data.loading">
          <i [class]="getTrendIcon()" [style.color]="getTrendColor()"></i>
          <span class="trend-percentage" [style.color]="getTrendColor()">
            {{ data.trend.percentage }}%
          </span>
          <span class="trend-period">{{ data.trend.period }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kpi-card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid #e5e7eb;
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
      border-color: #c7d2fe;
    }

    .kpi-card--primary { border-left-color: #6366f1; }
    .kpi-card--success { border-left-color: #10b981; }
    .kpi-card--warning { border-left-color: #f59e0b; }
    .kpi-card--danger { border-left-color: #ef4444; }
    .kpi-card--info { border-left-color: #8b5cf6; }

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
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      color: #6366f1;
    }
    .kpi-card--success .kpi-card__icon {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
      color: #10b981;
    }
    .kpi-card--warning .kpi-card__icon {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%);
      color: #f59e0b;
    }
    .kpi-card--danger .kpi-card__icon {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.15) 100%);
      color: #ef4444;
    }
    .kpi-card--info .kpi-card__icon {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(167, 139, 250, 0.15) 100%);
      color: #8b5cf6;
    }

    .kpi-card__title {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
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
      color: #1e293b;
      margin-bottom: 4px;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .kpi-card__subtitle {
      font-size: 11px;
      color: #94a3b8;
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
      color: #94a3b8;
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
    if (!this.data.trend) return '#999';
    
    switch (this.data.trend.direction) {
      case 'up':
        return '#4caf50';
      case 'down':
        return '#f44336';
      case 'stable':
        return '#999';
      default:
        return '#999';
    }
  }
}