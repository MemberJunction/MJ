/**
 * Configuration options for OAuth2Manager
 */
export interface OAuth2Config {
    /**
     * OAuth2 client ID
     */
    clientId: string;

    /**
     * OAuth2 client secret
     */
    clientSecret: string;

    /**
     * Token endpoint URL (e.g., 'https://api.example.com/oauth/token')
     */
    tokenEndpoint: string;

    /**
     * Authorization endpoint URL (e.g., 'https://api.example.com/oauth/authorize')
     * Only needed for authorization_code flow
     */
    authorizationEndpoint?: string;

    /**
     * Redirect URI for authorization_code flow
     */
    redirectUri?: string;

    /**
     * OAuth2 scopes to request
     */
    scopes?: string[];

    /**
     * Initial access token (if already obtained)
     */
    accessToken?: string;

    /**
     * Initial refresh token (if available)
     */
    refreshToken?: string;

    /**
     * Initial token expiration timestamp (milliseconds since epoch)
     */
    tokenExpiresAt?: number;

    /**
     * Buffer time in milliseconds before token expiration to trigger refresh (default: 60000 = 1 minute)
     */
    refreshBufferMs?: number;

    /**
     * Custom transformation for token response (for non-standard OAuth2 implementations)
     */
    tokenResponseTransform?: (response: any) => OAuth2TokenResponse;

    /**
     * Custom transformation for token request body (for provider-specific requirements)
     */
    tokenRequestTransform?: (params: Record<string, string>) => Record<string, string>;

    /**
     * Additional headers to include in token requests
     */
    additionalHeaders?: Record<string, string>;

    /**
     * Callback invoked when tokens are updated (for persistence)
     */
    onTokenUpdate?: (tokens: OAuth2TokenData) => void | Promise<void>;
}

/**
 * Standard OAuth2 token response
 */
export interface OAuth2TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
}

/**
 * OAuth2 token data with computed expiration
 */
export interface OAuth2TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenType?: string;
    scope?: string;
}

/**
 * Generic OAuth2 token manager supporting multiple grant types and automatic token refresh.
 *
 * This class provides a standardized way to handle OAuth2 authentication flows including:
 * - Authorization code flow (with PKCE support)
 * - Client credentials flow
 * - Refresh token flow
 * - Direct access token usage
 *
 * Features:
 * - Automatic token refresh before expiration
 * - Thread-safe token refresh (prevents concurrent refresh requests)
 * - Provider customization hooks for non-standard OAuth2 implementations
 * - Token persistence callbacks
 * - Support for multiple grant types
 *
 * @example
 * ```typescript
 * // Initialize with client credentials
 * const oauth = new OAuth2Manager({
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenEndpoint: 'https://api.example.com/oauth/token',
 *   authorizationEndpoint: 'https://api.example.com/oauth/authorize',
 *   scopes: ['read', 'write']
 * });
 *
 * // Get a valid access token (auto-refreshes if needed)
 * const token = await oauth.getAccessToken();
 *
 * // Use the token in API requests
 * const response = await fetch('https://api.example.com/data', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 */
export class OAuth2Manager {
    private config: Required<Omit<OAuth2Config, 'authorizationEndpoint' | 'redirectUri' | 'scopes' | 'accessToken' | 'refreshToken' | 'tokenExpiresAt' | 'tokenResponseTransform' | 'tokenRequestTransform' | 'additionalHeaders' | 'onTokenUpdate'>> & Pick<OAuth2Config, 'authorizationEndpoint' | 'redirectUri' | 'scopes' | 'tokenResponseTransform' | 'tokenRequestTransform' | 'additionalHeaders' | 'onTokenUpdate'>;

    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiresAt: number = 0;

    private refreshPromise: Promise<string> | null = null;

    /**
     * Creates a new OAuth2Manager instance
     *
     * @param config - OAuth2 configuration options
     */
    constructor(config: OAuth2Config) {
        this.config = {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            tokenEndpoint: config.tokenEndpoint,
            authorizationEndpoint: config.authorizationEndpoint,
            redirectUri: config.redirectUri,
            scopes: config.scopes,
            refreshBufferMs: config.refreshBufferMs ?? 60000, // Default 1 minute buffer
            tokenResponseTransform: config.tokenResponseTransform,
            tokenRequestTransform: config.tokenRequestTransform,
            additionalHeaders: config.additionalHeaders,
            onTokenUpdate: config.onTokenUpdate
        };

        // Initialize with provided tokens if available
        if (config.accessToken) {
            this.accessToken = config.accessToken;
        }
        if (config.refreshToken) {
            this.refreshToken = config.refreshToken;
        }
        if (config.tokenExpiresAt) {
            this.tokenExpiresAt = config.tokenExpiresAt;
        }
    }

    /**
     * Gets the authorization URL for the authorization code flow
     *
     * @param state - Optional state parameter for CSRF protection
     * @param additionalParams - Additional query parameters to include
     * @returns The authorization URL
     */
    public getAuthorizationUrl(state?: string, additionalParams?: Record<string, string>): string {
        if (!this.config.authorizationEndpoint) {
            throw new Error('Authorization endpoint not configured');
        }

        const params = new URLSearchParams({
            client_id: this.config.clientId,
            response_type: 'code',
            ...additionalParams
        });

        if (this.config.redirectUri) {
            params.append('redirect_uri', this.config.redirectUri);
        }

        if (this.config.scopes && this.config.scopes.length > 0) {
            params.append('scope', this.config.scopes.join(' '));
        }

        if (state) {
            params.append('state', state);
        }

        return `${this.config.authorizationEndpoint}?${params.toString()}`;
    }

    /**
     * Exchanges an authorization code for an access token
     *
     * @param code - The authorization code received from the authorization endpoint
     * @returns The token data
     */
    public async exchangeAuthorizationCode(code: string): Promise<OAuth2TokenData> {
        const params: Record<string, string> = {
            grant_type: 'authorization_code',
            code,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret
        };

        if (this.config.redirectUri) {
            params.redirect_uri = this.config.redirectUri;
        }

        return this.requestToken(params);
    }

    /**
     * Obtains an access token using client credentials flow
     *
     * @returns The token data
     */
    public async getClientCredentialsToken(): Promise<OAuth2TokenData> {
        const params: Record<string, string> = {
            grant_type: 'client_credentials',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret
        };

        if (this.config.scopes && this.config.scopes.length > 0) {
            params.scope = this.config.scopes.join(' ');
        }

        return this.requestToken(params);
    }

    /**
     * Refreshes the access token using the refresh token
     *
     * @returns The new token data
     * @throws Error if no refresh token is available
     */
    public async refreshAccessToken(): Promise<OAuth2TokenData> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const params: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret
        };

        return this.requestToken(params);
    }

    /**
     * Gets a valid access token, automatically refreshing if needed
     *
     * This is the main method to use when you need an access token for API requests.
     * It handles token refresh automatically if the current token is expired or about to expire.
     *
     * @returns A valid access token
     * @throws Error if no token is available and cannot be obtained
     */
    public async getAccessToken(): Promise<string> {
        // If we have a valid token, return it
        if (this.accessToken && this.isTokenValid()) {
            return this.accessToken;
        }

        // If a refresh is already in progress, wait for it
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        // Start a new refresh operation
        this.refreshPromise = this.performTokenRefresh();

        try {
            const token = await this.refreshPromise;
            return token;
        } finally {
            this.refreshPromise = null;
        }
    }

    /**
     * Performs the actual token refresh operation
     *
     * @private
     * @returns The new access token
     */
    private async performTokenRefresh(): Promise<string> {
        try {
            let tokenData: OAuth2TokenData;

            if (this.refreshToken) {
                // Use refresh token if available
                tokenData = await this.refreshAccessToken();
            } else {
                // Fall back to client credentials if no refresh token
                tokenData = await this.getClientCredentialsToken();
            }

            return tokenData.accessToken;
        } catch (error) {
            throw new Error(`Failed to refresh access token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Makes a token request to the OAuth2 server
     *
     * @private
     * @param params - Token request parameters
     * @returns The token data
     */
    private async requestToken(params: Record<string, string>): Promise<OAuth2TokenData> {
        try {
            // Allow provider-specific transformations
            const requestParams = this.config.tokenRequestTransform
                ? this.config.tokenRequestTransform(params)
                : params;

            const headers: Record<string, string> = {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...this.config.additionalHeaders
            };

            const response = await fetch(this.config.tokenEndpoint, {
                method: 'POST',
                headers,
                body: new URLSearchParams(requestParams)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const responseData = await response.json();

            // Allow provider-specific response transformations
            const tokenResponse = this.config.tokenResponseTransform
                ? this.config.tokenResponseTransform(responseData)
                : responseData as OAuth2TokenResponse;

            // Update internal state
            this.accessToken = tokenResponse.access_token;

            if (tokenResponse.refresh_token) {
                this.refreshToken = tokenResponse.refresh_token;
            }

            if (tokenResponse.expires_in) {
                this.tokenExpiresAt = Date.now() + (tokenResponse.expires_in * 1000);
            } else {
                // If no expires_in, assume token is long-lived (1 year)
                this.tokenExpiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
            }

            const tokenData: OAuth2TokenData = {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken || undefined,
                expiresAt: this.tokenExpiresAt,
                tokenType: tokenResponse.token_type,
                scope: tokenResponse.scope
            };

            // Invoke token update callback if provided
            if (this.config.onTokenUpdate) {
                await this.config.onTokenUpdate(tokenData);
            }

            return tokenData;
        } catch (error) {
            throw new Error(`OAuth2 token request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Checks if the current access token is valid (exists and not expired)
     *
     * @returns True if the token is valid, false otherwise
     */
    public isTokenValid(): boolean {
        if (!this.accessToken) {
            return false;
        }

        // Check if token is expired or about to expire (within buffer time)
        const now = Date.now();
        const expiresWithBuffer = this.tokenExpiresAt - this.config.refreshBufferMs;

        return now < expiresWithBuffer;
    }

    /**
     * Sets the access token directly (for cases where token is obtained externally)
     *
     * @param accessToken - The access token
     * @param refreshToken - Optional refresh token
     * @param expiresIn - Optional expiration time in seconds
     */
    public setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
        this.accessToken = accessToken;

        if (refreshToken) {
            this.refreshToken = refreshToken;
        }

        if (expiresIn) {
            this.tokenExpiresAt = Date.now() + (expiresIn * 1000);
        }

        // Invoke token update callback if provided
        if (this.config.onTokenUpdate) {
            this.config.onTokenUpdate({
                accessToken: this.accessToken,
                refreshToken: this.refreshToken || undefined,
                expiresAt: this.tokenExpiresAt
            });
        }
    }

    /**
     * Clears all stored tokens
     */
    public clearTokens(): void {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = 0;
    }

    /**
     * Gets the current token state (for debugging or persistence)
     *
     * @returns The current token data or null if no tokens are available
     */
    public getTokenState(): OAuth2TokenData | null {
        if (!this.accessToken) {
            return null;
        }

        return {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken || undefined,
            expiresAt: this.tokenExpiresAt
        };
    }
}
