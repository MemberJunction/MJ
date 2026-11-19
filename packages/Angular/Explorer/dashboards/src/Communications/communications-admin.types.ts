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
