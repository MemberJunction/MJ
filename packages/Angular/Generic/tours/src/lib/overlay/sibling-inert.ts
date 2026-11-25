/**
 * @fileoverview Sibling-subtree `inert` manager for modal Guided Tour steps (`Spotlight`, `Modal`).
 *
 * Sets `inert = true` ONLY on sibling subtrees outside both:
 * 1. the tour overlay subtree (`overlayRoot`),
 * 2. the polite `aria-live` announcer (`liveRegion`), and
 * 3. the spotlighted target element(s) and their ancestor chains (so the spotlighted target
 *    never becomes `inert` and remains reachable in the accessibility tree — §15).
 *
 * Restores every modified element's exact prior `inert` state on {@link Restore}.
 * @module @memberjunction/ng-tours
 */

export class SiblingInertManager {
  private readonly _previousInert = new Map<HTMLElement, boolean>();
  private _applied = false;

  /**
   * Marks all sibling subtrees outside `keepActive` roots as `inert = true`.
   * Re-running `Apply` cleanly restores previous state first so target transitions stay exact.
   */
  public Apply(keepActive: ReadonlyArray<HTMLElement | null | undefined>, rootBody?: HTMLElement | null): void {
    this.Restore();

    const body = rootBody ?? (typeof document !== 'undefined' ? document.body : null);
    if (!body) {
      return;
    }

    const activeRoots = keepActive.filter(
      (el): el is HTMLElement => Boolean(el && el.isConnected && body.contains(el)),
    );
    if (activeRoots.length === 0) {
      return;
    }

    // Build set of all ancestors from each kept element up to `body` (inclusive).
    const keepAncestors = new Set<HTMLElement>();
    for (const target of activeRoots) {
      let cursor: HTMLElement | null = target;
      while (cursor && cursor !== body) {
        keepAncestors.add(cursor);
        cursor = cursor.parentElement;
      }
    }

    // Walk down only through kept branches, marking every non-kept sibling subtree inert.
    const markSubtreeSiblings = (parent: HTMLElement): void => {
      const children = parent.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!(child instanceof HTMLElement)) {
          continue;
        }
        if (activeRoots.includes(child)) {
          // This child itself is a kept root (overlay, live region, or spotlighted target).
          // Keep it and its entire subtree active!
          continue;
        }
        if (keepAncestors.has(child)) {
          // Ancestor of a kept root: recurse into it so only its non-kept siblings become inert.
          markSubtreeSiblings(child);
          continue;
        }
        // Sibling outside every kept subtree -> set inert
        if (!this._previousInert.has(child)) {
          this._previousInert.set(child, Boolean(child.inert));
        }
        child.inert = true;
        child.setAttribute('inert', '');
      }
    };

    markSubtreeSiblings(body);
    this._applied = true;
  }

  /**
   * Restores the exact `inert` property and attribute state on every modified element.
   */
  public Restore(): void {
    if (!this._applied && this._previousInert.size === 0) {
      return;
    }
    for (const [el, wasInert] of this._previousInert.entries()) {
      el.inert = wasInert;
      if (wasInert) {
        el.setAttribute('inert', '');
      } else {
        el.removeAttribute('inert');
      }
    }
    this._previousInert.clear();
    this._applied = false;
  }
}
