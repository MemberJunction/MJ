/**
 * The phone breakpoint the custom forms share with the rest of MJ's chrome. One query string so the
 * CSS (`@media (max-width: 768px)`) and the TypeScript decide the same way.
 */
export const PHONE_VIEWPORT_QUERY = '(max-width: 768px)';

/**
 * Whether the window is a phone-width viewport right now. False where `matchMedia` is missing
 * (server rendering, jsdom), so a form keeps its desktop defaults there.
 */
export function IsPhoneViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(PHONE_VIEWPORT_QUERY).matches;
}
