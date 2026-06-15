import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy,
  OnInit, Output, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

/** How often the surface polls the server for a fresh page screenshot while bound (~1.4 fps). */
const SNAPSHOT_POLL_MS = 700;

/** Min interval between forwarded pointer-move samples during takeover (~20 moves/sec). */
const POINTER_MOVE_THROTTLE_MS = 50;

/** Min interval between forwarded scroll samples during takeover; the deltas coalesce between sends (~25/sec). */
const SCROLL_THROTTLE_MS = 40;

/** Radius (px) of the synthetic cursor ring drawn on the overlay so the user can see their pointer. */
const SYNTHETIC_CURSOR_RADIUS = 6;

/** A keyboard modifier held during a relayed human input (Shift-click selection, Ctrl/Cmd+key chords). */
export type RemoteBrowserModifier = 'Shift' | 'Control' | 'Alt' | 'Meta';

/**
 * One human-takeover input the surface emits to the channel while the user "drives" the live view.
 * Mirrors the server's `RemoteBrowserHumanInput` union (flattened for transport): pointer
 * moves/clicks/down/up and scrolls carry VIEWPORT coordinates, a scroll also carries wheel deltas, a key
 * carries the pressed key string. Pointer clicks/down/up and keys also carry any held `modifiers`.
 */
export interface RemoteBrowserHumanInputEvent {
  /** Which input occurred. */
  kind: 'pointer-move' | 'pointer-click' | 'pointer-down' | 'pointer-up' | 'key' | 'scroll';
  /** Viewport X (pointer + scroll kinds only). */
  x?: number;
  /** Viewport Y (pointer + scroll kinds only). */
  y?: number;
  /** Mouse button (pointer-click / -down / -up only). */
  button?: 'left' | 'middle' | 'right';
  /** The pressed key (key kind only). */
  key?: string;
  /** Horizontal wheel delta in pixels (scroll kind only; positive = right). */
  deltaX?: number;
  /** Vertical wheel delta in pixels (scroll kind only; positive = down). */
  deltaY?: number;
  /** Modifier keys held during the input (pointer-click / -down / -up and key kinds). */
  modifiers?: RemoteBrowserModifier[];
}

/**
 * Keys forwarded into the page during takeover even though they aren't single printable characters —
 * navigation/editing keys the page (not the host app) should receive. `preventDefault` is applied only to
 * forwarded keys so the host app's own shortcuts on un-forwarded keys still work.
 */
const FORWARDED_CONTROL_KEYS = new Set<string>([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

/**
 * The modifier keys themselves — pressing one alone is never forwarded as a key (it only rides as a
 * modifier on the NEXT non-modifier key / click), so the page never receives a lone `'Shift'` keypress.
 */
const MODIFIER_KEYS = new Set<string>(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * Maps a display-space pointer position on the live canvas to the server browser's VIEWPORT pixel space.
 *
 * The canvas's internal resolution (`canvasWidth`/`canvasHeight`, set from each pushed frame) IS the
 * viewport pixel space; the canvas is displayed scaled to its bounding rect. So a display point maps as
 * `vx = (clientX - rect.left) / rect.width * canvasWidth` (and likewise for y), rounded to ints. Returns
 * `null` for a zero-size rect or un-sized canvas (divide-by-zero / not-ready guard).
 *
 * Pure + framework-free so it's unit-testable without a DOM.
 *
 * @param clientX The pointer's viewport X in the DOM (`event.clientX`).
 * @param clientY The pointer's viewport Y in the DOM (`event.clientY`).
 * @param rect The canvas's bounding rect (`getBoundingClientRect()`).
 * @param canvasWidth The canvas's internal pixel width (= frame/viewport width).
 * @param canvasHeight The canvas's internal pixel height (= frame/viewport height).
 * @returns Integer viewport coordinates, or `null` when mapping isn't possible.
 */
export function MapToViewportCoords(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }
  const x = Math.round((clientX - rect.left) / rect.width * canvasWidth);
  const y = Math.round((clientY - rect.top) / rect.height * canvasHeight);
  return { x, y };
}

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
        @if (CanTakeOver) {
          <span class="rb-driving" title="Click and type to control the live page">
            <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> You're driving
          </span>
        }
        @if (AudioAvailable) {
          <button
            type="button"
            class="rb-speaker"
            [class.rb-speaker--muted]="AudioMuted"
            [attr.aria-pressed]="!AudioMuted"
            [attr.aria-label]="AudioMuted ? 'Unmute browser audio' : 'Mute browser audio'"
            [title]="AudioMuted ? 'Unmute browser audio' : 'Mute browser audio'"
            (click)="ToggleAudioMuted()"
          >
            <i class="fa-solid" [class.fa-volume-high]="!AudioMuted" [class.fa-volume-xmark]="AudioMuted" aria-hidden="true"></i>
          </button>
        }
      </div>
      <div class="rb-viewport">
        @if (Streaming) {
          <div class="rb-canvas-stack" [class.rb-hidden]="!HasFrame">
            <canvas #frameCanvas class="rb-screenshot" [class.rb-screenshot--interactive]="CanTakeOver"></canvas>
            @if (CanTakeOver) {
              <!-- Synthetic cursor overlay: same internal resolution + CSS box as the frame canvas, so a
                   point drawn at viewport coords aligns exactly. CDP screencast frames don't include the OS
                   cursor, so we render the user's pointer locally for immediate, round-trip-free feedback. -->
              <canvas #cursorCanvas class="rb-screenshot rb-cursor-overlay"></canvas>
            }
          </div>
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
    .rb-screenshot--interactive {
      /* Hide the OS cursor — we render a synthetic cursor on the overlay so there's exactly one pointer
         and it reads naturally for clicking on a web page (not the old crosshair). */
      cursor: none;
      outline: none;
    }
    .rb-screenshot--interactive:focus-visible {
      border-color: var(--mj-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
    }
    /* Frame canvas + synthetic-cursor overlay share one box; the stack shrinks to the frame canvas so the
       absolutely-positioned overlay (inset:0, same object-fit) lines up pixel-for-pixel with it. */
    .rb-canvas-stack {
      position: relative;
      display: inline-flex;
      max-width: 100%;
      max-height: 100%;
      min-height: 0;
    }
    .rb-cursor-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      /* Transparent passthrough layer — no chrome of its own, and never steals pointer/wheel events from
         the frame canvas underneath (those listeners drive takeover). */
      border: none;
      box-shadow: none;
      background: transparent;
      pointer-events: none;
    }
    .rb-driving {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: var(--mj-radius-full, 999px);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
    }
    .rb-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rb-hidden {
      display: none;
    }
    .rb-speaker {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md, 6px);
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      cursor: pointer;
      font-size: 0.8125rem;
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
    }
    .rb-speaker:hover {
      background: var(--mj-bg-surface-hover);
    }
    .rb-speaker:focus-visible {
      outline: none;
      border-color: var(--mj-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
    }
    .rb-speaker--muted {
      color: var(--mj-text-muted);
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
    // Takeover only attaches on the canvas path — (de)attach as streaming flips.
    this.syncTakeoverListeners();
  }
  get Streaming(): boolean {
    return this._streaming;
  }
  private _streaming = false;

  /**
   * Whether HUMAN TAKEOVER is enabled — the user watching the live view can click/type into the page and
   * those events are relayed into the server browser (Collaborative control). Takeover only attaches to the
   * canvas render path (pushed screencast); the `<img>` poll fallback stays view-only. When enabled while
   * already streaming the setter attaches listeners; flipping it off (or streaming off) detaches them.
   */
  @Input()
  set Interactive(value: boolean) {
    if (value === this._interactive) {
      return;
    }
    this._interactive = value;
    this.syncTakeoverListeners();
    this.zone.run(() => this.cdr.markForCheck());
  }
  get Interactive(): boolean {
    return this._interactive;
  }
  private _interactive = false;

  /** Emits each human-takeover input (pointer move/click, key) the user performs on the live canvas. */
  @Output() HumanInput = new EventEmitter<RemoteBrowserHumanInputEvent>();

  /**
   * Whether the live tab-audio stream is available — the channel sets this `true` when the server confirms
   * it is pushing audio. Drives whether the speaker toggle renders in the live-view bar.
   */
  @Input() AudioAvailable = false;

  /**
   * Whether tab audio is currently muted. Two-way: the channel sets the initial value (un-muted when audio
   * starts) and the toggle updates it; {@link AudioMutedChange} relays each user change to the channel,
   * which mutes/unmutes the player.
   */
  @Input() AudioMuted = false;

  /** Emits the new muted state each time the user toggles the speaker (two-way `AudioMuted`). */
  @Output() AudioMutedChange = new EventEmitter<boolean>();

  /** Toggles the speaker mute state and relays it to the channel (which mutes/unmutes the audio player). */
  public ToggleAudioMuted(): void {
    this.AudioMuted = !this.AudioMuted;
    this.AudioMutedChange.emit(this.AudioMuted);
  }

  /** True when takeover is both enabled AND on the canvas path — drives the cursor + "driving" pill. */
  public get CanTakeOver(): boolean {
    return this._interactive && this._streaming;
  }

  /**
   * True while the user is actively driving the remote browser with the keyboard — the takeover canvas
   * holds focus. The host overlay reads this to stand down its own global keyboard shortcuts (e.g.
   * T-to-type opening the local composer) so keystrokes go to the remote page, not the local input.
   */
  public get IsCapturingInput(): boolean {
    return this.surfaceFocused && this.CanTakeOver;
  }

  /** The current screenshot as a `data:` URL, or `null` before the first snapshot arrives. */
  public ScreenshotDataUrl: string | null = null;
  /** The current page URL reported by the server, or `null` when none. */
  public CurrentUrl: string | null = null;
  /** Whether at least one pushed screencast frame has been painted (drives the canvas placeholder). */
  public HasFrame = false;

  /** The canvas the pushed screencast frames are painted onto (present only while {@link Streaming}). */
  @ViewChild('frameCanvas') private frameCanvas?: ElementRef<HTMLCanvasElement>;

  /** The transparent overlay the synthetic cursor is drawn onto (present only while {@link CanTakeOver}). */
  @ViewChild('cursorCanvas') private cursorCanvas?: ElementRef<HTMLCanvasElement>;

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

  /** The canvas element takeover listeners are currently bound to, or `null` when detached. */
  private takeoverCanvas: HTMLCanvasElement | null = null;
  /** Timestamp (ms) of the last forwarded pointer-move, for throttling the high-frequency stream. */
  private lastPointerMoveAt = 0;
  /** Timestamp (ms) of the last forwarded scroll, for throttling the high-frequency wheel stream. */
  private lastScrollAt = 0;
  /** Horizontal wheel delta accumulated since the last forwarded scroll (coalesced across throttled events). */
  private pendingScrollDeltaX = 0;
  /** Vertical wheel delta accumulated since the last forwarded scroll (coalesced across throttled events). */
  private pendingScrollDeltaY = 0;

  /** Last canvas-relative mouse position in VIEWPORT pixel space, or `null` when the pointer is off-canvas. */
  private cursorViewportPoint: { x: number; y: number } | null = null;
  /** True while a synthetic-cursor repaint is queued, so rapid moves coalesce to one `requestAnimationFrame`. */
  private cursorPaintScheduled = false;

  /**
   * True while the user is mid-drag on the canvas (a `mousedown` not yet released) — drives forwarding
   * intermediate moves as a drag and emitting the closing `pointer-up`. Click-drag text selection relies on
   * this so the drag relays as down → moves → up rather than a single discrete click.
   */
  private dragging = false;

  /**
   * True when the most recent `mousedown`→`mouseup` actually MOVED (a real drag), so the synthetic `click`
   * the browser fires right after should be suppressed — the drag's down/move/up already conveyed the intent,
   * and a trailing click would collapse a just-made text selection.
   */
  private suppressNextClick = false;

  /** Viewport point of the active drag's mousedown, used to tell a real drag from a stationary click. */
  private dragStartPoint: { x: number; y: number } | null = null;

  /**
   * True while the takeover canvas currently HOLDS keyboard focus. The host overlay reads this (via
   * {@link IsCapturingInput}) to suppress its own global key shortcuts (e.g. T-to-type) so the user's
   * keystrokes land in the remote browser, not the local composer — fixing the "greedy textbox" focus theft.
   */
  private surfaceFocused = false;

  /** Bound handlers — stored so the exact same references can be removed on detach. */
  private readonly onCanvasMouseMove = (e: MouseEvent): void => this.handlePointerMove(e);
  private readonly onCanvasMouseDown = (e: MouseEvent): void => this.handlePointerDown(e);
  private readonly onCanvasMouseUp = (e: MouseEvent): void => this.handlePointerUp(e);
  private readonly onCanvasClick = (e: MouseEvent): void => this.handlePointerClick(e);
  private readonly onCanvasKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onCanvasMouseLeave = (): void => this.handleMouseLeave();
  private readonly onCanvasWheel = (e: WheelEvent): void => this.handleWheel(e);
  private readonly onCanvasFocus = (): void => { this.surfaceFocused = true; };
  private readonly onCanvasBlur = (): void => { this.surfaceFocused = false; };

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
    this.detachTakeoverListeners();
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

  /**
   * Updates the URL shown above the live view. In streaming (canvas) mode the snapshot poll is stopped, so
   * the channel pushes the current URL here after a navigation/action reports one — otherwise the bar would
   * stay stuck on "No page loaded yet" even though the page is live. No-op for an unchanged / empty value.
   *
   * @param url The current page URL, or null/empty to leave the bar unchanged.
   */
  public SetCurrentUrl(url: string | null | undefined): void {
    if (this.destroyed || !url || url === this.CurrentUrl) {
      return;
    }
    this.CurrentUrl = url;
    this.zone.run(() => this.cdr.markForCheck());
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
      // First frame arrived — re-enter the zone to clear the placeholder + flip the "Live" indicator,
      // and attach takeover listeners now that the canvas element exists in the DOM.
      this.zone.run(() => {
        this.HasFrame = true;
        this.cdr.markForCheck();
      });
      this.syncTakeoverListeners();
    }
  }

  // ----- human takeover (Collaborative control) --------------------------------------------

  /**
   * Attaches or detaches the canvas takeover listeners so they're bound exactly when takeover is live —
   * {@link CanTakeOver} is true AND the canvas element exists. Idempotent: re-binds only when the target
   * canvas changed, detaches when the conditions no longer hold. Safe to call from any state-flip path
   * (the `Interactive`/`Streaming` setters, the first-frame paint, destroy).
   */
  private syncTakeoverListeners(): void {
    const canvas = this.CanTakeOver && !this.destroyed ? (this.frameCanvas?.nativeElement ?? null) : null;
    if (canvas === this.takeoverCanvas) {
      return; // already in the desired state
    }
    this.detachTakeoverListeners();
    if (canvas) {
      this.attachTakeoverListeners(canvas);
    }
  }

  /** Binds the pointer/keyboard/wheel listeners to the canvas OUTSIDE the zone (mousemove/wheel are high-frequency). */
  private attachTakeoverListeners(canvas: HTMLCanvasElement): void {
    canvas.tabIndex = 0; // focusable so it can receive keydown
    // Marks this canvas as a keyboard-capturing surface so the host overlay's global shortcuts (e.g.
    // T-to-type) stand down while it holds focus — see the overlay's isKeyboardCapturingSurfaceFocused().
    canvas.setAttribute('data-mj-capture-keys', '');
    this.zone.runOutsideAngular(() => {
      canvas.addEventListener('mousemove', this.onCanvasMouseMove);
      canvas.addEventListener('mousedown', this.onCanvasMouseDown);
      canvas.addEventListener('mouseup', this.onCanvasMouseUp);
      canvas.addEventListener('click', this.onCanvasClick);
      canvas.addEventListener('keydown', this.onCanvasKeyDown);
      canvas.addEventListener('mouseleave', this.onCanvasMouseLeave);
      canvas.addEventListener('focus', this.onCanvasFocus);
      canvas.addEventListener('blur', this.onCanvasBlur);
      // `passive: false` so preventDefault stops the host page from scrolling while the user drives the page.
      canvas.addEventListener('wheel', this.onCanvasWheel, { passive: false });
    });
    this.takeoverCanvas = canvas;
  }

  /** Removes the listeners from the currently-bound canvas (no-op when none are bound) and clears the cursor. */
  private detachTakeoverListeners(): void {
    const canvas = this.takeoverCanvas;
    if (!canvas) {
      return;
    }
    canvas.removeEventListener('mousemove', this.onCanvasMouseMove);
    canvas.removeEventListener('mousedown', this.onCanvasMouseDown);
    canvas.removeEventListener('mouseup', this.onCanvasMouseUp);
    canvas.removeEventListener('click', this.onCanvasClick);
    canvas.removeEventListener('keydown', this.onCanvasKeyDown);
    canvas.removeEventListener('mouseleave', this.onCanvasMouseLeave);
    canvas.removeEventListener('focus', this.onCanvasFocus);
    canvas.removeEventListener('blur', this.onCanvasBlur);
    canvas.removeEventListener('wheel', this.onCanvasWheel);
    canvas.removeAttribute('data-mj-capture-keys');
    this.takeoverCanvas = null;
    this.cursorViewportPoint = null;
    this.dragging = false;
    this.suppressNextClick = false;
    this.dragStartPoint = null;
    this.surfaceFocused = false;
    this.clearSyntheticCursor();
  }

  /**
   * Pointer-move → tracks the cursor for the synthetic-cursor overlay (every move, immediate, no
   * round-trip) AND emits a throttled viewport-mapped move to the server. Runs outside the zone (no CD
   * per move).
   */
  private handlePointerMove(event: MouseEvent): void {
    const point = this.toViewportCoords(event);
    if (point) {
      // Always update the local cursor for instant feedback — independent of the server-relay throttle.
      this.cursorViewportPoint = point;
      this.scheduleCursorPaint();
    }
    const now = Date.now();
    if (now - this.lastPointerMoveAt < POINTER_MOVE_THROTTLE_MS) {
      return;
    }
    this.lastPointerMoveAt = now;
    if (point) {
      this.emitInput({ kind: 'pointer-move', x: point.x, y: point.y });
    }
  }

  /** Mouse leaves the canvas → hide the synthetic cursor (nothing to relay). */
  private handleMouseLeave(): void {
    this.cursorViewportPoint = null;
    this.scheduleCursorPaint();
  }

  /**
   * Wheel/trackpad/Magic-Mouse scroll over the canvas → forwards a viewport-mapped scroll to the server.
   * Calls `preventDefault` so the host page doesn't scroll while the user drives the live page. Throttled
   * to {@link SCROLL_THROTTLE_MS}, coalescing the skipped deltas so no scroll distance is lost.
   */
  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    this.pendingScrollDeltaX += event.deltaX;
    this.pendingScrollDeltaY += event.deltaY;
    const point = this.toViewportCoords(event);
    if (point) {
      this.cursorViewportPoint = point;
      this.scheduleCursorPaint();
    }
    const now = Date.now();
    if (now - this.lastScrollAt < SCROLL_THROTTLE_MS) {
      return; // accumulate into pendingScrollDelta* until the throttle window opens
    }
    this.lastScrollAt = now;
    const target = point ?? this.cursorViewportPoint;
    if (target && (this.pendingScrollDeltaX !== 0 || this.pendingScrollDeltaY !== 0)) {
      this.emitInput({ kind: 'scroll', x: target.x, y: target.y, deltaX: this.pendingScrollDeltaX, deltaY: this.pendingScrollDeltaY });
      this.pendingScrollDeltaX = 0;
      this.pendingScrollDeltaY = 0;
    }
  }

  /**
   * Mouse-down on the canvas → focuses the canvas (so subsequent keys are captured) and BEGINS a drag:
   * emits a `pointer-down` and arms drag mode so the following moves relay as drag motion and the matching
   * `pointer-up` closes it. This is what makes click-drag text selection work (rather than a discrete click).
   */
  private handlePointerDown(event: MouseEvent): void {
    this.takeoverCanvas?.focus();
    const point = this.toViewportCoords(event);
    if (!point) {
      return;
    }
    this.dragging = true;
    this.dragStartPoint = point;
    this.suppressNextClick = false;
    this.cursorViewportPoint = point;
    this.scheduleCursorPaint();
    this.emitInput({ kind: 'pointer-down', x: point.x, y: point.y, button: this.mapButton(event.button), modifiers: this.collectModifiers(event) });
  }

  /**
   * Mouse-up on the canvas → closes a drag with a `pointer-up` at the release point, disarming drag mode.
   * If the pointer actually moved between down and up, marks the following synthetic `click` to be suppressed
   * (so the drag selection isn't immediately collapsed by a trailing click).
   */
  private handlePointerUp(event: MouseEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    const point = this.toViewportCoords(event);
    if (point) {
      const start = this.dragStartPoint;
      this.suppressNextClick = !!start && (start.x !== point.x || start.y !== point.y);
      this.emitInput({ kind: 'pointer-up', x: point.x, y: point.y, button: this.mapButton(event.button), modifiers: this.collectModifiers(event) });
    }
    this.dragStartPoint = null;
  }

  /**
   * Click → emits a viewport-mapped click WITH any held modifiers (e.g. Shift-click text selection). The
   * server browser receives the press/release of a drag via {@link handlePointerDown}/{@link handlePointerUp};
   * a plain click (down+up with no motion) still fires this `click` event, so a simple click relays as one
   * click action — but we skip emitting it when it terminates a real drag (where down/up already covered it).
   */
  private handlePointerClick(event: MouseEvent): void {
    this.takeoverCanvas?.focus();
    if (this.suppressNextClick) {
      // This click terminates a real drag (selection) — the down/move/up already conveyed it.
      this.suppressNextClick = false;
      return;
    }
    const point = this.toViewportCoords(event);
    if (point) {
      this.emitInput({ kind: 'pointer-click', x: point.x, y: point.y, button: this.mapButton(event.button), modifiers: this.collectModifiers(event) });
    }
  }

  /**
   * Keydown → forwards printable keys, a curated set of control keys ({@link FORWARDED_CONTROL_KEYS}), AND
   * any key combined with a Ctrl/Cmd/Alt modifier (so combos like Ctrl/Cmd+A select-all, Cmd+C/Cmd+V relay).
   * Calls `preventDefault` + `stopPropagation` ONLY on forwarded keys, so (a) the host app keeps its own
   * shortcuts on un-forwarded keys and (b) forwarded keys never bubble to the host overlay's global shortcuts
   * (the T-to-type focus-steal). Lone modifier keys are never forwarded — they ride as `modifiers` on the
   * next key/click.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key;
    if (MODIFIER_KEYS.has(key)) {
      return; // a modifier on its own is not a keypress — it rides on the next key/click
    }
    const isPrintable = key.length === 1;
    const hasComboModifier = event.ctrlKey || event.metaKey || event.altKey;
    const isForwardable = isPrintable || FORWARDED_CONTROL_KEYS.has(key) || hasComboModifier;
    if (!isForwardable) {
      return; // leave non-forwarded keys to the host app
    }
    event.preventDefault();
    // Stop the keystroke from reaching document-level handlers (e.g. the overlay's T-to-type) so the user's
    // typing lands in the remote browser, not the local composer.
    event.stopPropagation();
    this.emitInput({ kind: 'key', key, modifiers: this.collectModifiers(event) });
  }

  /**
   * Collects the modifier keys currently held during a DOM mouse/keyboard event into the relayed
   * {@link RemoteBrowserModifier} list (empty when none are held).
   *
   * @param event The DOM event whose modifier flags to read.
   * @returns The held modifiers, in a stable order.
   */
  private collectModifiers(event: MouseEvent | KeyboardEvent): RemoteBrowserModifier[] {
    const modifiers: RemoteBrowserModifier[] = [];
    if (event.shiftKey) { modifiers.push('Shift'); }
    if (event.ctrlKey) { modifiers.push('Control'); }
    if (event.altKey) { modifiers.push('Alt'); }
    if (event.metaKey) { modifiers.push('Meta'); }
    return modifiers;
  }

  /** Re-enters the zone to emit one human input (so subscribers see it inside Angular). */
  private emitInput(input: RemoteBrowserHumanInputEvent): void {
    this.zone.run(() => this.HumanInput.emit(input));
  }

  /**
   * Maps a DOM pointer event on the live canvas to VIEWPORT coordinates via {@link MapToViewportCoords}
   * (the pure, unit-tested mapping). Returns `null` when no canvas is bound or mapping isn't possible yet.
   *
   * @param event The pointer event on the canvas.
   * @returns The integer viewport coordinates, or `null` when mapping isn't possible yet.
   */
  private toViewportCoords(event: MouseEvent): { x: number; y: number } | null {
    const canvas = this.takeoverCanvas;
    if (!canvas) {
      return null;
    }
    return MapToViewportCoords(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
  }

  // ----- synthetic cursor (local feedback — CDP frames don't include the OS cursor) -----------

  /**
   * Schedules a synthetic-cursor repaint on the next animation frame, coalescing a burst of moves to one
   * paint (the newest position wins). Runs outside the zone — drawing the cursor never triggers Angular CD.
   */
  private scheduleCursorPaint(): void {
    if (this.cursorPaintScheduled) {
      return;
    }
    this.cursorPaintScheduled = true;
    this.zone.runOutsideAngular(() => requestAnimationFrame(() => this.paintSyntheticCursor()));
  }

  /**
   * Draws (or clears) the synthetic cursor on the overlay canvas at {@link cursorViewportPoint}. The overlay
   * shares the frame canvas's internal resolution (sized here to match), so a point drawn at viewport coords
   * aligns exactly with the page underneath. A small brand-tinted ring with a center dot reads as a pointer
   * without obscuring what it's over. No-op after destroy or when the overlay isn't mounted.
   */
  private paintSyntheticCursor(): void {
    this.cursorPaintScheduled = false;
    const overlay = this.cursorCanvas?.nativeElement;
    const frame = this.frameCanvas?.nativeElement;
    if (this.destroyed || !overlay || !frame) {
      return;
    }
    // Keep the overlay's internal resolution locked to the frame canvas so coordinate spaces match.
    if (overlay.width !== frame.width || overlay.height !== frame.height) {
      overlay.width = frame.width;
      overlay.height = frame.height;
    }
    const ctx = overlay.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const point = this.cursorViewportPoint;
    if (!point) {
      return; // pointer left the canvas — leave the overlay cleared
    }
    const ring = this.resolveCssColor('--mj-brand-primary', '#264FAF');
    ctx.beginPath();
    ctx.arc(point.x, point.y, SYNTHETIC_CURSOR_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
  }

  /** Clears the synthetic-cursor overlay (e.g. on detach). No-op when the overlay isn't mounted. */
  private clearSyntheticCursor(): void {
    const overlay = this.cursorCanvas?.nativeElement;
    const ctx = overlay?.getContext('2d');
    if (overlay && ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  /**
   * Resolves a CSS custom property (design token) to its computed color value off the host element, so the
   * canvas-drawn cursor honors theming. Falls back to the supplied default when the token is unset or the
   * host isn't measurable.
   *
   * @param token The CSS custom property name (e.g. `'--mj-brand-primary'`).
   * @param fallback The color to use when the token resolves empty.
   * @returns The resolved color string.
   */
  private resolveCssColor(token: string, fallback: string): string {
    const host = this.frameCanvas?.nativeElement;
    if (!host) {
      return fallback;
    }
    const value = getComputedStyle(host).getPropertyValue(token).trim();
    return value.length > 0 ? value : fallback;
  }

  /** Maps a DOM `MouseEvent.button` (0/1/2) to the relayed button union, defaulting to `'left'`. */
  private mapButton(button: number): 'left' | 'middle' | 'right' {
    if (button === 1) {
      return 'middle';
    }
    if (button === 2) {
      return 'right';
    }
    return 'left';
  }
}
