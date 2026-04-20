import { Component, Input } from '@angular/core';

export type TestStatus = 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Pending' | 'Timeout';

@Component({
  standalone: false,
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
      @if (showIcon) {
        <i [class]="getIcon()"></i>
      }
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
      background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
      color: var(--mj-status-success);
      border: 1px solid color-mix(in srgb, var(--mj-status-success) 20%, transparent);
    }

    .test-status-badge--failed {
      background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
      color: var(--mj-status-error);
      border: 1px solid color-mix(in srgb, var(--mj-status-error) 20%, transparent);
    }

    .test-status-badge--skipped {
      background: color-mix(in srgb, var(--mj-text-disabled) 10%, var(--mj-bg-surface));
      color: var(--mj-text-disabled);
      border: 1px solid color-mix(in srgb, var(--mj-text-disabled) 20%, transparent);
    }

    .test-status-badge--error {
      background: color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
      border: 1px solid color-mix(in srgb, var(--mj-status-warning) 20%, transparent);
    }

    .test-status-badge--running {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
    }

    .test-status-badge--pending {
      background: color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
      border: 1px solid color-mix(in srgb, var(--mj-status-warning) 20%, transparent);
    }

    .test-status-badge--timeout {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
      border: 1px solid color-mix(in srgb, var(--mj-status-warning) 30%, transparent);
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
