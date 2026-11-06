/**
 * The breakpoint MJ's UI treats as "a phone". It is the same string as the `@media (max-width: 768px)`
 * rules in the component stylesheets, so a component that decides something in TypeScript (start a
 * panel hidden, pick a section) decides it at the same width the CSS changes layout.
 */
export const PHONE_VIEWPORT_QUERY = '(max-width: 768px)';

function phoneMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(PHONE_VIEWPORT_QUERY) ?? null;
}

/** True at phone width. False wherever `matchMedia` does not exist (SSR, jsdom), so desktop defaults hold. */
export function IsPhoneViewport(): boolean {
  return phoneMedia()?.matches === true;
}

/**
 * Calls `onChange` whenever the viewport crosses the phone breakpoint (rotation, a resized window,
 * DevTools device mode). Returns the function that stops watching; always returns one, even where
 * there is no `matchMedia`. Call it from `ngOnDestroy`.
 */
export function WatchPhoneViewport(onChange: () => void): () => void {
  const media = phoneMedia();
  if (!media || typeof media.addEventListener !== 'function') return () => undefined;
  const listener = (): void => onChange();
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
