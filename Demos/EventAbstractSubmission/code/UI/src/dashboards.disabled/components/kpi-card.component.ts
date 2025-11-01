import { Component, Input } from '@angular/core';

@Component({
  selector: 'mj-kpi-card',
  template: `
    <kendo-card class="kpi-card">
      <kendo-card-body>
        <div class="kpi-content">
          <div class="kpi-icon">
            <span class="k-icon k-i-{{icon}}"></span>
          </div>
          <div class="kpi-details">
            <div class="kpi-value">{{ value }}</div>
            <div class="kpi-title">{{ title }}</div>
          </div>
        </div>
      </kendo-card-body>
    </kendo-card>
  `,
  styles: [`
    .kpi-card {
      min-width: 200px;
      margin: 8px;
    }
    .kpi-content {
      display: flex;
      align-items: center;
      padding: 16px;
    }
    .kpi-icon {
      font-size: 48px;
      color: #3b82f6;
      margin-right: 16px;
    }
    .kpi-value {
      font-size: 32px;
      font-weight: bold;
      color: #1f2937;
    }
    .kpi-title {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
  `]
})
export class KpiCardComponent {
  @Input() title: string = '';
  @Input() value: number | string = 0;
  @Input() icon: string = 'info-circle';
}
