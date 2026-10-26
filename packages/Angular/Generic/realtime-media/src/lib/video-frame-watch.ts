/**
 * Watches a `<video>` element for new frames, and reports when none has come for a while (a stalled or ended video)
 * and when frames come back. It works the same for a live stream and for a player that owns the element (MSE playout of
 * an avatar), because it watches the element, not the source.
 *
 * It uses `requestVideoFrameCallback` where the browser has it (each composited frame), and otherwise `timeupdate`
 * events while the playback position moves. A watched element counts as stalled until its first frame.
 *
 * Framework-free: a component runs it outside its zone and enters the zone only when {@link Stalled} changes.
 */
export class VideoFrameWatch {
  private element: HTMLVideoElement | null = null;
  private frameHandle: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private lastTime = 0;
  private stalled = true;

  /**
   * @param stallAfterMs How long without a frame counts as stalled.
   * @param onChange Called when {@link Stalled} changes.
   * @param clock The time in milliseconds, injectable for tests.
   */
  constructor(
    private readonly stallAfterMs: number,
    private readonly onChange: (stalled: boolean) => void,
    private readonly clock: () => number = () => performance.now()
  ) {}

  /** Whether no frame has come for {@link stallAfterMs}, or none has come yet. */
  public get Stalled(): boolean {
    return this.stalled;
  }

  /** Starts watching an element (stopping any watch before), stalled until its first frame. */
  public Watch(element: HTMLVideoElement): void {
    this.Stop();
    this.element = element;
    // Only a position that moves from here counts as a frame.
    this.lastTime = element.currentTime;
    this.setStalled(true);
    if (typeof element.requestVideoFrameCallback === 'function') {
      const next = (): void => {
        this.frame();
        this.frameHandle = element.requestVideoFrameCallback(next);
      };
      this.frameHandle = element.requestVideoFrameCallback(next);
    } else {
      element.addEventListener('timeupdate', this.onTimeUpdate);
    }
    this.timer = setInterval(() => this.check(), Math.max(50, Math.round(this.stallAfterMs / 4)));
  }

  /** Stops watching. Safe to call when nothing is watched. */
  public Stop(): void {
    const element = this.element;
    if (element && this.frameHandle !== null && typeof element.cancelVideoFrameCallback === 'function') {
      element.cancelVideoFrameCallback(this.frameHandle);
    }
    element?.removeEventListener('timeupdate', this.onTimeUpdate);
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
    this.element = null;
    this.frameHandle = null;
    this.timer = null;
  }

  /** Without frame callbacks: a moving playback position is a new frame. */
  private readonly onTimeUpdate = (): void => {
    const time = this.element?.currentTime ?? -1;
    if (time !== this.lastTime) {
      this.lastTime = time;
      this.frame();
    }
  };

  private frame(): void {
    this.lastFrameAt = this.clock();
    this.setStalled(false);
  }

  private check(): void {
    if (!this.stalled && this.clock() - this.lastFrameAt > this.stallAfterMs) {
      this.setStalled(true);
    }
  }

  private setStalled(stalled: boolean): void {
    if (stalled !== this.stalled) {
      this.stalled = stalled;
      this.onChange(stalled);
    }
  }
}
