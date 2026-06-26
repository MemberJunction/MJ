import { BehaviorSubject } from 'rxjs';

/** The media kinds the Media surface can render — one render path per value. */
export type MediaItemType = 'image' | 'video' | 'audio' | 'pdf' | 'web';

/**
 * A fractional highlight rectangle drawn over a media item, in the item's OWN coordinate space
 * (0..1 on both axes). `X`,`Y` is the top-left corner; `W`,`H` are the width/height. Fractional
 * coordinates keep the highlight correct regardless of how the media is scaled to fit the pane.
 */
export interface MediaHighlight {
  /** Left edge as a fraction of width (0..1). */
  X: number;
  /** Top edge as a fraction of height (0..1). */
  Y: number;
  /** Width as a fraction of width (0..1). */
  W: number;
  /** Height as a fraction of height (0..1). */
  H: number;
  /** Optional short label rendered on the highlight. */
  Label?: string;
}

/** One piece of media on the surface — a tab + a render pane keyed by {@link MediaItemType}. */
export interface MediaItem {
  /** Stable id (returned to the agent by `Media_ShowMedia`, used by close/play/highlight). */
  Id: string;
  /** Which render path the pane uses. */
  Type: MediaItemType;
  /**
   * Absolute URL of the media — for an EXTERNAL/public asset. Optional/empty when {@link FileID}
   * is set (the surface resolves a secure streaming URL from the file id instead). At least one of
   * `Url` / `FileID` is always present.
   */
  Url?: string;
  /**
   * Id of an "MJ: Files" record this item is backed by. When set, the item is streamed securely
   * (permission-gated) from MJStorage rather than from a public {@link Url}; the surface resolves a
   * short-lived streaming URL (via `CreateMediaAccessToken`) or hands the id straight to
   * `mj-storage-media-player` for audio/video.
   */
  FileID?: string;
  /** Short tab label. */
  DisplayName: string;
  /** Optional one-line caption beneath the media. */
  Caption?: string;
  /** Optional fractional highlight overlay. */
  Highlight?: MediaHighlight;
  /** Set transiently to request playback of a video/audio item (consumed by the surface). */
  PlayRequestedAt?: number;
}

/** The serialized shape persisted as the channel's state of record (versioned for forward-compat). */
interface SerializedMediaState {
  V: 1;
  Items: MediaItem[];
  ActiveItemId: string | null;
}

/** Monotonic counter feeding {@link MediaChannelState.newId} so ids stay unique within a session. */
let mediaIdCounter = 0;

/**
 * The Media channel's STATE ENGINE — a pure, framework-free model of what's on the shared Media
 * surface: an ordered list of {@link MediaItem}s plus which one is active. Mutations push the new
 * state through {@link Changed$} so the channel persists it and the surface re-renders. Mirrors
 * `WhiteboardState` (no Angular, tolerant (de)serialization, single `Changed$` notifier).
 */
export class MediaChannelState {
  /** The media currently on the surface, in tab order (oldest first). */
  public Items: MediaItem[] = [];

  /** The id of the active (visible) item, or `null` when the surface is empty. */
  public ActiveItemId: string | null = null;

  /**
   * Fires on every mutation. Replays the current state on subscribe (BehaviorSubject), so a late
   * surface binding immediately renders what's already on the board.
   */
  public readonly Changed$ = new BehaviorSubject<MediaChannelState>(this);

  /** Adds a media item, makes it active, and returns it. */
  public AddItem(item: Omit<MediaItem, 'Id'> & { Id?: string }): MediaItem {
    const created: MediaItem = { ...item, Id: item.Id ?? this.newId() };
    this.Items = [...this.Items, created];
    this.ActiveItemId = created.Id;
    this.notify();
    return created;
  }

  /** Removes the item with `id` (no-op if absent). When it was active, the last remaining item becomes active. */
  public RemoveItem(id: string): boolean {
    const next = this.Items.filter((i) => i.Id !== id);
    if (next.length === this.Items.length) {
      return false;
    }
    this.Items = next;
    if (this.ActiveItemId === id) {
      this.ActiveItemId = next.length > 0 ? next[next.length - 1].Id : null;
    }
    this.notify();
    return true;
  }

  /** Makes `id` the active item (no-op if absent). */
  public SetActive(id: string): boolean {
    if (!this.Items.some((i) => i.Id === id) || this.ActiveItemId === id) {
      return this.ActiveItemId === id;
    }
    this.ActiveItemId = id;
    this.notify();
    return true;
  }

  /**
   * Activates `id` and stamps a play request on it (the surface consumes the stamp to start
   * video/audio playback). No-op if the item is absent.
   */
  public RequestPlay(id: string): boolean {
    const item = this.Items.find((i) => i.Id === id);
    if (!item) {
      return false;
    }
    this.ActiveItemId = id;
    this.Items = this.Items.map((i) => (i.Id === id ? { ...i, PlayRequestedAt: Date.now() } : i));
    this.notify();
    return true;
  }

  /** Sets (or, with `null`, clears) the fractional highlight on `id`. No-op if the item is absent. */
  public Highlight(id: string, highlight: MediaHighlight | null): boolean {
    const item = this.Items.find((i) => i.Id === id);
    if (!item) {
      return false;
    }
    this.Items = this.Items.map((i) => (i.Id === id ? { ...i, Highlight: highlight ?? undefined } : i));
    this.notify();
    return true;
  }

  /** Removes all media and resets the active item. */
  public Clear(): void {
    if (this.Items.length === 0 && this.ActiveItemId === null) {
      return;
    }
    this.Items = [];
    this.ActiveItemId = null;
    this.notify();
  }

  /** The active item, or `null` when the surface is empty / the active id is stale. */
  public get ActiveItem(): MediaItem | null {
    return this.Items.find((i) => i.Id === this.ActiveItemId) ?? null;
  }

  /** Serializes the state of record to a JSON string (persisted via the channel's RequestSave). */
  public ToJSON(): string {
    const payload: SerializedMediaState = { V: 1, Items: this.Items, ActiveItemId: this.ActiveItemId };
    return JSON.stringify(payload);
  }

  /**
   * Rehydrates a prior session's saved state IN PLACE (preserving this instance + its `Changed$`
   * subscribers). Tolerant by contract: malformed / incompatible JSON is ignored and the method
   * returns `false` without throwing, leaving the current state untouched.
   */
  public LoadFromJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as Partial<SerializedMediaState> | null;
      if (!parsed || !Array.isArray(parsed.Items)) {
        return false;
      }
      const items = parsed.Items.filter((i): i is MediaItem => this.isValidItem(i));
      this.Items = items;
      const active = typeof parsed.ActiveItemId === 'string' ? parsed.ActiveItemId : null;
      this.ActiveItemId = active && items.some((i) => i.Id === active) ? active : items.length > 0 ? items[items.length - 1].Id : null;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates one parsed item enough to render it safely (defensive against hand-edited / old
   * payloads). An item must carry a SOURCE — a non-empty `Url` OR a non-empty `FileID` — since one
   * of the two backs every render path.
   */
  private isValidItem(value: unknown): value is MediaItem {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const item = value as Record<string, unknown>;
    const validTypes: MediaItemType[] = ['image', 'video', 'audio', 'pdf', 'web'];
    const hasUrl = typeof item['Url'] === 'string' && (item['Url'] as string).length > 0;
    const hasFileID = typeof item['FileID'] === 'string' && (item['FileID'] as string).length > 0;
    return (
      typeof item['Id'] === 'string' &&
      (hasUrl || hasFileID) &&
      typeof item['DisplayName'] === 'string' &&
      typeof item['Type'] === 'string' &&
      validTypes.includes(item['Type'] as MediaItemType)
    );
  }

  /** Mints a unique-within-session item id. */
  private newId(): string {
    mediaIdCounter += 1;
    return `media-${Date.now().toString(36)}-${mediaIdCounter}`;
  }

  /** Pushes the current state to subscribers. */
  private notify(): void {
    this.Changed$.next(this);
  }
}
