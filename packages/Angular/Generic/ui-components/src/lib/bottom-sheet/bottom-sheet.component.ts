import {
  Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy,
  ElementRef, HostListener, OnDestroy, ViewChild, inject
} from '@angular/core';

/**
 * Generic bottom sheet — the canonical mobile overlay surface (scrim + panel
 * sliding up from the bottom edge with a grab handle).
 *
 * Pure chrome, no breakpoint logic: the CALLER decides when a sheet is the
 * right presentation (typically below its mobile breakpoint). Content is
 * projected; the sheet owns the scrim, enter/exit transitions, Escape,
 * focus capture/restore, and the open/close lifecycle.
 *
 * Mechanics notes (learned from the earlier hand-rolled sheets):
 * - Enter AND exit are class-driven `transition`s (the filter-popover sheet's
 *   mount-only `animation` cannot animate dismissal).
 * - The settled open state is `transform: none`, NOT `translateY(0)` — any
 *   non-none transform makes the sheet a containing block and breaks
 *   `position: fixed` descendants (dropdowns/popovers projected into it).
 * - z-index 9998/9999: the established mobile-chrome band (same as the
 *   left-nav drawer and filter sheet; below mj-window at 10000, and
 *   MJConfirmService dialogs at 20000 still land above).
 *
 * @example
 * ```html
 * <mj-bottom-sheet [(Visible)]="sheetOpen" Title="Open Records">
 *   <div>...rows...</div>
 * </mj-bottom-sheet>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-bottom-sheet',
  templateUrl: './bottom-sheet.component.html',
  styleUrls: ['./bottom-sheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJBottomSheetComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('sheet') private sheetEl?: ElementRef<HTMLElement>;

  /** Optional header row text; also the default accessible name */
  @Input() Title = '';
  /** Accessible name override (falls back to Title) */
  @Input() AriaLabel = '';

  @Input()
  set Visible(value: boolean) {
    if (value === this._visible) {
      return;
    }
    this._visible = value;
    if (value) {
      this.open();
    } else {
      this.close(false);
    }
  }
  get Visible(): boolean {
    return this._visible;
  }
  private _visible = false;

  @Output() VisibleChange = new EventEmitter<boolean>();
  /** Emitted after the exit transition completes */
  @Output() Closed = new EventEmitter<void>();

  /** @if gate — outlives Visible through the exit transition */
  public IsRendered = false;
  /** Drives the enter/exit transition classes */
  public IsOpen = false;
  /** Open transition finished — transform settles to `none` */
  public IsSettled = false;

  /** Focus restore target captured at open */
  private previousFocus: HTMLElement | null = null;
  private closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending open rAFs — canceled on close so a rapid open→close can't
   *  resurrect the open class after the close started */
  private openRafIds: number[] = [];
  /** Settle fallback: under prefers-reduced-motion no transitionend fires,
   *  and the sheet must still reach transform:none (containing-block fix) */
  private settleFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('document:keydown.escape')
  public OnEscape(): void {
    if (this.IsOpen) {
      this.close(true);
    }
  }

  /** Scrim click / programmatic dismiss */
  public Close(): void {
    if (this.IsOpen) {
      this.close(true);
    }
  }

  public OnTransitionEnd(event: TransitionEvent): void {
    if (event.target !== this.sheetEl?.nativeElement || event.propertyName !== 'transform') {
      return;
    }
    if (this.IsOpen) {
      // Settled: transform → none so fixed-position descendants aren't trapped
      this.IsSettled = true;
      this.cdr.markForCheck();
    } else if (this.IsRendered) {
      this.finishClose();
    }
  }

  private open(): void {
    this.clearCloseFallback();
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.IsRendered = true;
    this.cdr.markForCheck();
    // Two frames: one for the @if to render at translateY(100%), one so the
    // class flip actually transitions (same-frame flips snap instead)
    this.openRafIds.push(requestAnimationFrame(() => {
      this.openRafIds.push(requestAnimationFrame(() => {
        this.openRafIds = [];
        if (!this._visible) {
          return; // closed again before the frames ran — stay closed
        }
        this.IsOpen = true;
        this.cdr.markForCheck();
        this.sheetEl?.nativeElement?.focus();
        // Reduced-motion (transition:none) never fires transitionend — the
        // fallback still settles the transform to none
        this.clearSettleFallback();
        this.settleFallbackTimer = setTimeout(() => {
          if (this.IsOpen && !this.IsSettled) {
            this.IsSettled = true;
            this.cdr.markForCheck();
          }
        }, 300);
      }));
    }));
  }

  /**
   * @param emit true when the sheet itself initiated the dismissal (Escape,
   * scrim) — the Visible setter path passes false because the caller's
   * binding is already up to date.
   */
  private close(emit: boolean): void {
    this._visible = false;
    this.cancelOpenRafs();
    this.clearSettleFallback();
    this.IsOpen = false;
    this.IsSettled = false;
    this.cdr.markForCheck();
    if (emit) {
      this.VisibleChange.emit(false);
    }
    // transitionend normally finishes the close; the timer covers
    // prefers-reduced-motion (no transition event) and detached nodes
    this.clearCloseFallback();
    this.closeFallbackTimer = setTimeout(() => this.finishClose(), 300);
  }

  private finishClose(): void {
    this.clearCloseFallback();
    if (!this.IsRendered) {
      return;
    }
    this.IsRendered = false;
    this.cdr.markForCheck();
    this.Closed.emit();
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  private clearCloseFallback(): void {
    if (this.closeFallbackTimer !== null) {
      clearTimeout(this.closeFallbackTimer);
      this.closeFallbackTimer = null;
    }
  }

  private clearSettleFallback(): void {
    if (this.settleFallbackTimer !== null) {
      clearTimeout(this.settleFallbackTimer);
      this.settleFallbackTimer = null;
    }
  }

  private cancelOpenRafs(): void {
    this.openRafIds.forEach(id => cancelAnimationFrame(id));
    this.openRafIds = [];
  }

  ngOnDestroy(): void {
    this.clearCloseFallback();
    this.clearSettleFallback();
    this.cancelOpenRafs();
  }
}
