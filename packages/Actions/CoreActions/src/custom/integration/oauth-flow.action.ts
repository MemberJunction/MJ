import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios from "axios";
import * as crypto from "crypto";

/**
 * Action that handles OAuth 2.0 authentication flows
 * 
 * @example
 * ```typescript
 * // Authorization Code flow - Step 1: Get auth URL
 * const authResult = await runAction({
 *   ActionName: 'OAuth Flow',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'GetAuthorizationURL'
 *   }, {
 *     Name: 'Provider',
 *     Value: 'github'
 *   }, {
 *     Name: 'ClientID',
 *     Value: 'your-client-id'
 *   }, {
 *     Name: 'RedirectURI',
 *     Value: 'http://localhost:3000/callback'
 *   }, {
 *     Name: 'Scopes',
 *     Value: ['user', 'repo']
 *   }]
 * });
 * 
 * // Step 2: Exchange code for token
 * const tokenResult = await runAction({
 *   ActionName: 'OAuth Flow',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'ExchangeCodeForToken'
 *   }, {
 *     Name: 'Provider',
 *     Value: 'github'
 *   }, {
 *     Name: 'ClientID',
 *     Value: 'your-client-id'
 *   }, {
 *     Name: 'ClientSecret',
 *     Value: 'your-client-secret'
 *   }, {
 *     Name: 'Code',
 *     Value: 'auth-code-from-callback'
 *   }, {
 *     Name: 'RedirectURI',
 *     Value: 'http://localhost:3000/callback'
 *   }]
 * });
 * 
 * // Client Credentials flow
 * const tokenResult = await runAction({
 *   ActionName: 'OAuth Flow',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'ClientCredentials'
 *   }, {
 *     Name: 'Provider',
 *     Value: 'custom'
 *   }, {
 *     Name: 'TokenEndpoint',
 *     Value: 'https://api.example.com/oauth/token'
 *   }, {
 *     Name: 'ClientID',
 *     Value: 'your-client-id'
 *   }, {
 *     Name: 'ClientSecret',
 *     Value: 'your-client-secret'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "OAuth Flow")
export class OAuthFlowAction extends BaseAction {
    
    // Common OAuth provider configurations
    private readonly providers: Record<string, any> = {
        github: {
            authorizationEndpoint: 'https://github.com/login/oauth/authorize',
            tokenEndpoint: 'https://github.com/login/oauth/access_token',
            scopeSeparator: ' '
        },
        google: {
            authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
            scopeSeparator: ' '
        },
        microsoft: {
            authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            scopeSeparator: ' '
        },
        linkedin: {
            authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
            tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
            scopeSeparator: ' '
        }
    };

    /**
     * Handles OAuth 2.0 authentication flows
     * 
     * @param params - The action parameters containing:
     *   - Operation: "GetAuthorizationURL" | "ExchangeCodeForToken" | "RefreshToken" | "ClientCredentials" (required)
     *   - Provider: Provider name or "custom" (required)
     *   - ClientID: OAuth client ID (required)
     *   - ClientSecret: OAuth client secret (required for token operations)
     *   - RedirectURI: Callback URL (required for auth code flow)
     *   - Scopes: Array of scopes (optional)
     *   - State: State parameter for CSRF protection (optional, auto-generated if not provided)
     *   - Code: Authorization code (for ExchangeCodeForToken)
     *   - RefreshToken: Refresh token (for RefreshToken operation)
     *   - AuthorizationEndpoint: Custom auth endpoint (for custom provider)
     *   - TokenEndpoint: Custom token endpoint (for custom provider)
     *   - ScopeSeparator: Custom scope separator (default: space)
     * 
     * @returns OAuth flow result (authorization URL or tokens)
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const operation = this.getParamValue(params, 'operation');
            
            if (!operation) {
                return {
                    Success: false,
                    Message: "Operation parameter is required",
                    ResultCode: "MISSING_OPERATION"
                };
            }

            switch (operation.toLowerCase()) {
                case 'getauthorizationurl':
                    return await this.getAuthorizationURL(params);
                case 'exchangecodefortoken':
                    return await this.exchangeCodeForToken(params);
                case 'refreshtoken':
                    return await this.refreshToken(params);
                case 'clientcredentials':
                    return await this.clientCredentials(params);
                default:
                    return {
                        Success: false,
                        Message: `Invalid operation: ${operation}. Must be GetAuthorizationURL, ExchangeCodeForToken, RefreshToken, or ClientCredentials`,
                        ResultCode: "INVALID_OPERATION"
                    };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `OAuth flow failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "OAUTH_FAILED"
            };
        }
    }

    /**
     * Generate authorization URL
     */
    private async getAuthorizationURL(params: RunActionParams): Promise<ActionResultSimple> {
        const provider = this.getParamValue(params, 'provider');
        const clientId = this.getParamValue(params, 'clientid');
        const redirectUri = this.getParamValue(params, 'redirecturi');
        const scopes = this.getParamValue(params, 'scopes');
        let state = this.getParamValue(params, 'state');
        const responseType = this.getParamValue(params, 'responsetype') || 'code';

        // Validate required parameters
        if (!provider) {
            return {
                Success: false,
                Message: "Provider parameter is required",
                ResultCode: "MISSING_PROVIDER"
            };
        }

        if (!clientId) {
            return {
                Success: false,
                Message: "ClientID parameter is required",
                ResultCode: "MISSING_CLIENT_ID"
            };
        }

        if (!redirectUri) {
            return {
                Success: false,
                Message: "RedirectURI parameter is required",
                ResultCode: "MISSING_REDIRECT_URI"
            };
        }

        // Get provider config
        const providerConfig = this.getProviderConfig(provider, params);
        if (!providerConfig.authorizationEndpoint) {
            return {
                Success: false,
                Message: "Authorization endpoint not configured for provider",
                ResultCode: "MISSING_AUTH_ENDPOINT"
            };
        }

        // Generate state if not provided
        if (!state) {
            state = crypto.randomBytes(16).toString('hex');
        }

        // Build authorization URL
        const authUrl = new URL(providerConfig.authorizationEndpoint);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', responseType);
        authUrl.searchParams.set('state', state);

        // Add scopes if provided
        if (scopes) {
            const scopeString = Array.isArray(scopes) 
                ? scopes.join(providerConfig.scopeSeparator || ' ')
                : scopes;
            authUrl.searchParams.set('scope', scopeString);
        }

        // Add provider-specific parameters
        this.addProviderSpecificParams(authUrl, provider, params);

        // Add output parameters
        params.Params.push({
            Name: 'AuthorizationURL',
            Type: 'Output',
            Value: authUrl.toString()
        });

        params.Params.push({
            Name: 'State',
            Type: 'Output',
            Value: state
        });

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify({
                message: "Authorization URL generated successfully",
                authorizationUrl: authUrl.toString(),
                state: state,
                provider: provider
            }, null, 2)
        };
    }

    /**
     * Exchange authorization code for tokens
     */
    private async exchangeCodeForToken(params: RunActionParams): Promise<ActionResultSimple> {
        const provider = this.getParamValue(params, 'provider');
        const clientId = this.getParamValue(params, 'clientid');
        const clientSecret = this.getParamValue(params, 'clientsecret');
        const code = this.getParamValue(params, 'code');
        const redirectUri = this.getParamValue(params, 'redirecturi');

        // Validate required parameters
        if (!provider || !clientId || !clientSecret || !code) {
            return {
                Success: false,
                Message: "Provider, ClientID, ClientSecret, and Code are required",
                ResultCode: "MISSING_PARAMETERS"
            };
        }

        // Get provider config
        const providerConfig = this.getProviderConfig(provider, params);
        if (!providerConfig.tokenEndpoint) {
            return {
                Success: false,
                Message: "Token endpoint not configured for provider",
                ResultCode: "MISSING_TOKEN_ENDPOINT"
            };
        }

        // Prepare token request
        const tokenData: any = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code
        };

        if (redirectUri) {
            tokenData.redirect_uri = redirectUri;
        }

        // Make token request
        try {
            const response = await axios.post(providerConfig.tokenEndpoint, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                transformRequest: [(data) => {
                    return Object.entries(data)
                        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
                        .join('&');
                }]
            });

            const tokens = response.data;

            // Add output parameters
            params.Params.push({
                Name: 'AccessToken',
                Type: 'Output',
                Value: tokens.access_token
            });

            if (tokens.refresh_token) {
                params.Params.push({
                    Name: 'RefreshToken',
                    Type: 'Output',
                    Value: tokens.refresh_token
                });
            }

            if (tokens.expires_in) {
                params.Params.push({
                    Name: 'ExpiresIn',
                    Type: 'Output',
                    Value: tokens.expires_in
                });
            }

            if (tokens.token_type) {
                params.Params.push({
                    Name: 'TokenType',
                    Type: 'Output',
                    Value: tokens.token_type
                });
            }

            if (tokens.scope) {
                params.Params.push({
                    Name: 'Scope',
                    Type: 'Output',
                    Value: tokens.scope
                });
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "Token exchange successful",
                    tokenType: tokens.token_type || 'Bearer',
                    expiresIn: tokens.expires_in,
                    scope: tokens.scope,
                    hasRefreshToken: !!tokens.refresh_token
                }, null, 2)
            };

        } catch (error: any) {
            const errorMessage = error.response?.data?.error_description || 
                               error.response?.data?.error || 
                               error.message;
            return {
                Success: false,
                Message: `Token exchange failed: ${errorMessage}`,
                ResultCode: "TOKEN_EXCHANGE_FAILED"
            };
        }
    }

    /**
     * Refresh access token
     */
    private async refreshToken(params: RunActionParams): Promise<ActionResultSimple> {
        const provider = this.getParamValue(params, 'provider');
        const clientId = this.getParamValue(params, 'clientid');
        const clientSecret = this.getParamValue(params, 'clientsecret');
        const refreshToken = this.getParamValue(params, 'refreshtoken');

        // Validate required parameters
        if (!provider || !clientId || !clientSecret || !refreshToken) {
            return {
                Success: false,
                Message: "Provider, ClientID, ClientSecret, and RefreshToken are required",
                ResultCode: "MISSING_PARAMETERS"
            };
        }

        // Get provider config
        const providerConfig = this.getProviderConfig(provider, params);
        if (!providerConfig.tokenEndpoint) {
            return {
                Success: false,
                Message: "Token endpoint not configured for provider",
                ResultCode: "MISSING_TOKEN_ENDPOINT"
            };
        }

        // Prepare refresh request
        const tokenData = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };

        // Make refresh request
        try {
            const response = await axios.post(providerConfig.tokenEndpoint, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                transformRequest: [(data) => {
                    return Object.entries(data)
                        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
                        .join('&');
                }]
            });

            const tokens = response.data;

            // Add output parameters
            params.Params.push({
                Name: 'AccessToken',
                Type: 'Output',
                Value: tokens.access_token
            });

            if (tokens.refresh_token) {
                params.Params.push({
                    Name: 'RefreshToken',
                    Type: 'Output',
                    Value: tokens.refresh_token
                });
            }

            if (tokens.expires_in) {
                params.Params.push({
                    Name: 'ExpiresIn',
                    Type: 'Output',
                    Value: tokens.expires_in
                });
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "Token refresh successful",
                    expiresIn: tokens.expires_in,
                    newRefreshToken: !!tokens.refresh_token
                }, null, 2)
            };

        } catch (error: any) {
            const errorMessage = error.response?.data?.error_description || 
                               error.response?.data?.error || 
                               error.message;
            return {
                Success: false,
                Message: `Token refresh failed: ${errorMessage}`,
                ResultCode: "TOKEN_REFRESH_FAILED"
            };
        }
    }

    /**
     * Client credentials flow
     */
    private async clientCredentials(params: RunActionParams): Promise<ActionResultSimple> {
        const provider = this.getParamValue(params, 'provider');
        const clientId = this.getParamValue(params, 'clientid');
        const clientSecret = this.getParamValue(params, 'clientsecret');
        const scopes = this.getParamValue(params, 'scopes');

        // Validate required parameters
        if (!provider || !clientId || !clientSecret) {
            return {
                Success: false,
                Message: "Provider, ClientID, and ClientSecret are required",
                ResultCode: "MISSING_PARAMETERS"
            };
        }

        // Get provider config
        const providerConfig = this.getProviderConfig(provider, params);
        if (!providerConfig.tokenEndpoint) {
            return {
                Success: false,
                Message: "Token endpoint not configured for provider",
                ResultCode: "MISSING_TOKEN_ENDPOINT"
            };
        }

        // Prepare token request
        const tokenData: any = {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        };

        if (scopes) {
            const scopeString = Array.isArray(scopes) 
                ? scopes.join(providerConfig.scopeSeparator || ' ')
                : scopes;
            tokenData.scope = scopeString;
        }

        // Make token request
        try {
            const response = await axios.post(providerConfig.tokenEndpoint, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                transformRequest: [(data) => {
                    return Object.entries(data)
                        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
                        .join('&');
                }]
            });

            const tokens = response.data;

            // Add output parameters
            params.Params.push({
                Name: 'AccessToken',
                Type: 'Output',
                Value: tokens.access_token
            });

            if (tokens.expires_in) {
                params.Params.push({
                    Name: 'ExpiresIn',
                    Type: 'Output',
                    Value: tokens.expires_in
                });
            }

            if (tokens.token_type) {
                params.Params.push({
                    Name: 'TokenType',
                    Type: 'Output',
                    Value: tokens.token_type
                });
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "Client credentials flow successful",
                    tokenType: tokens.token_type || 'Bearer',
                    expiresIn: tokens.expires_in,
                    scope: tokens.scope
                }, null, 2)
            };

        } catch (error: any) {
            const errorMessage = error.response?.data?.error_description || 
                               error.response?.data?.error || 
                               error.message;
            return {
                Success: false,
                Message: `Client credentials flow failed: ${errorMessage}`,
                ResultCode: "CLIENT_CREDENTIALS_FAILED"
            };
        }
    }

    /**
     * Get provider configuration
     */
    private getProviderConfig(provider: string, params: RunActionParams): any {
        if (provider.toLowerCase() === 'custom') {
            return {
                authorizationEndpoint: this.getParamValue(params, 'authorizationendpoint'),
                tokenEndpoint: this.getParamValue(params, 'tokenendpoint'),
                scopeSeparator: this.getParamValue(params, 'scopeseparator') || ' '
            };
        }

        return this.providers[provider.toLowerCase()] || {};
    }

    /**
     * Add provider-specific parameters to authorization URL
     */
    private addProviderSpecificParams(url: URL, provider: string, params: RunActionParams): void {
        switch (provider.toLowerCase()) {
            case 'google':
                // Add access_type for refresh token
                const accessType = this.getParamValue(params, 'accesstype');
                if (accessType) {
                    url.searchParams.set('access_type', accessType);
                }
                // Add prompt for re-consent
                const prompt = this.getParamValue(params, 'prompt');
                if (prompt) {
                    url.searchParams.set('prompt', prompt);
                }
                break;

            case 'github':
                // Add login for re-authentication
                const login = this.getParamValue(params, 'login');
                if (login) {
                    url.searchParams.set('login', login);
                }
                break;

            case 'microsoft':
                // Add prompt for behavior
                const msPrompt = this.getParamValue(params, 'prompt');
                if (msPrompt) {
                    url.searchParams.set('prompt', msPrompt);
                }
                break;
        }
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}