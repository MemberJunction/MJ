/**
 * The one breakpoint the form chrome treats as "a phone": the section rail becomes a
 * horizontal strip, the toolbar auto-hides, the More folder opens as a sheet, and the
 * standard-form switch compacts. Keep every form-side `matchMedia` on this constant.
 */
export const PHONE_VIEWPORT_MEDIA_QUERY = '(max-width: 768px)';

function phoneMedia(): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(PHONE_VIEWPORT_MEDIA_QUERY);
}

/** True at phone width. False wherever `matchMedia` does not exist (jsdom, SSR). */
export function IsPhoneViewport(): boolean {
    return phoneMedia()?.matches === true;
}

/**
 * Calls `onChange` whenever the viewport crosses the phone breakpoint. Returns the
 * function that stops watching; always returns one, even where there is no `matchMedia`.
 */
export function WatchPhoneViewport(onChange: () => void): () => void {
    const media = phoneMedia();
    if (!media || typeof media.addEventListener !== 'function') return () => undefined;
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}
