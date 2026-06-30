import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, OverlayModule],
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
      <span class="mj-filter-popover-label">{{ Label }}</span>
      @if (ActiveCount > 0) {
        <span class="mj-filter-popover-badge" [attr.aria-label]="ActiveCount + ' active filters'">
          {{ ActiveCount }}
        </span>
      }
      <i class="fa-solid fa-chevron-down mj-filter-popover-chevron" [class.mj-filter-popover-chevron--open]="IsOpen"></i>
    </button>

    <!-- The panel body (header + projected filter UI) is declared ONCE here and
         stamped into whichever wrapper is active (anchored overlay on desktop,
         docked sheet on mobile). A single <ng-content> avoids the duplicate-slot
         bug where projected content lands in only one of two branches. -->
    <ng-template #panelBody>
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
    </ng-template>

    @if (IsMobile) {
      <!-- Mobile: the popover docks as a bottom sheet — mirrors how mj-left-nav
           becomes a drawer at this width. -->
      @if (IsOpen) {
        <div class="mj-filter-popover-scrim" (click)="Close()" aria-hidden="true"></div>
        <div class="mj-filter-popover-sheet" role="dialog" [attr.aria-label]="Label">
          <div class="mj-filter-popover-grab" aria-hidden="true"></div>
          <ng-container *ngTemplateOutlet="panelBody"></ng-container>
        </div>
      }
    } @else {
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
          <ng-container *ngTemplateOutlet="panelBody"></ng-container>
        </div>
      </ng-template>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    /* Trigger button — visually aligned with mjButton size="sm" variant="secondary"
       (same height, padding, font-size, font-weight, background) so it sits
       cleanly next to Refresh/Export/+Add in chrome and filter-card rows. */
    .mj-filter-popover-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      min-height: 32px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-primary);
      font-family: inherit;
      font-size: 0.8125rem;
      font-weight: var(--mj-font-semibold);
      line-height: 1.5;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      white-space: nowrap;
    }

    .mj-filter-popover-trigger:hover {
      background: var(--mj-bg-surface-active);
      border-color: var(--mj-border-strong);
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
      font-size: var(--mj-text-xs);
      color: var(--mj-brand-primary);
    }

    .mj-filter-popover-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 var(--mj-space-1-5);
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
      margin-top: var(--mj-space-1-5);
      overflow: hidden;
    }

    .mj-filter-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--mj-space-3) var(--mj-space-4) 0;
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
      font-size: var(--mj-text-xs);
      font-weight: 500;
      cursor: pointer;
      padding: var(--mj-space-1) var(--mj-space-2);
      border-radius: var(--mj-radius-sm);
    }

    .mj-filter-popover-clear:hover {
      background: var(--mj-bg-surface-hover);
    }

    .mj-filter-popover-content {
      padding: var(--mj-space-3) var(--mj-space-4) var(--mj-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-2-5);
    }

    /* ── Mobile bottom sheet (≤700px) ─────────────────────────────────────
       The trigger button stays inline; tapping it docks the panel body as a
       sheet at the bottom of the viewport over a scrim — same body, different
       wrapper. Mirrors the mj-left-nav drawer treatment. */
    .mj-filter-popover-scrim {
      position: fixed;
      inset: 0;
      background: var(--mj-bg-overlay);
      z-index: 9998;
      animation: mj-fp-fade 0.2s ease;
    }
    .mj-filter-popover-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      background: var(--mj-bg-surface);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      box-shadow: var(--mj-shadow-lg);
      animation: mj-fp-slide-up 0.24s ease;
    }
    .mj-filter-popover-grab {
      flex-shrink: 0;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--mj-border-strong);
      margin: 10px auto 2px;
    }
    .mj-filter-popover-sheet .mj-filter-popover-header {
      flex-shrink: 0;
    }
    .mj-filter-popover-sheet .mj-filter-popover-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: var(--mj-space-6);
    }
    @keyframes mj-fp-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes mj-fp-slide-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mj-filter-popover-scrim,
      .mj-filter-popover-sheet {
        animation: none;
      }
    }

    /* On mobile the trigger collapses to icon-only (the count badge still
       conveys active state) so the control bar — search · Filter · view —
       stays on one line. */
    @media (max-width: 700px) {
      .mj-filter-popover-label,
      .mj-filter-popover-chevron {
        display: none;
      }
      .mj-filter-popover-trigger {
        padding: 6px 10px;
        gap: 4px;
      }
    }
  `]
})
export class MJFilterPopoverComponent implements OnDestroy {
  @Input() Label: string = 'Filters';
  @Input() Icon: string = 'fa-solid fa-filter';
  @Input() ActiveCount: number = 0;
  @Input() ShowClearAll: boolean = false;

  public IsOpen: boolean = false;

  /**
   * True when the viewport is narrow enough that the popover should dock as a
   * bottom sheet instead of an anchored overlay. Driven by matchMedia so it
   * tracks live resize without Angular change-detection plumbing.
   */
  public IsMobile: boolean = false;

  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly mediaQuery: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 700px)')
      : null;

  // matchMedia 'change' fires OUTSIDE Angular's zone, so the flip must be
  // re-entered into the zone — otherwise the IsMobile change lands mid-CD and
  // the @if(IsMobile) branch swap throws ExpressionChangedAfterItHasBeenChecked
  // when crossing the breakpoint. Also close across the switch so a sheet/overlay
  // opened in one mode doesn't linger in the other.
  private readonly onMediaChange = (e: MediaQueryListEvent): void => {
    this.zone.run(() => {
      this.IsMobile = e.matches;
      this.IsOpen = false;
      this.cdr.markForCheck();
    });
  };

  constructor() {
    if (this.mediaQuery) {
      this.IsMobile = this.mediaQuery.matches;
      this.mediaQuery.addEventListener('change', this.onMediaChange);
    }
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onMediaChange);
  }

  // Note: NO offsetY here — CDK applies offsetY as `transform: translateY(...)` on the
  // overlay pane, which creates a containing block for `position: fixed` descendants.
  // Tree dropdowns (and any other component using position: fixed) would then mis-position.
  // The 6px spacing below the trigger is applied via margin-top on .mj-filter-popover-panel.
  public readonly Positions: ConnectedPosition[] = [
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top' },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'end',   originY: 'top',    overlayX: 'end',   overlayY: 'bottom' }
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
