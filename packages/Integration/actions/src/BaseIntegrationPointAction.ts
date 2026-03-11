import { LogError, RunView } from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { BaseIntegrationConnector, ConnectorFactory } from '@memberjunction/integration-engine';

/**
 * Supported write-back verbs for point operations on external connector objects.
 */
export type IntegrationPointVerb = 'Create' | 'Update' | 'Delete' | 'Search';

/**
 * Base class for auto-generated integration point actions.
 *
 * Provides a super-generic execution layer that delegates to the connector's
 * optional write-back methods (CreateRecord, UpdateRecord, DeleteRecord, SearchRecords).
 * Each verb × connector × object combination is exposed as a thin metadata shell
 * that extends this base, with no duplicated code.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): ID of the CompanyIntegration to operate on
 *   - ObjectType (required):           External object name (e.g., "contacts", "members")
 *   - Verb (required):                 'Create' | 'Update' | 'Delete' | 'Search'
 *   - ExternalID (required for Update/Delete): External system record ID
 *   - Data (required for Create/Update): JSON string of field values
 *   - Filter (optional for Search):    JSON string of search criteria
 *
 * Parameters (Output):
 *   - Result: JSON string of the returned record(s) from the external system
 */
export abstract class BaseIntegrationPointAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
            if (!companyIntegrationID) return this.missingParam('CompanyIntegrationID');

            const objectType = this.getStringParam(params, 'ObjectType');
            if (!objectType) return this.missingParam('ObjectType');

            const verb = this.getStringParam(params, 'Verb') as IntegrationPointVerb | undefined;
            if (!verb || !['Create', 'Update', 'Delete', 'Search'].includes(verb)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PARAMETER',
                    Message: "Parameter 'Verb' must be one of: Create, Update, Delete, Search"
                };
            }

            const { companyIntegration, integration } = await this.loadEntities(companyIntegrationID);
            if (!companyIntegration || !integration) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `CompanyIntegration '${companyIntegrationID}' or its Integration record not found`
                };
            }

            const connector = ConnectorFactory.Resolve(integration);

            switch (verb) {
                case 'Create': return await this.runCreate(connector, objectType, companyIntegration, params);
                case 'Update': return await this.runUpdate(connector, objectType, companyIntegration, params);
                case 'Delete': return await this.runDelete(connector, objectType, companyIntegration, params);
                case 'Search': return await this.runSearch(connector, objectType, companyIntegration, params);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[BaseIntegrationPointAction] Unexpected error: ${message}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
        }
    }

    // ── Verb handlers ──────────────────────────────────────────────────────

    private async runCreate(
        connector: BaseIntegrationConnector,
        objectType: string,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.CreateRecord) return this.verbNotSupported('Create');
        const data = this.parseJsonParam(params, 'Data');
        if (!data) return this.missingParam('Data');

        const result = await connector.CreateRecord(objectType, data, companyIntegration, params.ContextUser);
        this.setOutputParam(params, 'Result', JSON.stringify(result));
        return { Success: true, ResultCode: 'SUCCESS', Message: 'Record created', Params: params.Params };
    }

    private async runUpdate(
        connector: BaseIntegrationConnector,
        objectType: string,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.UpdateRecord) return this.verbNotSupported('Update');
        const externalId = this.getStringParam(params, 'ExternalID');
        if (!externalId) return this.missingParam('ExternalID');
        const data = this.parseJsonParam(params, 'Data');
        if (!data) return this.missingParam('Data');

        const result = await connector.UpdateRecord(objectType, externalId, data, companyIntegration, params.ContextUser);
        this.setOutputParam(params, 'Result', JSON.stringify(result));
        return { Success: true, ResultCode: 'SUCCESS', Message: 'Record updated', Params: params.Params };
    }

    private async runDelete(
        connector: BaseIntegrationConnector,
        objectType: string,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.DeleteRecord) return this.verbNotSupported('Delete');
        const externalId = this.getStringParam(params, 'ExternalID');
        if (!externalId) return this.missingParam('ExternalID');

        const deleted = await connector.DeleteRecord(objectType, externalId, companyIntegration, params.ContextUser);
        this.setOutputParam(params, 'Result', String(deleted));
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Record ${deleted ? 'deleted' : 'not found'}`,
            Params: params.Params
        };
    }

    private async runSearch(
        connector: BaseIntegrationConnector,
        objectType: string,
        companyIntegration: MJCompanyIntegrationEntity,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        if (!connector.SearchRecords) return this.verbNotSupported('Search');
        const filter = this.parseJsonParam(params, 'Filter') ?? {};

        const results = await connector.SearchRecords(objectType, filter, companyIntegration, params.ContextUser);
        this.setOutputParam(params, 'Result', JSON.stringify(results));
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Found ${results.length} record(s)`,
            Params: params.Params
        };
    }

    // ── Data loaders ───────────────────────────────────────────────────────

    private async loadEntities(companyIntegrationID: string): Promise<{
        companyIntegration: MJCompanyIntegrationEntity | null;
        integration: MJIntegrationEntity | null;
    }> {
        const rv = new RunView();
        const ciResult = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'Company Integrations',
            ExtraFilter: `ID='${companyIntegrationID}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        });

        if (!ciResult.Success || ciResult.Results.length === 0) {
            return { companyIntegration: null, integration: null };
        }

        const companyIntegration = ciResult.Results[0];
        const integrationID = companyIntegration.IntegrationID;

        const intResult = await rv.RunView<MJIntegrationEntity>({
            EntityName: 'Integrations',
            ExtraFilter: `ID='${integrationID}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        });

        const integration = intResult.Success && intResult.Results.length > 0 ? intResult.Results[0] : null;
        return { companyIntegration, integration };
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const nameLower = name.toLowerCase();
        const param = params.Params?.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (!param || param.Value == null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private parseJsonParam(params: RunActionParams, name: string): Record<string, unknown> | null {
        const raw = this.getStringParam(params, name);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return null;
        }
    }

    private setOutputParam(params: RunActionParams, name: string, value: string): void {
        const existing = params.Params.find(p => p.Name === name && p.Type === 'Output');
        if (existing) {
            existing.Value = value;
        } else {
            const p = new ActionParam();
            p.Name = name;
            p.Type = 'Output';
            p.Value = value;
            params.Params.push(p);
        }
    }

    private missingParam(name: string): ActionResultSimple {
        return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: `Required parameter '${name}' is missing` };
    }

    private verbNotSupported(verb: string): ActionResultSimple {
        return { Success: false, ResultCode: 'VERB_NOT_SUPPORTED', Message: `This connector does not support the '${verb}' operation` };
    }
}
