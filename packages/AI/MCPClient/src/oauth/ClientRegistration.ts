/**
 * @fileoverview OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Handles dynamic client registration with authorization servers that support DCR.
 * Falls back to pre-configured client credentials when DCR is not available.
 *
 * @module @memberjunction/ai-mcp-client/oauth/ClientRegistration
 */

import { Metadata, RunView, UserInfo, LogError, LogStatus, BaseEntity, CompositeKey } from '@memberjunction/core';
import type {
    AuthServerMetadata,
    DCRRequest,
    DCRResponse,
    OAuthClientRegistration,
    OAuthClientRegistrationStatus
} from './types.js';

/** Entity name for OAuth client registrations */
const ENTITY_OAUTH_CLIENT_REGISTRATIONS = 'MJ: O Auth Client Registrations';

/**
 * Handles OAuth Dynamic Client Registration (DCR) for MCP connections.
 *
 * Implements RFC 7591 DCR with fallback to pre-configured client credentials.
 * Stores registrations in the database for reuse across connections.
 *
 * Features:
 * - Automatic DCR when supported by authorization server
 * - Fallback to pre-configured credentials
 * - Registration persistence and reuse
 * - Client secret expiration tracking
 *
 * @example
 * ```typescript
 * const registration = new ClientRegistration();
 *
 * // Get or create client credentials
 * const client = await registration.getOrRegisterClient(
 *     connectionId,
 *     serverId,
 *     metadata,
 *     {
 *         redirectUri: 'https://api.example.com/oauth/callback',
 *         scopes: 'read write'
 *     },
 *     contextUser
 * );
 *
 * // Use client credentials in authorization request
 * authUrl.searchParams.set('client_id', client.clientId);
 * ```
 */
export class ClientRegistration {
    /** Default client name prefix */
    private static readonly CLIENT_NAME_PREFIX = 'MemberJunction MCP Client';

    /**
     * Gets existing client registration or registers a new one.
     *
     * If a valid registration exists for this connection, returns it.
     * Otherwise, attempts DCR if supported, or uses pre-configured credentials.
     *
     * @param connectionId - MCP Server Connection ID
     * @param serverId - MCP Server ID
     * @param metadata - Authorization server metadata
     * @param options - Registration options
     * @param contextUser - User context for database operations
     * @returns Client registration with credentials
     * @throws Error if no valid client credentials can be obtained
     */
    public async getOrRegisterClient(
        connectionId: string,
        serverId: string,
        metadata: AuthServerMetadata,
        options: {
            redirectUri: string;
            scopes?: string;
            serverName?: string;
            preConfiguredClientId?: string;
            preConfiguredClientSecret?: string;
        },
        contextUser: UserInfo
    ): Promise<OAuthClientRegistration> {
        // Check for existing valid registration
        const existing = await this.loadRegistration(connectionId, metadata.issuer, contextUser);
        if (existing && existing.status === 'Active') {
            // Check if client secret has expired
            if (existing.clientSecretExpiresAt && new Date() >= existing.clientSecretExpiresAt) {
                LogStatus(`[OAuth] Client secret expired for connection ${connectionId}, re-registering`);
                await this.deleteRegistration(existing.id!, contextUser);
            }
            // Check if the requested redirect_uri is in the registered redirect_uris
            else if (!existing.redirectUris.includes(options.redirectUri)) {
                LogStatus(`[OAuth] Redirect URI changed for connection ${connectionId} (was: ${existing.redirectUris.join(', ')}, now: ${options.redirectUri}), re-registering`);
                await this.deleteRegistration(existing.id!, contextUser);
            } else {
                LogStatus(`[OAuth] Using existing client registration for connection ${connectionId}`);
                return existing;
            }
        }

        // Check for pre-configured credentials
        if (options.preConfiguredClientId) {
            LogStatus(`[OAuth] Using pre-configured client credentials for connection ${connectionId}`);
            return this.createPreConfiguredRegistration(
                connectionId,
                serverId,
                metadata.issuer,
                options.preConfiguredClientId,
                options.preConfiguredClientSecret,
                options.redirectUri,
                options.scopes,
                contextUser
            );
        }

        // Attempt DCR if supported
        if (metadata.registration_endpoint) {
            LogStatus(`[OAuth] Attempting DCR at ${metadata.registration_endpoint}`);
            try {
                return await this.registerClient(
                    connectionId,
                    serverId,
                    metadata,
                    options,
                    contextUser
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                LogError(`[OAuth] DCR failed: ${errorMsg}`);
                throw new Error(
                    `Dynamic Client Registration failed and no pre-configured credentials available. ` +
                    `Error: ${errorMsg}. ` +
                    `Please configure OAuthClientID and OAuthClientSecretEncrypted on the MCP Server.`
                );
            }
        }

        // No DCR and no pre-configured credentials
        throw new Error(
            `Authorization server does not support Dynamic Client Registration and no pre-configured ` +
            `credentials are available. Please configure OAuthClientID and OAuthClientSecretEncrypted ` +
            `on the MCP Server.`
        );
    }

    /**
     * Registers a new client with the authorization server via DCR.
     *
     * @param connectionId - MCP Server Connection ID
     * @param serverId - MCP Server ID
     * @param metadata - Authorization server metadata
     * @param options - Registration options
     * @param contextUser - User context
     * @returns New client registration
     */
    private async registerClient(
        connectionId: string,
        serverId: string,
        metadata: AuthServerMetadata,
        options: {
            redirectUri: string;
            scopes?: string;
            serverName?: string;
        },
        contextUser: UserInfo
    ): Promise<OAuthClientRegistration> {
        if (!metadata.registration_endpoint) {
            throw new Error('Authorization server does not support Dynamic Client Registration');
        }

        // Build DCR request
        const clientName = options.serverName
            ? `${ClientRegistration.CLIENT_NAME_PREFIX} - ${options.serverName}`
            : ClientRegistration.CLIENT_NAME_PREFIX;

        const dcrRequest: DCRRequest = {
            client_name: clientName,
            redirect_uris: [options.redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: this.selectAuthMethod(metadata),
            scope: options.scopes
        };

        // Send DCR request
        const response = await fetch(metadata.registration_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(dcrRequest)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error_description) {
                    errorMessage = `${errorJson.error}: ${errorJson.error_description}`;
                } else if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
            } catch {
                errorMessage += `: ${errorBody}`;
            }
            throw new Error(errorMessage);
        }

        const dcrResponse = await response.json() as DCRResponse;

        // Validate response has required fields
        if (!dcrResponse.client_id) {
            throw new Error('DCR response missing required client_id');
        }

        // Create and save registration
        const registration: OAuthClientRegistration = {
            connectionId,
            serverId,
            issuer: metadata.issuer,
            clientId: dcrResponse.client_id,
            clientSecret: dcrResponse.client_secret,
            clientIdIssuedAt: dcrResponse.client_id_issued_at
                ? new Date(this.normalizeTimestamp(dcrResponse.client_id_issued_at))
                : undefined,
            clientSecretExpiresAt: dcrResponse.client_secret_expires_at
                ? dcrResponse.client_secret_expires_at === 0
                    ? undefined
                    : new Date(this.normalizeTimestamp(dcrResponse.client_secret_expires_at))
                : undefined,
            registrationAccessToken: dcrResponse.registration_access_token,
            registrationClientUri: dcrResponse.registration_client_uri,
            redirectUris: dcrResponse.redirect_uris ?? [options.redirectUri],
            grantTypes: dcrResponse.grant_types ?? ['authorization_code', 'refresh_token'],
            responseTypes: dcrResponse.response_types ?? ['code'],
            scope: dcrResponse.scope ?? options.scopes,
            status: 'Active',
            registrationResponse: JSON.stringify(dcrResponse)
        };

        // Save to database
        const savedRegistration = await this.saveRegistration(registration, contextUser);

        LogStatus(`[OAuth] Successfully registered client for connection ${connectionId}`);
        return savedRegistration;
    }

    /**
     * Creates a registration record for pre-configured credentials.
     */
    private async createPreConfiguredRegistration(
        connectionId: string,
        serverId: string,
        issuer: string,
        clientId: string,
        clientSecret: string | undefined,
        redirectUri: string,
        scopes: string | undefined,
        contextUser: UserInfo
    ): Promise<OAuthClientRegistration> {
        const registration: OAuthClientRegistration = {
            connectionId,
            serverId,
            issuer,
            clientId,
            clientSecret,
            redirectUris: [redirectUri],
            grantTypes: ['authorization_code', 'refresh_token'],
            responseTypes: ['code'],
            scope: scopes,
            status: 'Active',
            registrationResponse: JSON.stringify({ pre_configured: true })
        };

        // Save to database
        return await this.saveRegistration(registration, contextUser);
    }

    /**
     * Selects the best token endpoint authentication method.
     */
    private selectAuthMethod(metadata: AuthServerMetadata): string {
        const supported = metadata.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];

        // Prefer client_secret_basic, then client_secret_post
        if (supported.includes('client_secret_basic')) {
            return 'client_secret_basic';
        }
        if (supported.includes('client_secret_post')) {
            return 'client_secret_post';
        }
        // If only none is supported, return that (public client)
        if (supported.includes('none')) {
            return 'none';
        }

        // Default to basic
        return 'client_secret_basic';
    }

    /**
     * Normalizes a timestamp that may be in seconds or milliseconds.
     *
     * OAuth specs (RFC 7591) specify timestamps in seconds since epoch,
     * but some providers (e.g., Context7/Clerk) return milliseconds.
     * This method detects and handles both formats.
     *
     * @param timestamp - Unix timestamp in seconds or milliseconds
     * @returns Timestamp in milliseconds suitable for Date constructor
     */
    private normalizeTimestamp(timestamp: number): number {
        // Timestamps in seconds for years 2000-3000 are roughly 10 digits (946684800 to 32503680000)
        // Timestamps in milliseconds are 13 digits
        // If the value is greater than a reasonable seconds value (year ~2286), it's likely milliseconds
        const maxReasonableSeconds = 10000000000; // Year 2286 in seconds
        return timestamp > maxReasonableSeconds ? timestamp : timestamp * 1000;
    }

    /**
     * Loads an existing registration from the database.
     */
    private async loadRegistration(
        connectionId: string,
        issuer: string,
        contextUser: UserInfo
    ): Promise<OAuthClientRegistration | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{
                ID: string;
                MCPServerConnectionID: string;
                MCPServerID: string;
                IssuerURL: string;
                ClientID: string;
                ClientSecretEncrypted: string | null;
                ClientIDIssuedAt: Date | null;
                ClientSecretExpiresAt: Date | null;
                RegistrationAccessToken: string | null;
                RegistrationClientURI: string | null;
                RedirectURIs: string;
                GrantTypes: string;
                ResponseTypes: string;
                Scope: string | null;
                Status: OAuthClientRegistrationStatus;
                RegistrationResponse: string;
            }>({
                EntityName: ENTITY_OAUTH_CLIENT_REGISTRATIONS,
                ExtraFilter: `MCPServerConnectionID='${connectionId}' AND IssuerURL='${issuer.replace(/'/g, "''")}'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            const record = result.Results[0];
            return {
                id: record.ID,
                connectionId: record.MCPServerConnectionID,
                serverId: record.MCPServerID,
                issuer: record.IssuerURL,
                clientId: record.ClientID,
                clientSecret: record.ClientSecretEncrypted ?? undefined,
                clientIdIssuedAt: record.ClientIDIssuedAt ? new Date(record.ClientIDIssuedAt) : undefined,
                clientSecretExpiresAt: record.ClientSecretExpiresAt ? new Date(record.ClientSecretExpiresAt) : undefined,
                registrationAccessToken: record.RegistrationAccessToken ?? undefined,
                registrationClientUri: record.RegistrationClientURI ?? undefined,
                redirectUris: JSON.parse(record.RedirectURIs),
                grantTypes: JSON.parse(record.GrantTypes),
                responseTypes: JSON.parse(record.ResponseTypes),
                scope: record.Scope ?? undefined,
                status: record.Status,
                registrationResponse: record.RegistrationResponse
            };
        } catch (error) {
            LogError(`[OAuth] Failed to load client registration: ${error}`);
            return null;
        }
    }

    /**
     * Saves a registration to the database.
     */
    private async saveRegistration(
        registration: OAuthClientRegistration,
        contextUser: UserInfo
    ): Promise<OAuthClientRegistration> {
        try {
            const md = new Metadata();
            const rv = new RunView();

            // Check for existing record
            const existing = await rv.RunView<{ ID: string }>({
                EntityName: ENTITY_OAUTH_CLIENT_REGISTRATIONS,
                ExtraFilter: `MCPServerConnectionID='${registration.connectionId}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            }, contextUser);

            // Use BaseEntity with Set() method for dynamic field access
            const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_CLIENT_REGISTRATIONS, contextUser);

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: existing.Results[0].ID }]);
                await entity.InnerLoad(compositeKey);
            } else {
                entity.NewRecord();
                entity.Set('MCPServerConnectionID', registration.connectionId);
            }

            entity.Set('MCPServerID', registration.serverId);
            entity.Set('IssuerURL', registration.issuer);
            entity.Set('ClientID', registration.clientId);
            entity.Set('ClientSecretEncrypted', registration.clientSecret ?? null);
            entity.Set('ClientIDIssuedAt', registration.clientIdIssuedAt ?? null);
            entity.Set('ClientSecretExpiresAt', registration.clientSecretExpiresAt ?? null);
            entity.Set('RegistrationAccessToken', registration.registrationAccessToken ?? null);
            entity.Set('RegistrationClientURI', registration.registrationClientUri ?? null);
            entity.Set('RedirectURIs', JSON.stringify(registration.redirectUris));
            entity.Set('GrantTypes', JSON.stringify(registration.grantTypes));
            entity.Set('ResponseTypes', JSON.stringify(registration.responseTypes));
            entity.Set('Scope', registration.scope ?? null);
            entity.Set('Status', registration.status);
            entity.Set('RegistrationResponse', registration.registrationResponse);

            await entity.Save();
            registration.id = entity.Get('ID');

            return registration;
        } catch (error) {
            LogError(`[OAuth] Failed to save client registration: ${error}`);
            throw error;
        }
    }

    /**
     * Deletes a registration from the database.
     */
    private async deleteRegistration(registrationId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_CLIENT_REGISTRATIONS, contextUser);
            const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: registrationId }]);
            const loaded = await entity.InnerLoad(compositeKey);
            if (loaded) {
                await entity.Delete();
            }
        } catch (error) {
            LogError(`[OAuth] Failed to delete client registration: ${error}`);
        }
    }

    /**
     * Updates a registration's status.
     */
    public async updateRegistrationStatus(
        registrationId: string,
        status: OAuthClientRegistrationStatus,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_CLIENT_REGISTRATIONS, contextUser);
            const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: registrationId }]);
            const loaded = await entity.InnerLoad(compositeKey);
            if (loaded) {
                entity.Set('Status', status);
                await entity.Save();
            }
        } catch (error) {
            LogError(`[OAuth] Failed to update registration status: ${error}`);
        }
    }
}
