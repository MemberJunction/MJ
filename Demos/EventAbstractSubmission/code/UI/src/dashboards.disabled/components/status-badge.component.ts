import { Component, Input } from '@angular/core';

@Component({
  selector: 'mj-status-badge',
  template: `
    <span class="status-badge" [class]="'status-' + getBadgeClass()">
      {{ status }}
    </span>
  `,
  styles: [`
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .status-success {
      background-color: #d1fae5;
      color: #065f46;
    }
    .status-error {
      background-color: #fee2e2;
      color: #991b1b;
    }
    .status-warning {
      background-color: #fef3c7;
      color: #92400e;
    }
    .status-info {
      background-color: #dbeafe;
      color: #1e40af;
    }
    .status-default {
      background-color: #f3f4f6;
      color: #374151;
    }
  `]
})
export class StatusBadgeComponent {
  @Input() status: string = '';

  getBadgeClass(): string {
    const statusMap: { [key: string]: string } = {
      'Accepted': 'success',
      'Rejected': 'error',
      'Under Review': 'info',
      'New': 'warning',
      'Draft': 'default',
      'Submitted': 'info',
      'Active': 'success',
      'Inactive': 'default',
      'Planning': 'info',
      'Completed': 'success'
    };
    return statusMap[this.status] || 'default';
  }
}
