/**
 * @fileoverview Waiting for an element to have a size. Home builds a dashboard viewer only in an
 * element that has a size (a viewer cannot lay out its panels in a hidden element), so Home's tab
 * dashboard and each Dashboards tile wait with this before they rebuild their viewer.
 */

/** True when the element is laid out with a width and a height. A hidden or detached element has neither. */
export function ElementHasSize(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Watches one element with a ResizeObserver, and calls back each time the element reports a size, until stopped. */
export class ElementSizeWait {
  private observer: ResizeObserver | null = null;
  private observed: HTMLElement | null = null;

  /** @param onSize - runs each time the watched element reports a width and a height */
  constructor(private readonly onSize: () => void) {}

  /** True while an element is watched. */
  public get IsWatching(): boolean {
    return this.observed !== null;
  }

  /** Watches `element`. Watching the element it already watches changes nothing. */
  public Watch(element: HTMLElement): void {
    if (this.observed === element) {
      return;
    }
    this.Stop();
    const observer = new ResizeObserver(entries => {
      if (entries.some(entry => entry.contentRect.width > 0 && entry.contentRect.height > 0)) {
        this.onSize();
      }
    });
    observer.observe(element);
    this.observer = observer;
    this.observed = element;
  }

  /** Stops watching. */
  public Stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observed = null;
  }
}
