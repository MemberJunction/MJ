import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit,
  ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { MediaChannelState, MediaItem } from './media-channel-state';

/** Zoom levels cycled by the image zoom control (×). */
const IMAGE_ZOOM_LEVELS = [1, 1.5, 2, 3] as const;

/**
 * LIVE MEDIA surface (`mj-realtime-media-surface`) — the Media channel tab's pane, rendered with a
 * TABS layout: a horizontal tab bar (one tab per {@link MediaItem}, type icon + name) over a single
 * media pane that swaps as you switch tabs. The active pane renders by type (image / video / audio /
 * pdf / web), with a fractional {@link MediaItem.Highlight} drawn as an absolutely-positioned overlay
 * rectangle. Pure PERCEPTION of the channel's {@link MediaChannelState}: the agent's `Media_*` tools
 * mutate the state through the channel plugin and this surface re-renders.
 *
 * Mirrors the surface contract of the whiteboard / remote-browser panes: inputs are set by the
 * channel's `BindSurface` before first change detection, and the component subscribes the state's
 * `Changed$` to drive OnPush updates.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-media-surface',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-media-surface.component.html',
  styleUrls: ['./realtime-media-surface.component.scss'],
})
export class RealtimeMediaSurfaceComponent implements OnInit, OnDestroy {
  /** The shared media state engine (set by the channel's BindSurface before first CD). */
  @Input()
  set State(value: MediaChannelState | null) {
    if (value === this._state) {
      return;
    }
    this._state = value;
    this.resubscribe();
  }
  get State(): MediaChannelState | null {
    return this._state;
  }
  private _state: MediaChannelState | null = null;

  /** Display name of the agent fronting the session — used in the empty-state copy. */
  @Input() AgentName = 'The agent';

  /** The current image zoom multiplier (cycled by the zoom button; image panes only). */
  public ImageZoom = 1;

  /** Sanitized URL cache for `web` / `pdf` iframes (Angular blocks raw resource URLs in `[src]`). */
  private safeUrlCache = new Map<string, SafeResourceUrl>();

  /** The id of the item whose play we last actioned, so a re-render doesn't replay it. */
  private lastPlayedStamp = new Map<string, number>();

  @ViewChild('mediaPane') private mediaPane?: ElementRef<HTMLElement>;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  private stateSub: Subscription | null = null;

  ngOnInit(): void {
    this.resubscribe();
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.stateSub = null;
  }

  /** The items currently on the surface (empty when no state is bound). */
  public get Items(): MediaItem[] {
    return this._state?.Items ?? [];
  }

  /** The active item, or `null` when the surface is empty. */
  public get ActiveItem(): MediaItem | null {
    return this._state?.ActiveItem ?? null;
  }

  /** Whether the active id matches `item` (drives the active tab + pane). */
  public IsActive(item: MediaItem): boolean {
    return this._state?.ActiveItemId === item.Id;
  }

  /** Switches the active tab to `item`. */
  public SelectTab(item: MediaItem): void {
    this._state?.SetActive(item.Id);
  }

  /** Keyboard handler for the tab buttons — Enter/Space activate, arrows move between tabs. */
  public OnTabKeydown(event: KeyboardEvent, index: number): void {
    const items = this.Items;
    if (items.length === 0) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = (index + delta + items.length) % items.length;
      this._state?.SetActive(items[next].Id);
      this.focusTabButton(next);
    }
  }

  /** Closes one media item (removes its tab + pane). */
  public CloseItem(event: Event, item: MediaItem): void {
    event.stopPropagation();
    this._state?.RemoveItem(item.Id);
  }

  /** Opens the active media in a new browser tab. */
  public OpenInNew(item: MediaItem): void {
    window.open(item.Url, '_blank', 'noopener,noreferrer');
  }

  /** Triggers a browser download of the active media via a transient anchor. */
  public Download(item: MediaItem): void {
    const anchor = document.createElement('a');
    anchor.href = item.Url;
    anchor.download = item.DisplayName || '';
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }

  /** Cycles the image zoom multiplier through {@link IMAGE_ZOOM_LEVELS}. */
  public CycleZoom(): void {
    const idx = IMAGE_ZOOM_LEVELS.indexOf(this.ImageZoom as (typeof IMAGE_ZOOM_LEVELS)[number]);
    this.ImageZoom = IMAGE_ZOOM_LEVELS[(idx + 1) % IMAGE_ZOOM_LEVELS.length];
  }

  /** The Font Awesome icon class for a media type's tab. */
  public IconFor(type: MediaItem['Type']): string {
    switch (type) {
      case 'image':
        return 'fa-solid fa-image';
      case 'video':
        return 'fa-solid fa-film';
      case 'audio':
        return 'fa-solid fa-music';
      case 'pdf':
        return 'fa-solid fa-file-pdf';
      case 'web':
        return 'fa-solid fa-globe';
      default:
        return 'fa-solid fa-file';
    }
  }

  /** A memoized sanitized resource URL for iframe-rendered media (web / pdf). */
  public SafeUrl(url: string): SafeResourceUrl {
    let cached = this.safeUrlCache.get(url);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.safeUrlCache.set(url, cached);
    }
    return cached;
  }

  /** Inline style for the fractional highlight rectangle (percentages of the pane box). */
  public HighlightStyle(item: MediaItem): Record<string, string> | null {
    const h = item.Highlight;
    if (!h) {
      return null;
    }
    const pct = (v: number): string => `${Math.max(0, Math.min(1, v)) * 100}%`;
    return { left: pct(h.X), top: pct(h.Y), width: pct(h.W), height: pct(h.H) };
  }

  /** Stable `@for` track for tab/pane diffing. */
  public TrackById(_index: number, item: MediaItem): string {
    return item.Id;
  }

  /** Re-subscribes the state's Changed$ stream (called on state input change + ngOnInit). */
  private resubscribe(): void {
    this.stateSub?.unsubscribe();
    this.stateSub = null;
    if (!this._state) {
      this.cdr.markForCheck();
      return;
    }
    this.stateSub = this._state.Changed$.subscribe(() => {
      this.applyPendingPlay();
      this.cdr.markForCheck();
    });
  }

  /**
   * Honors a pending {@link MediaItem.PlayRequestedAt} stamp on the active video/audio element by
   * calling `.play()` once per new stamp (so a routine re-render never replays the media).
   */
  private applyPendingPlay(): void {
    const item = this.ActiveItem;
    if (!item || item.PlayRequestedAt == null || (item.Type !== 'video' && item.Type !== 'audio')) {
      return;
    }
    if (this.lastPlayedStamp.get(item.Id) === item.PlayRequestedAt) {
      return;
    }
    this.lastPlayedStamp.set(item.Id, item.PlayRequestedAt);
    // The pane re-renders this CD pass; defer the play to the next microtask so the element exists.
    queueMicrotask(() => {
      const el = this.mediaPane?.nativeElement.querySelector('video, audio') as HTMLMediaElement | null;
      void el?.play().catch(() => undefined);
    });
  }

  /** Moves keyboard focus to the tab button at `index` (arrow-key navigation). */
  private focusTabButton(index: number): void {
    queueMicrotask(() => {
      const host = this.mediaPane?.nativeElement.parentElement;
      const buttons = host?.querySelectorAll<HTMLButtonElement>('.media-tab');
      buttons?.[index]?.focus();
    });
  }
}
