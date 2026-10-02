import { Renderer2 } from '@angular/core';

/**
 * One pointer drag of a separator (a gutter or a row's height handle) in Home's Dashboards strip.
 * Start captures the pointer on the separator and listens on the document for that pointer's moves
 * and its end; call it outside Angular's zone, so moves run no app-wide change detection. The drag
 * ends once, on the first of: pointerup, pointercancel, lostpointercapture, a move with the main
 * button up, a move after the separator left the page, or End. Each end removes the listeners,
 * releases the capture if the separator still holds it, and calls back.
 */
export class SeparatorPointerDrag {
  private unlisteners: Array<() => void> = [];
  private active = false;

  /**
   * @param renderer - attaches and removes the document listeners
   * @param Target - the separator that got the pointer down
   * @param PointerId - the pointer that drags
   * @param onMove - called for each move of that pointer while its main button is down
   * @param onEnd - called once, when the drag ends
   */
  constructor(
    private readonly renderer: Renderer2,
    public readonly Target: Element,
    public readonly PointerId: number,
    private readonly onMove: (event: PointerEvent) => void,
    private readonly onEnd: () => void
  ) {}

  /** Captures the pointer on the separator and starts listening on the document. */
  public Start(): void {
    this.active = true;
    this.Target.setPointerCapture(this.PointerId);
    this.unlisteners = [
      this.renderer.listen('document', 'pointermove', (event: PointerEvent) => this.move(event)),
      this.renderer.listen('document', 'pointerup', (event: PointerEvent) => this.endFor(event)),
      this.renderer.listen('document', 'pointercancel', (event: PointerEvent) => this.endFor(event)),
      this.renderer.listen('document', 'lostpointercapture', (event: PointerEvent) => this.captureLost(event)),
    ];
  }

  /** Ends the drag, once: stops listening, releases the capture and calls back. */
  public End(): void {
    if (this.stop()) {
      this.onEnd();
    }
  }

  /** Stops the drag without the call back, for an owner that is being destroyed. */
  public Dispose(): void {
    this.stop();
  }

  /** Stops listening and releases the capture; false when the drag had already stopped. */
  private stop(): boolean {
    if (!this.active) {
      return false;
    }
    this.active = false;
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    if (this.Target.hasPointerCapture(this.PointerId)) {
      this.Target.releasePointerCapture(this.PointerId);
    }
    return true;
  }

  /** A move of the dragging pointer. With the main button up, or the separator gone, the drag ends. */
  private move(event: PointerEvent): void {
    if (event.pointerId !== this.PointerId) {
      return;
    }
    if ((event.buttons & 1) === 0 || !this.Target.isConnected) {
      this.End();
      return;
    }
    this.onMove(event);
  }

  /** A pointerup or pointercancel of the dragging pointer ends the drag. */
  private endFor(event: PointerEvent): void {
    if (event.pointerId === this.PointerId) {
      this.End();
    }
  }

  /** The separator lost the capture (or left the page, when the browser reports the loss on the document): the drag ends. */
  private captureLost(event: PointerEvent): void {
    if (event.target === this.Target || !this.Target.isConnected) {
      this.endFor(event);
    }
  }
}
