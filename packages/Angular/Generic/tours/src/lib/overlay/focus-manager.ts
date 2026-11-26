/**
 * @fileoverview Focus management and keyboard handling for Guided Tour steps (`WCAG 2.2 AA`):
 * - Programmatic focus move into step dialog on open, restore previous focus on close
 * - `Esc` dismisses active tour
 * - `F6` switches focus between non-modal (`Action`, `Beacon`) popovers and the anchored target
 * - Opt-in `Tab` focus cycling within modal (`Spotlight`, `Modal`) steps
 * @module @memberjunction/ng-tours
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface TourFocusManagerCallbacks {
  OnDismiss: () => void;
  IsModal: () => boolean;
  GetDialogElement: () => HTMLElement | null;
  GetAnchorElement: () => HTMLElement | null;
}

export class TourFocusManager {
  private _previouslyFocused: HTMLElement | null = null;
  private _attached = false;
  private _callbacks: TourFocusManagerCallbacks | null = null;
  private readonly _onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  /**
   * Saves the currently focused element (if outside the tour dialog) and attaches keyboard handlers.
   */
  public Attach(callbacks: TourFocusManagerCallbacks): void {
    this._callbacks = callbacks;
    if (!this._previouslyFocused && typeof document !== 'undefined') {
      const active = document.activeElement;
      const dialog = callbacks.GetDialogElement();
      if (active instanceof HTMLElement && (!dialog || !dialog.contains(active))) {
        this._previouslyFocused = active;
      }
    }

    if (!this._attached && typeof document !== 'undefined') {
      document.addEventListener('keydown', this._onKeyDown, true);
      this._attached = true;
    }
  }

  /**
   * Moves programmatic focus into the step dialog container (never the close button, so `:focus-visible`
   * ring only appears when the user navigates via keyboard).
   */
  public FocusStepDialog(): void {
    const dialog = this._callbacks?.GetDialogElement();
    if (!dialog) {
      return;
    }
    if (!dialog.hasAttribute('tabindex')) {
      dialog.setAttribute('tabindex', '-1');
    }
    dialog.focus({ preventScroll: true });
  }

  /**
   * Detaches listeners and restores focus to the element focused prior to the tour.
   */
  public DetachAndRestore(): void {
    if (this._attached && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this._onKeyDown, true);
      this._attached = false;
    }

    const prev = this._previouslyFocused;
    this._previouslyFocused = null;
    this._callbacks = null;

    if (prev && prev.isConnected && typeof prev.focus === 'function') {
      prev.focus({ preventScroll: true });
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const callbacks = this._callbacks;
    if (!callbacks) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      callbacks.OnDismiss();
      return;
    }

    // F6 toggles focus between a non-modal popover and the anchored target element
    if (event.key === 'F6' && !callbacks.IsModal()) {
      const dialog = callbacks.GetDialogElement();
      const anchor = callbacks.GetAnchorElement();
      if (!dialog || !anchor) {
        return;
      }
      event.preventDefault();
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active instanceof HTMLElement && dialog.contains(active)) {
        const focusTarget = findFocusableInOrSelf(anchor);
        focusTarget.focus();
      } else {
        this.FocusStepDialog();
      }
      return;
    }

    // Modal focus trap for Tab / Shift+Tab
    if (event.key === 'Tab' && callbacks.IsModal()) {
      const dialog = callbacks.GetDialogElement();
      if (!dialog) {
        return;
      }
      const focusables = getFocusableElements(dialog);
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = typeof document !== 'undefined' ? document.activeElement : null;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.offsetParent !== null || el.getClientRects?.().length > 0 || el.hasAttribute('tabindex')) {
      out.push(el);
    }
  }
  return out;
}

function findFocusableInOrSelf(el: HTMLElement): HTMLElement {
  if (el.matches(FOCUSABLE_SELECTOR)) {
    return el;
  }
  const child = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (child) {
    return child;
  }
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1');
  }
  return el;
}
