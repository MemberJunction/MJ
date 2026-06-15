import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnDestroy, OnInit,
  ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

/** How often the surface polls the server for a fresh page screenshot while bound (~1.4 fps). */
const SNAPSHOT_POLL_MS = 700;

/**
 * One snapshot of the server-hosted browser — the shape the surface's {@link RemoteBrowserSurfaceComponent.Fetch}
 * callback resolves to. Mirrors the server's `RemoteBrowserSnapshot` query payload.
 */
export interface RemoteBrowserSnapshotView {
  /** The current page screenshot as raw base64 PNG, or `null` when none is available yet. */
  ScreenshotBase64: string | null;
  /** The current page URL, or `null` when no page is loaded. */
  CurrentUrl: string | null;
}

/**
 * Fetches one {@link RemoteBrowserSnapshotView} from the server. Supplied by the channel
 * plugin (it owns the session id + GraphQL provider). Best-effort by contract: resolves to
 * `null` on any failure rather than throwing, so the surface keeps the last good frame.
 */
export type RemoteBrowserSnapshotFetcher = () => Promise<RemoteBrowserSnapshotView | null>;

/**
 * LIVE REMOTE-BROWSER surface (`mj-realtime-remote-browser-surface`) — the Browser channel
 * tab's pane. It renders the SERVER-hosted browser the agent drives: a refreshing screenshot
 * `<img>` with the current URL above it and a small "live" indicator. The agent's
 * `browser_*` tools mutate the page through the channel plugin; this surface only PERCEIVES
 * it, polling its {@link Fetch} callback every {@link SNAPSHOT_POLL_MS} ms while bound.
 *
 * The surface is transport-agnostic — it never touches GraphQL directly. The channel plugin
 * wires the {@link Fetch} callback (closing over the session id + provider) in `BindSurface`
 * before the surface's first change detection, so the `ngOnInit` poll has it. Polling stops
 * in `ngOnDestroy` (pane collapsed / overlay torn down) so no traffic continues after unbind.
 * View-only in v1 — there is no takeover input.
 *
 * ### Two render paths: pushed screencast (preferred) vs. snapshot poll (fallback)
 * When the backend advertises the `ScreenStreaming` capability, the server PUSHES encoded CDP
 * frames and the channel plugin sets {@link Streaming} = `true`. In that mode the surface paints
 * each frame onto a `<canvas>` via {@link RenderFrame} and DOES NOT start the poll. When streaming
 * is off (capability absent or start failed) the original behavior is unchanged: the surface polls
 * {@link Fetch} every {@link SNAPSHOT_POLL_MS} ms and renders the screenshot `<img>`.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-remote-browser-surface',
  imports: [CommonModule, SharedGenericModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rb-surface">
      <div class="rb-bar">
        <span class="rb-live" [class.rb-live--on]="HasSnapshot" aria-hidden="true"></span>
        <span class="rb-live-label">{{ HasSnapshot ? 'Live' : 'Connecting…' }}</span>
        <span class="rb-url" [title]="CurrentUrl || ''">{{ CurrentUrl || 'No page loaded yet' }}</span>
      </div>
      <div class="rb-viewport">
        @if (Streaming) {
          <canvas #frameCanvas class="rb-screenshot" [class.rb-hidden]="!HasFrame"></canvas>
          @if (!HasFrame) {
            <div class="rb-placeholder">
              <mj-loading text="Waiting for the browser…" size="medium"></mj-loading>
            </div>
          }
        } @else if (ScreenshotDataUrl) {
          <img class="rb-screenshot" [src]="ScreenshotDataUrl" alt="Live view of the shared browser" />
        } @else {
          <div class="rb-placeholder">
            <mj-loading text="Waiting for the browser…" size="medium"></mj-loading>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .rb-surface {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface-sunken);
    }
    .rb-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--mj-border-subtle);
      background: var(--mj-bg-surface);
      font-size: 0.8125rem;
      color: var(--mj-text-secondary);
    }
    .rb-live {
      width: 8px;
      height: 8px;
      border-radius: var(--mj-radius-full, 50%);
      background: var(--mj-text-disabled);
      flex: 0 0 auto;
    }
    .rb-live--on {
      background: var(--mj-status-success);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-status-success) 25%, transparent);
    }
    .rb-live-label {
      flex: 0 0 auto;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
    .rb-url {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--mj-font-mono, monospace);
    }
    .rb-viewport {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 12px;
    }
    .rb-screenshot {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md, 6px);
      box-shadow: var(--mj-shadow-sm, 0 1px 3px color-mix(in srgb, var(--mj-text-primary) 12%, transparent));
      background: var(--mj-bg-surface);
    }
    .rb-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rb-hidden {
      display: none;
    }
  `]
})
export class RemoteBrowserSurfaceComponent implements OnInit, OnDestroy {
  /** Snapshot fetcher supplied by the channel plugin (closes over the session id + provider). */
  @Input() Fetch: RemoteBrowserSnapshotFetcher | null = null;

  /**
   * Whether the server is PUSHING live screencast frames for this session (the backend advertised the
   * `ScreenStreaming` capability and the start succeeded). When `true` the surface paints pushed frames
   * onto its `<canvas>` via {@link RenderFrame} and does NOT poll; when `false` it uses the snapshot
   * `<img>` poll fallback. Set by the channel plugin in `BindSurface` from the start-screencast result.
   *
   * The start-screencast result is async, so this may flip to `true` AFTER `ngOnInit` has already begun
   * polling — the setter tears the poll down in that case so the two render paths never run at once.
   */
  @Input()
  set Streaming(value: boolean) {
    if (value === this._streaming) {
      return;
    }
    this._streaming = value;
    if (value) {
      // Late flip after the poll-fallback already started: stop polling, switch to canvas frames.
      this.stopPolling();
      this.zone.run(() => this.cdr.markForCheck());
    }
  }
  get Streaming(): boolean {
    return this._streaming;
  }
  private _streaming = false;

  /** The current screenshot as a `data:` URL, or `null` before the first snapshot arrives. */
  public ScreenshotDataUrl: string | null = null;
  /** The current page URL reported by the server, or `null` when none. */
  public CurrentUrl: string | null = null;
  /** Whether at least one pushed screencast frame has been painted (drives the canvas placeholder). */
  public HasFrame = false;

  /** The canvas the pushed screencast frames are painted onto (present only while {@link Streaming}). */
  @ViewChild('frameCanvas') private frameCanvas?: ElementRef<HTMLCanvasElement>;

  /** Whether at least one screenshot OR frame has been rendered (drives the "Live" indicator). */
  public get HasSnapshot(): boolean {
    return this.ScreenshotDataUrl !== null || this.HasFrame;
  }

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  /** Active poll timer; `null` when polling is stopped. */
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Guards against overlapping polls when a request runs longer than the interval. */
  private polling = false;
  /** Set on destroy so an in-flight poll's late resolution doesn't touch a torn-down view. */
  private destroyed = false;
  /** Reused decode target for pushed frames — avoids allocating an `Image` per frame. */
  private readonly frameImage = new Image();
  /** The most recent un-painted frame data URL, drained on the next animation frame (drop-old coalescing). */
  private pendingFrameDataUrl: string | null = null;
  /** True while a paint is scheduled, so rapid frames coalesce to one `requestAnimationFrame`. */
  private framePaintScheduled = false;

  ngOnInit(): void {
    // In streaming mode the server pushes frames — never start the poll (it would be redundant traffic).
    if (this.Streaming) {
      return;
    }
    void this.pollOnce();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPolling();
  }

  /** Starts the interval poll OUTSIDE Angular's zone so it doesn't trigger CD on every tick. */
  private startPolling(): void {
    if (this.pollTimer !== null) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => void this.pollOnce(), SNAPSHOT_POLL_MS);
    });
  }

  /** Stops the interval poll (no further snapshot requests are issued). */
  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Fetches one snapshot and applies it to the view. Best-effort: the fetcher resolves to
   * `null` on failure (the prior frame stays on screen) so a single failed poll never breaks
   * the live view. Skips when a prior poll is still in flight, the fetcher isn't wired, or
   * after destroy.
   */
  private async pollOnce(): Promise<void> {
    if (this.polling || this.destroyed || !this.Fetch) {
      return;
    }
    this.polling = true;
    try {
      const snapshot = await this.Fetch();
      this.applySnapshot(snapshot);
    } catch {
      // Defensive — the fetcher is contractually non-throwing, but never let a poll break the view.
    } finally {
      this.polling = false;
    }
  }

  /** Applies a fetched snapshot to the view fields and triggers OnPush change detection. */
  private applySnapshot(snapshot: RemoteBrowserSnapshotView | null): void {
    if (this.destroyed) {
      return;
    }
    const base64 = snapshot?.ScreenshotBase64 ?? null;
    const nextUrl = snapshot?.CurrentUrl ?? null;
    const nextDataUrl = base64 ? `data:image/png;base64,${base64}` : this.ScreenshotDataUrl;
    if (nextDataUrl === this.ScreenshotDataUrl && nextUrl === this.CurrentUrl) {
      return; // nothing changed — skip the CD pass
    }
    this.ScreenshotDataUrl = nextDataUrl;
    this.CurrentUrl = nextUrl;
    // Re-enter the zone for the OnPush update (the poll runs outside Angular).
    this.zone.run(() => this.cdr.markForCheck());
  }

  /**
   * Paints one PUSHED screencast frame (base64 JPEG) onto the canvas. Called by the channel plugin for
   * each frame the server pushes while {@link Streaming}. Coalesces a burst of frames to one paint per
   * animation frame (the newest wins) so a fast stream never floods the main thread, and reuses a single
   * `Image` decode target to avoid per-frame allocation. No-op after destroy or when not in streaming mode.
   *
   * @param dataBase64 The frame image as raw base64 JPEG (no `data:` prefix).
   */
  public RenderFrame(dataBase64: string): void {
    if (this.destroyed || !this.Streaming || !dataBase64) {
      return;
    }
    this.pendingFrameDataUrl = `data:image/jpeg;base64,${dataBase64}`;
    if (this.framePaintScheduled) {
      return; // a paint is already queued — it will pick up this newest frame
    }
    this.framePaintScheduled = true;
    this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.paintPendingFrame()));
  }

  /** Drains the most recent pending frame onto the canvas (drop-old coalescing target). */
  private paintPendingFrame(): void {
    this.framePaintScheduled = false;
    const dataUrl = this.pendingFrameDataUrl;
    this.pendingFrameDataUrl = null;
    if (this.destroyed || !dataUrl) {
      return;
    }
    this.frameImage.onload = () => this.drawFrameImage();
    this.frameImage.src = dataUrl;
  }

  /** Draws the decoded frame image onto the canvas, sizing the canvas to the frame on the first paint. */
  private drawFrameImage(): void {
    const canvas = this.frameCanvas?.nativeElement;
    if (this.destroyed || !canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { naturalWidth: w, naturalHeight: h } = this.frameImage;
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.drawImage(this.frameImage, 0, 0);
    if (!this.HasFrame) {
      // First frame arrived — re-enter the zone to clear the placeholder + flip the "Live" indicator.
      this.zone.run(() => {
        this.HasFrame = true;
        this.cdr.markForCheck();
      });
    }
  }
}
