import { Component, Input } from '@angular/core';

export type TestStatus = 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Pending' | 'Timeout';

@Component({
  selector: 'app-test-status-badge',
  template: `
    <span
      class="test-status-badge"
      [class.test-status-badge--passed]="status === 'Passed'"
      [class.test-status-badge--failed]="status === 'Failed'"
      [class.test-status-badge--skipped]="status === 'Skipped'"
      [class.test-status-badge--error]="status === 'Error'"
      [class.test-status-badge--running]="status === 'Running'"
      [class.test-status-badge--pending]="status === 'Pending'"
      [class.test-status-badge--timeout]="status === 'Timeout'"
    >
      <i [class]="getIcon()" *ngIf="showIcon"></i>
      <span class="badge-text">{{ status }}</span>
    </span>
  `,
  styles: [`
    .test-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: all 0.2s ease;
    }

    .test-status-badge i {
      font-size: 10px;
    }

    .test-status-badge--passed {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
      border: 1px solid rgba(76, 175, 80, 0.2);
    }

    .test-status-badge--failed {
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
      border: 1px solid rgba(244, 67, 54, 0.2);
    }

    .test-status-badge--skipped {
      background: rgba(158, 158, 158, 0.1);
      color: #9e9e9e;
      border: 1px solid rgba(158, 158, 158, 0.2);
    }

    .test-status-badge--error {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
      border: 1px solid rgba(255, 152, 0, 0.2);
    }

    .test-status-badge--running {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
      border: 1px solid rgba(33, 150, 243, 0.2);
    }

    .test-status-badge--pending {
      background: rgba(255, 193, 7, 0.1);
      color: #ffc107;
      border: 1px solid rgba(255, 193, 7, 0.2);
    }

    .test-status-badge--timeout {
      background: rgba(255, 152, 0, 0.15);
      color: #e65100;
      border: 1px solid rgba(255, 152, 0, 0.3);
    }

    .badge-text {
      line-height: 1;
    }

    @media (max-width: 768px) {
      .test-status-badge {
        font-size: 10px;
        padding: 3px 8px;
      }
    }
  `]
})
export class TestStatusBadgeComponent {
  @Input() status!: TestStatus;
  @Input() showIcon = true;

  getIcon(): string {
    switch (this.status) {
      case 'Passed':
        return 'fa-solid fa-check-circle';
      case 'Failed':
        return 'fa-solid fa-times-circle';
      case 'Skipped':
        return 'fa-solid fa-forward';
      case 'Error':
        return 'fa-solid fa-exclamation-triangle';
      case 'Running':
        return 'fa-solid fa-spinner fa-spin';
      case 'Pending':
        return 'fa-solid fa-clock';
      case 'Timeout':
        return 'fa-solid fa-stopwatch';
      default:
        return 'fa-solid fa-question-circle';
    }
  }
}
