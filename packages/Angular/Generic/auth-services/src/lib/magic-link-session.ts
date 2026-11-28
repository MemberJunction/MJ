/** Provider type string for MemberJunction magic-link guest sessions. */
export const MAGIC_LINK_PROVIDER_TYPE = 'magic-link';

/** sessionStorage key holding the magic-link session token for this tab. */
export const MAGIC_LINK_TOKEN_STORAGE_KEY = 'mj_magic_link_token';

/**
 * True if a magic-link session token is present for this page load — either
 * arriving in the URL fragment (`#token=<jwt>`, from the redeem redirect) or
 * already stashed in sessionStorage from earlier in this tab.
 *
 * Kept dependency-free so preload and `AuthServicesModule.ForRoot` can detect
 * magic-link sessions without eagerly importing `MJMagicLinkProvider`.
 */
export function HasMagicLinkSessionToken(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const hash = window.location?.hash ?? '';
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
    if (new URLSearchParams(fragment).get('token')) {
      return true;
    }
    return !!window.sessionStorage?.getItem(MAGIC_LINK_TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }
}
