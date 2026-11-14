import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** Why a connection could not be chosen; actions return it as their result code. */
export type CompanyIntegrationResolutionCode =
   | 'VALIDATION_ERROR'
   | 'NO_COMPANY_INTEGRATION'
   | 'AMBIGUOUS_COMPANY_INTEGRATION'
   | 'COMPANY_INTEGRATION_NOT_FOUND'
   | 'COMPANY_INTEGRATION_WRONG_COMPANY'
   | 'COMPANY_INTEGRATION_INACTIVE'
   | 'COMPANY_INTEGRATION_WRONG_INTEGRATION';

/** A refusal from {@link ResolveCompanyIntegration}, carrying a result code an action can return as-is. */
export class CompanyIntegrationResolutionError extends Error {
   public readonly Code: CompanyIntegrationResolutionCode;
   constructor(message: string, code: CompanyIntegrationResolutionCode) {
      super(message);
      this.name = 'CompanyIntegrationResolutionError';
      this.Code = code;
   }
}

/** What {@link ResolveCompanyIntegration} needs to pick a company's connection. */
export interface ResolveCompanyIntegrationParams {
   /** The MJ company the action runs for. Must be a UUID. */
   CompanyID: string;
   /** Integration names (the `Integration` column of `MJ: Company Integrations`) the caller can use. */
   IntegrationNames: readonly string[];
   /** Optional explicit connection; it must belong to the company, be active and be one of the integrations. */
   CompanyIntegrationID?: string | null;
   ContextUser: UserInfo;
   /** The request's provider, when the action ran with one. */
   Provider?: IMetadataProvider;
}

/**
 * Picks the one active connection a BizApps action should use for a company (#4929).
 *
 * The company ID is checked as a UUID before it reaches a filter, the integration is matched on the view's
 * `Integration` column (a joined `Integration.Name` does not bind on SQL Server), and more than one match is refused
 * with the candidates named instead of taking the first. A caller that knows which connection it wants passes
 * `CompanyIntegrationID`, which is checked against the company.
 *
 * @throws CompanyIntegrationResolutionError with a code saying what is wrong.
 */
export async function ResolveCompanyIntegration(params: ResolveCompanyIntegrationParams): Promise<MJCompanyIntegrationEntity> {
   const companyId = (params.CompanyID ?? '').trim();
   if (!IsValidUUID(companyId)) {
      throw new CompanyIntegrationResolutionError(`CompanyID '${params.CompanyID}' is not a valid ID.`, 'VALIDATION_ERROR');
   }
   if (params.IntegrationNames.length === 0) {
      throw new CompanyIntegrationResolutionError('No Integration names to search for.', 'NO_COMPANY_INTEGRATION');
   }
   const explicitId = params.CompanyIntegrationID?.trim();
   if (explicitId) {
      return loadForCompany(explicitId, companyId, params);
   }

   const names = params.IntegrationNames.map(n => `'${EscapeSQLString(n)}'`).join(', ');
   const rv = params.Provider ? RunView.FromMetadataProvider(params.Provider) : new RunView();
   const result = await rv.RunView<MJCompanyIntegrationEntity>({
      EntityName: 'MJ: Company Integrations',
      ExtraFilter: `CompanyID = '${EscapeSQLString(companyId)}' AND IsActive = 1 AND Integration IN (${names})`,
      OrderBy: 'Integration, Name',
      ResultType: 'entity_object',
   }, params.ContextUser);
   if (!result.Success) {
      throw new CompanyIntegrationResolutionError(`Failed to retrieve company integration: ${result.ErrorMessage}`, 'NO_COMPANY_INTEGRATION');
   }
   const rows = result.Results ?? [];
   if (rows.length === 0) {
      throw new CompanyIntegrationResolutionError(
         `No active ${params.IntegrationNames.join(' / ')} integration found for company ${companyId}. Please configure the integration first.`,
         'NO_COMPANY_INTEGRATION'
      );
   }
   if (rows.length > 1) {
      const candidates = rows.map(r => `'${r.Name}' (${r.Integration}, ID ${r.ID})`).join(', ');
      throw new CompanyIntegrationResolutionError(
         `Company ${companyId} has ${rows.length} active ${params.IntegrationNames.join(' / ')} connections: ${candidates}. Pass CompanyIntegrationID to select one.`,
         'AMBIGUOUS_COMPANY_INTEGRATION'
      );
   }
   return rows[0];
}

async function loadForCompany(id: string, companyId: string, params: ResolveCompanyIntegrationParams): Promise<MJCompanyIntegrationEntity> {
   if (!IsValidUUID(id)) {
      throw new CompanyIntegrationResolutionError(`CompanyIntegrationID '${id}' is not a valid ID.`, 'VALIDATION_ERROR');
   }
   const md = params.Provider ?? new Metadata();
   const record = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', params.ContextUser);
   if (!(await record.Load(id))) {
      throw new CompanyIntegrationResolutionError(`CompanyIntegration ${id} was not found.`, 'COMPANY_INTEGRATION_NOT_FOUND');
   }
   if (!UUIDsEqual(record.CompanyID, companyId)) {
      throw new CompanyIntegrationResolutionError(`CompanyIntegration ${id} does not belong to company ${companyId}.`, 'COMPANY_INTEGRATION_WRONG_COMPANY');
   }
   if (!record.IsActive) {
      throw new CompanyIntegrationResolutionError(`CompanyIntegration ${id} is not active.`, 'COMPANY_INTEGRATION_INACTIVE');
   }
   const allowed = params.IntegrationNames.some(n => n.trim().toLowerCase() === (record.Integration ?? '').trim().toLowerCase());
   if (!allowed) {
      throw new CompanyIntegrationResolutionError(
         `CompanyIntegration ${id} is a ${record.Integration} connection, not ${params.IntegrationNames.join(' / ')}.`,
         'COMPANY_INTEGRATION_WRONG_INTEGRATION'
      );
   }
   return record;
}
