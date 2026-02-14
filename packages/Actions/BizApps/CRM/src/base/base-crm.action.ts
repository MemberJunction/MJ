import { ActionParam } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

/**
 * Base class for all CRM-related actions.
 * Provides common functionality and patterns for interacting with Customer Relationship Management systems.
 */
@RegisterClass(BaseAction, 'BaseCRMAction')
export abstract class BaseCRMAction extends BaseAction {
    /**
     * The CRM provider this action is designed for (e.g., 'HubSpot', 'Salesforce', etc.)
     */
    protected abstract crmProvider: string;

    /**
     * The integration name to look up in the Integration entity
     */
    protected abstract integrationName: string;

    /**
     * Cached company integration for the current execution
     */
    private _companyIntegration: MJCompanyIntegrationEntity | null = null;

    /**
     * Common CRM parameters that many actions will need
     */
    protected getCommonCRMParams(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
            }
        ];
    }

    /**
     * Gets the company integration record for the specified company and CRM
     */
    protected async getCompanyIntegration(companyId: string, contextUser: UserInfo): Promise<MJCompanyIntegrationEntity> {
        // Check cache first
        if (this._companyIntegration && this._companyIntegration.CompanyID === companyId) {
            return this._companyIntegration;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${companyId}' AND Integration.Name = '${this.integrationName}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to retrieve company integration: ${result.ErrorMessage}`);
        }

        if (!result.Results || result.Results.length === 0) {
            throw new Error(`No ${this.integrationName} integration found for company ${companyId}. Please configure the integration first.`);
        }

        this._companyIntegration = result.Results[0];
        return this._companyIntegration;
    }

    /**
     * Gets credentials from environment variables
     * Format: BIZAPPS_{PROVIDER}_{COMPANY_ID}_{CREDENTIAL_TYPE}
     * Example: BIZAPPS_HUBSPOT_12345_API_KEY
     */
    protected getCredentialFromEnv(companyId: string, credentialType: string): string | undefined {
        const envKey = `BIZAPPS_${this.crmProvider.toUpperCase().replace(/\s+/g, '_')}_${companyId}_${credentialType.toUpperCase()}`;
        return process.env[envKey];
    }

    /**
     * Gets API credentials - first tries environment variables, then falls back to database
     */
    protected async getAPICredentials(integration: MJCompanyIntegrationEntity): Promise<{ 
        apiKey?: string; 
        apiSecret?: string; 
        accessToken?: string;
        refreshToken?: string;
        clientId?: string;
        clientSecret?: string;
    }> {
        const companyId = integration.CompanyID;
        
        // Try environment variables first
        const envApiKey = this.getCredentialFromEnv(companyId, 'API_KEY');
        const envApiSecret = this.getCredentialFromEnv(companyId, 'API_SECRET');
        const envAccessToken = this.getCredentialFromEnv(companyId, 'ACCESS_TOKEN');
        const envRefreshToken = this.getCredentialFromEnv(companyId, 'REFRESH_TOKEN');
        const envClientId = this.getCredentialFromEnv(companyId, 'CLIENT_ID');
        const envClientSecret = this.getCredentialFromEnv(companyId, 'CLIENT_SECRET');
        
        if (envApiKey || envAccessToken) {
            return {
                apiKey: envApiKey,
                apiSecret: envApiSecret,
                accessToken: envAccessToken,
                refreshToken: envRefreshToken,
                clientId: envClientId,
                clientSecret: envClientSecret
            };
        }
        
        // Fall back to database (for backwards compatibility)
        if (!integration.APIKey && !integration.AccessToken) {
            throw new Error(`No API credentials found for ${this.integrationName} integration. Please set environment variables or configure in database.`);
        }
        
        return {
            apiKey: integration.APIKey || undefined,
            accessToken: integration.AccessToken || undefined,
            refreshToken: integration.RefreshToken || undefined
        };
    }

    /**
     * Gets the base URL for API calls
     */
    protected async getAPIBaseURL(integration: MJCompanyIntegrationEntity): Promise<string> {
        // Check if custom URL is stored in the integration
        if (integration.CustomAttribute1) {
            return integration.CustomAttribute1;
        }
        
        // Return empty string - derived classes should override this
        return '';
    }

    /**
     * Helper to get parameter value with type safety
     */
    protected getParamValue(params: ActionParam[], paramName: string): any {
        const param = params.find(p => p.Name === paramName);
        return param?.Value;
    }

    /**
     * Standard date format for CRM systems (ISO 8601)
     */
    protected formatCRMDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Parse date from CRM format
     */
    protected parseCRMDate(dateString: string): Date {
        return new Date(dateString);
    }

    /**
     * Format phone numbers to E.164 format if possible
     */
    protected formatPhoneNumber(phone: string): string {
        if (!phone) return '';
        
        // Remove all non-numeric characters
        const cleaned = phone.replace(/\D/g, '');
        
        // If it's a US number (10 digits), format it
        if (cleaned.length === 10) {
            return `+1${cleaned}`;
        }
        
        // If it already has country code
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+${cleaned}`;
        }
        
        // Return cleaned version for other formats
        return cleaned;
    }

    /**
     * Validate email format
     */
    protected isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Helper to build consistent error messages for CRM operations
     */
    protected buildCRMErrorMessage(operation: string, details: string, systemError?: any): string {
        let message = `CRM operation failed: ${operation}. ${details}`;
        if (systemError) {
            message += ` System error: ${systemError.message || systemError}`;
        }
        return message;
    }

    /**
     * Map deal/opportunity stages to common statuses
     */
    protected mapDealStatus(stage: string): 'open' | 'won' | 'lost' | 'unknown' {
        const lowerStage = stage.toLowerCase();
        
        if (lowerStage.includes('won') || lowerStage.includes('closed-won') || lowerStage.includes('success')) {
            return 'won';
        }
        
        if (lowerStage.includes('lost') || lowerStage.includes('closed-lost') || lowerStage.includes('failed')) {
            return 'lost';
        }
        
        if (lowerStage.includes('open') || lowerStage.includes('active') || lowerStage.includes('qualified')) {
            return 'open';
        }
        
        return 'unknown';
    }

    /**
     * Common activity types mapping
     */
    protected mapActivityType(type: string): 'call' | 'email' | 'meeting' | 'task' | 'note' | 'other' {
        const activityMap: Record<string, 'call' | 'email' | 'meeting' | 'task' | 'note' | 'other'> = {
            'call': 'call',
            'phone': 'call',
            'email': 'email',
            'meeting': 'meeting',
            'appointment': 'meeting',
            'task': 'task',
            'todo': 'task',
            'note': 'note',
            'comment': 'note'
        };
        
        return activityMap[type.toLowerCase()] || 'other';
    }
}