/**
 * MemberJunction API Keys Engine Base Package
 *
 * This package provides the base engine for API Keys metadata caching.
 * It can be used on both client and server for cached access to:
 * - API Scopes
 * - API Applications
 * - API Application Scopes
 * - API Key Applications
 * - API Key Scopes
 *
 * For server-side authorization features (key generation, validation, usage logging),
 * use the @memberjunction/api-keys package instead.
 *
 * @module @memberjunction/api-keys-base
 */

export { APIKeysEngineBase, APIScopeUIConfig, parseAPIScopeUIConfig } from './APIKeysEngineBase';

/**
 * Tree-shaking prevention function.
 * Call this to ensure the APIKeysEngineBase class is included in the bundle.
 */
export function LoadAPIKeysEngineBase(): void {
    // This function exists to prevent tree shaking from removing the class.
    // The @RegisterForStartup decorator registers the class, but this function
    // ensures the module is imported.
}
