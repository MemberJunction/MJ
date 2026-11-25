/**
 * @fileoverview Event-driven DOM anchor registry (`AnchorRegistry`) extending `BaseSingleton`.
 * Tracks elements registered via `[mjTourAnchor]`, `RegisterAnchor()`, or `data-mj-tour-anchor`
 * attributes observed via `MutationObserver` (zero polling).
 * @module @memberjunction/ng-tours
 */

import { BaseSingleton } from '@memberjunction/global';
import type { TourVisibleAnchorInfo } from '@memberjunction/tours-runtime';
import { Subject, type Observable } from 'rxjs';

export interface AnchorRegistryChangeEvent {
  Kind: 'registered' | 'unregistered';
  Key: string;
  Element: HTMLElement;
}

/**
 * Process-wide registry of tour anchor elements.
 * Uses `BaseSingleton` (`AGENTS.md` Rule #7) so duplicated chunks share one registry.
 */
export class AnchorRegistry extends BaseSingleton<AnchorRegistry> {
  private readonly _elementsByKey = new Map<string, HTMLElement[]>();
  private readonly _changesSubject = new Subject<AnchorRegistryChangeEvent>();
  private _observer: MutationObserver | null = null;
  private _observerRefs = 0;

  protected constructor() {
    super();
  }

  public static get Instance(): AnchorRegistry {
    return super.getInstance<AnchorRegistry>();
  }

  public get Changes$(): Observable<AnchorRegistryChangeEvent> {
    return this._changesSubject.asObservable();
  }

  /**
   * Registers an element for `key`. Returns an idempotent unregister callback.
   */
  public RegisterAnchor(key: string, element: HTMLElement): () => void {
    const normalized = key.trim();
    if (!normalized) {
      return () => undefined;
    }

    if (element.getAttribute('data-mj-tour-anchor') !== normalized) {
      element.setAttribute('data-mj-tour-anchor', normalized);
    }

    const list = this._elementsByKey.get(normalized) ?? [];
    if (!list.includes(element)) {
      list.push(element);
      this._elementsByKey.set(normalized, list);
      this._changesSubject.next({ Kind: 'registered', Key: normalized, Element: element });
    }

    return () => this.UnregisterAnchor(normalized, element);
  }

  /**
   * Unregisters `element` (or all elements if omitted) for `key`.
   */
  public UnregisterAnchor(key: string, element?: HTMLElement): void {
    const normalized = key.trim();
    const list = this._elementsByKey.get(normalized);
    if (!list || list.length === 0) {
      return;
    }

    if (!element) {
      this._elementsByKey.delete(normalized);
      for (const el of list) {
        this._changesSubject.next({ Kind: 'unregistered', Key: normalized, Element: el });
      }
      return;
    }

    const remaining = list.filter((el) => el !== element);
    if (remaining.length === list.length) {
      return;
    }
    if (remaining.length === 0) {
      this._elementsByKey.delete(normalized);
    } else {
      this._elementsByKey.set(normalized, remaining);
    }
    this._changesSubject.next({ Kind: 'unregistered', Key: normalized, Element: element });
  }

  /**
   * Returns the first connected, visible element registered or present in the DOM for `key`.
   */
  public GetElement(key: string): HTMLElement | null {
    const normalized = key.trim();
    if (!normalized) {
      return null;
    }

    const registered = this._elementsByKey.get(normalized);
    if (registered && registered.length > 0) {
      const connected = registered.filter((el) => el.isConnected);
      if (connected.length !== registered.length) {
        if (connected.length === 0) {
          this._elementsByKey.delete(normalized);
        } else {
          this._elementsByKey.set(normalized, connected);
        }
      }
      const visible = connected.find((el) => IsElementVisible(el));
      if (visible) {
        return visible;
      }
      if (connected[0]) {
        return connected[0];
      }
    }

    if (typeof document !== 'undefined') {
      const escaped = escapeAttributeValue(normalized);
      const fromDom = document.querySelector<HTMLElement>(`[data-mj-tour-anchor="${escaped}"]`);
      if (fromDom) {
        this.RegisterAnchor(normalized, fromDom);
        return fromDom;
      }
    }

    return null;
  }

  /**
   * Lists all currently visible registered & semantic anchors with their accessible names.
   * This is the grounded list agents are permitted to cite (`TourGetVisibleAnchors`).
   */
  public GetVisibleAnchors(): TourVisibleAnchorInfo[] {
    if (typeof document !== 'undefined') {
      this.ScanDom(document);
    }

    const results: TourVisibleAnchorInfo[] = [];
    const seenKeys = new Set<string>();

    for (const [key, elements] of this._elementsByKey.entries()) {
      const target = elements.find((el) => el.isConnected && IsElementVisible(el));
      if (!target) {
        continue;
      }
      seenKeys.add(key);
      results.push(buildVisibleAnchorInfo(key, 'Registered', target));
    }

    if (typeof document !== 'undefined') {
      const fieldEls = document.querySelectorAll<HTMLElement>('[data-field-name]');
      for (let i = 0; i < fieldEls.length; i++) {
        const el = fieldEls[i];
        const fieldName = el.getAttribute('data-field-name')?.trim();
        if (!fieldName || !IsElementVisible(el)) {
          continue;
        }
        const semanticKey = `form.field.${fieldName}`;
        if (seenKeys.has(semanticKey)) {
          continue;
        }
        seenKeys.add(semanticKey);
        results.push({
          ...buildVisibleAnchorInfo(semanticKey, 'FormField', el),
          FieldName: fieldName,
        });
      }

      const navEls = document.querySelectorAll<HTMLElement>('[data-mj-nav-key], [data-nav-item-key]');
      for (let i = 0; i < navEls.length; i++) {
        const el = navEls[i];
        const navKey = (el.getAttribute('data-mj-nav-key') ?? el.getAttribute('data-nav-item-key'))?.trim();
        if (!navKey || !IsElementVisible(el)) {
          continue;
        }
        const semanticKey = `nav.${navKey}`;
        if (seenKeys.has(semanticKey)) {
          continue;
        }
        seenKeys.add(semanticKey);
        results.push(buildVisibleAnchorInfo(semanticKey, 'NavItem', el));
      }
    }

    return results;
  }

  /**
   * Event-driven wait for an anchor key to appear and become connected (zero polling).
   * Watches both `AnchorRegistry` registrations and `MutationObserver` DOM mutations.
   */
  public WaitFor(key: string, timeoutMs = 5000): Promise<HTMLElement | null> {
    const normalized = key.trim();
    if (!normalized) {
      return Promise.resolve(null);
    }

    const immediate = this.GetElement(normalized);
    if (immediate && IsElementVisible(immediate)) {
      return Promise.resolve(immediate);
    }

    return new Promise<HTMLElement | null>((resolve) => {
      let settled = false;
      const stopObserving = this.ObserveDom();

      const finish = (el: HTMLElement | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        sub.unsubscribe();
        stopObserving();
        resolve(el);
      };

      const checkNow = (): void => {
        const candidate = this.GetElement(normalized);
        if (candidate && IsElementVisible(candidate)) {
          finish(candidate);
        }
      };

      const sub = this._changesSubject.subscribe((evt) => {
        if (evt.Kind === 'registered' && evt.Key === normalized) {
          checkNow();
        }
      });

      const timer = setTimeout(() => {
        // One final lookup before timing out in case element was hidden/shown via CSS
        const lastChance = this.GetElement(normalized);
        finish(lastChance && IsElementVisible(lastChance) ? lastChance : null);
      }, Math.max(0, timeoutMs));
    });
  }

  /**
   * Scans `root` for `[data-mj-tour-anchor]` attributes and prunes disconnected entries.
   */
  public ScanDom(root: ParentNode = document): void {
    if (typeof document === 'undefined') {
      return;
    }

    // Prune disconnected elements
    for (const [key, elements] of this._elementsByKey.entries()) {
      const connected = elements.filter((el) => el.isConnected);
      if (connected.length === 0) {
        this._elementsByKey.delete(key);
      } else if (connected.length !== elements.length) {
        this._elementsByKey.set(key, connected);
      }
    }

    const nodes = root.querySelectorAll<HTMLElement>('[data-mj-tour-anchor]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const key = el.getAttribute('data-mj-tour-anchor')?.trim();
      if (key) {
        this.RegisterAnchor(key, el);
      }
    }
  }

  /**
   * Reference-counted `MutationObserver` watching `[data-mj-tour-anchor]` additions, removals,
   * and attribute changes across `document.body`.
   */
  public ObserveDom(root: Node | null = typeof document !== 'undefined' ? document.body : null): () => void {
    if (!root || typeof MutationObserver === 'undefined') {
      return () => undefined;
    }

    this.ScanDom(root instanceof Document || root instanceof Element ? root : document);
    this._observerRefs++;

    if (!this._observer) {
      this._observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
            const key = mutation.target.getAttribute('data-mj-tour-anchor')?.trim();
            if (key) {
              this.RegisterAnchor(key, mutation.target);
            }
          } else if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                const ownKey = node.getAttribute('data-mj-tour-anchor')?.trim();
                if (ownKey) {
                  this.RegisterAnchor(ownKey, node);
                }
                this.ScanDom(node);
              }
            });
            mutation.removedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                const ownKey = node.getAttribute('data-mj-tour-anchor')?.trim();
                if (ownKey) {
                  this.UnregisterAnchor(ownKey, node);
                }
              }
            });
          }
        }
      });

      this._observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-mj-tour-anchor'],
      });
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this._observerRefs = Math.max(0, this._observerRefs - 1);
      if (this._observerRefs === 0 && this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    };
  }
}

/** Returns true when `el` is connected, not hidden, and has non-zero or measurable presence. */
export function IsElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }
  if (el.hidden || el.closest('[hidden], [aria-hidden="true"]')) {
    return false;
  }
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
  }
  return true;
}

/** Computes a best-effort WCAG accessible name for an element. */
export function ComputeAccessibleName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = el.getAttribute('aria-labelledby')?.trim();
  if (labelledBy && typeof document !== 'undefined') {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  const id = el.getAttribute('id');
  if (id && typeof document !== 'undefined') {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${escapeAttributeValue(id)}"]`);
    const labelText = label?.textContent?.trim();
    if (labelText) {
      return labelText;
    }
  }

  const alt = el.getAttribute('alt')?.trim();
  if (alt) {
    return alt;
  }

  const title = el.getAttribute('title')?.trim();
  if (title) {
    return title;
  }

  const placeholder = el.getAttribute('placeholder')?.trim();
  if (placeholder) {
    return placeholder;
  }

  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function buildVisibleAnchorInfo(key: string, strategy: string, el: HTMLElement): TourVisibleAnchorInfo {
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  return {
    AnchorKey: key,
    Strategy: strategy,
    AccessibleName: ComputeAccessibleName(el) || key,
    Role: el.getAttribute('role') ?? inferImplicitRole(el),
    IsVisible: true,
    ...(rect
      ? {
          Bounds: {
            X: Math.round(rect.left),
            Y: Math.round(rect.top),
            Width: Math.round(rect.width),
            Height: Math.round(rect.height),
          },
        }
      : {}),
  };
}

function inferImplicitRole(el: HTMLElement): string | undefined {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'dialog') return 'dialog';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'number') return 'spinbutton';
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
    return 'textbox';
  }
  return undefined;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
