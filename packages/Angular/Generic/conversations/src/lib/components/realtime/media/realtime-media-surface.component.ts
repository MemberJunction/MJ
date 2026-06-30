import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit,
  ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJMediaPlayerComponent, MJStorageMediaPlayerComponent, MediaTrack } from '@memberjunction/ng-media-player';
import { MediaChannelState, MediaItem } from './media-channel-state';

/** Zoom levels cycled by the image zoom control (×). */
const IMAGE_ZOOM_LEVELS = [1, 1.5, 2, 3] as const;

/** Shape of the `CreateMediaAccessToken` server mutation result (one file). */
interface CreateMediaAccessTokenResult {
  Success: boolean;
  Url?: string | null;
  ErrorMessage?: string | null;
}

/**
 * The exact GraphQL mutation used to resolve a SECURE streaming URL for an `MJ: Files` id — mints a
 * short-lived signed token (after a server-side per-user permission check) and returns the
 * authenticated `/media/<fileId>?token=` URL. Image / PDF / web (iframe) panes render this URL; the
 * audio/video panes hand the file id straight to `mj-storage-media-player` (which mints its own).
 */
const CREATE_MEDIA_ACCESS_TOKEN_MUTATION = `mutation CreateMediaAccessToken($fileId: String!) {
  CreateMediaAccessToken(fileId: $fileId) {
    Success
    Url
    ErrorMessage
  }
}`;

/** The per-item resolution status for FileID-backed image/pdf/web panes (audio/video resolve in the player). */
export type FileResolveState =
  | { Status: 'loading' }
  | { Status: 'ready'; Url: string }
  | { Status: 'error'; Message: string };

/** The render route chosen for a {@link MediaItem} (pure function of its source + type). */
export type MediaRenderRoute = 'storage-player' | 'url-player' | 'iframe-or-img' | 'none';

/** Whether an item is rendered by the real media player (audio/video) vs. an img/iframe pane. */
export function IsPlayerMediaType(item: MediaItem): boolean {
  return item.Type === 'audio' || item.Type === 'video';
}

/**
 * Decides which render path an item uses based ONLY on its source + type — the single source of truth
 * the surface methods delegate to (kept pure so it's unit-testable without an Angular context):
 *  - audio/video + FileID → `'storage-player'` (`mj-storage-media-player`, secure streaming)
 *  - audio/video + Url    → `'url-player'`     (`mj-media-player`, public URL)
 *  - image/pdf/web        → `'iframe-or-img'`  (img/iframe; FileID resolves a streaming URL first)
 *  - no usable source     → `'none'`
 */
export function RouteForMediaItem(item: MediaItem): MediaRenderRoute {
  if (IsPlayerMediaType(item)) {
    if (item.FileID) {
      return 'storage-player';
    }
    return item.Url ? 'url-player' : 'none';
  }
  if (item.Url || item.FileID) {
    return 'iframe-or-img';
  }
  return 'none';
}

/**
 * LIVE MEDIA surface (`mj-realtime-media-surface`) — the Media channel tab's pane, rendered with a
 * TABS layout: a horizontal tab bar (one tab per {@link MediaItem}, type icon + name) over a single
 * media pane that swaps as you switch tabs. Pure PERCEPTION of the channel's {@link MediaChannelState}:
 * the agent's `Media_*` tools mutate the state through the channel plugin and this surface re-renders.
 *
 * SOURCE-AWARE rendering. Each item is backed by EITHER an external/public {@link MediaItem.Url} or an
 * MemberJunction {@link MediaItem.FileID} (an `MJ: Files` id, streamed securely + permission-gated):
 *  - **audio/video + FileID** → `<mj-storage-media-player [FileID] [Provider]>` (real transport/waveform,
 *    streams over HTTP Range under the session's authenticated provider).
 *  - **audio/video + Url** → `<mj-media-player [Tracks]>` (the same real player, fed the public URL).
 *  - **image/pdf/web + FileID** → a streaming URL is resolved via `CreateMediaAccessToken` (through the
 *    channel's provider) and rendered in the existing img/iframe path; graceful no-access state on failure.
 *  - **image/pdf/web + Url** → the public URL, rendered unchanged.
 *
 * Multi-provider safe: the channel plugin threads the live session's `IMetadataProvider` in via the
 * `Provider` input ({@link BaseAngularComponent}), and both the storage player and the token mutation
 * use it ({@link ProviderToUse}) rather than the global default.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-media-surface',
  imports: [CommonModule, MJMediaPlayerComponent, MJStorageMediaPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-media-surface.component.html',
  styleUrls: ['./realtime-media-surface.component.scss'],
})
export class RealtimeMediaSurfaceComponent extends BaseAngularComponent implements OnInit, OnDestroy {
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

  /**
   * Resolution status for FileID-backed image/pdf/web items, keyed by item id. Audio/video FileID items
   * resolve inside `mj-storage-media-player` and never enter this map.
   */
  private fileResolveByItem = new Map<string, FileResolveState>();

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

  // ---------------------------------------------------------------------------
  // Source routing — which render path an item uses
  // ---------------------------------------------------------------------------

  /** Whether `item` is rendered by the real media player (audio/video). */
  public IsPlayerItem(item: MediaItem): boolean {
    return IsPlayerMediaType(item);
  }

  /** Whether `item` is an audio/video item backed by an MJStorage FileID → `mj-storage-media-player`. */
  public UsesStoragePlayer(item: MediaItem): boolean {
    return RouteForMediaItem(item) === 'storage-player';
  }

  /** Whether `item` is an audio/video item backed by a public URL → `mj-media-player`. */
  public UsesUrlPlayer(item: MediaItem): boolean {
    return RouteForMediaItem(item) === 'url-player';
  }

  /** The single-track payload for the URL-backed `mj-media-player` (audio/video). */
  public TracksFor(item: MediaItem): MediaTrack[] {
    if (!item.Url) {
      return [];
    }
    return [{ Id: item.Id, Kind: item.Type === 'video' ? 'video' : 'audio', Url: item.Url }];
  }

  /**
   * The render URL for an IMG/IFRAME (image/pdf/web) item: its public {@link MediaItem.Url}, or — for a
   * FileID-backed item — the resolved streaming URL once minted (`null` while loading / on no-access).
   */
  public RenderUrl(item: MediaItem): string | null {
    if (item.Url) {
      return item.Url;
    }
    if (item.FileID) {
      const state = this.fileResolveByItem.get(item.Id);
      return state?.Status === 'ready' ? state.Url : null;
    }
    return null;
  }

  /** Whether a FileID-backed image/pdf/web item is still resolving its streaming URL. */
  public IsResolving(item: MediaItem): boolean {
    return !item.Url && !!item.FileID && this.fileResolveByItem.get(item.Id)?.Status === 'loading';
  }

  /** The no-access / load-failure message for a FileID-backed image/pdf/web item, or `null`. */
  public ResolveError(item: MediaItem): string | null {
    if (item.Url || !item.FileID) {
      return null;
    }
    const state = this.fileResolveByItem.get(item.Id);
    return state?.Status === 'error' ? state.Message : null;
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
    this.fileResolveByItem.delete(item.Id);
    this._state?.RemoveItem(item.Id);
  }

  /** Whether the open-in-tab / download toolbar buttons are available for `item` (need a usable URL). */
  public CanOpenOrDownload(item: MediaItem): boolean {
    return !!this.RenderUrl(item);
  }

  /** Opens the active media in a new browser tab (its public or resolved streaming URL). */
  public OpenInNew(item: MediaItem): void {
    const url = this.RenderUrl(item);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /** Triggers a browser download of the active media via a transient anchor (public or resolved URL). */
  public Download(item: MediaItem): void {
    const url = this.RenderUrl(item);
    if (!url) {
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
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
      this.resolvePendingFileUrls();
      this.applyPendingPlay();
      this.cdr.markForCheck();
    });
  }

  /**
   * Mints streaming URLs for any FileID-backed image/pdf/web items not yet resolved (audio/video FileID
   * items resolve inside the storage player, so they're skipped). Idempotent — each item is resolved
   * once; a `loading`/`ready`/`error` entry guards against re-firing on every state change.
   */
  private resolvePendingFileUrls(): void {
    for (const item of this.Items) {
      if (item.Url || !item.FileID || this.IsPlayerItem(item)) {
        continue;
      }
      if (this.fileResolveByItem.has(item.Id)) {
        continue;
      }
      this.fileResolveByItem.set(item.Id, { Status: 'loading' });
      void this.resolveFileUrl(item.Id, item.FileID);
    }
  }

  /** Resolves one file id to a secure streaming URL via the channel's provider, then re-renders. */
  private async resolveFileUrl(itemId: string, fileId: string): Promise<void> {
    const result = await this.mintAccessToken(fileId);
    if (result && result.Success && result.Url) {
      this.fileResolveByItem.set(itemId, { Status: 'ready', Url: result.Url });
    } else {
      this.fileResolveByItem.set(itemId, {
        Status: 'error',
        Message: result?.ErrorMessage || "This media couldn't be loaded, or you don't have access to it.",
      });
    }
    this.cdr.markForCheck();
  }

  /** Mints an authenticated streaming-URL token for one file id via the active provider. */
  private async mintAccessToken(fileId: string): Promise<CreateMediaAccessTokenResult | null> {
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const data = await provider.ExecuteGQL(CREATE_MEDIA_ACCESS_TOKEN_MUTATION, { fileId });
      const payload = data?.CreateMediaAccessToken as CreateMediaAccessTokenResult | undefined;
      return payload ?? null;
    } catch (err) {
      LogError(`CreateMediaAccessToken failed for file '${fileId}': ${err instanceof Error ? err.message : String(err)}`);
      return { Success: false, ErrorMessage: 'Unable to load this media.' };
    }
  }

  /**
   * Honors a pending {@link MediaItem.PlayRequestedAt} stamp on the active video/audio element by
   * calling `.play()` once per new stamp (so a routine re-render never replays the media). Only applies
   * to the URL-backed `<mj-media-player>` / raw-element panes; the storage player owns its own autoplay.
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
