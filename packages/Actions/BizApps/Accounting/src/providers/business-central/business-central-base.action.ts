import { RegisterClass } from '@memberjunction/global';
import { BaseAccountingAction } from '../../base/base-accounting-action';
import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';
import { ERP_INTEGRATION } from '../../constants';
import {
    BusinessCentralTokenURL,
    ConfigurationHasConnectorSettings,
    GetBusinessCentralTokenManager,
    JSONObject,
    ParseJSONObject,
    ResolveBusinessCentralConnectorConfig
} from './business-central-connection';

/**
 * Everything a Business Central API call needs, however the connection stores it.
 */
export interface BusinessCentralConnection {
    /** Bearer token for the Business Central API. */
    AccessToken: string;
    /** Entra ID tenant (GUID or domain). */
    TenantId: string;
    /** Business Central environment name. */
    Environment: string;
    /** Business Central company ID. */
    CompanyId: string;
}

/**
 * Base class for all Microsoft Dynamics 365 Business Central actions.
 * Handles BC-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'BusinessCentralBaseAction')
export abstract class BusinessCentralBaseAction extends BaseAccountingAction {
    protected accountingProvider = 'Business Central';
    protected integrationName: string = ERP_INTEGRATION.BusinessCentral;

    /**
     * Business Central API version
     */
    protected apiVersion = 'v2.0';

    /**
     * Makes an authenticated request to Business Central API
     */
    protected async makeBCRequest<T = any>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
        body?: any,
        contextUser?: UserInfo
    ): Promise<T> {
        if (!contextUser) {
            throw new Error('Context user is required for Business Central API calls');
        }

        // Get company ID from action params
        const companyId = this.getParamValue(this.params, 'CompanyID');
        if (!companyId) {
            throw new Error('CompanyID parameter is required');
        }

        // Get the connection: the one named by CompanyIntegrationID, or the company's only active one
        const companyIntegrationId = this.getOptionalStringParam(this.params, 'CompanyIntegrationID');
        const integration = await this.getCompanyIntegration(companyId, contextUser, companyIntegrationId);

        // Token, tenant, environment and BC company, from the connector's settings or the legacy fields
        const connection = await this.resolveBCConnection(integration, companyId, contextUser);

        // Build the full URL
        const baseUrl = await this.getBusinessCentralAPIUrl(integration, connection.TenantId, connection.Environment);
        const fullUrl = `${baseUrl}/companies(${connection.CompanyId})/${endpoint}`;

        // Prepare headers
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${connection.AccessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // Add API version header
        headers['api-version'] = this.apiVersion;

        try {
            const response = await fetch(fullUrl, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Business Central API error: ${response.status} ${response.statusText}`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error) {
                        errorMessage = `Business Central API error: ${errorJson.error.message} (Code: ${errorJson.error.code})`;
                    }
                } catch {
                    errorMessage += ` - ${errorText}`;
                }

                throw new Error(errorMessage);
            }

            // Bound actions such as Microsoft.NAV.post return 204 with an empty body.
            const text = await response.text();
            if (!text || !text.trim()) {
                return undefined as T;
            }
            return JSON.parse(text) as T;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Business Central API request failed: ${error}`);
        }
    }

    /**
     * Resolves the token, tenant, environment and Business Central company for a connection.
     *
     * A connection made by MJ's Integrations connector (it has a `CredentialID`, or a
     * `Configuration` carrying a tenant or environment) is resolved the way the connector does it,
     * with a client-credentials token. Any other connection uses the legacy fields, unchanged.
     */
    protected async resolveBCConnection(
        integration: MJCompanyIntegrationEntity,
        companyId: string,
        contextUser: UserInfo
    ): Promise<BusinessCentralConnection> {
        if (this.usesConnectorAuth(integration)) {
            return this.resolveConnectorBCConnection(integration, contextUser);
        }
        return this.resolveLegacyBCConnection(integration, companyId);
    }

    /**
     * True when the connection carries the connector's settings: a `CredentialID`, or a
     * `Configuration` with a tenant or environment key. A `Configuration` that is not valid JSON
     * is logged and ignored here, so a legacy connection keeps working.
     */
    protected usesConnectorAuth(integration: MJCompanyIntegrationEntity): boolean {
        if (integration.CredentialID) {
            return true;
        }
        try {
            return ConfigurationHasConnectorSettings(
                ParseJSONObject(integration.Configuration, `Configuration of CompanyIntegration ${integration.ID}`)
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`Business Central: ${msg}. Ignoring it and using the legacy connection fields.`);
            return false;
        }
    }

    /**
     * Connector-style resolution: merges `Configuration` with the connection's Credential values,
     * then gets a client-credentials token from Entra ID (cached per CompanyIntegration).
     */
    protected async resolveConnectorBCConnection(
        integration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<BusinessCentralConnection> {
        const configuration = ParseJSONObject(integration.Configuration, `Configuration of CompanyIntegration ${integration.ID}`);
        const credentialValues = integration.CredentialID
            ? await this.loadCredentialValues(integration.CredentialID, integration.ID, contextUser)
            : {};
        const config = ResolveBusinessCentralConnectorConfig(integration, configuration, credentialValues);

        const token = await GetBusinessCentralTokenManager(integration.ID, config).GetAccessToken({
            TokenURL: BusinessCentralTokenURL(config),
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            Scopes: config.Scope,
        }, 'client_credentials');

        return {
            AccessToken: token.AccessToken,
            TenantId: config.TenantId,
            Environment: config.Environment,
            CompanyId: config.CompanyId,
        };
    }

    /**
     * Loads and parses the `Values` JSON of the MJ Credential a connection points at.
     *
     * @throws Error when the Credential cannot be loaded, is inactive, or its Values are not a JSON object.
     */
    protected async loadCredentialValues(
        credentialId: string,
        companyIntegrationId: string,
        contextUser: UserInfo
    ): Promise<JSONObject> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialId);
        if (!loaded) {
            throw new Error(`Credential ${credentialId} for CompanyIntegration ${companyIntegrationId} could not be loaded.`);
        }
        if (!credential.IsActive) {
            throw new Error(`Credential ${credentialId} for CompanyIntegration ${companyIntegrationId} is not active.`);
        }
        return ParseJSONObject(credential.Values, `Values of Credential ${credentialId}`);
    }

    /**
     * The original resolution, kept exactly for connections without the connector's settings:
     * token from `BIZAPPS_BUSINESS_CENTRAL_<companyId>_ACCESS_TOKEN` or `AccessToken`, environment
     * and tenant from `CustomAttribute1`, BC company from `ExternalSystemID`.
     */
    protected async resolveLegacyBCConnection(
        integration: MJCompanyIntegrationEntity,
        companyId: string
    ): Promise<BusinessCentralConnection> {
        // Get OAuth tokens (from env vars or database)
        const { accessToken } = await this.getOAuthTokens(integration);

        // Get Business Central environment and company info
        const environment = integration.CustomAttribute1 || 'production';
        const bcCompanyId = integration.ExternalSystemID;
        const tenantId = integration.CustomAttribute1 || this.getCredentialFromEnv(companyId, 'TENANT_ID');

        if (!bcCompanyId) {
            throw new Error('Business Central Company ID not found. Set in CompanyIntegration.ExternalSystemID');
        }

        if (!tenantId) {
            throw new Error('Tenant ID not found. Set in CompanyIntegration.CustomAttribute1 or environment variable');
        }

        return {
            AccessToken: accessToken,
            TenantId: tenantId,
            Environment: environment,
            CompanyId: bcCompanyId,
        };
    }

    /**
     * Handles Business Central OData queries
     */
    protected async queryBC<T = any>(
        resource: string,
        filters?: string[],
        select?: string[],
        expand?: string[],
        orderBy?: string,
        top?: number,
        contextUser?: UserInfo
    ): Promise<T> {
        const queryParams: string[] = [];
        
        if (filters && filters.length > 0) {
            queryParams.push(`$filter=${filters.join(' and ')}`);
        }
        
        if (select && select.length > 0) {
            queryParams.push(`$select=${select.join(',')}`);
        }
        
        if (expand && expand.length > 0) {
            queryParams.push(`$expand=${expand.join(',')}`);
        }
        
        if (orderBy) {
            queryParams.push(`$orderby=${orderBy}`);
        }
        
        if (top) {
            queryParams.push(`$top=${top}`);
        }

        const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
        return this.makeBCRequest<T>(`${resource}${queryString}`, 'GET', undefined, contextUser);
    }

    /**
     * Formats date for Business Central API (ISO 8601)
     */
    protected formatBCDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    /**
     * Parses Business Central date format
     */
    protected parseBCDate(dateString: string): Date {
        return new Date(dateString);
    }

    /**
     * Maps Business Central account types to standard categories
     */
    protected mapAccountType(bcAccountType: string): string {
        const typeMap: Record<string, string> = {
            'Posting': 'Posting',
            'Heading': 'Header',
            'Total': 'Total',
            'Begin-Total': 'Subtotal',
            'End-Total': 'Subtotal'
        };

        return typeMap[bcAccountType] || 'Other';
    }

    /**
     * Maps Business Central account category to standard type
     */
    protected mapAccountCategory(category: string): string {
        const categoryMap: Record<string, string> = {
            'Assets': 'Asset',
            'Liabilities': 'Liability',
            'Equity': 'Equity',
            'Income': 'Revenue',
            'Cost of Goods Sold': 'Expense',
            'Expense': 'Expense'
        };

        return categoryMap[category] || 'Other';
    }

    /**
     * Gets the appropriate Business Central API URL
     */
    protected async getBusinessCentralAPIUrl(
        integration: MJCompanyIntegrationEntity,
        tenantId: string,
        environment: string
    ): Promise<string> {
        // Default Business Central API URL pattern
        // Format: https://api.businesscentral.dynamics.com/v2.0/{tenant-id}/{environment}/api/v2.0
        return `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environment}/api/${this.apiVersion}`;
    }

    /**
     * Helper to build OData filter expressions
     */
    protected buildFilterExpression(field: string, operator: string, value: any): string {
        if (typeof value === 'string') {
            return `${field} ${operator} '${value}'`;
        } else if (value instanceof Date) {
            return `${field} ${operator} ${value.toISOString()}`;
        } else {
            return `${field} ${operator} ${value}`;
        }
    }

    /**
     * Current action parameters (set by the framework)
     */
    protected params: any;
}