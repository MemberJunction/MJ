/**
 * @fileoverview Reads and removes the `?signup=1` hint that public pages add to a
 * "Create account" link. Pure functions with no Angular or MJ dependencies.
 *
 * @module @memberjunction/ng-auth-services
 */

/** Query parameter that asks Explorer to open the identity provider's sign-up form. */
export const SIGN_UP_HINT_PARAM = 'signup';

const SIGN_UP_HINT_VALUES = new Set(['1', 'true']);

/**
 * True when a query string carries the sign-up hint (`signup=1` or `signup=true`).
 *
 * @param search A query string such as `window.location.search`, with or without the leading `?`.
 */
export function ReadSignUpHint(search: string): boolean {
  const value = new URLSearchParams(search).get(SIGN_UP_HINT_PARAM);
  return value !== null && SIGN_UP_HINT_VALUES.has(value.toLowerCase());
}

/**
 * Returns the URL without the sign-up hint. Other query params and the hash stay as they are.
 *
 * @param url An absolute URL or a path such as `/app/home?signup=1#top`.
 */
export function RemoveSignUpHint(url: string): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex < 0) {
    return url;
  }

  const base = beforeHash.slice(0, queryIndex);
  const params = new URLSearchParams(beforeHash.slice(queryIndex + 1));
  if (!params.has(SIGN_UP_HINT_PARAM)) {
    return url;
  }
  params.delete(SIGN_UP_HINT_PARAM);

  const query = params.toString();
  return `${base}${query ? `?${query}` : ''}${hash}`;
}
