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
    UpsertRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    SearchContext,
    ListContext,
} from '@memberjunction/integration-engine';
import { Metadata, RunView } from '@memberjunction/core';
import type { MJIntegrationEntity, MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

// ─── Config Types ────────────────────────────────────────────────────

/** CRUD verb that an integration action can dispatch to */
type IntegrationActionVerb = 'Get' | 'Create' | 'Update' | 'Upsert' | 'Delete' | 'Search' | 'List';

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
 * Every pre-generated integration action uses `DriverClass='IntegrationActionExecutor'`
 * and stores its routing info in the Action.Config_ JSON field. The executor also
 * supports a **generic catch-all** mode: when Action.Config_ is empty, it reads
 * IntegrationName/ObjectName/Verb from ActionParams instead, so a single generic
 * action can do CRUD on ANY object without pre-generation. At runtime this executor:
 *
 *   1. Parses Config JSON from the Action entity (or, when absent, from ActionParams)
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
            const config = this.parseConfig(params);

            // 2. Resolve connector
            const connector = await this.resolveConnector(config.IntegrationName, params);

            // 3. Resolve CompanyIntegration
            const companyIntegration = await this.resolveCompanyIntegration(
                config.IntegrationName, params
            );

            // 4. Dispatch to verb handler
            const result = await this.dispatchVerb(
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

    /**
     * Resolves the routing config (IntegrationName/ObjectName/Verb) for this run.
     *
     * Two modes, in priority order:
     *   1. **Config_ mode** (pre-generated actions): when Action.Config_ holds JSON,
     *      it is parsed and validated. Missing required fields are an error here —
     *      a populated Config_ is treated as authoritative and never falls through.
     *   2. **Generic catch-all mode**: when Action.Config_ is absent/empty, the same
     *      three values are read (case-insensitive) from the ActionParams. This lets a
     *      single generic action do CRUD on ANY object without pre-generation.
     */
    private parseConfig(params: RunActionParams): IntegrationActionConfig {
        const configJson = params.Action?.Config_;
        if (configJson && configJson.trim().length > 0) {
            return this.parseConfigFromJson(configJson);
        }
        return this.parseConfigFromParams(params);
    }

    /** Parse + validate the JSON stored in Action.Config_ (pre-generated actions). */
    private parseConfigFromJson(configJson: string): IntegrationActionConfig {
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

    /**
     * Read IntegrationName/ObjectName/Verb from ActionParams (case-insensitive),
     * the generic catch-all path used when no Config_ is present. The error message
     * still references Action.Config_ so existing pre-generated callers get a
     * familiar diagnostic when nothing at all was provided.
     */
    private parseConfigFromParams(params: RunActionParams): IntegrationActionConfig {
        const integrationName = this.getParamValue(params.Params, 'IntegrationName');
        const objectName = this.getParamValue(params.Params, 'ObjectName');
        const verb = this.getParamValue(params.Params, 'Verb') as IntegrationActionVerb | null;

        if (!integrationName || !objectName || !verb) {
            throw new Error(
                'Action.Config_ is required for IntegrationActionExecutor, or pass ' +
                'IntegrationName, ObjectName and Verb as ActionParams for generic invocation'
            );
        }

        return { IntegrationName: integrationName, ObjectName: objectName, Verb: verb };
    }

    // ─── Connector Resolution ────────────────────────────────────────

    private async resolveConnector(
        integrationName: string,
        params: RunActionParams
    ): Promise<BaseIntegrationConnector> {
        const integration = await this.loadIntegrationEntity(integrationName, params);
        return ConnectorFactory.Resolve(integration);
    }

    private async loadIntegrationEntity(
        integrationName: string,
        params: RunActionParams
    ): Promise<MJIntegrationEntity> {
        const rv = new RunView();
        const result = await rv.RunView<MJIntegrationEntity>({
            EntityName: 'MJ: Integrations',
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

    private async resolveCompanyIntegration(
        integrationName: string,
        params: RunActionParams
    ): Promise<MJCompanyIntegrationEntity> {
        // Check if CompanyIntegrationID was passed as an ActionParam
        const ciIdParam = this.getParamValue(params.Params, 'CompanyIntegrationID');
        if (ciIdParam) {
            return this.loadCompanyIntegrationByID(ciIdParam, params);
        }

        // Otherwise look up the first active CompanyIntegration for this integration name
        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
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

    private async loadCompanyIntegrationByID(
        id: string,
        params: RunActionParams
    ): Promise<MJCompanyIntegrationEntity> {
        const md = params.Provider ?? new Metadata();
        const entity = await md.GetEntityObject<MJCompanyIntegrationEntity>(
            'MJ: Company Integrations', params.ContextUser
        );
        const loaded = await entity.Load(id);
        if (!loaded) {
            throw new Error(`CompanyIntegration with ID "${id}" not found`);
        }
        return entity;
    }

    // ─── Verb Dispatch ───────────────────────────────────────────────

    private async dispatchVerb(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        switch (config.Verb) {
            case 'Get':
                return this.handleGet(config, connector, companyIntegration, params);
            case 'Create':
                return this.handleCreate(config, connector, companyIntegration, params);
            case 'Update':
                return this.handleUpdate(config, connector, companyIntegration, params);
            case 'Upsert':
                return this.handleUpsert(config, connector, companyIntegration, params);
            case 'Delete':
                return this.handleDelete(config, connector, companyIntegration, params);
            case 'Search':
                return this.handleSearch(config, connector, companyIntegration, params);
            case 'List':
                return this.handleList(config, connector, companyIntegration, params);
            default:
                throw new Error(`Unsupported verb: ${config.Verb}`);
        }
    }

    // ─── Get ─────────────────────────────────────────────────────────

    private async handleGet(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        const externalID = this.getRequiredParam(params.Params, 'ExternalID');

        const ctx: GetRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
        };

        const record = await connector.GetRecord(ctx);
        if (!record) {
            return this.buildResult(false, 'NOT_FOUND', `Record ${externalID} not found`, params.Params);
        }

        this.setOutputParam(params.Params, 'Record', record.Fields);
        this.setOutputParam(params.Params, 'ExternalID', record.ExternalID);
        return this.buildResult(true, 'SUCCESS', `Retrieved ${config.ObjectName} ${externalID}`, params.Params);
    }

    // ─── Create ──────────────────────────────────────────────────────

    private async handleCreate(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsCreate) {
            return this.buildResult(false, 'NOT_SUPPORTED', `Create not supported for ${config.IntegrationName}`, params.Params);
        }

        const attributes = this.collectInputAttributes(params.Params);
        const ctx: CreateRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            Attributes: attributes,
        };

        const result = await connector.CreateRecord(ctx);
        return this.cRUDResultToActionResult(result, 'Create', config.ObjectName, params.Params);
    }

    // ─── Update ──────────────────────────────────────────────────────

    private async handleUpdate(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsUpdate) {
            return this.buildResult(false, 'NOT_SUPPORTED', `Update not supported for ${config.IntegrationName}`, params.Params);
        }

        const externalID = this.getRequiredParam(params.Params, 'ExternalID');
        const attributes = this.collectInputAttributes(params.Params);
        const ctx: UpdateRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
            Attributes: attributes,
        };

        const result = await connector.UpdateRecord(ctx);
        return this.cRUDResultToActionResult(result, 'Update', config.ObjectName, params.Params);
    }

    // ─── Upsert ──────────────────────────────────────────────────────

    private async handleUpsert(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsUpsert) {
            return this.buildResult(false, 'NOT_SUPPORTED', `Upsert not supported for ${config.IntegrationName}`, params.Params);
        }

        const attributes = this.collectInputAttributes(params.Params);
        const idProperty = this.getParamValue(params.Params, 'IDProperty');
        const ctx: UpsertRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            Attributes: attributes,
            IDProperty: idProperty ?? undefined,
        };

        const result = await connector.Upsert(ctx);
        return this.cRUDResultToActionResult(result, 'Upsert', config.ObjectName, params.Params);
    }

    // ─── Delete ──────────────────────────────────────────────────────

    private async handleDelete(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsDelete) {
            return this.buildResult(false, 'NOT_SUPPORTED', `Delete not supported for ${config.IntegrationName}`, params.Params);
        }

        const externalID = this.getRequiredParam(params.Params, 'ExternalID');
        const ctx: DeleteRecordContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            ExternalID: externalID,
        };

        const result = await connector.DeleteRecord(ctx);
        return this.cRUDResultToActionResult(result, 'Delete', config.ObjectName, params.Params);
    }

    // ─── Search ──────────────────────────────────────────────────────

    private async handleSearch(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsSearch) {
            return this.buildResult(false, 'NOT_SUPPORTED', `Search not supported for ${config.IntegrationName}`, params.Params);
        }

        const filters = this.collectInputAttributes(params.Params) as Record<string, string>;
        const pageSize = this.getOptionalNumericParam(params.Params, 'PageSize');
        const page = this.getOptionalNumericParam(params.Params, 'Page');
        const sort = this.getParamValue(params.Params, 'Sort');

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
        this.setOutputParam(params.Params, 'Records', result.Records.map(r => r.Fields));
        this.setOutputParam(params.Params, 'TotalCount', result.TotalCount);
        this.setOutputParam(params.Params, 'HasMore', result.HasMore);

        return this.buildResult(
            true, 'SUCCESS',
            `Found ${result.TotalCount} ${config.ObjectName} record(s)`,
            params.Params
        );
    }

    // ─── List ────────────────────────────────────────────────────────

    private async handleList(
        config: IntegrationActionConfig,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SupportsListing) {
            return this.buildResult(false, 'NOT_SUPPORTED', `List not supported for ${config.IntegrationName}`, params.Params);
        }

        const pageSize = this.getOptionalNumericParam(params.Params, 'PageSize');
        const cursor = this.getParamValue(params.Params, 'Cursor');
        const sort = this.getParamValue(params.Params, 'Sort');

        const ctx: ListContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: config.ObjectName,
            ContextUser: params.ContextUser,
            PageSize: pageSize,
            Cursor: cursor ?? undefined,
            Sort: sort ?? undefined,
        };

        const result: ListResult = await connector.ListRecords(ctx);
        this.setOutputParam(params.Params, 'Records', result.Records.map(r => r.Fields));
        this.setOutputParam(params.Params, 'HasMore', result.HasMore);
        this.setOutputParam(params.Params, 'NextCursor', result.NextCursor);
        if (result.TotalCount != null) {
            this.setOutputParam(params.Params, 'TotalCount', result.TotalCount);
        }

        return this.buildResult(
            true, 'SUCCESS',
            `Listed ${result.Records.length} ${config.ObjectName} record(s)`,
            params.Params
        );
    }

    // ─── Parameter Helpers ───────────────────────────────────────────

    /** Gets a parameter value by name (case-insensitive). Returns null if not found. */
    private getParamValue(actionParams: ActionParam[], name: string): string | null {
        const param = actionParams.find(
            p => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type !== 'Output'
        );
        if (!param || param.Value == null) return null;
        return String(param.Value);
    }

    /** Gets a required parameter, throwing if not found. */
    private getRequiredParam(actionParams: ActionParam[], name: string): string {
        const value = this.getParamValue(actionParams, name);
        if (!value) {
            throw new Error(`Required parameter "${name}" is missing`);
        }
        return value;
    }

    /** Gets an optional numeric parameter. */
    private getOptionalNumericParam(actionParams: ActionParam[], name: string): number | undefined {
        const value = this.getParamValue(actionParams, name);
        if (!value) return undefined;
        const parsed = Number(value);
        return isNaN(parsed) ? undefined : parsed;
    }

    /**
     * Collects all Input parameters (excluding system params like ExternalID, CompanyIntegrationID,
     * PageSize, Page, Cursor, Sort, IDProperty) into a key-value object suitable for CRUD Attributes.
     */
    private collectInputAttributes(actionParams: ActionParam[]): Record<string, unknown> {
        const systemParams = new Set([
            'externalid', 'companyintegrationid', 'pagesize', 'page', 'cursor', 'sort', 'idproperty',
            // Generic catch-all routing params — never treated as record attributes.
            'integrationname', 'objectname', 'verb',
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
    private setOutputParam(actionParams: ActionParam[], name: string, value: unknown): void {
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

    private buildResult(
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

    private cRUDResultToActionResult(
        result: CRUDResult,
        operation: string,
        objectName: string,
        actionParams: ActionParam[]
    ): ActionResultSimple {
        if (result.Success) {
            if (result.ExternalID) {
                this.setOutputParam(actionParams, 'ExternalID', result.ExternalID);
            }
            return this.buildResult(
                true, 'SUCCESS',
                `${operation} ${objectName} succeeded${result.ExternalID ? ` (ID: ${result.ExternalID})` : ''}`,
                actionParams
            );
        }

        return this.buildResult(
            false,
            `${operation.toUpperCase()}_FAILED`,
            result.ErrorMessage ?? `${operation} ${objectName} failed (HTTP ${result.StatusCode})`,
            actionParams
        );
    }
}
