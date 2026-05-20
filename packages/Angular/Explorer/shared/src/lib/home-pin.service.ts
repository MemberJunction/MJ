import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { toJpeg } from 'html-to-image';
import { HomeAppPinnedItem, HomeAppPinInput, HomeAppPinUpdate } from './home-pin.types';

/** UserSettings key for persisting pins */
const PINS_SETTING_KEY = 'HomeApp.PinnedItems';

/**
 * Service for managing pinned items on the Home dashboard.
 *
 * All pin state is stored as a JSON blob in UserSettings via UserInfoEngine.
 * Uses debounced saving to avoid excessive DB writes during edit mode operations.
 */
@Injectable({ providedIn: 'root' })
export class HomeAppPinService {
  /** Max time to wait for a thumbnail capture before giving up and pinning without a preview. */
  private static readonly THUMBNAIL_CAPTURE_TIMEOUT_MS = 4000;

  /**
   * Max DOM node count we'll attempt to rasterize. Above this, html-to-image's synchronous
   * clone/inline step blocks the main thread long enough to freeze the UI, so we skip the
   * (decorative) preview instead. Tuned to comfortably allow typical dashboards/forms while
   * excluding heavy grid/map views like the Data Explorer.
   */
  private static readonly THUMBNAIL_MAX_NODES = 3000;

  /** Observable of current pins (for reactive UI) */
  public readonly Pins$ = new BehaviorSubject<HomeAppPinnedItem[]>([]);

  private loaded = false;

  // =============================================
  // LOADING
  // =============================================

  /**
   * Load pins from UserSettings. Safe to call multiple times (loads only once).
   */
  async LoadPins(): Promise<void> {
    if (this.loaded) return;

    const raw = UserInfoEngine.Instance.GetSetting(PINS_SETTING_KEY);
    if (raw) {
      try {
        const pins = JSON.parse(raw) as HomeAppPinnedItem[];
        this.Pins$.next(this.sortPins(pins));
      } catch (err) {
        console.warn('HomeAppPinService: Failed to parse saved pins, starting fresh', err);
        this.Pins$.next([]);
      }
    }
    this.loaded = true;
  }

  /**
   * Force reload from UserSettings (e.g. after external changes)
   */
  async ReloadPins(): Promise<void> {
    this.loaded = false;
    await this.LoadPins();
  }

  // =============================================
  // CRUD OPERATIONS
  // =============================================

  /**
   * Add a new pin. Returns false if a duplicate already exists.
   */
  AddPin(input: HomeAppPinInput): boolean {
    if (this.IsPinned(input.ResourceType, input.Configuration)) {
      return false;
    }

    const pins = [...this.Pins$.value];
    const newPin: HomeAppPinnedItem = {
      ...input,
      Id: this.generateId(),
      Sequence: pins.length,
      PinnedAt: new Date().toISOString()
    };

    pins.push(newPin);
    this.updateAndSave(pins);
    return true;
  }

  /**
   * Remove a pin by ID
   */
  RemovePin(pinId: string): void {
    const pins = this.Pins$.value.filter(p => p.Id !== pinId);
    this.resequence(pins);
    this.updateAndSave(pins);
  }

  /**
   * Update pin properties (name, description, icon, group, thumbnail)
   */
  UpdatePin(pinId: string, updates: HomeAppPinUpdate): void {
    const pins = this.Pins$.value.map(p => {
      if (p.Id !== pinId) return p;
      return { ...p, ...updates };
    });
    this.updateAndSave(pins);
  }

  /**
   * Reorder pins. Accepts full reordered array with updated Sequence values.
   */
  ReorderPins(pins: HomeAppPinnedItem[]): void {
    this.resequence(pins);
    this.updateAndSave(pins);
  }

  // =============================================
  // DUPLICATE DETECTION
  // =============================================

  /**
   * Check if a resource is already pinned
   */
  IsPinned(resourceType: string, config: Record<string, unknown>): boolean {
    return this.Pins$.value.some(pin => this.matchesResource(pin, resourceType, config));
  }

  /**
   * Find the pin for a given resource, if it exists
   */
  FindPin(resourceType: string, config: Record<string, unknown>): HomeAppPinnedItem | undefined {
    return this.Pins$.value.find(pin => this.matchesResource(pin, resourceType, config));
  }

  // =============================================
  // HELPERS
  // =============================================

  /**
   * Get ungrouped pins (Group is null/undefined/empty)
   */
  GetUngroupedPins(): HomeAppPinnedItem[] {
    return this.Pins$.value.filter(p => !p.Group);
  }

  /**
   * Get unique group names in display order (ordered by lowest Sequence in group)
   */
  GetGroups(): string[] {
    const groupMinSeq = new Map<string, number>();
    for (const pin of this.Pins$.value) {
      if (!pin.Group) continue;
      const current = groupMinSeq.get(pin.Group);
      if (current === undefined || pin.Sequence < current) {
        groupMinSeq.set(pin.Group, pin.Sequence);
      }
    }
    return [...groupMinSeq.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }

  /**
   * Get pins in a specific group
   */
  GetPinsInGroup(groupName: string): HomeAppPinnedItem[] {
    return this.Pins$.value
      .filter(p => p.Group === groupName)
      .sort((a, b) => a.Sequence - b.Sequence);
  }

  // =============================================
  // THUMBNAIL CAPTURE
  // =============================================

  /**
   * Capture a thumbnail of a DOM element using html-to-image.
   * Uses SVG foreignObject so the browser's own CSS engine handles
   * modern features like color-mix() that html2canvas can't parse.
   * Returns a base64 JPEG data URL (~5-15KB) or undefined on failure.
   */
  async CaptureThumbnail(element: HTMLElement): Promise<string | undefined> {
    try {
      if (element.clientWidth === 0 || element.clientHeight === 0) {
        return undefined;
      }
      // Bail on very large DOM trees. html-to-image clones and inlines the ENTIRE subtree
      // SYNCHRONOUSLY before it ever yields, so a heavy view (e.g. the Data Explorer's grid
      // + map) blocks the main thread for seconds — long enough to freeze the UI, and the
      // timeout below (setTimeout-based) can't even fire while the thread is blocked. A
      // thumbnail is best-effort decoration, so skip rather than jank the app.
      const nodeCount = element.getElementsByTagName('*').length;
      if (nodeCount > HomeAppPinService.THUMBNAIL_MAX_NODES) {
        return undefined;
      }
      // Race against a timeout as a secondary guard for the async portion: toJpeg() can also
      // hang on content with cross-origin resources it must re-fetch (e.g. Leaflet map tiles),
      // where the inlining/canvas step never resolves. Don't cacheBust — re-fetching every
      // image is what tends to stall, and a slightly cached preview is fine.
      const capture = toJpeg(element, {
        quality: 0.6,
        pixelRatio: 0.2,
      });
      return await this.withTimeout(capture, HomeAppPinService.THUMBNAIL_CAPTURE_TIMEOUT_MS);
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve to `undefined` if the given promise hasn't settled within `ms`.
   * Note: this does not cancel the underlying work (toJpeg is not cancelable),
   * it just stops the pin flow from waiting on it.
   */
  private withTimeout(promise: Promise<string>, ms: number): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(undefined);
        }
      }, ms);
      promise.then(
        (value) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }
        },
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(undefined);
          }
        }
      );
    });
  }

  // =============================================
  // PRIVATE
  // =============================================

  private matchesResource(pin: HomeAppPinnedItem, resourceType: string, config: Record<string, unknown>): boolean {
    if (pin.ResourceType !== resourceType) return false;
    switch (resourceType) {
      case 'Dashboards':
        return pin.Configuration['dashboardId'] === config['dashboardId'];
      case 'User Views':
        return pin.Configuration['viewId'] === config['viewId'];
      case 'Queries':
        return pin.Configuration['queryId'] === config['queryId'];
      case 'Reports':
        return pin.Configuration['reportId'] === config['reportId'];
      case 'Records':
        return pin.Configuration['Entity'] === config['Entity']
            && pin.Configuration['recordId'] === config['recordId'];
      case 'Custom': {
        // Match by app name + nav item name + route — never use appId or driverClass
        // Include route to differentiate same nav item with different URL paths
        const sameApp = pin.Configuration['appName'] === config['appName'];
        const sameNav = pin.Configuration['navItemName'] === config['navItemName'];
        const pinRoute = pin.Configuration['route'] as string || '';
        const configRoute = config['route'] as string || '';
        const sameRoute = pinRoute === configRoute;
        // Also compare queryParams if present
        const pinQP = JSON.stringify(pin.Configuration['queryParams'] || {});
        const configQP = JSON.stringify(config['queryParams'] || {});
        const sameQP = pinQP === configQP;
        return sameApp && sameNav && sameRoute && sameQP;
      }
      case 'Actions': {
        // A pinned Action is unique per (actionId + preset-params + runtime-params + title).
        // Two pins targeting the same action with different preset configs are allowed —
        // e.g. "Weekly Report — Sales" vs. "Weekly Report — Ops" both pin "Run Report".
        if (pin.Configuration['actionId'] !== config['actionId']) return false;
        const pinPreset = JSON.stringify(pin.Configuration['presetParams'] ?? {});
        const configPreset = JSON.stringify(config['presetParams'] ?? {});
        const pinRuntime = JSON.stringify(pin.Configuration['runtimeParamNames'] ?? []);
        const configRuntime = JSON.stringify(config['runtimeParamNames'] ?? []);
        const samePreset = pinPreset === configPreset;
        const sameRuntime = pinRuntime === configRuntime;
        const sameTitle = pin.DisplayName === (config['displayName'] ?? pin.DisplayName);
        return samePreset && sameRuntime && sameTitle;
      }
      default:
        return false;
    }
  }

  private updateAndSave(pins: HomeAppPinnedItem[]): void {
    const sorted = this.sortPins(pins);
    this.Pins$.next(sorted);
    UserInfoEngine.Instance.SetSettingDebounced(
      PINS_SETTING_KEY,
      JSON.stringify(sorted)
    );
  }

  private sortPins(pins: HomeAppPinnedItem[]): HomeAppPinnedItem[] {
    return [...pins].sort((a, b) => a.Sequence - b.Sequence);
  }

  private resequence(pins: HomeAppPinnedItem[]): void {
    pins.forEach((pin, i) => { pin.Sequence = i; });
  }

  private generateId(): string {
    // Crypto.randomUUID is available in modern browsers
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
