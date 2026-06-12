import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Which way a zoom button points. */
type ZoomDirection = 1 | -1;

/**
 * The bottom-right zoom cluster of the live whiteboard: zoom out / percentage / zoom in,
 * fit-to-content, and the minimap toggle. Pure presentational; the board owns the
 * viewport math and the minimap rendering.
 *
 * HOLD-TO-ZOOM: a plain click on +/− still emits the existing single preset step
 * ({@link ZoomIn} / {@link ZoomOut}); holding the button down (pointerdown held past a
 * short delay) emits {@link ZoomBy} factors (~3.5%) every 50 ms for smooth continuous
 * zooming, stopping on pointerup / pointerleave / pointercancel / destroy — the timers
 * never leak. The board clamps to its usual 25%–200% limits.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-zoom',
  imports: [CommonModule],
  templateUrl: './whiteboard-zoom.component.html',
  styleUrl: './whiteboard-zoom.component.css'
})
export class RealtimeWhiteboardZoomComponent implements OnDestroy {
  /** How long a press must be held before continuous zooming kicks in. */
  private static readonly HoldDelayMs = 350;
  /** Continuous-zoom tick cadence while held. */
  private static readonly HoldIntervalMs = 50;
  /** Multiplicative zoom factor per held tick (~3.5%). */
  private static readonly HoldFactor = 1.035;

  /** Current zoom as a percentage (e.g. 90). */
  @Input() ZoomPercent = 100;
  /** Whether the minimap is currently shown (highlights the map button). */
  @Input() MinimapOpen = false;

  /** Single preset step out (a plain click on −). */
  @Output() ZoomOut = new EventEmitter<void>();
  /** Single preset step in (a plain click on +). */
  @Output() ZoomIn = new EventEmitter<void>();
  /**
   * Continuous (held-button) zoom tick: a multiplicative factor (>1 zooms in, <1 zooms
   * out) emitted every 50 ms while + or − is held. Wire to the board's `ZoomByFactor`.
   */
  @Output() ZoomBy = new EventEmitter<number>();
  @Output() Fit = new EventEmitter<void>();
  @Output() ToggleMinimap = new EventEmitter<void>();

  private holdDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private holdIntervalTimer: ReturnType<typeof setInterval> | null = null;
  /** Set once continuous ticks started, so the trailing click doesn't ALSO step. */
  private suppressNextClick = false;

  ngOnDestroy(): void {
    this.stopHold();
  }

  /** Pointer down on +/−: arm the hold — after the delay, tick {@link ZoomBy} repeatedly. */
  public OnZoomPressStart(event: PointerEvent, direction: ZoomDirection): void {
    if (event.button !== 0) {
      return;
    }
    this.stopHold();
    this.suppressNextClick = false;
    this.holdDelayTimer = setTimeout(() => {
      this.holdDelayTimer = null;
      this.suppressNextClick = true;
      const factor = direction === 1
        ? RealtimeWhiteboardZoomComponent.HoldFactor
        : 1 / RealtimeWhiteboardZoomComponent.HoldFactor;
      this.ZoomBy.emit(factor); // first tick fires immediately when the hold engages
      this.holdIntervalTimer = setInterval(() => this.ZoomBy.emit(factor), RealtimeWhiteboardZoomComponent.HoldIntervalMs);
    }, RealtimeWhiteboardZoomComponent.HoldDelayMs);
  }

  /** Pointer up / leave / cancel: stop any pending or running continuous zoom. */
  public OnZoomPressEnd(): void {
    this.stopHold();
  }

  /** The click that follows the press: a single preset step unless a hold already zoomed. */
  public OnZoomClick(direction: ZoomDirection): void {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    if (direction === 1) {
      this.ZoomIn.emit();
    }
    else {
      this.ZoomOut.emit();
    }
  }

  /** Clear both hold timers (idempotent — safe from any stop path). */
  private stopHold(): void {
    if (this.holdDelayTimer !== null) {
      clearTimeout(this.holdDelayTimer);
      this.holdDelayTimer = null;
    }
    if (this.holdIntervalTimer !== null) {
      clearInterval(this.holdIntervalTimer);
      this.holdIntervalTimer = null;
    }
  }
}
