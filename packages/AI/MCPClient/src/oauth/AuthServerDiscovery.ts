/**
 * @fileoverview OAuth 2.0 Authorization Server Metadata Discovery (RFC 8414)
 *
 * Discovers and caches authorization server metadata from well-known endpoints.
 * Supports both OAuth 2.0 and OpenID Connect discovery endpoints.
 *
 * @module @memberjunction/ai-mcp-client/oauth/AuthServerDiscovery
 */

import { Metadata, RunView, UserInfo, LogError, LogStatus, BaseEntity, CompositeKey } from '@memberjunction/core';
import type { AuthServerMetadata, CachedAuthServerMetadata } from './types.js';

/** Entity name for OAuth auth server metadata cache */
const ENTITY_OAUTH_METADATA_CACHE = 'MJ: O Auth Auth Server Metadata Cache';

/**
 * Discovers and caches OAuth 2.0 authorization server metadata.
 *
 * Implements RFC 8414 metadata discovery with fallback to OpenID Connect
 * discovery endpoint for maximum compatibility.
 *
 * Features:
 * - Automatic endpoint discovery
 * - Database-backed caching with configurable TTL
 * - Fallback from OAuth to OIDC discovery
 * - Validation of required metadata fields
 *
 * @example
 * ```typescript
 * const discovery = new AuthServerDiscovery();
 *
 * // Get metadata (from cache or fetch)
 * const metadata = await discovery.getMetadata(
 *     'https://auth.example.com',
 *     contextUser,
 *     { cacheTTLMinutes: 1440 } // 24 hours
 * );
 *
 * console.log('Authorization endpoint:', metadata.authorization_endpoint);
 * console.log('Token endpoint:', metadata.token_endpoint);
 * console.log('Supports DCR:', !!metadata.registration_endpoint);
 * ```
 */
export class AuthServerDiscovery {
    /** Default cache TTL in minutes (24 hours) */
    private static readonly DEFAULT_CACHE_TTL_MINUTES = 1440;

    /** In-memory cache for faster repeated access */
    private readonly memoryCache: Map<string, CachedAuthServerMetadata> = new Map();

    /**
     * Gets authorization server metadata for an issuer URL.
     *
     * First checks in-memory cache, then database cache, finally fetches
     * from the authorization server if not cached or expired.
     *
     * @param issuerUrl - The authorization server's issuer URL
     * @param contextUser - User context for database operations
     * @param options - Optional configuration
     * @returns Authorization server metadata
     * @throws Error if metadata cannot be discovered
     */
    public async getMetadata(
        issuerUrl: string,
        contextUser: UserInfo,
        options?: { cacheTTLMinutes?: number }
    ): Promise<AuthServerMetadata> {
        const cacheTTLMinutes = options?.cacheTTLMinutes ?? AuthServerDiscovery.DEFAULT_CACHE_TTL_MINUTES;

        // Normalize issuer URL (remove trailing slash)
        const normalizedIssuer = issuerUrl.replace(/\/$/, '');

        // Check in-memory cache first
        const memoryCached = this.memoryCache.get(normalizedIssuer);
        if (memoryCached && new Date() < memoryCached.expiresAt) {
            LogStatus(`[OAuth] Using in-memory cached metadata for ${normalizedIssuer}`);
            return memoryCached.metadata;
        }

        // Check database cache
        const dbCached = await this.loadFromDatabase(normalizedIssuer, contextUser);
        if (dbCached && new Date() < dbCached.expiresAt) {
            // Update in-memory cache
            this.memoryCache.set(normalizedIssuer, dbCached);
            LogStatus(`[OAuth] Using database cached metadata for ${normalizedIssuer}`);
            return dbCached.metadata;
        }

        // Fetch fresh metadata
        const metadata = await this.fetchMetadata(normalizedIssuer);

        // Calculate expiration
        const now = new Date();
        const expiresAt = new Date(now.getTime() + cacheTTLMinutes * 60 * 1000);

        // Save to database cache
        await this.saveToDatabase(normalizedIssuer, metadata, now, expiresAt, contextUser);

        // Update in-memory cache
        const cached: CachedAuthServerMetadata = {
            metadata,
            cachedAt: now,
            expiresAt
        };
        this.memoryCache.set(normalizedIssuer, cached);

        LogStatus(`[OAuth] Fetched and cached metadata for ${normalizedIssuer}`);
        return metadata;
    }

    /**
     * Invalidates cached metadata for an issuer.
     *
     * Call this when you need to force a refresh of the metadata,
     * such as after a configuration change or error.
     *
     * @param issuerUrl - The authorization server's issuer URL
     * @param contextUser - User context for database operations
     */
    public async invalidateCache(issuerUrl: string, contextUser: UserInfo): Promise<void> {
        const normalizedIssuer = issuerUrl.replace(/\/$/, '');

        // Remove from in-memory cache
        this.memoryCache.delete(normalizedIssuer);

        // Delete from database
        await this.deleteFromDatabase(normalizedIssuer, contextUser);

        LogStatus(`[OAuth] Invalidated cached metadata for ${normalizedIssuer}`);
    }

    /**
     * Checks if an authorization server supports DCR.
     *
     * @param issuerUrl - The authorization server's issuer URL
     * @param contextUser - User context for database operations
     * @returns true if DCR is supported
     */
    public async supportsDCR(issuerUrl: string, contextUser: UserInfo): Promise<boolean> {
        try {
            const metadata = await this.getMetadata(issuerUrl, contextUser);
            return !!metadata.registration_endpoint;
        } catch {
            return false;
        }
    }

    /**
     * Checks if an authorization server supports PKCE with S256.
     *
     * @param issuerUrl - The authorization server's issuer URL
     * @param contextUser - User context for database operations
     * @returns true if S256 PKCE is supported (or if not explicitly listed, assume supported)
     */
    public async supportsPKCE(issuerUrl: string, contextUser: UserInfo): Promise<boolean> {
        try {
            const metadata = await this.getMetadata(issuerUrl, contextUser);
            // If code_challenge_methods_supported is not listed, many servers still support PKCE
            // If listed, check for S256
            if (!metadata.code_challenge_methods_supported) {
                return true; // Assume supported if not explicitly listed
            }
            return metadata.code_challenge_methods_supported.includes('S256');
        } catch {
            return false;
        }
    }

    /**
     * Fetches metadata from the authorization server.
     *
     * Tries OAuth 2.0 discovery first, then falls back to OIDC discovery.
     *
     * @param issuerUrl - The normalized issuer URL
     * @returns Authorization server metadata
     * @throws Error if metadata cannot be fetched
     */
    private async fetchMetadata(issuerUrl: string): Promise<AuthServerMetadata> {
        // Try OAuth 2.0 discovery endpoint first (RFC 8414)
        const oauthUrl = `${issuerUrl}/.well-known/oauth-authorization-server`;
        try {
            const metadata = await this.fetchFromEndpoint(oauthUrl);
            if (metadata) {
                return metadata;
            }
        } catch (error) {
            LogStatus(`[OAuth] OAuth discovery failed for ${issuerUrl}, trying OIDC...`);
        }

        // Fallback to OpenID Connect discovery
        const oidcUrl = `${issuerUrl}/.well-known/openid-configuration`;
        try {
            const metadata = await this.fetchFromEndpoint(oidcUrl);
            if (metadata) {
                return metadata;
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`[OAuth] OIDC discovery also failed for ${issuerUrl}: ${errorMsg}`);
        }

        throw new Error(
            `Failed to discover authorization server metadata for ${issuerUrl}. ` +
            `Neither OAuth 2.0 nor OpenID Connect discovery endpoints responded.`
        );
    }

    /**
     * Fetches and validates metadata from a specific endpoint.
     *
     * @param url - The discovery endpoint URL
     * @returns Validated metadata or null if invalid
     */
    private async fetchFromEndpoint(url: string): Promise<AuthServerMetadata | null> {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate required fields per RFC 8414
        if (!this.validateMetadata(data)) {
            LogError(`[OAuth] Invalid metadata from ${url}: missing required fields`);
            return null;
        }

        return data as AuthServerMetadata;
    }

    /**
     * Validates that metadata contains all required fields.
     *
     * @param data - The metadata object to validate
     * @returns true if valid
     */
    private validateMetadata(data: Record<string, unknown>): boolean {
        const required = ['issuer', 'authorization_endpoint', 'token_endpoint', 'response_types_supported'];

        for (const field of required) {
            if (!data[field]) {
                LogError(`[OAuth] Missing required metadata field: ${field}`);
                return false;
            }
        }

        // Validate issuer is a URL
        if (typeof data['issuer'] !== 'string') {
            return false;
        }

        // Validate endpoints are URLs
        if (typeof data['authorization_endpoint'] !== 'string') {
            return false;
        }
        if (typeof data['token_endpoint'] !== 'string') {
            return false;
        }

        // Validate response_types_supported is an array
        if (!Array.isArray(data['response_types_supported'])) {
            return false;
        }

        return true;
    }

    /**
     * Loads cached metadata from database.
     *
     * @param issuerUrl - The issuer URL to look up
     * @param contextUser - User context
     * @returns Cached metadata or null if not found
     */
    private async loadFromDatabase(
        issuerUrl: string,
        contextUser: UserInfo
    ): Promise<CachedAuthServerMetadata | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{
                MetadataJSON: string;
                CachedAt: Date;
                ExpiresAt: Date;
            }>({
                EntityName: ENTITY_OAUTH_METADATA_CACHE,
                ExtraFilter: `IssuerURL='${issuerUrl.replace(/'/g, "''")}'`,
                Fields: ['MetadataJSON', 'CachedAt', 'ExpiresAt'],
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            const record = result.Results[0];
            const metadata = JSON.parse(record.MetadataJSON) as AuthServerMetadata;

            return {
                metadata,
                cachedAt: new Date(record.CachedAt),
                expiresAt: new Date(record.ExpiresAt)
            };
        } catch (error) {
            LogError(`[OAuth] Failed to load cached metadata: ${error}`);
            return null;
        }
    }

    /**
     * Saves metadata to database cache.
     *
     * @param issuerUrl - The issuer URL
     * @param metadata - The metadata to cache
     * @param cachedAt - When the metadata was cached
     * @param expiresAt - When the cache expires
     * @param contextUser - User context
     */
    private async saveToDatabase(
        issuerUrl: string,
        metadata: AuthServerMetadata,
        cachedAt: Date,
        expiresAt: Date,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = new Metadata();
            const rv = new RunView();

            // Check if record exists
            const existing = await rv.RunView<{ ID: string }>({
                EntityName: ENTITY_OAUTH_METADATA_CACHE,
                ExtraFilter: `IssuerURL='${issuerUrl.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            }, contextUser);

            // Use dynamic entity to work with new entities that might not have generated classes yet
            const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_METADATA_CACHE, contextUser);

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                // Update existing record
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: existing.Results[0].ID }]);
                await entity.InnerLoad(compositeKey);
            } else {
                // Create new record
                entity.NewRecord();
                entity.Set('IssuerURL', issuerUrl);
            }

            // Set fields using BaseEntity.Set() method
            entity.Set('AuthorizationEndpoint', metadata.authorization_endpoint);
            entity.Set('TokenEndpoint', metadata.token_endpoint);
            entity.Set('RegistrationEndpoint', metadata.registration_endpoint ?? null);
            entity.Set('RevocationEndpoint', metadata.revocation_endpoint ?? null);
            entity.Set('JwksURI', metadata.jwks_uri ?? null);
            entity.Set('ScopesSupported', metadata.scopes_supported ? JSON.stringify(metadata.scopes_supported) : null);
            entity.Set('ResponseTypesSupported', JSON.stringify(metadata.response_types_supported));
            entity.Set('GrantTypesSupported', metadata.grant_types_supported ? JSON.stringify(metadata.grant_types_supported) : null);
            entity.Set('TokenEndpointAuthMethods', metadata.token_endpoint_auth_methods_supported
                ? JSON.stringify(metadata.token_endpoint_auth_methods_supported)
                : null);
            entity.Set('CodeChallengeMethodsSupported', metadata.code_challenge_methods_supported
                ? JSON.stringify(metadata.code_challenge_methods_supported)
                : null);
            entity.Set('MetadataJSON', JSON.stringify(metadata));
            entity.Set('CachedAt', cachedAt);
            entity.Set('ExpiresAt', expiresAt);

            await entity.Save();
        } catch (error) {
            // Log but don't throw - caching failure shouldn't break the flow
            LogError(`[OAuth] Failed to cache metadata: ${error}`);
        }
    }

    /**
     * Deletes cached metadata from database.
     *
     * @param issuerUrl - The issuer URL to delete
     * @param contextUser - User context
     */
    private async deleteFromDatabase(issuerUrl: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const rv = new RunView();

            const existing = await rv.RunView<{ ID: string }>({
                EntityName: ENTITY_OAUTH_METADATA_CACHE,
                ExtraFilter: `IssuerURL='${issuerUrl.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            }, contextUser);

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_METADATA_CACHE, contextUser);
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: existing.Results[0].ID }]);
                const loaded = await entity.InnerLoad(compositeKey);
                if (loaded) {
                    await entity.Delete();
                }
            }
        } catch (error) {
            LogError(`[OAuth] Failed to delete cached metadata: ${error}`);
        }
    }
}
