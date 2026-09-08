/**
 * Helpers for asserting against Angular CDK **connected-overlay** content (dropdowns, comboboxes,
 * popovers, menus). CDK renders overlay panels into a `.cdk-overlay-container` appended to
 * `document.body` — i.e. OUTSIDE the component fixture's element — so the normal `query()` helpers
 * (which scope to `fixture.nativeElement`) can't see them. These query the overlay container instead.
 *
 * Usage (drive the component to open the overlay, then assert inside it):
 * ```ts
 * afterEach(() => clearOverlayContainers()); // prevent panels leaking across tests in a file
 *
 * it('opens the panel and lists options', () => {
 *   const f = render({ Data: [...] });
 *   (query(f, '.mj-dropdown-trigger') as HTMLElement).click();
 *   f.detectChanges();
 *   expect(overlayQueryAll('.mj-dropdown-option').length).toBe(3);
 * });
 * ```
 */

/** The live CDK overlay container on document.body, or null if none has been created yet. */
export function getOverlayContainerElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.cdk-overlay-container');
}

/** First element matching `selector` inside the overlay container (null if no overlay / no match). */
export function overlayQuery(selector: string): Element | null {
  return getOverlayContainerElement()?.querySelector(selector) ?? null;
}

/** All elements matching `selector` inside the overlay container. */
export function overlayQueryAll(selector: string): Element[] {
  const container = getOverlayContainerElement();
  return container ? Array.from(container.querySelectorAll(selector)) : [];
}

/** Trimmed textContent of the first overlay element matching `selector` (''. if absent). */
export function overlayText(selector: string): string {
  return overlayQuery(selector)?.textContent?.trim() ?? '';
}

/**
 * Remove every `.cdk-overlay-container` from the DOM. Call in `afterEach`: CDK reuses a single
 * container across a test file, and a panel left open by one test would otherwise be visible to the
 * next test's overlay queries (a cross-test leak the fixture teardown does NOT clean up).
 */
export function clearOverlayContainers(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
}
