import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BadgeConfig } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';

/**
 * Displays notification badges with various styles and animations
 * Supports count, dot, pulse, and new badge types
 */
@Component({
  standalone: false,
  selector: 'mj-notification-badge',
  template: `
    @if (badgeConfig?.show) {
      <div class="notification-badge-container">
        @if (badgeConfig?.type === 'count' && badgeConfig?.count != null && badgeConfig?.count! > 0) {
          <div
            class="notification-badge badge-count"
            [class.badge-high]="badgeConfig?.priority === 'high'"
            [class.badge-urgent]="badgeConfig?.priority === 'urgent'"
            [class.badge-animate]="badgeConfig?.animate">
            {{ formatCount(badgeConfig?.count!) }}
          </div>
        }
        @if (badgeConfig?.type === 'dot') {
          <div
            class="notification-badge badge-dot"
            [class.badge-high]="badgeConfig?.priority === 'high'"
            [class.badge-urgent]="badgeConfig?.priority === 'urgent'"
            [class.badge-animate]="badgeConfig?.animate">
          </div>
        }
        @if (badgeConfig?.type === 'pulse') {
          <div
            class="notification-badge badge-pulse"
            [class.badge-high]="badgeConfig?.priority === 'high'"
            [class.badge-urgent]="badgeConfig?.priority === 'urgent'">
            <span class="pulse-ring"></span>
            <span class="pulse-ring-delay"></span>
            @if (badgeConfig?.count != null && badgeConfig?.count! > 0) {
              <span class="pulse-count">{{ formatCount(badgeConfig?.count!) }}</span>
            }
          </div>
        }
        @if (badgeConfig?.type === 'new') {
          <div
            class="notification-badge badge-new"
            [class.badge-animate]="badgeConfig?.animate">
            NEW
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .notification-badge-container {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .notification-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      color: white;
      border-radius: 10px;
      white-space: nowrap;
      transition: all 150ms ease;
    }

    /* Count badge */
    .badge-count {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: #0076B6;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .badge-count.badge-high {
      background: #F59E0B;
    }

    .badge-count.badge-urgent {
      background: #DC2626;
    }

    /* Dot badge */
    .badge-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #0076B6;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .badge-dot.badge-high {
      background: #F59E0B;
    }

    .badge-dot.badge-urgent {
      background: #DC2626;
    }

    /* Pulse badge with animated rings */
    .badge-pulse {
      position: relative;
      width: 24px;
      height: 24px;
      background: #0076B6;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .badge-pulse.badge-high {
      background: #F59E0B;
    }

    .badge-pulse.badge-urgent {
      background: #DC2626;
    }

    .pulse-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      border: 2px solid currentColor;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
      opacity: 0;
    }

    .pulse-ring-delay {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      border: 2px solid currentColor;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
      animation-delay: 1s;
      opacity: 0;
    }

    @keyframes pulse-ring {
      0% {
        transform: translate(-50%, -50%) scale(0.8);
        opacity: 1;
      }
      50% {
        transform: translate(-50%, -50%) scale(1.3);
        opacity: 0.5;
      }
      100% {
        transform: translate(-50%, -50%) scale(1.5);
        opacity: 0;
      }
    }

    .pulse-count {
      position: relative;
      z-index: 1;
      font-size: 10px;
      font-weight: 700;
      color: white;
    }

    /* New badge */
    .badge-new {
      height: 18px;
      padding: 0 6px;
      background: linear-gradient(135deg, #10B981, #059669);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
    }

    /* Pop-in animation for badges */
    .badge-animate {
      animation: badge-pop 300ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
    }

    @keyframes badge-pop {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      50% {
        transform: scale(1.2);
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    /* Shake animation for urgent badges */
    .badge-urgent.badge-animate {
      animation: badge-pop 300ms cubic-bezier(0.68, -0.55, 0.265, 1.55),
                 badge-shake 400ms ease-in-out 300ms;
    }

    @keyframes badge-shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
      20%, 40%, 60%, 80% { transform: translateX(2px); }
    }

    /* Hover effects */
    .notification-badge:hover {
      transform: scale(1.1);
      cursor: default;
    }

    .badge-pulse:hover .pulse-ring,
    .badge-pulse:hover .pulse-ring-delay {
      animation-play-state: paused;
    }
  `]
})
export class NotificationBadgeComponent implements OnInit, OnDestroy {
  @Input() conversationId?: string;
  @Input() badgeConfig?: BadgeConfig;

  private destroy$ = new Subject<void>();
  private _loadedBadgeConfig: BadgeConfig | null = null;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    // If badgeConfig not provided but conversationId is, load from service
    if (!this.badgeConfig && this.conversationId) {
      this.notificationService
        .getBadgeConfig$(this.conversationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(config => {
          this._loadedBadgeConfig = config;
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get displayConfig(): BadgeConfig | null {
    return this.badgeConfig || this._loadedBadgeConfig;
  }

  /**
   * Formats count for display
   * Shows 99+ for counts over 99
   */
  formatCount(count: number): string {
    return count > 99 ? '99+' : count.toString();
  }
}
