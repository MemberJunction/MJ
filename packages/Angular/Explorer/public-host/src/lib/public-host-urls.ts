import type { MJBootstrapEnvironment } from './public-page-entry';

/**
 * The query parameter that tells Explorer to open the identity provider's sign-up form.
 * Explorer's sign-in reads the same name (`ReadSignUpHint` in `@memberjunction/ng-auth-services`).
 */
export const SIGN_UP_HINT_PARAM = 'signup';

/**
 * The MJAPI base URL, without a trailing slash: `MJAPI_URI` when set, otherwise the GraphQL server's origin.
 * Matches how Explorer's login-screen loader finds MJAPI before sign-in.
 */
export function ResolvePublicMJAPIURL(environment: MJBootstrapEnvironment): string {
  const configured = environment.MJAPI_URI?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return new URL(environment.GRAPHQL_URI).origin;
}

/** The public route that returns the default theme's published sign-in page design. */
export function BuildLoginScreenURL(environment: MJBootstrapEnvironment): string {
  return `${ResolvePublicMJAPIURL(environment)}/auth/login-screen`;
}

/** Explorer's root with the sign-up hint. */
export function BuildSignUpURL(): string {
  return `/?${SIGN_UP_HINT_PARAM}=1`;
}

/** Explorer's root. A visitor with no session sees the sign-in screen there. */
export function BuildSignInURL(): string {
  return '/';
}
