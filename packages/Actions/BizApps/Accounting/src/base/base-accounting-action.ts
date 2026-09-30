import { BaseAction } from '@memberjunction/actions';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { EscapeSQLString, IsValidUUID, MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { IMetadataProvider, Metadata, RunView } from '@memberjunction/core';
import {
    ACCOUNTING_ERP_INTEGRATION_ALIASES,
    CanonicalERPIntegrationName,
    ERPIntegrationNameAliases,
    erpPluginKey
} from '../constants';
import { ResolvedAccountingIntegration } from '../types';

/**
 * Result codes a failed connection lookup reports. The dispatcher returns them as the action's
 * `ResultCode`, so a caller can tell "not configured" from "ambiguous" from "wrong connection".
 */
export type AccountingIntegrationResultCode =
    | 'NO_ACCOUNTING_INTEGRATION'
    | 'AMBIGUOUS_ACCOUNTING_INTEGRATION'
    | 'VALIDATION_ERROR'
    | 'COMPANY_INTEGRATION_NOT_FOUND'
    | 'COMPANY_INTEGRATION_WRONG_COMPANY'
    | 'COMPANY_INTEGRATION_INACTIVE'
    | 'NOT_ACCOUNTING_INTEGRATION';

class AccountingIntegrationError extends Error {
    constructor(message: string, readonly resultCode: AccountingIntegrationResultCode) {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
        super(message);
        this.name = 'AccountingIntegrationError';
    }
}

/** The param a caller uses to name the exact connection a verb should run against. */
const COMPANY_INTEGRATION_ID_PARAM = 'CompanyIntegrationID';

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
     * A param's value as a trimmed, non-empty string, or `undefined` when it is absent or blank.
     */
    protected getOptionalStringParam(params: ActionParam[] | null | undefined, name: string): string | undefined {
        const value: unknown = params?.find(p => p.Name === name)?.Value;
        if (value === null || value === undefined) {
            return undefined;
        }
        const text = String(value).trim();
        return text.length > 0 ? text : undefined;
    }

    /**
     * Common accounting parameters that many actions will need.
     *
     * `CompanyIntegrationID` names the exact `MJ: Company Integrations` row to run against. It is
     * optional: without it the company's single active connection for the provider is used, and a
     * company with more than one is refused rather than guessed at.
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
            },
            {
                Name: COMPANY_INTEGRATION_ID_PARAM,
                Type: 'Input',
                Value: null
            }
        ];
    }

    /**
     * Every Integration name this action's provider may be registered under (canonical first).
     */
    protected get integrationNameAliases(): readonly string[] {
        return ERPIntegrationNameAliases(this.integrationName);
    }

    /**
     * Gets the company's connection for this action's accounting provider.
     *
     * With `companyIntegrationId`, exactly that row is loaded; it must belong to `companyId`, be
     * active, and be one of this provider's Integrations. Without it, the company's active
     * connections for the provider (under any of its Integration names) are searched, and more
     * than one match is an error that names them — the first match is never taken.
     *
     * @param companyId - The MJ Company the action runs for.
     * @param contextUser - The user the lookup runs as.
     * @param companyIntegrationId - Optional ID of the exact connection to use.
     * @returns The connection.
     * @throws Error when no connection, more than one connection, or an unusable connection is found.
     */
    protected async getCompanyIntegration(
        companyId: string,
        contextUser: UserInfo,
        companyIntegrationId?: string
    ): Promise<MJCompanyIntegrationEntity> {
        if (!companyId) {
            throw new Error('CompanyID is required to find the company integration');
        }

        const cached = this._companyIntegration;
        if (cached && UUIDsEqual(cached.CompanyID, companyId)
            && (!companyIntegrationId || UUIDsEqual(cached.ID, companyIntegrationId))) {
            return cached;
        }

        const record = companyIntegrationId
            ? await this.loadCompanyIntegrationForCompany(companyIntegrationId, companyId, this.integrationNameAliases, contextUser)
            : this.requireSingleCompanyIntegration(
                await this.findActiveCompanyIntegrations(companyId, this.integrationNameAliases, contextUser),
                companyId,
                `No active ${this.integrationName} integration found for company ${companyId}. Please configure the integration first.`
            );

        this._companyIntegration = record;
        return record;
    }

    /**
     * The company's active connections whose Integration is one of `integrationNames`.
     *
     * Filters on the view's `Integration` column (the Integration's name). `Integration.Name` is
     * not bindable on SQL Server.
     */
    protected async findActiveCompanyIntegrations(
        companyId: string,
        integrationNames: readonly string[],
        contextUser: UserInfo
    ): Promise<MJCompanyIntegrationEntity[]> {
        if (integrationNames.length === 0) {
            throw new AccountingIntegrationError('No Integration names to search for.', 'NO_ACCOUNTING_INTEGRATION');
        }
        const nameList = integrationNames
            .map(name => `'${EscapeSQLString(name)}'`)
            .join(', ');

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${EscapeSQLString(companyId)}' AND IsActive = 1 AND Integration IN (${nameList})`,
            OrderBy: 'Integration, Name',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new AccountingIntegrationError(
                `Failed to retrieve company integration: ${result.ErrorMessage}`,
                'NO_ACCOUNTING_INTEGRATION'
            );
        }
        return result.Results ?? [];
    }

    /**
     * Returns the only record in `records`; throws when there are none or more than one.
     *
     * @param notFoundMessage - The message for the no-match error.
     * @param selectorHint - What the caller can pass to pick one when several match.
     */
    protected requireSingleCompanyIntegration(
        records: MJCompanyIntegrationEntity[],
        companyId: string,
        notFoundMessage: string,
        selectorHint: string = COMPANY_INTEGRATION_ID_PARAM
    ): MJCompanyIntegrationEntity {
        if (records.length === 0) {
            throw new AccountingIntegrationError(notFoundMessage, 'NO_ACCOUNTING_INTEGRATION');
        }
        if (records.length > 1) {
            const candidates = records
                .map(r => `'${r.Name}' (${r.Integration}, ID ${r.ID})`)
                .join(', ');
            throw new AccountingIntegrationError(
                `Company ${companyId} has ${records.length} active accounting connections: ${candidates}. Pass ${selectorHint} to select one.`,
                'AMBIGUOUS_ACCOUNTING_INTEGRATION'
            );
        }
        return records[0];
    }

    /**
     * Loads one connection by ID and checks that it can be used for `companyId`: it must exist,
     * belong to that company, be active, and be one of `allowedIntegrationNames`.
     *
     * @throws AccountingIntegrationError with a result code naming what is wrong.
     */
    protected async loadCompanyIntegrationForCompany(
        companyIntegrationId: string,
        companyId: string,
        allowedIntegrationNames: readonly string[],
        contextUser: UserInfo
    ): Promise<MJCompanyIntegrationEntity> {
        if (!IsValidUUID(companyIntegrationId)) {
            throw new AccountingIntegrationError(
                `CompanyIntegrationID '${companyIntegrationId}' is not a valid ID.`,
                'VALIDATION_ERROR'
            );
        }

        const md = new Metadata();
        const record = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', contextUser);
        let loaded: boolean;
        try {
            loaded = await record.Load(companyIntegrationId);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new AccountingIntegrationError(
                `Failed to load CompanyIntegration ${companyIntegrationId}: ${msg}`,
                'COMPANY_INTEGRATION_NOT_FOUND'
            );
        }
        if (!loaded) {
            throw new AccountingIntegrationError(
                `CompanyIntegration ${companyIntegrationId} was not found.`,
                'COMPANY_INTEGRATION_NOT_FOUND'
            );
        }

        if (!UUIDsEqual(record.CompanyID, companyId)) {
            throw new AccountingIntegrationError(
                `CompanyIntegration ${companyIntegrationId} does not belong to company ${companyId}.`,
                'COMPANY_INTEGRATION_WRONG_COMPANY'
            );
        }

        if (record.IsActive !== true) {
            throw new AccountingIntegrationError(
                `CompanyIntegration ${companyIntegrationId} ('${record.Name}') is not active.`,
                'COMPANY_INTEGRATION_INACTIVE'
            );
        }

        const integrationName = (record.Integration ?? '').trim().toLowerCase();
        if (!allowedIntegrationNames.some(name => name.toLowerCase() === integrationName)) {
            throw new AccountingIntegrationError(
                `CompanyIntegration ${companyIntegrationId} is a '${record.Integration}' connection, not one of: ${allowedIntegrationNames.join(', ')}.`,
                'NOT_ACCOUNTING_INTEGRATION'
            );
        }

        return record;
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
     * Load the company's accounting CompanyIntegration: its single active connection whose
     * Integration is any known ERP name or alias (or, with `integrationName`, any name of that
     * provider). Does not hard-filter to a single vendor.
     *
     * More than one match is refused (`AMBIGUOUS_ACCOUNTING_INTEGRATION`), even when
     * `integrationName` narrows the search: a company with a production and a sandbox connection
     * to the same ERP must say which one with `CompanyIntegrationID`.
     */
    protected async resolveCompanyAccountingIntegration(
        companyId: string,
        contextUser: UserInfo,
        integrationName?: string
    ): Promise<ResolvedAccountingIntegration> {
        const names = integrationName
            ? ERPIntegrationNameAliases(integrationName)
            : ACCOUNTING_ERP_INTEGRATION_ALIASES;

        const records = await this.findActiveCompanyIntegrations(companyId, names, contextUser);
        const spansProviders = new Set(records.map(r => CanonicalERPIntegrationName(r.Integration) ?? r.Integration)).size > 1;
        const record = this.requireSingleCompanyIntegration(
            records,
            companyId,
            integrationName
                ? `No active '${integrationName}' integration found for company ${companyId}.`
                : `No accounting ERP integration found for company ${companyId}. Configure QuickBooks Online or Microsoft Dynamics 365 Business Central.`,
            !integrationName && spansProviders
                ? `IntegrationName or ${COMPANY_INTEGRATION_ID_PARAM}`
                : COMPANY_INTEGRATION_ID_PARAM
        );
        return this.toResolvedAccountingIntegration(record);
    }

    /**
     * Load the connection the caller named with `CompanyIntegrationID` and check that it is an
     * active accounting connection of `companyId` (and of `integrationName`'s provider, when given).
     */
    protected async resolveExplicitAccountingIntegration(
        companyIntegrationId: string,
        companyId: string,
        contextUser: UserInfo,
        integrationName?: string
    ): Promise<ResolvedAccountingIntegration> {
        const allowedNames = integrationName
            ? ERPIntegrationNameAliases(integrationName)
            : ACCOUNTING_ERP_INTEGRATION_ALIASES;
        const record = await this.loadCompanyIntegrationForCompany(companyIntegrationId, companyId, allowedNames, contextUser);
        return this.toResolvedAccountingIntegration(record);
    }

    private toResolvedAccountingIntegration(record: MJCompanyIntegrationEntity): ResolvedAccountingIntegration {
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
     * Resolve the company's ERP connection and invoke the plugin registered as
     * `${verb}:${canonical provider name}`.
     *
     * The connection is the one named by the `CompanyIntegrationID` param when given, otherwise
     * the company's single active accounting connection. Its ID is then written into the params
     * (added when absent) so the plugin runs against that same connection instead of looking one
     * up again. Plugin.Run → InternalRunAction with the caller's params.
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

        const companyIntegrationId = this.getOptionalStringParam(params.Params, COMPANY_INTEGRATION_ID_PARAM);
        const integrationName = this.getOptionalStringParam(params.Params, 'IntegrationName');

        let integration: ResolvedAccountingIntegration;
        try {
            integration = companyIntegrationId
                ? await this.resolveExplicitAccountingIntegration(companyIntegrationId, companyId, params.ContextUser, integrationName)
                : await this.resolveCompanyAccountingIntegration(companyId, params.ContextUser, integrationName);
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

        const providerName = CanonicalERPIntegrationName(integration.Name) ?? integration.Name;
        const pluginKey = erpPluginKey(verb, providerName);
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, pluginKey);
        if (!resolved.Resolved || !resolved.Instance) {
            return {
                Success: false,
                ResultCode: 'PROVIDER_NOT_REGISTERED',
                Message: `No ERP plugin registered for ${pluginKey}`,
                Params: params.Params
            };
        }

        this.setCompanyIntegrationIDParam(params.Params, integration.CompanyIntegrationID);
        return resolved.Instance.Run(params);
    }

    /**
     * Writes the chosen connection's ID into the `CompanyIntegrationID` param: pushed when the
     * param is absent, filled in when it is present but blank. A caller-supplied value is left as is.
     */
    private setCompanyIntegrationIDParam(params: ActionParam[], companyIntegrationId: string): void {
        const existing = params.find(p => p.Name === COMPANY_INTEGRATION_ID_PARAM);
        if (!existing) {
            params.push({ Name: COMPANY_INTEGRATION_ID_PARAM, Type: 'Input', Value: companyIntegrationId });
            return;
        }
        if (this.getOptionalStringParam([existing], COMPANY_INTEGRATION_ID_PARAM) === undefined) {
            existing.Value = companyIntegrationId;
        }
    }
}
