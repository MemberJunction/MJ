/**
 * Lightweight Stage-1 vanilla DOM anchor observer (`MutationObserver` + `RegisterAnchor`).
 * Zero dependencies — runs on every page before Stage-2 Angular ever loads.
 */
export class ShellAnchorObserver {
  private readonly _anchors = new Map<string, HTMLElement[]>();
  private _observer: MutationObserver | null = null;

  public RegisterAnchor(key: string, element: HTMLElement): () => void {
    const normalized = key.trim();
    if (!normalized) {
      return () => undefined;
    }
    if (element.getAttribute('data-mj-tour-anchor') !== normalized) {
      element.setAttribute('data-mj-tour-anchor', normalized);
    }
    const existing = this._anchors.get(normalized) ?? [];
    if (!existing.includes(element)) {
      existing.push(element);
      this._anchors.set(normalized, existing);
    }
    return () => this.UnregisterAnchor(normalized, element);
  }

  public UnregisterAnchor(key: string, element?: HTMLElement): void {
    const normalized = key.trim();
    const list = this._anchors.get(normalized);
    if (!list) {
      return;
    }
    if (!element) {
      this._anchors.delete(normalized);
      return;
    }
    const remaining = list.filter((el) => el !== element);
    if (remaining.length === 0) {
      this._anchors.delete(normalized);
    } else {
      this._anchors.set(normalized, remaining);
    }
  }

  public GetAnchorKeys(): string[] {
    return [...this._anchors.keys()];
  }

  public GetElement(key: string): HTMLElement | null {
    const list = this._anchors.get(key.trim());
    if (!list) {
      return null;
    }
    const connected = list.filter((el) => el.isConnected);
    if (connected.length !== list.length) {
      if (connected.length === 0) {
        this._anchors.delete(key.trim());
      } else {
        this._anchors.set(key.trim(), connected);
      }
    }
    return connected[0] ?? null;
  }

  public Start(root: Node | null = typeof document !== 'undefined' ? document.body : null): void {
    if (!root || this._observer || typeof MutationObserver === 'undefined') {
      this.scan(root);
      return;
    }
    this.scan(root);
    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const key = mutation.target.getAttribute('data-mj-tour-anchor')?.trim();
          if (key) {
            this.RegisterAnchor(key, mutation.target);
          }
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              this.scan(n);
            }
          });
          mutation.removedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              const key = n.getAttribute('data-mj-tour-anchor')?.trim();
              if (key) {
                this.UnregisterAnchor(key, n);
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

  public Stop(): void {
    this._observer?.disconnect();
    this._observer = null;
    this._anchors.clear();
  }

  private scan(root: Node | null): void {
    if (!root || !(root instanceof Document || root instanceof HTMLElement)) {
      return;
    }
    if (root instanceof HTMLElement) {
      const own = root.getAttribute('data-mj-tour-anchor')?.trim();
      if (own) {
        this.RegisterAnchor(own, root);
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
}

export const SharedShellAnchorObserver = new ShellAnchorObserver();
