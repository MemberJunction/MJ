import type { AuthProviderConfig } from '@memberjunction/core';

/**
 * Optional static contract a provider class implements to configure itself from environment
 * variables.
 *
 * **Why this is a hook and not a list.** MJServer used to derive env-based providers from a
 * hard-coded block that enumerated Entra, Auth0 and Cognito inline. That block was a closed
 * domain in the one place the architecture is otherwise open: a third-party provider could
 * register a class and take a metadata row or a `mj.config.cjs` entry, but it could never offer
 * the "set two environment variables and you are done" experience the built-ins got, because
 * the enumeration lived in core. Moving the mapping onto the provider class puts every provider
 * — shipped or third-party — on the same footing.
 *
 * A provider that has no meaningful env-var form simply omits the static, and discovery skips it.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseAuthProvider, 'my-idp')
 * export class MyIdpProvider extends BaseAuthProvider {
 *   static configFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
 *     if (!env.MY_IDP_DOMAIN || !env.MY_IDP_CLIENT_ID) return null;
 *     return {
 *       name: 'my-idp',
 *       type: 'my-idp',
 *       issuer: `https://${env.MY_IDP_DOMAIN}/`,
 *       audience: env.MY_IDP_CLIENT_ID,
 *       jwksUri: `https://${env.MY_IDP_DOMAIN}/.well-known/jwks.json`,
 *       clientId: env.MY_IDP_CLIENT_ID
 *     };
 *   }
 * }
 * ```
 */
export interface IEnvironmentConfigurableProvider {
  /**
   * Builds this provider's configuration from environment variables.
   *
   * MUST return `null` — not a partial config — when its variables are absent or incomplete.
   * A half-populated config would fail `validateConfig()` at registration and surface as a
   * startup error on every deployment that simply does not use this provider.
   *
   * @param env The environment to read (injected rather than read from `process.env` directly
   *        so the mapping is testable without mutating global state).
   */
  configFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null;
}

/**
 * Narrows an unknown provider class to one that offers env-var configuration.
 */
export function isEnvironmentConfigurable(subject: unknown): subject is IEnvironmentConfigurableProvider {
  return typeof (subject as IEnvironmentConfigurableProvider | undefined)?.configFromEnvironment === 'function';
}
