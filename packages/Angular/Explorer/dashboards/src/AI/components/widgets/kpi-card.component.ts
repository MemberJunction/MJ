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
          <div class="spinner"></div>
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
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-left: 4px solid transparent;
      transition: all 0.3s ease;
      height: 140px;
      display: flex;
      flex-direction: column;
    }

    .kpi-card:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }

    .kpi-card--primary { border-left-color: #2196f3; }
    .kpi-card--success { border-left-color: #4caf50; }
    .kpi-card--warning { border-left-color: #ff9800; }
    .kpi-card--danger { border-left-color: #f44336; }
    .kpi-card--info { border-left-color: #00bcd4; }

    .kpi-card__header {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }

    .kpi-card__icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      font-size: 14px;
    }

    .kpi-card--primary .kpi-card__icon { background: rgba(33, 150, 243, 0.1); color: #2196f3; }
    .kpi-card--success .kpi-card__icon { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
    .kpi-card--warning .kpi-card__icon { background: rgba(255, 152, 0, 0.1); color: #ff9800; }
    .kpi-card--danger .kpi-card__icon { background: rgba(244, 67, 54, 0.1); color: #f44336; }
    .kpi-card--info .kpi-card__icon { background: rgba(0, 188, 212, 0.1); color: #00bcd4; }

    .kpi-card__title {
      font-size: 12px;
      font-weight: 600;
      color: #666;
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
      font-size: 28px;
      font-weight: 700;
      color: #333;
      margin-bottom: 4px;
      line-height: 1;
    }

    .kpi-card__subtitle {
      font-size: 11px;
      color: #999;
      margin-bottom: 8px;
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
      color: #999;
    }

    .kpi-card__loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 60px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #f3f3f3;
      border-top: 2px solid #2196f3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .kpi-card {
        height: auto;
        min-height: 120px;
      }
      
      .kpi-card__value {
        font-size: 24px;
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