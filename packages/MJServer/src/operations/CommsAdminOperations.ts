/**
 * @fileoverview Server implementations of Communications V2 admin Remote Operations.
 *
 * Replaces `CommsAdminResolver` GraphQL queries/mutations with `BaseRemotableOperation`
 * subclasses invoked from the browser via `RouteOperation` / generated operation classes:
 *   - `Communications.SimulateComplianceGate`
 *   - `Communications.CreateSendingDomain`
 *   - `Communications.VerifySendingDomain`
 *   - `Communications.DeleteSendingDomain`
 *   - `Communications.RevokeSuppression`
 *   - `Communications.BlockEndpoint`
 */
import {
  AuthorizationEvaluator,
  BaseRemotableOperation,
  type IMetadataProvider,
  LogError,
  RemoteOperationError,
  type RemoteOpServerContext,
  RunView,
  type UserInfo,
} from '@memberjunction/core';
import {
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationProviderEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';
import { CommunicationEngine, ComplianceGate, JurisdictionResolver } from '@memberjunction/communication-engine';
import type {
  BaseMessageResult,
  DomainDNSRecord,
  MessageClass,
  ProviderCredentialsBase,
} from '@memberjunction/communication-types';
import { CredentialEngine } from '@memberjunction/credentials';
import { EscapeSQLString, IndexByUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { IsOwner } from '../auth/actionAuthorization.js';

export const COMMS_SIMULATE_GATE_KEY = 'Communications.SimulateComplianceGate';
export const COMMS_CREATE_SENDING_DOMAIN_KEY = 'Communications.CreateSendingDomain';
export const COMMS_VERIFY_SENDING_DOMAIN_KEY = 'Communications.VerifySendingDomain';
export const COMMS_DELETE_SENDING_DOMAIN_KEY = 'Communications.DeleteSendingDomain';
export const COMMS_REVOKE_SUPPRESSION_KEY = 'Communications.RevokeSuppression';
export const COMMS_BLOCK_ENDPOINT_KEY = 'Communications.BlockEndpoint';

export interface CommsSimulateComplianceGateInput {
  SenderID: string;
  PrincipalID?: string;
  RecordID?: string;
  PreferenceID?: string;
  MessageClass: string;
  RecipientJurisdictionID?: string;
}

export interface CommsSimulateComplianceGateOutput {
  Success: boolean;
  Decision?: string;
  Reason?: string;
  Detail?: string;
  ResultJSON?: string;
  ErrorMessage?: string;
}

export interface CommsSendingDomainInput {
  DomainID: string;
}

export interface CommsSendingDomainAuthOutput {
  Success: boolean;
  Verified?: boolean;
  Status?: string;
  ProviderDomainID?: string;
  DNSRecordsJSON?: string;
  ErrorMessage?: string;
}

export interface CommsAdminMutationOutput {
  Success: boolean;
  ErrorMessage?: string;
  WarningMessage?: string;
}

export interface CommsRevokeSuppressionInput {
  SuppressionID: string;
}

export interface CommsBlockEndpointInput {
  EndpointID: string;
}

export interface CommsBlockEndpointOutput {
  Success: boolean;
  SuppressionID?: string;
  ErrorMessage?: string;
}

interface SuppressionRemovableProvider {
  RemoveSuppression(
    email: string,
    suppressionType?: string,
    credentials?: ProviderCredentialsBase,
  ): Promise<BaseMessageResult>;
}

function hasRemoveSuppression(provider: object): provider is SuppressionRemovableProvider {
  return (
    'RemoveSuppression' in provider &&
    typeof (provider as { RemoveSuppression?: unknown }).RemoveSuppression === 'function'
  );
}

function assertCommsAdmin(user: UserInfo | undefined, provider: IMetadataProvider | undefined): void {
  if (!user) {
    throw new RemoteOperationError('UNAUTHORIZED', 'Authentication required');
  }
  if (IsOwner(user)) {
    return;
  }
  const authorizations = provider?.Authorizations ?? [];
  const commsAuth = authorizations.find(
    (a) => a.Name?.trim().toLowerCase() === 'communications: admin',
  );
  if (commsAuth && new AuthorizationEvaluator().UserCanExecuteWithAncestors(commsAuth, user, authorizations)) {
    return;
  }
  throw new RemoteOperationError(
    'FORBIDDEN',
    'Owner privileges or "Communications: Admin" authorization required for Communications Admin operations',
  );
}

function mergeDnsValidationRecords(
  existingJson: string | null | undefined,
  validated: DomainDNSRecord[],
): DomainDNSRecord[] {
  if (!existingJson) {
    return validated;
  }
  let existing: DomainDNSRecord[] = [];
  try {
    const parsed = JSON.parse(existingJson) as unknown;
    if (Array.isArray(parsed)) {
      existing = parsed as DomainDNSRecord[];
    }
  } catch {
    return validated;
  }
  if (existing.length === 0) {
    return validated;
  }

  const remaining = [...validated];
  const merged = existing.map((rec) => {
    const idx = remaining.findIndex(
      (v) =>
        (v.Host && rec.Host && v.Host.toLowerCase() === rec.Host.toLowerCase()) ||
        (v.Purpose === rec.Purpose && v.Type === rec.Type),
    );
    if (idx === -1) {
      return rec;
    }
    const [match] = remaining.splice(idx, 1);
    return {
      ...rec,
      Host: match.Value ? match.Host : rec.Host,
      Value: match.Value || rec.Value,
      Validated: match.Validated,
    };
  });

  for (const leftover of remaining) {
    if (leftover.Value || leftover.Purpose === 'DMARC') {
      merged.push(leftover);
    }
  }
  return merged;
}

function mapReasonToSuppressionType(reason: MJCommunicationSuppressionEntity['Reason']): string | undefined {
  switch (reason) {
    case 'Hard Bounce':
      return 'bounces';
    case 'Spam Complaint':
      return 'spam_reports';
    case 'Invalid Address':
      return 'invalid_emails';
    case 'User Unsubscribe':
      return 'unsubscribes';
    default:
      return undefined;
  }
}

async function resolveDomainCredentials(
  domain: MJCommunicationSendingDomainEntity,
  user: UserInfo,
): Promise<ProviderCredentialsBase | undefined> {
  if (!domain.CredentialID) {
    return undefined;
  }
  await CredentialEngine.Instance.Config(false, user);
  const cred = CredentialEngine.Instance.getCredentialById(domain.CredentialID);
  if (!cred) {
    return undefined;
  }
  const resolved = await CredentialEngine.Instance.GetCredential<{ apiKey?: string; APIKey?: string }>(
    cred.Name,
    { contextUser: user, subsystem: 'CommsAdmin' },
  );
  const apiKey = resolved.values.apiKey ?? resolved.values.APIKey;
  return apiKey ? ({ apiKey } as ProviderCredentialsBase) : (resolved.values as ProviderCredentialsBase);
}

async function loadSendingDomain(
  mdProvider: IMetadataProvider,
  domainId: string,
  user: UserInfo,
): Promise<MJCommunicationSendingDomainEntity | undefined> {
  const rv = RunView.FromMetadataProvider(mdProvider);
  const res = await rv.RunView<MJCommunicationSendingDomainEntity>(
    {
      EntityName: 'MJ: Communication Sending Domains',
      ExtraFilter: `ID='${EscapeSQLString(domainId)}'`,
      ResultType: 'entity_object',
    },
    user,
  );
  return res.Success && res.Results.length > 0 ? res.Results[0] : undefined;
}

async function restoreEndpointIfNoActiveSuppressions(
  mdProvider: IMetadataProvider,
  endpointID: string | null,
  user: UserInfo,
): Promise<void> {
  if (!endpointID) return;
  const rv = RunView.FromMetadataProvider(mdProvider);
  const activeRes = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Communication Suppressions',
      ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpointID)}' AND Status='Active'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple',
    },
    user,
  );
  if (!activeRes.Success || activeRes.Results.length > 0) {
    return;
  }

  const endpoint = await mdProvider.GetEntityObject<MJCommunicationEndpointEntity>(
    'MJ: Communication Endpoints',
    user,
  );
  if (
    (await endpoint.Load(endpointID)) &&
    endpoint.Status !== 'Active' &&
    endpoint.Status !== 'Erased'
  ) {
    endpoint.Status = 'Active';
    endpoint.SoftBounceCount = 0;
    if (!(await endpoint.Save())) {
      LogError(`restoreEndpointIfNoActiveSuppressions: failed to restore endpoint ${endpointID}: ${endpoint.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }
}

async function resolveProvidersForSuppression(
  mdProvider: IMetadataProvider,
  supp: MJCommunicationSuppressionEntity,
  user: UserInfo,
): Promise<MJCommunicationProviderEntity[]> {
  if (supp.CommunicationSenderID) {
    const sender = await mdProvider.GetEntityObject<MJCommunicationSenderEntity>(
      'MJ: Communication Senders',
      user,
    );
    if (await sender.Load(supp.CommunicationSenderID)) {
      const matched = CommunicationEngine.Instance.Providers.find((p) =>
        UUIDsEqual(p.ID, sender.CommunicationProviderID),
      );
      if (matched) return [matched];
    }
  }

  const rv = RunView.FromMetadataProvider(mdProvider);
  const res = await rv.RunView<MJCommunicationProviderEntity>(
    {
      EntityName: 'MJ: Communication Providers',
      ExtraFilter: `Status='Active'`,
      ResultType: 'entity_object',
    },
    user,
  );
  return res.Success ? res.Results : [];
}

async function clearDownstreamSuppression(
  mdProvider: IMetadataProvider,
  supp: MJCommunicationSuppressionEntity,
  user: UserInfo,
): Promise<string | undefined> {
  if (!supp.CommunicationEndpointID) return undefined;

  const endpoint = await mdProvider.GetEntityObject<MJCommunicationEndpointEntity>(
    'MJ: Communication Endpoints',
    user,
  );
  if (!(await endpoint.Load(supp.CommunicationEndpointID)) || !endpoint.NormalizedValue) {
    return undefined;
  }

  const providerEntities = await resolveProvidersForSuppression(mdProvider, supp, user);
  const suppressionType = mapReasonToSuppressionType(supp.Reason);
  if (!suppressionType) {
    return undefined;
  }
  const warnings: string[] = [];

  for (const pe of providerEntities) {
    try {
      const instance = CommunicationEngine.Instance.GetProvider(pe.Name);
      if (hasRemoveSuppression(instance)) {
        const res = await instance.RemoveSuppression(endpoint.NormalizedValue, suppressionType);
        if (!res.Success && res.ErrorMessage) {
          warnings.push(`${pe.Name}: ${res.ErrorMessage}`);
        }
      }
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      LogError(`[CommsAdminOperations] Failed clearing downstream suppression on ${pe.Name}: ${msg}`);
      warnings.push(`${pe.Name}: ${msg}`);
    }
  }

  return warnings.length > 0 ? warnings.join('; ') : undefined;
}

@RegisterClass(BaseRemotableOperation, COMMS_SIMULATE_GATE_KEY)
export class CommsSimulateComplianceGateServerOperation extends BaseRemotableOperation<
  CommsSimulateComplianceGateInput,
  CommsSimulateComplianceGateOutput
> {
  public get OperationKey(): string {
    return COMMS_SIMULATE_GATE_KEY;
  }

  protected override async Authorize(
    _input: CommsSimulateComplianceGateInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsSimulateComplianceGateInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsSimulateComplianceGateOutput> {
    await CommunicationEngine.Instance.Config(false, user, provider);

    const rv = RunView.FromMetadataProvider(provider);
    const [
      sendersRes,
      prefsRes,
      principalsRes,
      jurRes,
      jmRes,
      rtRes,
      regRes,
      rjRes,
      rrRes,
    ] = await rv.RunViews([
      { EntityName: 'MJ: Communication Senders', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Preferences', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Principals', ResultType: 'entity_object' },
      { EntityName: 'MJ: Jurisdictions', ResultType: 'entity_object' },
      { EntityName: 'MJ: Jurisdiction Members', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Rule Types', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regimes', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regime Jurisdictions', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regime Rules', ResultType: 'entity_object' },
    ], user);

    const senders = (sendersRes.Success ? sendersRes.Results : []) as MJCommunicationSenderEntity[];
    const senderById = IndexByUUID(senders, (s) => s.ID);
    const sender = senderById.Get(input.SenderID);
    if (!sender) {
      return { Success: false, ErrorMessage: `Sender '${input.SenderID}' not found` };
    }

    const senderAncestors: string[] = [];
    const seenSenders = new Set<string>([sender.ID.toLowerCase()]);
    let curParent = sender.ParentSenderID;
    while (curParent && !seenSenders.has(curParent.toLowerCase())) {
      seenSenders.add(curParent.toLowerCase());
      const parent = senderById.Get(curParent);
      if (!parent) break;
      senderAncestors.push(parent.ID);
      curParent = parent.ParentSenderID;
    }

    const preferences = (prefsRes.Success ? prefsRes.Results : []) as MJCommunicationPreferenceEntity[];
    const preference = input.PreferenceID
      ? preferences.find((p) => UUIDsEqual(p.ID, input.PreferenceID))
      : undefined;

    const principals = (principalsRes.Success ? principalsRes.Results : []) as MJCommunicationPrincipalEntity[];
    const principal = input.PrincipalID
      ? principals.find((p) => UUIDsEqual(p.ID, input.PrincipalID))
      : undefined;

    const jurisdictions = (jurRes.Success ? jurRes.Results : []) as MJJurisdictionEntity[];
    const recipientJurisdictionCode = input.RecipientJurisdictionID
      ? jurisdictions.find((j) => UUIDsEqual(j.ID, input.RecipientJurisdictionID))?.Code ?? null
      : null;

    let suppressions: MJCommunicationSuppressionEntity[] = [];
    let principalPref: MJCommunicationPrincipalPreferenceEntity | undefined;
    if (principal && input.RecordID?.trim()) {
      const safeEntityId = EscapeSQLString(principal.EntityID);
      const safeRecordId = EscapeSQLString(input.RecordID.trim());
      const [suppRes, ppRes] = await rv.RunViews([
        {
          EntityName: 'MJ: Communication Suppressions',
          ExtraFilter: `EntityID='${safeEntityId}' AND RecordID='${safeRecordId}' AND Status='Active'`,
          ResultType: 'entity_object',
        },
        ...(preference
          ? [{
              EntityName: 'MJ: Communication Principal Preferences',
              ExtraFilter: `EntityID='${safeEntityId}' AND RecordID='${safeRecordId}' AND CommunicationPreferenceID='${EscapeSQLString(preference.ID)}'`,
              MaxRows: 1,
              ResultType: 'entity_object' as const,
            }]
          : []),
      ], user);
      if (suppRes.Success) {
        suppressions = suppRes.Results as MJCommunicationSuppressionEntity[];
      }
      if (ppRes?.Success && ppRes.Results.length > 0) {
        principalPref = ppRes.Results[0] as MJCommunicationPrincipalPreferenceEntity;
      }
    }

    const emailChannel = CommunicationEngine.Instance.BaseMessageTypes.find(
      (b) => b.Type.toLowerCase() === 'email',
    );
    const channelId = emailChannel?.ID ?? sender.CommunicationProviderID;

    const resolver = new JurisdictionResolver({
      Jurisdictions: jurisdictions,
      JurisdictionMembers: (jmRes.Success ? jmRes.Results : []) as MJJurisdictionMemberEntity[],
      ComplianceRuleTypes: (rtRes.Success ? rtRes.Results : []) as MJCommunicationComplianceRuleTypeEntity[],
      ComplianceRegimes: (regRes.Success ? regRes.Results : []) as MJCommunicationComplianceRegimeEntity[],
      ComplianceRegimeJurisdictions: (rjRes.Success ? rjRes.Results : []) as MJCommunicationComplianceRegimeJurisdictionEntity[],
      ComplianceRegimeRules: (rrRes.Success ? rrRes.Results : []) as MJCommunicationComplianceRegimeRuleEntity[],
    });

    const gate = new ComplianceGate(resolver);
    const messageClass: MessageClass =
      input.MessageClass === 'Operational' || input.MessageClass === 'Transactional'
        ? input.MessageClass
        : 'Marketing';

    const mockEndpoint = {
      ID: '00000000-0000-0000-0000-000000000000',
      BaseMessageTypeID: channelId,
      NormalizedValue: 'simulator@example.com',
      Status: 'Active',
    } as MJCommunicationEndpointEntity;

    const gateResult = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: senderAncestors,
        Principal: principal && input.RecordID?.trim()
          ? { EntityID: principal.EntityID, RecordID: input.RecordID.trim() }
          : undefined,
        Endpoint: mockEndpoint,
        Preference: preference,
        PrincipalPreference: principalPref,
        MessageClass: messageClass,
        ChannelID: channelId,
        Now: new Date(),
      },
      {
        Suppressions: suppressions,
        RecipientJurisdiction: recipientJurisdictionCode,
      },
    );

    return {
      Success: true,
      Decision: gateResult.Decision,
      Reason: gateResult.Reason,
      Detail: gateResult.Detail,
      ResultJSON: JSON.stringify(gateResult, null, 2),
    };
  }
}

@RegisterClass(BaseRemotableOperation, COMMS_CREATE_SENDING_DOMAIN_KEY)
export class CommsCreateSendingDomainServerOperation extends BaseRemotableOperation<
  CommsSendingDomainInput,
  CommsSendingDomainAuthOutput
> {
  public get OperationKey(): string {
    return COMMS_CREATE_SENDING_DOMAIN_KEY;
  }

  protected override async Authorize(
    _input: CommsSendingDomainInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsSendingDomainInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsSendingDomainAuthOutput> {
    await CommunicationEngine.Instance.Config(false, user, provider);

    const domain = await loadSendingDomain(provider, input.DomainID, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${input.DomainID}' not found` };
    }

    const providerEntity = CommunicationEngine.Instance.Providers.find((p) =>
      UUIDsEqual(p.ID, domain.CommunicationProviderID),
    );
    if (!providerEntity) {
      return { Success: false, ErrorMessage: 'Communication provider not found for sending domain' };
    }

    const commProvider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
    const credentials = await resolveDomainCredentials(domain, user);
    const result = await commProvider.CreateDomainAuthentication({ Domain: domain.Domain }, credentials);
    if (!result.Success) {
      return {
        Success: false,
        Status: domain.Status,
        ProviderDomainID: domain.ProviderDomainID ?? undefined,
        DNSRecordsJSON: domain.DNSRecords ?? '[]',
        ErrorMessage: result.ErrorMessage ?? 'Provider failed to create domain authentication',
      };
    }

    domain.ProviderDomainID = result.ProviderDomainID ?? domain.ProviderDomainID;
    domain.DNSRecords = JSON.stringify(result.DNSRecords);
    domain.Status = 'Pending';
    if (!(await domain.Save())) {
      return {
        Success: false,
        ErrorMessage: domain.LatestResult?.CompleteMessage || 'Failed to save sending domain records',
      };
    }

    return {
      Success: true,
      Status: domain.Status,
      ProviderDomainID: domain.ProviderDomainID ?? undefined,
      DNSRecordsJSON: domain.DNSRecords ?? '[]',
    };
  }
}

@RegisterClass(BaseRemotableOperation, COMMS_VERIFY_SENDING_DOMAIN_KEY)
export class CommsVerifySendingDomainServerOperation extends BaseRemotableOperation<
  CommsSendingDomainInput,
  CommsSendingDomainAuthOutput
> {
  public get OperationKey(): string {
    return COMMS_VERIFY_SENDING_DOMAIN_KEY;
  }

  protected override async Authorize(
    _input: CommsSendingDomainInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsSendingDomainInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsSendingDomainAuthOutput> {
    await CommunicationEngine.Instance.Config(false, user, provider);

    const domain = await loadSendingDomain(provider, input.DomainID, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${input.DomainID}' not found` };
    }

    if (!domain.ProviderDomainID) {
      return {
        Success: false,
        Status: domain.Status,
        ErrorMessage: 'Domain authentication has not been created with the provider yet. Run Generate SPF/DKIM first.',
      };
    }

    const providerEntity = CommunicationEngine.Instance.Providers.find((p) =>
      UUIDsEqual(p.ID, domain.CommunicationProviderID),
    );
    if (!providerEntity) {
      return { Success: false, ErrorMessage: 'Communication provider not found for sending domain' };
    }

    const commProvider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
    const credentials = await resolveDomainCredentials(domain, user);
    const result = await commProvider.VerifyDomainAuthentication(
      {
        ProviderDomainID: domain.ProviderDomainID,
        Domain: domain.Domain,
      },
      credentials,
    );

    const now = new Date();
    domain.LastVerifiedAt = now;
    if (result.DNSRecords && result.DNSRecords.length > 0) {
      domain.DNSRecords = JSON.stringify(mergeDnsValidationRecords(domain.DNSRecords, result.DNSRecords));
    }
    if (result.Verified) {
      domain.Status = 'Verified';
      domain.VerifiedAt = domain.VerifiedAt ?? now;
    } else if (!result.Success) {
      domain.Status = 'Failed';
    } else {
      domain.Status = 'Pending';
    }

    if (!(await domain.Save())) {
      return {
        Success: false,
        ErrorMessage: domain.LatestResult?.CompleteMessage || 'Failed to save verification result',
      };
    }

    return {
      Success: result.Success,
      Verified: result.Verified,
      Status: domain.Status,
      ProviderDomainID: domain.ProviderDomainID ?? undefined,
      DNSRecordsJSON: domain.DNSRecords ?? '[]',
      ErrorMessage: result.ErrorMessage,
    };
  }
}

@RegisterClass(BaseRemotableOperation, COMMS_DELETE_SENDING_DOMAIN_KEY)
export class CommsDeleteSendingDomainServerOperation extends BaseRemotableOperation<
  CommsSendingDomainInput,
  CommsAdminMutationOutput
> {
  public get OperationKey(): string {
    return COMMS_DELETE_SENDING_DOMAIN_KEY;
  }

  protected override async Authorize(
    _input: CommsSendingDomainInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsSendingDomainInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsAdminMutationOutput> {
    await CommunicationEngine.Instance.Config(false, user, provider);

    const domain = await loadSendingDomain(provider, input.DomainID, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${input.DomainID}' not found` };
    }

    if (domain.ProviderDomainID) {
      const providerEntity = CommunicationEngine.Instance.Providers.find((p) =>
        UUIDsEqual(p.ID, domain.CommunicationProviderID),
      );
      if (providerEntity) {
        const commProvider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
        const credentials = await resolveDomainCredentials(domain, user);
        const delRes = await commProvider.DeleteDomainAuthentication(
          { ProviderDomainID: domain.ProviderDomainID },
          credentials,
        );
        if (!delRes.Success) {
          return { Success: false, ErrorMessage: delRes.ErrorMessage ?? 'Provider failed to delete domain' };
        }
      }
    }

    domain.Status = 'Revoked';
    if (!(await domain.Save())) {
      return {
        Success: false,
        ErrorMessage: domain.LatestResult?.CompleteMessage || 'Failed to update sending domain status',
      };
    }
    return { Success: true };
  }
}

@RegisterClass(BaseRemotableOperation, COMMS_REVOKE_SUPPRESSION_KEY)
export class CommsRevokeSuppressionServerOperation extends BaseRemotableOperation<
  CommsRevokeSuppressionInput,
  CommsAdminMutationOutput
> {
  public get OperationKey(): string {
    return COMMS_REVOKE_SUPPRESSION_KEY;
  }

  protected override async Authorize(
    _input: CommsRevokeSuppressionInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsRevokeSuppressionInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsAdminMutationOutput> {
    await CommunicationEngine.Instance.Config(false, user, provider);

    const supp = await provider.GetEntityObject<MJCommunicationSuppressionEntity>(
      'MJ: Communication Suppressions',
      user,
    );
    if (!(await supp.Load(input.SuppressionID))) {
      return { Success: false, ErrorMessage: `Suppression '${input.SuppressionID}' not found` };
    }

    const prevStatus = supp.Status;
    supp.Status = 'Revoked';
    supp.RevokedAt = new Date();
    if (!(await supp.Save())) {
      return {
        Success: false,
        ErrorMessage: supp.LatestResult?.CompleteMessage || 'Failed to revoke suppression',
      };
    }

    const audit = await provider.GetEntityObject<MJCommunicationConsentAuditLogEntity>(
      'MJ: Communication Consent Audit Logs',
      user,
    );
    audit.CommunicationSuppressionID = supp.ID;
    audit.Action = 'Revoked';
    audit.PreviousValue = JSON.stringify({ Status: prevStatus });
    audit.NewValue = JSON.stringify({ Status: 'Revoked' });
    audit.Source = 'Admin';
    audit.ChangedByUserID = user.ID;
    if (!(await audit.Save())) {
      LogError(`CommsRevokeSuppressionServerOperation: failed to save audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const warning = await clearDownstreamSuppression(provider, supp, user);
    await restoreEndpointIfNoActiveSuppressions(provider, supp.CommunicationEndpointID, user);
    return { Success: true, WarningMessage: warning };
  }
}

@RegisterClass(BaseRemotableOperation, COMMS_BLOCK_ENDPOINT_KEY)
export class CommsBlockEndpointServerOperation extends BaseRemotableOperation<
  CommsBlockEndpointInput,
  CommsBlockEndpointOutput
> {
  public get OperationKey(): string {
    return COMMS_BLOCK_ENDPOINT_KEY;
  }

  protected override async Authorize(
    _input: CommsBlockEndpointInput,
    user: UserInfo,
    context?: RemoteOpServerContext,
  ): Promise<boolean> {
    assertCommsAdmin(user, context?.provider);
    return true;
  }

  protected override async InternalExecute(
    input: CommsBlockEndpointInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<CommsBlockEndpointOutput> {
    const endpoint = await provider.GetEntityObject<MJCommunicationEndpointEntity>(
      'MJ: Communication Endpoints',
      user,
    );
    if (!(await endpoint.Load(input.EndpointID))) {
      return { Success: false, ErrorMessage: `Endpoint '${input.EndpointID}' not found` };
    }

    const supp = await provider.GetEntityObject<MJCommunicationSuppressionEntity>(
      'MJ: Communication Suppressions',
      user,
    );
    supp.CommunicationEndpointID = endpoint.ID;
    supp.BaseMessageTypeID = endpoint.BaseMessageTypeID;
    supp.Reason = 'Admin Block';
    supp.Source = 'Admin';
    supp.Status = 'Active';
    supp.EffectiveAt = new Date();
    if (!(await supp.Save())) {
      return {
        Success: false,
        ErrorMessage: supp.LatestResult?.CompleteMessage || 'Failed to create Admin Block suppression',
      };
    }

    const audit = await provider.GetEntityObject<MJCommunicationConsentAuditLogEntity>(
      'MJ: Communication Consent Audit Logs',
      user,
    );
    audit.CommunicationSuppressionID = supp.ID;
    audit.Action = 'Created';
    audit.PreviousValue = null;
    audit.NewValue = JSON.stringify({ Reason: 'Admin Block', Status: 'Active' });
    audit.Source = 'Admin';
    audit.ChangedByUserID = user.ID;
    if (!(await audit.Save())) {
      LogError(`CommsBlockEndpointServerOperation: failed to save audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    return { Success: true, SuppressionID: supp.ID };
  }
}

export function LoadCommsAdminOperations(): void {
  // Ensures bundler retains @RegisterClass side effects for all Communications Admin operations.
}
