/**
 * Focus handling shared by the modal primitives (`mj-dialog`, `mj-slide-panel`): the tab stops
 * of a container, wrapping Tab at its ends, and handing focus back when the modal closes.
 *
 * Plain DOM functions with no Angular state, so each modal keeps its own open/close lifecycle and
 * calls these at the right moments.
 */

const TAB_STOP_SELECTOR =
  'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]';

/** The element that holds focus now, to hand focus back to when a modal closes. */
export function CaptureFocusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

/**
 * Real tab stops inside `container`, in document order. `tabindex="-1"` (including a container
 * that takes focus as a fallback) is not a stop, nor is anything disabled or hidden.
 */
export function GetTabStops(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR)).filter(IsTabStop);
}

/** True for a control Tab can land on. */
export function IsTabStop(el: HTMLElement): boolean {
  if (el.getAttribute('tabindex') === '-1') return false;
  if (IsDisabledElement(el)) return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  return IsVisibleStop(el);
}

/**
 * display:none, [hidden] and [inert] (a collapsed accordion body) take the whole subtree out of
 * focus. visibility is inherited, and a child can set visible again, so that check is only on the
 * element itself.
 */
export function IsVisibleStop(el: HTMLElement): boolean {
  if (getComputedStyle(el).visibility === 'hidden') return false;
  let current: HTMLElement | null = el;
  while (current) {
    if (current.hasAttribute('hidden') || current.hasAttribute('inert')) return false;
    if (getComputedStyle(current).display === 'none') return false;
    current = current.parentElement;
  }
  return true;
}

/** True when the element is disabled, natively or through a `disabled` attribute. */
export function IsDisabledElement(el: HTMLElement): boolean {
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLFieldSetElement ||
    el instanceof HTMLOptGroupElement ||
    el instanceof HTMLOptionElement
  ) {
    return el.disabled;
  }
  return el.hasAttribute('disabled');
}

/**
 * The first element of `nodes` that can take focus.
 *
 * @param nodes Candidates, in order.
 * @param skip Optional filter for candidates to pass over (for example a close button).
 */
export function FirstEnabledElement(nodes: NodeListOf<HTMLElement> | HTMLElement[], skip?: (el: HTMLElement) => boolean): HTMLElement | null {
  for (const el of Array.from(nodes)) {
    if (skip?.(el)) continue;
    if (IsDisabledElement(el)) continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    // A hidden or inert element is skipped: `.focus()` on one is a silent no-op, which would leave
    // focus outside the modal.
    if (!IsVisibleStop(el)) continue;
    return el;
  }
  return null;
}

/**
 * Tab on the last stop wraps to the first. Shift+Tab on the first stop or on the container wraps
 * to the last. A Tab in the middle is left for the browser. With no stop at all, focus stays on
 * the container.
 */
export function WrapTabAtEnds(event: KeyboardEvent, container: HTMLElement): void {
  const stops = GetTabStops(container);
  if (stops.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const active = document.activeElement;
  const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;
  const onContainer = active === container;
  if (event.shiftKey) {
    if (index === 0 || onContainer) {
      event.preventDefault();
      stops[stops.length - 1].focus();
    }
    return;
  }
  if (index === stops.length - 1) {
    event.preventDefault();
    stops[0].focus();
  }
}

/**
 * Hands focus back after a modal closes: to `target` when it is still in the page and outside the
 * modal's `host` (an element inside the host is about to be removed), else to the page body.
 */
export function RestoreFocusTo(target: HTMLElement | null, host: HTMLElement): void {
  if (target && target !== document.body && document.contains(target) && !host.contains(target)) {
    target.focus();
    return;
  }
  FocusDocumentBody();
}

/** `document.body.focus()` is a no-op unless body is a focusable area; blur lands on body. */
export function FocusDocumentBody(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
  if (document.activeElement !== document.body) {
    document.body.focus();
  }
}
