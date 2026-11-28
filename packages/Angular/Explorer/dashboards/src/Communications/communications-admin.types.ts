import { CompositeKey, type IRemoteOperationProvider } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { themeQuartz } from 'ag-grid-community';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
  MJCommunicationSuppressionPolicyEntity,
  MJEntityCommunicationMessageTypeEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';

export type CommsAdminTabId =
  | 'simulator'
  | 'senders'
  | 'regimes'
  | 'endpoints'
  | 'policies'
  | 'domains';

export interface CommsAdminTabDef {
  Key: CommsAdminTabId;
  Label: string;
  Icon: string;
}

export const COMMS_ADMIN_TABS: readonly CommsAdminTabDef[] = [
  { Key: 'simulator', Label: 'Gate Simulator', Icon: 'fa-solid fa-vial-circle-check' },
  { Key: 'senders', Label: 'Senders & Permissions', Icon: 'fa-solid fa-sitemap' },
  { Key: 'regimes', Label: 'Regimes & Jurisdictions', Icon: 'fa-solid fa-scale-balanced' },
  { Key: 'endpoints', Label: 'Endpoints & Suppressions', Icon: 'fa-solid fa-ban' },
  { Key: 'policies', Label: 'Policies & Principals', Icon: 'fa-solid fa-shield-halved' },
  { Key: 'domains', Label: 'Sending Domains & DNS', Icon: 'fa-solid fa-globe' },
] as const;

export interface SenderTreeNode {
  Sender: MJCommunicationSenderEntity;
  Depth: number;
  Children: SenderTreeNode[];
}

export interface JurisdictionTreeNode {
  Jurisdiction: MJJurisdictionEntity;
  Depth: number;
  Children: JurisdictionTreeNode[];
}

export interface CommsAdminLoadedMetadata {
  Senders: MJCommunicationSenderEntity[];
  SenderPermissions: MJCommunicationSenderPermissionEntity[];
  Preferences: MJCommunicationPreferenceEntity[];
  Principals: MJCommunicationPrincipalEntity[];
  BaseMessageTypes: MJCommunicationBaseMessageTypeEntity[];
  Regimes: MJCommunicationComplianceRegimeEntity[];
  RegimeJurisdictions: MJCommunicationComplianceRegimeJurisdictionEntity[];
  RegimeRules: MJCommunicationComplianceRegimeRuleEntity[];
  RuleTypes: MJCommunicationComplianceRuleTypeEntity[];
  Jurisdictions: MJJurisdictionEntity[];
  JurisdictionMembers: MJJurisdictionMemberEntity[];
  SuppressionPolicies: MJCommunicationSuppressionPolicyEntity[];
  SendingDomains: MJCommunicationSendingDomainEntity[];
  EntityCommMessageTypes: MJEntityCommunicationMessageTypeEntity[];
}

export type {
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationSuppressionEntity,
};

export interface CommsSimulateGateOpInput {
  SenderID: string;
  PrincipalID?: string;
  RecordID?: string;
  PreferenceID?: string;
  MessageClass: string;
  RecipientJurisdictionID?: string;
}

export interface CommsSimulateGateOpOutput {
  Success: boolean;
  Decision?: string;
  Reason?: string;
  Detail?: string;
  ResultJSON?: string;
  ErrorMessage?: string;
}

export interface CommsSendingDomainOpOutput {
  Success: boolean;
  Verified?: boolean;
  Status?: string;
  ProviderDomainID?: string;
  DNSRecordsJSON?: string;
  ErrorMessage?: string;
}

export interface CommsAdminMutationOpOutput {
  Success: boolean;
  ErrorMessage?: string;
  WarningMessage?: string;
}

export interface CommsBlockEndpointOpOutput {
  Success: boolean;
  SuppressionID?: string;
  ErrorMessage?: string;
}

function isRemoteOperationProvider(provider: unknown): provider is IRemoteOperationProvider {
  return (
    Boolean(provider) &&
    typeof provider === 'object' &&
    'RouteOperation' in (provider as object) &&
    typeof (provider as { RouteOperation?: unknown }).RouteOperation === 'function'
  );
}

/**
 * Dispatches a Communications Admin Remote Operation through `IRemoteOperationProvider.RouteOperation`.
 */
export function CommsGridTheme() {
  return themeQuartz.withParams({
    fontFamily: 'inherit',
    fontSize: 13,
    headerFontSize: 12,
    rowHeight: 40,
    headerHeight: 38,
  });
}

export function OpenCommsEntityRecord(entityName: string, id: string): void {
  SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(id)); // first-pk-ok: all MJ: Communication* entities use single-column ID primary keys
}

export async function ExecuteCommsRemoteOp<TInput, TOutput>(
  provider: unknown,
  operationKey: string,
  input: TInput,
): Promise<TOutput> {
  if (!isRemoteOperationProvider(provider)) {
    throw new Error('Remote operation provider is not available.');
  }
  const result = await provider.RouteOperation<TInput, TOutput>(operationKey, input);
  if (!result.Success || result.Output === undefined) {
    throw new Error(result.ErrorMessage || `Remote operation '${operationKey}' failed.`);
  }
  return result.Output;
}
