import { BaseAction } from './BaseAction';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { MJCompanyIntegrationEntity, MJCompanyIntegrationEntityType, MJIntegrationEntity } from '@memberjunction/core-entities';
import { IMetadataProvider, Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { ActionResultSimple } from '@memberjunction/actions-base';

/**
 * Base class for actions that require OAuth authentication.
 * Provides common OAuth token management functionality including retrieval,
 * refresh, and error handling.
 *
 * **Multi-provider note:** OAuth actions run server-side and must respect the per-request
 * provider passed in `RunActionParams.Provider`. Subclasses pass their `params` to
 * {@link initializeOAuth}; the base class stores the resolved provider on `this` so all
 * subsequent entity loads (`_companyIntegration.Save()`, etc.) bind to the same connection.
 */
export abstract class BaseOAuthAction extends BaseAction {
    /**
     * The metadata provider used for entity operations on this action instance. Set by
     * `initializeOAuth` from `params.Provider`, falling back to the global default when no
     * provider was supplied (e.g., legacy callers or non-server contexts).
     */
    private _provider?: IMetadataProvider;
    private get providerToUse(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    protected _companyIntegration: MJCompanyIntegrationEntity | null = null;
    protected _integration: MJIntegrationEntity | null = null;

    /**
     * OAuth-specific parameters that all OAuth actions should include
     */
    protected get oauthParams(): ActionParam[] {
        return [
            {
                Name: 'CompanyIntegrationID',
                Type: 'Input' as const,
                Value: null
                            }
        ];
    }

    /**
     * Initialize OAuth connection by loading integration details.
     *
     * @param companyIntegrationId - the MJ Company Integration ID to load
     * @param params - the running action's params; `params.Provider` is captured so all
     *   subsequent entity loads/saves bind to the per-request provider (multi-tenant
     *   correctness). When omitted, falls back to the global default Metadata provider.
     */
    protected async initializeOAuth(
        companyIntegrationId: string,
        params?: RunActionParams
    ): Promise<boolean> {
        try {
            // Capture the per-request provider for this action instance — every subsequent
            // entity operation (load + save) routes through it instead of the global default.
            this._provider = params?.Provider ?? this._provider;

            // Load company integration
            const ci = await this.providerToUse.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', params?.ContextUser);
            if (!ci) {
                throw new Error('Failed to create CompanyIntegration entity object');
            }

            if (!await ci.Load(companyIntegrationId)) {
                throw new Error(`Company integration not found: ${companyIntegrationId}`);
            }

            this._companyIntegration = ci;

            // Load integration details
            const integration = await this.providerToUse.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', params?.ContextUser);
            if (!integration || !await integration.Load(ci.IntegrationID)) {
                throw new Error(`Integration not found: ${ci.IntegrationID}`);
            }

            this._integration = integration;

            // Check if token is expired
            if (this.isTokenExpired()) {
                await this.refreshAccessToken();
            }

            return true;
        } catch (error) {
            LogError(`Failed to initialize OAuth: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the current access token
     */
    protected getAccessToken(): string | null {
        return this._companyIntegration?.AccessToken || null;
    }

    /**
     * Get the refresh token
     */
    protected getRefreshToken(): string | null {
        return this._companyIntegration?.RefreshToken || null;
    }

    /**
     * Check if the current token is expired
     */
    protected isTokenExpired(): boolean {
        if (!this._companyIntegration?.TokenExpirationDate) {
            return false; // No expiration date means token doesn't expire
        }

        const now = new Date();
        const expiration = new Date(this._companyIntegration.TokenExpirationDate);
        
        // Consider token expired if it expires in the next 5 minutes
        const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        return (expiration.getTime() - bufferTime) <= now.getTime();
    }

    /**
     * Refresh the access token using the refresh token.
     * Must be implemented by platform-specific subclasses.
     */
    protected abstract refreshAccessToken(): Promise<void>;

    /**
     * Make an authenticated API request with automatic retry on auth failure
     */
    protected async makeAuthenticatedRequest<T>(
        requestFn: (token: string) => Promise<T>,
        retryOnAuthFailure: boolean = true
    ): Promise<T> {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('No access token available');
        }

        try {
            return await requestFn(token);
        } catch (error) {
            // Check if error is due to invalid/expired token
            if (retryOnAuthFailure && this.isAuthError(error)) {
                LogStatus('Token appears invalid, attempting refresh...');
                await this.refreshAccessToken();
                
                const newToken = this.getAccessToken();
                if (!newToken) {
                    throw new Error('Failed to refresh access token');
                }

                // Retry with new token
                return await requestFn(newToken);
            }
            throw error;
        }
    }

    /**
     * Determine if an error is an authentication error.
     * Can be overridden by subclasses for platform-specific error detection.
     */
    protected isAuthError(error: any): boolean {
        // Common OAuth error indicators
        const authErrorPatterns = [
            'unauthorized',
            'invalid_token',
            'expired_token',
            'invalid_grant',
            '401',
            'forbidden',
            'authentication'
        ];

        const errorMessage = error?.message?.toLowerCase() || '';
        const errorCode = error?.code?.toLowerCase() || '';
        const statusCode = error?.response?.status || error?.statusCode;

        return statusCode === 401 || 
               statusCode === 403 ||
               authErrorPatterns.some(pattern => 
                   errorMessage.includes(pattern) || errorCode.includes(pattern)
               );
    }

    /**
     * Update stored tokens after refresh
     */
    protected async updateStoredTokens(
        accessToken: string,
        refreshToken?: string,
        expiresIn?: number
    ): Promise<void> {
        if (!this._companyIntegration) {
            throw new Error('Company integration not initialized');
        }

        this._companyIntegration.AccessToken = accessToken;
        
        if (refreshToken) {
            this._companyIntegration.RefreshToken = refreshToken;
        }

        if (expiresIn) {
            const expirationDate = new Date();
            expirationDate.setSeconds(expirationDate.getSeconds() + expiresIn);
            this._companyIntegration.TokenExpirationDate = expirationDate;
        }

        await this._companyIntegration.Save();
    }

    /**
     * Get custom attributes from company integration
     */
    protected getCustomAttribute(attributeNumber: 1 | 2 | 3 | 4 | 5): string | null {
        if (!this._companyIntegration) return null;
        
        const attributeKey = `CustomAttribute${attributeNumber}` as keyof MJCompanyIntegrationEntity;
        return this._companyIntegration[attributeKey] as string || null;
    }

    /**
     * Set custom attributes in company integration
     */
    protected async setCustomAttribute(
        attributeNumber: 1 | 2 | 3 | 4 | 5,
        value: string
    ): Promise<void> {
        if (!this._companyIntegration) {
            throw new Error('Company integration not initialized');
        }

        const attributeKey = `CustomAttribute${attributeNumber}` as keyof MJCompanyIntegrationEntity;
        (this._companyIntegration as any)[attributeKey] = value;
        await this._companyIntegration.Save();
    }

    /**
     * Handle OAuth-specific errors
     */
    protected handleOAuthError(error: any): ActionResultSimple {
        if (this.isAuthError(error)) {
            return {
                Success: false,
                Message: 'Authentication failed. Token may be expired or revoked.',
                ResultCode: 'INVALID_TOKEN'
            };
        }

        // Let base class handle other errors
        return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
    }
}