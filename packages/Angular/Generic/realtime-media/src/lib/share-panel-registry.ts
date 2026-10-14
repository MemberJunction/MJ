import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, distinctUntilChanged, map, type Observable } from 'rxjs';
import { GetDisplayCaptureSupport } from '@memberjunction/ai-realtime-client/media';
import type { MediaSharePanel } from './components/media-controls.component';

/** A panel of the page the user can share on its own, as it was registered. */
export interface SharePanelEntry {
  /** Unique per registration, so two panels may have the same label. */
  readonly Key: string;
  /** The panel's name in the Share menu and in the share preview, such as "Whiteboard". */
  readonly Label: string;
  /** Font Awesome classes for its menu item, or `null`. */
  readonly Icon: string | null;
  /** The element a share of the panel shows. */
  readonly Element: Element;
}

/** One panel's registration, held by whoever registered it. */
export interface SharePanelRegistration {
  /** The panel's key in the registry. */
  readonly Key: string;
  /** Renames the panel or changes its icon. */
  Update(label: string, icon: string | null): void;
  /** Takes the panel off the registry, which reports it on {@link SharePanelRegistry.Removed$}. Calling it again does nothing. */
  Unregister(): void;
}

/** A registered panel, and whether it is on screen. */
interface PanelRecord {
  Entry: SharePanelEntry;
  OnScreen: boolean;
}

/**
 * The panels of the page the user can share on their own, and which of them a Share menu offers. Panels register
 * themselves, mostly through the `[mjSharePanel]` directive; a call's Share menu lists the ones on screen under
 * "This panel" ({@link PanelsFor$}) and looks the picked one up by its key ({@link Get}).
 *
 * One instance for the app (`providedIn: 'root'`), so a panel marked in the app's shell and a Share menu inside a call
 * meet here without knowing each other.
 *
 * **On screen** means the panel's box overlaps the viewport with a non-zero area, as an `IntersectionObserver` reports
 * it: a panel scrolled away, collapsed or hidden (`display: none`) is not listed. What lies over a panel does not count.
 * Without `IntersectionObserver`, every registered panel counts as on screen.
 *
 * Changes reach {@link PanelsFor$} and {@link Removed$} in a microtask: a panel that registers or goes away while Angular
 * renders (a directive's `ngOnInit` or `ngOnDestroy`) changes what a menu shows in the next pass, not in the middle of
 * the one under way.
 */
@Injectable({ providedIn: 'root' })
export class SharePanelRegistry implements OnDestroy {
  /**
   * Whether this browser can share a single panel: it has `getDisplayMedia` and Element or Region Capture (Chrome and
   * Edge on the desktop). Read once. Where it is `false`, {@link PanelsFor$} lists nothing, so no menu offers a panel.
   */
  public readonly Supported: boolean;

  private readonly records = new Map<string, PanelRecord>();
  private readonly changes = new BehaviorSubject<void>(undefined);
  private readonly removed = new Subject<string>();
  private observer: IntersectionObserver | null = null;
  private lastKey = 0;

  constructor() {
    const support = GetDisplayCaptureSupport();
    this.Supported = support.Display && (support.ElementCapture || support.RegionCapture);
  }

  /** The key of each panel as it is taken off the registry, such as when its element goes away. */
  public get Removed$(): Observable<string> {
    return this.removed.asObservable();
  }

  /**
   * Registers an element as a panel the user can share on its own.
   *
   * @param element The element a share of the panel shows.
   * @param label The panel's name in the Share menu and in the share preview. Not empty.
   * @param icon Font Awesome classes for its menu item.
   * @returns The registration, to rename the panel or take it off the registry.
   */
  public Register(element: Element, label: string, icon: string | null = null): SharePanelRegistration {
    const key = `share-panel-${++this.lastKey}`;
    const watched = this.watch(element);
    this.records.set(key, { Entry: { Key: key, Label: label, Icon: icon, Element: element }, OnScreen: !watched });
    this.publish();
    return {
      Key: key,
      Update: (newLabel, newIcon) => this.update(key, newLabel, newIcon),
      Unregister: () => this.unregister(key),
    };
  }

  /** The panel registered under `key`, or `null` when there is none (anymore). */
  public Get(key: string): SharePanelEntry | null {
    return this.records.get(key)?.Entry ?? null;
  }

  /**
   * The panels a Share menu inside `host` offers, now and on every change: those on screen, in page order, leaving out
   * any panel that contains `host` (sharing it would show the call its own controls). Empty where the browser cannot
   * share a single panel ({@link Supported}).
   *
   * @param host The element the Share menu belongs to, such as the call's own element.
   */
  public PanelsFor$(host: Element): Observable<readonly MediaSharePanel[]> {
    return this.changes.pipe(
      map(() => this.panelsFor(host)),
      distinctUntilChanged(samePanels)
    );
  }

  public ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.changes.complete();
    this.removed.complete();
  }

  private panelsFor(host: Element): readonly MediaSharePanel[] {
    if (!this.Supported) {
      return [];
    }
    return [...this.records.values()]
      .filter((record) => record.OnScreen && !record.Entry.Element.contains(host))
      .map((record) => record.Entry)
      .sort(inPageOrder)
      .map(toMenuPanel);
  }

  /**
   * Watches whether the element is on screen.
   *
   * @returns `true` when it is watched (it counts as on screen once the observer says so), `false` when it cannot be.
   */
  private watch(element: Element): boolean {
    if (!this.Supported || typeof IntersectionObserver !== 'function') {
      return false;
    }
    this.observer ??= new IntersectionObserver((entries) => this.onIntersections(entries));
    this.observer.observe(element);
    return true;
  }

  /**
   * Records which watched panels are on screen now, and publishes a change. A panel that only touches the viewport's
   * edge, or has no box (`display: none`), overlaps it with no area.
   */
  private onIntersections(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const onScreen = entry.intersectionRect.width * entry.intersectionRect.height > 0;
      for (const record of this.records.values()) {
        if (record.Entry.Element === entry.target) {
          record.OnScreen = onScreen;
        }
      }
    }
    this.publish();
  }

  private update(key: string, label: string, icon: string | null): void {
    const record = this.records.get(key);
    if (!record) {
      return;
    }
    record.Entry = { ...record.Entry, Label: label, Icon: icon };
    this.publish();
  }

  private unregister(key: string): void {
    const record = this.records.get(key);
    if (!record) {
      return;
    }
    this.records.delete(key);
    const element = record.Entry.Element;
    if (![...this.records.values()].some((other) => other.Entry.Element === element)) {
      this.observer?.unobserve(element);
    }
    this.publish();
    queueMicrotask(() => this.removed.next(key));
  }

  /** Publishes the panels once the work under way is done; {@link PanelsFor$} passes on only a list that changed. */
  private publish(): void {
    queueMicrotask(() => this.changes.next());
  }
}

/** Orders panels as they appear in the page: an earlier element, or one that contains the other, first. */
function inPageOrder(a: SharePanelEntry, b: SharePanelEntry): number {
  if (a.Element === b.Element) {
    return 0;
  }
  return a.Element.compareDocumentPosition(b.Element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** A panel as the Share menu lists it. */
function toMenuPanel(entry: SharePanelEntry): MediaSharePanel {
  return entry.Icon ? { Key: entry.Key, Label: entry.Label, Icon: entry.Icon } : { Key: entry.Key, Label: entry.Label };
}

/** Whether two lists offer the same panels, with the same names and icons, in the same order. */
function samePanels(a: readonly MediaSharePanel[], b: readonly MediaSharePanel[]): boolean {
  return a.length === b.length && a.every((panel, i) => panel.Key === b[i].Key && panel.Label === b[i].Label && panel.Icon === b[i].Icon);
}
