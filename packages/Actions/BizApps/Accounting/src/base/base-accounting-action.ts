import { BaseAction } from '@memberjunction/actions';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { EscapeSQLString, MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { IMetadataProvider, Metadata, RunView } from '@memberjunction/core';
import { ACCOUNTING_ERP_INTEGRATION_NAMES, erpPluginKey } from '../constants';
import { ResolvedAccountingIntegration } from '../types';

class AccountingIntegrationError extends Error {
    constructor(message: string, readonly resultCode: 'NO_ACCOUNTING_INTEGRATION' | 'AMBIGUOUS_ACCOUNTING_INTEGRATION') {
        super(message);
        this.name = 'AccountingIntegrationError';
    }
}

/**
 * Base class for all accounting-related actions.
 * Provides common functionality and patterns for interacting with accounting systems.
 */
@RegisterClass(BaseAction, 'BaseAccountingAction')
export abstract class BaseAccountingAction extends BaseAction {
    /**
     * The accounting provider this action is designed for (e.g., 'QuickBooks', 'NetSuite', etc.)
     * Can be 'Generic' for provider-agnostic actions
     */
    protected abstract accountingProvider: string;

    /**
     * The integration name to look up in the Integration entity
     */
    protected abstract integrationName: string;

    /**
     * Cached company integration for the current execution
     */
    private _companyIntegration: MJCompanyIntegrationEntity | null = null;

    /**
     * Override of the required abstract method from BaseAction
     */
    protected abstract InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>;

    /**
     * Helper to get a parameter value from the params array
     */
    protected getParamValue(params: ActionParam[], name: string): any {
        const param = params.find(p => p.Name === name);
        return param?.Value;
    }

    /**
     * Common accounting parameters that many actions will need
     */
    protected getCommonAccountingParams(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'FiscalYear',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AccountingPeriod',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IntegrationName',
                Type: 'Input',
                Value: null
            }
        ];
    }

    /**
     * Gets the company integration record for the specified company and accounting system
     */
    protected async getCompanyIntegration(companyId: string, contextUser: UserInfo): Promise<MJCompanyIntegrationEntity> {
        // Check cache first
        if (this._companyIntegration && UUIDsEqual(this._companyIntegration.CompanyID, companyId)) {
            return this._companyIntegration;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${EscapeSQLString(companyId)}' AND Integration.Name = '${EscapeSQLString(this.integrationName)}'`,
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
     * Example: BIZAPPS_QUICKBOOKS_12345_ACCESS_TOKEN
     */
    protected getCredentialFromEnv(companyId: string, credentialType: string): string | undefined {
        const envKey = `BIZAPPS_${this.accountingProvider.toUpperCase().replace(/\s+/g, '_')}_${companyId}_${credentialType.toUpperCase()}`;
        return process.env[envKey];
    }

    /**
     * Gets OAuth tokens - first tries environment variables, then falls back to database
     */
    protected async getOAuthTokens(integration: MJCompanyIntegrationEntity): Promise<{ accessToken: string; refreshToken?: string }> {
        const companyId = integration.CompanyID;
        
        // Try environment variables first
        const envAccessToken = this.getCredentialFromEnv(companyId, 'ACCESS_TOKEN');
        const envRefreshToken = this.getCredentialFromEnv(companyId, 'REFRESH_TOKEN');
        
        if (envAccessToken) {
            return {
                accessToken: envAccessToken,
                refreshToken: envRefreshToken
            };
        }
        
        // Fall back to database (for backwards compatibility)
        if (!integration.AccessToken) {
            throw new Error(`No access token found for ${this.integrationName} integration. Please set environment variable BIZAPPS_${this.accountingProvider.toUpperCase().replace(/\s+/g, '_')}_${companyId}_ACCESS_TOKEN or configure in database.`);
        }

        // Check if token is expired
        if (integration.TokenExpirationDate && new Date(integration.TokenExpirationDate) < new Date()) {
            throw new Error(`Access token for ${this.integrationName} has expired. Please re-authenticate.`);
        }
        
        return {
            accessToken: integration.AccessToken!,
            refreshToken: integration.RefreshToken || undefined
        };
    }

    /**
     * Gets the base URL for API calls from the integration
     */
    protected async getAPIBaseURL(contextUser: UserInfo, provider?: IMetadataProvider): Promise<string> {
        const md = provider ?? new Metadata();
        const integration = await md.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', contextUser);
        
        const rv = new RunView();
        const result = await rv.RunView<MJIntegrationEntity>({
            EntityName: 'MJ: Integrations',
            ExtraFilter: `Name = '${EscapeSQLString(this.integrationName)}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success || !result.Results || result.Results.length === 0) {
            throw new Error(`Integration configuration not found for ${this.integrationName}`);
        }

        return result.Results[0].NavigationBaseURL || '';
    }

    /**
     * Validates common accounting data formats
     */
    protected validateAccountNumber(accountNumber: string): boolean {
        // Basic validation - can be overridden by specific providers
        return /^[0-9\-\.]+$/.test(accountNumber);
    }

    /**
     * Validates journal entry balance (debits must equal credits)
     */
    protected validateJournalEntryBalance(lines: Array<{debit?: number, credit?: number}>): boolean {
        const totalDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        return Math.abs(totalDebits - totalCredits) < 0.01; // Allow for minor rounding differences
    }

    /**
     * Formats currency values consistently
     */
    protected formatCurrency(amount: number, currencyCode: string = 'USD'): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Standard date format for accounting systems (ISO 8601)
     */
    protected formatAccountingDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    /**
     * Helper to build consistent error messages for accounting operations
     */
    protected buildAccountingErrorMessage(operation: string, details: string, systemError?: any): string {
        let message = `Accounting operation failed: ${operation}. ${details}`;
        if (systemError) {
            message += ` System error: ${systemError.message || systemError}`;
        }
        return message;
    }

    /**
     * Load the company's accounting CompanyIntegration (any Integration whose
     * Name is one of the known ERP names). Does not hard-filter to a single vendor.
     */
    protected async resolveCompanyAccountingIntegration(
        companyId: string,
        contextUser: UserInfo,
        integrationName?: string
    ): Promise<ResolvedAccountingIntegration> {
        const names = integrationName
            ? [integrationName]
            : [...ACCOUNTING_ERP_INTEGRATION_NAMES];
        const nameList = names
            .map(name => `'${EscapeSQLString(name)}'`)
            .join(', ');

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${EscapeSQLString(companyId)}' AND IsActive = 1 AND Integration.Name IN (${nameList})`,
            OrderBy: 'Integration',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new AccountingIntegrationError(
                `Failed to retrieve company integration: ${result.ErrorMessage}`,
                'NO_ACCOUNTING_INTEGRATION'
            );
        }

        if (!result.Results || result.Results.length === 0) {
            throw new AccountingIntegrationError(
                integrationName
                    ? `No active '${integrationName}' integration found for company ${companyId}.`
                    : `No accounting ERP integration found for company ${companyId}. Configure QuickBooks Online or Microsoft Dynamics 365 Business Central.`,
                'NO_ACCOUNTING_INTEGRATION'
            );
        }

        if (!integrationName && result.Results.length > 1) {
            const candidates = result.Results
                .map(r => r.Integration)
                .filter((n): n is string => !!n);
            throw new AccountingIntegrationError(
                `Company ${companyId} has ${result.Results.length} active accounting ERP integrations (${candidates.join(', ')}). Pass IntegrationName to select one.`,
                'AMBIGUOUS_ACCOUNTING_INTEGRATION'
            );
        }

        const record = result.Results[0];
        const name = record.Integration;
        if (!name) {
            throw new AccountingIntegrationError(
                `Company integration ${record.ID} has no Integration name; cannot dispatch an ERP plugin.`,
                'NO_ACCOUNTING_INTEGRATION'
            );
        }

        return {
            Name: name,
            CompanyIntegrationID: record.ID,
            CompanyID: record.CompanyID,
            IntegrationID: record.IntegrationID,
        };
    }

    /**
     * Resolve the company's ERP and invoke the plugin registered as `${verb}:${integration.Name}`.
     * Plugin.Run → InternalRunAction with the same params the caller passed to the dispatcher.
     */
    protected async dispatchVerb(verb: string, params: RunActionParams): Promise<ActionResultSimple> {
        const companyId = this.getParamValue(params.Params, 'CompanyID');
        if (!companyId) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'CompanyID is required',
                Params: params.Params
            };
        }

        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: 'Context user is required',
                Params: params.Params
            };
        }

        let integration: ResolvedAccountingIntegration;
        try {
            integration = await this.resolveCompanyAccountingIntegration(
                companyId,
                params.ContextUser,
                this.getParamValue(params.Params, 'IntegrationName')
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = error instanceof AccountingIntegrationError
                ? error.resultCode
                : 'NO_ACCOUNTING_INTEGRATION';
            return {
                Success: false,
                ResultCode: resultCode,
                Message: errorMessage,
                Params: params.Params
            };
        }

        const pluginKey = erpPluginKey(verb, integration.Name);
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, pluginKey);
        if (!resolved.Resolved || !resolved.Instance) {
            return {
                Success: false,
                ResultCode: 'PROVIDER_NOT_REGISTERED',
                Message: `No ERP plugin registered for ${pluginKey}`,
                Params: params.Params
            };
        }

        return resolved.Instance.Run(params);
    }
}