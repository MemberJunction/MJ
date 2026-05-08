import { Component, EventEmitter, Input, Output } from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';

/**
 * mj-filter-popover — Compact "Filters" trigger button that opens a popover
 * containing arbitrary filter UI. Use this in a dashboard's page-header to
 * keep the header chrome consistent regardless of filter density.
 *
 * Pass the popover content via `<ng-content>`. Drive the active-count badge
 * via the `ActiveCount` input.
 *
 * Example:
 * ```html
 * <mj-filter-popover [ActiveCount]="activeFilters.length">
 *   <div class="my-filter-grid">
 *     <mj-dropdown ...></mj-dropdown>
 *     <mj-dropdown ...></mj-dropdown>
 *   </div>
 * </mj-filter-popover>
 * ```
 */
@Component({
  selector: 'mj-filter-popover',
  standalone: true,
  imports: [OverlayModule],
  template: `
    <button
      type="button"
      class="mj-filter-popover-trigger"
      [class.mj-filter-popover-trigger--active]="IsOpen || ActiveCount > 0"
      cdkOverlayOrigin
      #overlayOrigin="cdkOverlayOrigin"
      [attr.aria-expanded]="IsOpen"
      [attr.aria-haspopup]="true"
      (click)="Toggle()">
      <i [class]="Icon"></i>
      <span>{{ Label }}</span>
      @if (ActiveCount > 0) {
        <span class="mj-filter-popover-badge" [attr.aria-label]="ActiveCount + ' active filters'">
          {{ ActiveCount }}
        </span>
      }
      <i class="fa-solid fa-chevron-down mj-filter-popover-chevron" [class.mj-filter-popover-chevron--open]="IsOpen"></i>
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="overlayOrigin"
      [cdkConnectedOverlayOpen]="IsOpen"
      [cdkConnectedOverlayPositions]="Positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="mj-filter-popover-backdrop"
      (backdropClick)="Close()"
      (detach)="Close()">
      <div class="mj-filter-popover-panel" role="dialog" [attr.aria-label]="Label">
        <div class="mj-filter-popover-header">
          <span class="mj-filter-popover-title">{{ Label }}</span>
          @if (ActiveCount > 0 && ShowClearAll) {
            <button type="button" class="mj-filter-popover-clear" (click)="ClearAll()">
              Clear all
            </button>
          }
        </div>
        <div class="mj-filter-popover-content">
          <ng-content></ng-content>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    .mj-filter-popover-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-secondary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      white-space: nowrap;
    }

    .mj-filter-popover-trigger:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .mj-filter-popover-trigger--active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-border-default));
      color: var(--mj-brand-primary);
    }

    .mj-filter-popover-trigger--active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
    }

    .mj-filter-popover-trigger > i:first-child {
      font-size: 12px;
      color: var(--mj-brand-primary);
    }

    .mj-filter-popover-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }

    .mj-filter-popover-chevron {
      font-size: 10px;
      transition: transform 0.2s ease;
      color: var(--mj-text-muted);
    }

    .mj-filter-popover-chevron--open {
      transform: rotate(180deg);
    }

    .mj-filter-popover-panel {
      min-width: 320px;
      max-width: 480px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      box-shadow: var(--mj-shadow-md);
      margin-top: 6px;
      overflow: hidden;
    }

    .mj-filter-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 0;
    }

    .mj-filter-popover-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .mj-filter-popover-clear {
      background: transparent;
      border: none;
      color: var(--mj-brand-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--mj-radius-sm);
    }

    .mj-filter-popover-clear:hover {
      background: var(--mj-bg-surface-hover);
    }

    .mj-filter-popover-content {
      padding: 12px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `]
})
export class MJFilterPopoverComponent {
  @Input() Label: string = 'Filters';
  @Input() Icon: string = 'fa-solid fa-filter';
  @Input() ActiveCount: number = 0;
  @Input() ShowClearAll: boolean = false;

  public IsOpen: boolean = false;

  public readonly Positions: ConnectedPosition[] = [
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'end',   originY: 'top',    overlayX: 'end',   overlayY: 'bottom', offsetY: -4 }
  ];

  public Toggle(): void { this.IsOpen = !this.IsOpen; }
  public Open(): void { this.IsOpen = true; }
  public Close(): void { this.IsOpen = false; }

  /** Emitted when the user clicks the "Clear all" link inside the popover header. */
  @Output() public ClearAllRequested = new EventEmitter<void>();

  public ClearAll(): void {
    this.ClearAllRequested.emit();
  }
}
