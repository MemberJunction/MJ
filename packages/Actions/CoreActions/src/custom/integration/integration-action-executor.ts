import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import {
    ConnectorFactory,
    BaseIntegrationConnector,
} from '@memberjunction/integration-engine';
import type {
    ExternalRecord,
    CRUDResult,
    SearchResult,
    ListResult,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    SearchContext,
    ListContext,
} from '@memberjunction/integration-engine';
import { Metadata, RunView } from '@memberjunction/core';
import type { MJIntegrationEntity, MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

// ─── Config Types ────────────────────────────────────────────────────

/** CRUD verb that an integration action can dispatch to */
type IntegrationActionVerb = 'Get' | 'Create' | 'Update' | 'Delete' | 'Search' | 'List';

/**
 * JSON structure stored in Action.Config_ for integration-backed actions.
 * The action generation CLI populates this when creating action metadata.
 */
interface IntegrationActionConfig {
    /** Name of the Integration entity (e.g., "HubSpot", "Salesforce") */
    IntegrationName: string;
    /** External object name in the integration (e.g., "contacts", "deals") */
    ObjectName: string;
    /** CRUD verb to dispatch */
    Verb: IntegrationActionVerb;
}

// ─── IntegrationActionExecutor ───────────────────────────────────────

/**
 * Single shared DriverClass for all auto-generated integration actions.
 *
 * Every integration action uses `DriverClass='IntegrationActionExecutor'` and
 * stores its routing info in the Action.Config_ JSON field. At runtime this
 * executor:
 *
 *   1. Parses Config JSON from the Action entity
 *   2. Resolves the correct connector via ConnectorFactory
 *   3. Resolves the CompanyIntegration for the current user/company
 *   4. Maps ActionParams → connector CRUD context (field attributes)
 *   5. Dispatches to the appropriate connector method (Get/Create/Update/Delete/Search/List)
 *   6. Maps results back to output ActionParams
 */
@RegisterClass(BaseAction, 'IntegrationActionExecutor')
export class IntegrationActionExecutor extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Parse config
            const config = this.ParseConfig(params);

            // 2. Resolve connector
            const connector = await this.ResolveConnector(config.IntegrationName, params);

            // 3. Resolve CompanyIntegration
            const companyIntegration = await this.ResolveCompanyIntegration(
                config.IntegrationName, params
            );

            // 4. Dispatch to verb handler
            const result = await this.DispatchVerb(
                config, connector, companyIntegration, params
            );

            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: 'EXECUTOR_ERROR',
                Message: message,
                Params: params.Params,
            } as ActionResultSimple;
        }
    }

    // ─── Config Parsing ──────────────────────────────────────────────

    private ParseConfig(params: RunActionParams): IntegrationActionConfig {
        const configJson = params.Action?.Config_;
        if (!configJson) {
            throw new Error('Action.Config_ is required for IntegrationActionExecutor');
        }

        const parsed = JSON.parse(configJson) as Record<string, unknown>;
        const integrationName = parsed['IntegrationName'] as string | undefined;
        const objectName = parsed['ObjectName'] as string | undefined;
        const verb = parsed['Verb'] as IntegrationActionVerb | undefined;

        if (!integrationName || !objectName || !verb) {
            throw new Error(
                `Invalid Action.Config_ — required fields: IntegrationName, ObjectName, Verb. ` +
                `Got: ${configJson}`
            );
        }

        return { IntegrationName: integrationName, ObjectName: objectName, Verb: verb };
    }

    // ─── Connector Resolution ────────────────────────────────────────

    private async ResolveConnector(
        integrationName: string,
        params: RunActionParams
    ): Promise<BaseIntegrationConnector> {
        const integration = await this.LoadIntegrationEntity(integrationName, params);
        return ConnectorFactory.Resolve(integration);
    }

    private async LoadIntegrationEntity(
        integrationName: string,
        params: RunActionParams
    ): Promise<MJIntegrationEntity> {
        const rv = new RunView();
        const result = await rv.RunView<MJIntegrationEntity>({
            EntityName: 'Integrations',
            ExtraFilter: `Name='${integrationName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, params.ContextUser);

        if (!result.Success || result.Results.length === 0) {
            throw new Error(`Integration "${integrationName}" not found`);
        }

        return result.Results[0];
    }

    // ─── CompanyIntegration Resolution ───────────────────────────────

    private async ResolveCompanyIntegration(
        integrationName: string,
        params: RunActionParams
    ): Promise<MJCompanyIntegrationEntity> {
        // Check if CompanyIntegrationID was passed as an ActionParam
        const ciIdParam = this.GetParamValue(params.Params, 'CompanyIntegrationID');
        if (ciIdParam) {
            return this.LoadCompanyIntegrationByID(ciIdParam, params);
        }

        // Otherwise look up the first active CompanyIntegration for this integration name
        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'Company Integrations',
            ExtraFilter: `Integration='${integrationName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, params.ContextUser);

        if (!result.Success || result.Results.length === 0) {
            throw new Error(
                `No CompanyIntegration found for integration "${integrationName}". ` +
                `Ensure a CompanyIntegration record exists and is accessible to the current user.`
            );
        }

        return result.Results[0];
    }

    private async LoadCompanyIntegrationByID(
        id: string,
        params: RunActionParams
    ): Promise<MJCompanyIntegrationEntity> {
        const md = new Metadata();
        const entity = await md.GetEntityObject<MJCompanyIntegrationEntity>(
            'Company Integrations', params.ContextUser
        );
        const loaded = await entity.Load(id);
        if (!loaded) {
            throw new Error(`CompanyIntegration with ID "${id}" not found`);
        }
        return entity;
    }

    // ─── Verb Dispatch ───────────────────────────────────────────────

    private async DispatchVerb(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        switch (config.Verb) {
            case 'Get':
                return this.HandleGet(config, connector, companyIntegration, params);
            case 'Create':
                return this.HandleCreate(config, connector, companyIntegration, params);
            case 'Update':
                return this.HandleUpdate(config, connector, companyIntegration, params);
            case 'Delete':
                return this.HandleDelete(config, connector, companyIntegration, params);
            case 'Search':
                return this.HandleSearch(config, connector, companyIntegration, params);
            case 'List':
                return this.HandleList(config, connector, companyIntegration, params);
            default:
                throw new Error(`Unsupported verb: ${config.Verb}`);
        }
    }

    // ─── Get ─────────────────────────────────────────────────────────

    private async HandleGet(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        const externalID = this.GetRequiredParam(params.Params, 'ExternalID');

        const ctx: GetRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
        };

        const record = await connector.GetRecord(ctx);
        if (!record) {
            return this.BuildResult(false, 'NOT_FOUND', `Record ${externalID} not found`, params.Params);
        }

        this.SetOutputParam(params.Params, 'Record', record.Fields);
        this.SetOutputParam(params.Params, 'ExternalID', record.ExternalID);
        return this.BuildResult(true, 'SUCCESS', `Retrieved ${config.ObjectName} ${externalID}`, params.Params);
    }

    // ─── Create ──────────────────────────────────────────────────────

    private async HandleCreate(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsCreate) {
            return this.BuildResult(false, 'NOT_SUPPORTED', `Create not supported for ${config.IntegrationName}`, params.Params);
        }

        const attributes = this.CollectInputAttributes(params.Params);
        const ctx: CreateRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            Attributes: attributes,
        };

        const result = await connector.CreateRecord(ctx);
        return this.CRUDResultToActionResult(result, 'Create', config.ObjectName, params.Params);
    }

    // ─── Update ──────────────────────────────────────────────────────

    private async HandleUpdate(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsUpdate) {
            return this.BuildResult(false, 'NOT_SUPPORTED', `Update not supported for ${config.IntegrationName}`, params.Params);
        }

        const externalID = this.GetRequiredParam(params.Params, 'ExternalID');
        const attributes = this.CollectInputAttributes(params.Params);
        const ctx: UpdateRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
            Attributes: attributes,
        };

        const result = await connector.UpdateRecord(ctx);
        return this.CRUDResultToActionResult(result, 'Update', config.ObjectName, params.Params);
    }

    // ─── Delete ──────────────────────────────────────────────────────

    private async HandleDelete(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsDelete) {
            return this.BuildResult(false, 'NOT_SUPPORTED', `Delete not supported for ${config.IntegrationName}`, params.Params);
        }

        const externalID = this.GetRequiredParam(params.Params, 'ExternalID');
        const ctx: DeleteRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
        };

        const result = await connector.DeleteRecord(ctx);
        return this.CRUDResultToActionResult(result, 'Delete', config.ObjectName, params.Params);
    }

    // ─── Search ──────────────────────────────────────────────────────

    private async HandleSearch(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsSearch) {
            return this.BuildResult(false, 'NOT_SUPPORTED', `Search not supported for ${config.IntegrationName}`, params.Params);
        }

        const filters = this.CollectInputAttributes(params.Params) as Record<string, string>;
        const pageSize = this.GetOptionalNumericParam(params.Params, 'PageSize');
        const page = this.GetOptionalNumericParam(params.Params, 'Page');
        const sort = this.GetParamValue(params.Params, 'Sort');

        const ctx: SearchContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            Filters: filters,
            PageSize: pageSize,
            Page: page,
            Sort: sort ?? undefined,
        };

        const result: SearchResult = await connector.SearchRecords(ctx);
        this.SetOutputParam(params.Params, 'Records', result.Records.map(r => r.Fields));
        this.SetOutputParam(params.Params, 'TotalCount', result.TotalCount);
        this.SetOutputParam(params.Params, 'HasMore', result.HasMore);

        return this.BuildResult(
            true, 'SUCCESS',
            `Found ${result.TotalCount} ${config.ObjectName} record(s)`,
            params.Params
        );
    }

    // ─── List ────────────────────────────────────────────────────────

    private async HandleList(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsListing) {
            return this.BuildResult(false, 'NOT_SUPPORTED', `List not supported for ${config.IntegrationName}`, params.Params);
        }

        const pageSize = this.GetOptionalNumericParam(params.Params, 'PageSize');
        const cursor = this.GetParamValue(params.Params, 'Cursor');
        const sort = this.GetParamValue(params.Params, 'Sort');

        const ctx: ListContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            PageSize: pageSize,
            Cursor: cursor ?? undefined,
            Sort: sort ?? undefined,
        };

        const result: ListResult = await connector.ListRecords(ctx);
        this.SetOutputParam(params.Params, 'Records', result.Records.map(r => r.Fields));
        this.SetOutputParam(params.Params, 'HasMore', result.HasMore);
        this.SetOutputParam(params.Params, 'NextCursor', result.NextCursor);
        if (result.TotalCount != null) {
            this.SetOutputParam(params.Params, 'TotalCount', result.TotalCount);
        }

        return this.BuildResult(
            true, 'SUCCESS',
            `Listed ${result.Records.length} ${config.ObjectName} record(s)`,
            params.Params
        );
    }

    // ─── Parameter Helpers ───────────────────────────────────────────

    /** Gets a parameter value by name (case-insensitive). Returns null if not found. */
    private GetParamValue(actionParams: ActionParam[], name: string): string | null {
        const param = actionParams.find(
            p => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type !== 'Output'
        );
        if (!param || param.Value == null) return null;
        return String(param.Value);
    }

    /** Gets a required parameter, throwing if not found. */
    private GetRequiredParam(actionParams: ActionParam[], name: string): string {
        const value = this.GetParamValue(actionParams, name);
        if (!value) {
            throw new Error(`Required parameter "${name}" is missing`);
        }
        return value;
    }

    /** Gets an optional numeric parameter. */
    private GetOptionalNumericParam(actionParams: ActionParam[], name: string): number | undefined {
        const value = this.GetParamValue(actionParams, name);
        if (!value) return undefined;
        const parsed = Number(value);
        return isNaN(parsed) ? undefined : parsed;
    }

    /**
     * Collects all Input parameters (excluding system params like ExternalID, CompanyIntegrationID,
     * PageSize, Page, Cursor, Sort) into a key-value object suitable for CRUD Attributes.
     */
    private CollectInputAttributes(actionParams: ActionParam[]): Record<string, unknown> {
        const systemParams = new Set([
            'externalid', 'companyintegrationid', 'pagesize', 'page', 'cursor', 'sort',
        ]);

        const attributes: Record<string, unknown> = {};
        for (const param of actionParams) {
            if (param.Type === 'Output') continue;
            const nameLower = param.Name.trim().toLowerCase();
            if (systemParams.has(nameLower)) continue;
            if (param.Value != null) {
                attributes[param.Name] = param.Value;
            }
        }
        return attributes;
    }

    /** Sets (or creates) an output parameter. */
    private SetOutputParam(actionParams: ActionParam[], name: string, value: unknown): void {
        const existing = actionParams.find(
            p => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type === 'Output'
        );
        if (existing) {
            existing.Value = value;
        } else {
            actionParams.push({ Name: name, Type: 'Output', Value: value } as ActionParam);
        }
    }

    // ─── Result Builders ─────────────────────────────────────────────

    private BuildResult(
        success: boolean,
        resultCode: string,
        message: string,
        actionParams: ActionParam[]
    ): ActionResultSimple {
        return {
            Success: success,
            ResultCode: resultCode,
            Message: message,
            Params: actionParams,
        } as ActionResultSimple;
    }

    private CRUDResultToActionResult(
        result: CRUDResult,
        operation: string,
        objectName: string,
        actionParams: ActionParam[]
    ): ActionResultSimple {
        if (result.Success) {
            if (result.ExternalID) {
                this.SetOutputParam(actionParams, 'ExternalID', result.ExternalID);
            }
            return this.BuildResult(
                true, 'SUCCESS',
                `${operation} ${objectName} succeeded${result.ExternalID ? ` (ID: ${result.ExternalID})` : ''}`,
                actionParams
            );
        }

        return this.BuildResult(
            false,
            `${operation.toUpperCase()}_FAILED`,
            result.ErrorMessage ?? `${operation} ${objectName} failed (HTTP ${result.StatusCode})`,
            actionParams
        );
    }
}
