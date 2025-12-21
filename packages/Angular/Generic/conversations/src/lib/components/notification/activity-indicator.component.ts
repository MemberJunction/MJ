import { Component, Input } from '@angular/core';
import { ActivityIndicatorConfig } from '../../models/notification.model';

/**
 * Displays activity indicators for agent processes, typing, etc.
 */
@Component({
  standalone: false,
  selector: 'mj-activity-indicator',
  template: `
    @if (config?.show) {
      <div class="activity-indicator" [class.activity-agent]="config?.type === 'agent'" [class.activity-processing]="config?.type === 'processing'" [class.activity-typing]="config?.type === 'typing'">
        <div class="activity-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        @if (config?.text) {
          <span class="activity-text">{{ config?.text }}</span>
        }
      </div>
    }
  `,
  styles: [`
    .activity-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      color: #666;
      background: #F4F4F4;
      transition: all 150ms ease;
    }

    .activity-agent {
      background: #EFF6FF;
      color: #0076B6;
    }

    .activity-processing {
      background: #FEF3C7;
      color: #D97706;
    }

    .activity-typing {
      background: #F3F4F6;
      color: #6B7280;
    }

    .activity-dots {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
      animation: dot-pulse 1.4s ease-in-out infinite;
    }

    .dot:nth-child(1) {
      animation-delay: 0s;
    }

    .dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes dot-pulse {
      0%, 60%, 100% {
        opacity: 0.3;
        transform: scale(0.8);
      }
      30% {
        opacity: 1;
        transform: scale(1.2);
      }
    }

    .activity-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
  `]
})
export class ActivityIndicatorComponent {
  @Input() config?: ActivityIndicatorConfig;
}
