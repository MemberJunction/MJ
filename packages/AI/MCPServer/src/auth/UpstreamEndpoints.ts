/**
 * @fileoverview Upstream OAuth endpoint resolution for the MCP OAuth proxy.
 *
 * The proxy needs the upstream provider's `/authorize` and `/token` URLs, but an
 * OIDC issuer is not always the origin those endpoints hang off. Amazon Cognito is
 * the case that breaks the naive assumption: its issuer is the user-pool URL
 * (`https://cognito-idp.<region>.amazonaws.com/<poolId>`), which serves discovery
 * and JWKS but no OAuth endpoints at all — those live on the hosted-UI domain
 * (`https://<domain>.auth.<region>.amazoncognito.com/oauth2/...`).
 *
 * @module @memberjunction/ai-mcp-server/auth/UpstreamEndpoints
 */

/**
 * Which upstream provider shape the endpoints were derived from. Callers use this
 * instead of re-sniffing the issuer (Azure AD, for example, needs different scopes).
 */
export type UpstreamFlavor = 'azure-ad' | 'cognito' | 'generic';

/**
 * The upstream OAuth endpoints the proxy redirects to and exchanges codes against.
 */
export interface UpstreamOAuthEndpoints {
  /** Provider shape the endpoints were derived from */
  flavor: UpstreamFlavor;
  /** Upstream authorization endpoint (browser redirect target) */
  authorizationEndpoint: string;
  /** Upstream token endpoint (code → token exchange) */
  tokenEndpoint: string;
}

/**
 * The subset of an auth provider this resolver reads.
 */
export interface UpstreamProviderInfo {
  /** OIDC issuer URL (matches the `iss` claim) */
  issuer: string;
  /** Provider domain — for Cognito, the hosted-UI domain */
  domain?: string;
}

/**
 * Classifies a provider by its issuer URL.
 *
 * @param issuer - The provider's OIDC issuer URL
 * @returns The upstream flavor to derive endpoints for
 */
export function detectUpstreamFlavor(issuer: string | undefined): UpstreamFlavor {
  if (!issuer) {
    return 'generic';
  }
  if (issuer.includes('microsoftonline.com') || issuer.includes('sts.windows.net')) {
    return 'azure-ad';
  }
  if (issuer.includes('cognito-idp.')) {
    return 'cognito';
  }
  return 'generic';
}

/**
 * Normalizes a configured domain to a bare host: callers write it either way
 * (MJExplorer's `COGNITO_DOMAIN` is host-only, an `authProviders` entry may carry
 * a scheme), and both must produce the same URL.
 *
 * @param domain - Configured domain, with or without scheme/trailing slash
 * @returns The bare host
 */
function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Derives the upstream authorization and token endpoints for an auth provider.
 *
 * @param provider - The upstream provider's issuer and (for Cognito) domain
 * @returns The resolved endpoints and the flavor they were derived from
 * @throws If the provider is Cognito but no hosted-UI domain is configured — Cognito's
 *         issuer host serves no OAuth endpoints, so there is nothing safe to guess.
 */
export function resolveUpstreamOAuthEndpoints(provider: UpstreamProviderInfo): UpstreamOAuthEndpoints {
  const issuer = provider.issuer;
  const flavor = detectUpstreamFlavor(issuer);

  if (flavor === 'azure-ad') {
    // Azure AD v2.0: issuer is https://login.microsoftonline.com/{tenant}/v2.0
    const baseUrl = issuer.replace(/\/v2\.0\/?$/, '');
    return {
      flavor,
      authorizationEndpoint: `${baseUrl}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${baseUrl}/oauth2/v2.0/token`,
    };
  }

  if (flavor === 'cognito') {
    if (!provider.domain) {
      throw new Error(
        'Cognito upstream is missing its hosted-UI domain. Cognito serves OAuth endpoints only on ' +
          'the hosted-UI domain, not on the user-pool issuer. Set COGNITO_DOMAIN (e.g. ' +
          '"my-pool.auth.us-east-1.amazoncognito.com") or add `domain` to the provider entry in ' +
          "mj.config.cjs's authProviders array.",
      );
    }
    const host = normalizeDomain(provider.domain);
    return {
      flavor,
      authorizationEndpoint: `https://${host}/oauth2/authorize`,
      tokenEndpoint: `https://${host}/oauth2/token`,
    };
  }

  // Generic OIDC - assume standard paths (Auth0, Okta, etc.)
  // Strip trailing slash from issuer to avoid double slashes in URL
  const issuerBase = issuer.replace(/\/+$/, '');
  return {
    flavor,
    authorizationEndpoint: `${issuerBase}/authorize`,
    tokenEndpoint: `${issuerBase}/oauth/token`,
  };
}
