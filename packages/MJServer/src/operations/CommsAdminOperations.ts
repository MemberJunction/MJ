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
  type IEntityDataProvider,
  type IMetadataProvider,
  LogError,
  RemoteOperationError,
  type RemoteOpServerContext,
  RunInEntityTransaction,
  RunView,
  type RunViewParams,
  type UserInfo,
} from '@memberjunction/core';
import {
  type CommsAdminMutationOutput,
  type CommsBlockEndpointInput,
  type CommsBlockEndpointOutput,
  type CommsRevokeSuppressionInput,
  type CommsSendingDomainAuthOutput,
  type CommsSendingDomainInput,
  type CommsSimulateComplianceGateInput,
  type CommsSimulateComplianceGateOutput,
  CommunicationsBlockEndpointOperation,
  CommunicationsCreateSendingDomainOperation,
  CommunicationsDeleteSendingDomainOperation,
  CommunicationsRevokeSuppressionOperation,
  CommunicationsSimulateComplianceGateOperation,
  CommunicationsVerifySendingDomainOperation,
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

/** Operation key for simulating the Communications V2 compliance gate. */
export const COMMS_SIMULATE_GATE_KEY = 'Communications.SimulateComplianceGate';
/** Operation key for registering a sending domain with its provider. */
export const COMMS_CREATE_SENDING_DOMAIN_KEY = 'Communications.CreateSendingDomain';
/** Operation key for verifying DNS authentication on a sending domain. */
export const COMMS_VERIFY_SENDING_DOMAIN_KEY = 'Communications.VerifySendingDomain';
/** Operation key for deleting a sending domain from its provider and database. */
export const COMMS_DELETE_SENDING_DOMAIN_KEY = 'Communications.DeleteSendingDomain';
/** Operation key for revoking an active communication suppression. */
export const COMMS_REVOKE_SUPPRESSION_KEY = 'Communications.RevokeSuppression';
/** Operation key for blocking a communication endpoint with an Admin Block suppression. */
export const COMMS_BLOCK_ENDPOINT_KEY = 'Communications.BlockEndpoint';

// The comms admin input/output types are defined in @memberjunction/core-entities; import them from there.

/** Deepest sender-parent chain the simulator walks; deeper chains are refused as a likely cycle. */
const SIMULATION_MAX_SENDER_DEPTH = 16;
/** Most of one recipient's active suppressions the simulator reads. */
const SIMULATION_MAX_SUPPRESSIONS = 500;

/**
 * An admin write that failed in a way the caller should be told about. Thrown inside a
 * transaction so the writes before it roll back, then turned into `Success: false` outside it.
 */
class AdminWriteFailedError extends Error {}

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

/**
 * Applies a provider's validation result to the DNS records stored on a sending domain.
 *
 * Records are paired by host (case-insensitive) and type, never by position: two DKIM records share
 * a purpose and type, so pairing by those would apply dkim2's result to dkim1 whenever the provider
 * lists them in a different order. A stored record with no counterpart is kept as it was; a
 * validated record with no stored counterpart is added. A validated record with an empty host or
 * value is ignored, so a provider can never blank out what was stored.
 */
export function MergeDnsValidationRecords(
  existingJson: string | null | undefined,
  validated: DomainDNSRecord[],
): DomainDNSRecord[] {
  const usable = validated.filter((v) => Boolean(v.Host?.trim()) && (Boolean(v.Value?.trim()) || v.Purpose === 'DMARC'));
  const existing = parseStoredDnsRecords(existingJson);
  if (existing.length === 0) {
    return usable;
  }

  const sameRecord = (a: DomainDNSRecord, b: DomainDNSRecord): boolean =>
    a.Host.trim().toLowerCase() === b.Host.trim().toLowerCase() && a.Type === b.Type;
  const remaining = [...usable];
  const merged = existing.map((rec) => {
    const idx = remaining.findIndex((v) => sameRecord(v, rec));
    if (idx === -1) {
      return rec;
    }
    const [match] = remaining.splice(idx, 1);
    const { LastError: _previousError, ...stored } = rec;
    return {
      ...stored,
      Value: match.Value || rec.Value,
      Validated: match.Validated,
      ...(match.LastError ? { LastError: match.LastError } : {}),
    };
  });
  return [...merged, ...remaining];
}

function parseStoredDnsRecords(existingJson: string | null | undefined): DomainDNSRecord[] {
  if (!existingJson) return [];
  try {
    const parsed = JSON.parse(existingJson) as DomainDNSRecord[] | object;
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.Host === 'string') : [];
  } catch {
    return [];
  }
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

async function resolveCredentialById(
  credentialId: string | null | undefined,
  user: UserInfo,
  subsystem = 'CommsAdmin',
): Promise<ProviderCredentialsBase | undefined> {
  if (!credentialId) {
    return undefined;
  }
  await CredentialEngine.Instance.Config(false, user);
  const cred = CredentialEngine.Instance.getCredentialById(credentialId);
  if (!cred) {
    throw new Error(`Credential '${credentialId}' was not found`);
  }
  const resolved = await CredentialEngine.Instance.GetCredential<{ apiKey?: string; APIKey?: string }>(
    cred.Name,
    { contextUser: user, subsystem },
  );
  const apiKey = resolved.values.apiKey ?? resolved.values.APIKey;
  return apiKey
    ? ({ apiKey } as ProviderCredentialsBase)
    : (resolved.values as ProviderCredentialsBase);
}

async function resolveDomainCredentials(
  domain: MJCommunicationSendingDomainEntity,
  user: UserInfo,
): Promise<ProviderCredentialsBase | undefined> {
  return resolveCredentialById(domain.CredentialID, user, 'CommsAdmin');
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
  if (!res.Success) {
    throw new Error(res.ErrorMessage || `Failed loading sending domain '${domainId}'`);
  }
  return res.Results.length > 0 ? res.Results[0] : undefined;
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
): Promise<{ providers: MJCommunicationProviderEntity[]; senderCredentialId?: string | null }> {
  if (supp.CommunicationSenderID) {
    const sender = await mdProvider.GetEntityObject<MJCommunicationSenderEntity>(
      'MJ: Communication Senders',
      user,
    );
    if (await sender.Load(supp.CommunicationSenderID)) {
      const matched = CommunicationEngine.Instance.Providers.find((p) =>
        UUIDsEqual(p.ID, sender.CommunicationProviderID),
      );
      if (matched) return { providers: [matched], senderCredentialId: sender.CredentialID };
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
  return { providers: res.Success ? res.Results : [] };
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

  const { providers: providerEntities, senderCredentialId } = await resolveProvidersForSuppression(mdProvider, supp, user);
  const suppressionType = mapReasonToSuppressionType(supp.Reason);
  if (!suppressionType) {
    return undefined;
  }
  const credentials = await resolveCredentialById(senderCredentialId, user, 'CommsAdmin');
  const warnings: string[] = [];

  for (const pe of providerEntities) {
    try {
      const instance = CommunicationEngine.Instance.GetProvider(pe.Name);
      if (hasRemoveSuppression(instance)) {
        const res = await instance.RemoveSuppression(endpoint.NormalizedValue, suppressionType, credentials);
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

/**
 * Walks a sender's parent chain, nearest first, over the (ID, ParentSenderID) pairs of every
 * sender. Returns an error message instead when the chain is deeper than
 * {@link SIMULATION_MAX_SENDER_DEPTH}: a simulation that cannot see every ancestor's suppressions
 * must not report a decision.
 */
function resolveSenderAncestors(
  sender: MJCommunicationSenderEntity,
  links: Array<{ ID: string; ParentSenderID: string | null }>,
): string[] | string {
  const parentOf = IndexByUUID(links, (l) => l.ID);
  const ancestors: string[] = [];
  const seen = new Set<string>([sender.ID.toLowerCase()]);
  let parentID = sender.ParentSenderID;
  while (parentID && !seen.has(parentID.toLowerCase())) {
    if (ancestors.length >= SIMULATION_MAX_SENDER_DEPTH) {
      return `Sender '${sender.ID}' has more than ${SIMULATION_MAX_SENDER_DEPTH} ancestors`;
    }
    seen.add(parentID.toLowerCase());
    const parent = parentOf.Get(parentID);
    if (!parent) break;
    ancestors.push(parent.ID);
    parentID = parent.ParentSenderID;
  }
  return ancestors;
}

/** Server implementation of `Communications.SimulateComplianceGate`. */
@RegisterClass(BaseRemotableOperation, COMMS_SIMULATE_GATE_KEY)
export class CommsSimulateComplianceGateServerOperation extends CommunicationsSimulateComplianceGateOperation {
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
    // Only the rows this simulation names are read as entities: the sender, the preference and the
    // principal by ID. The sender chain comes from (ID, ParentSenderID) pairs. The compliance tables
    // are small reference data and are read whole, which the resolver needs.
    const fixedViews: RunViewParams[] = [
      { EntityName: 'MJ: Communication Senders', ExtraFilter: `ID='${EscapeSQLString(input.SenderID)}'`, MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Senders', Fields: ['ID', 'ParentSenderID'], ResultType: 'simple' },
      { EntityName: 'MJ: Jurisdictions', ResultType: 'entity_object' },
      { EntityName: 'MJ: Jurisdiction Members', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Rule Types', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regimes', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regime Jurisdictions', ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Compliance Regime Rules', ResultType: 'entity_object' },
    ];
    const optionalViews: RunViewParams[] = [
      ...(input.PreferenceID
        ? [{ EntityName: 'MJ: Communication Preferences', ExtraFilter: `ID='${EscapeSQLString(input.PreferenceID)}'`, MaxRows: 1, ResultType: 'entity_object' as const }]
        : []),
      ...(input.PrincipalID
        ? [{ EntityName: 'MJ: Communication Principals', ExtraFilter: `ID='${EscapeSQLString(input.PrincipalID)}'`, MaxRows: 1, ResultType: 'entity_object' as const }]
        : []),
    ];
    const results = await rv.RunViews([...fixedViews, ...optionalViews], user);
    const failedMeta = results.find((r) => !r.Success);
    if (failedMeta) {
      return { Success: false, ErrorMessage: failedMeta.ErrorMessage || 'Failed loading compliance simulation metadata' };
    }
    const [sendersRes, senderLinksRes, jurRes, jmRes, rtRes, regRes, rjRes, rrRes] = results;
    let next = fixedViews.length;
    const prefsRes = input.PreferenceID ? results[next++] : undefined;
    const principalsRes = input.PrincipalID ? results[next++] : undefined;

    const sender = (sendersRes.Results as MJCommunicationSenderEntity[]).find((s) => UUIDsEqual(s.ID, input.SenderID));
    if (!sender) {
      return { Success: false, ErrorMessage: `Sender '${input.SenderID}' not found` };
    }

    const ancestors = resolveSenderAncestors(sender, senderLinksRes.Results as Array<{ ID: string; ParentSenderID: string | null }>);
    if (typeof ancestors === 'string') {
      return { Success: false, ErrorMessage: ancestors };
    }
    const senderAncestors = ancestors;

    const preference = prefsRes
      ? (prefsRes.Results as MJCommunicationPreferenceEntity[]).find((p) => UUIDsEqual(p.ID, input.PreferenceID))
      : undefined;

    const principal = principalsRes
      ? (principalsRes.Results as MJCommunicationPrincipalEntity[]).find((p) => UUIDsEqual(p.ID, input.PrincipalID))
      : undefined;

    const jurisdictions = jurRes.Results as MJJurisdictionEntity[];
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
          MaxRows: SIMULATION_MAX_SUPPRESSIONS,
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
      if (!suppRes.Success) {
        return { Success: false, ErrorMessage: suppRes.ErrorMessage || 'Failed loading recipient suppressions' };
      }
      suppressions = suppRes.Results as MJCommunicationSuppressionEntity[];
      if (ppRes && !ppRes.Success) {
        return { Success: false, ErrorMessage: ppRes.ErrorMessage || 'Failed loading recipient principal preferences' };
      }
      if (ppRes && ppRes.Results.length > 0) {
        principalPref = ppRes.Results[0] as MJCommunicationPrincipalPreferenceEntity;
      }
    }

    const emailChannel = CommunicationEngine.Instance.BaseMessageTypes.find(
      (b) => b.Type.toLowerCase() === 'email',
    );
    const channelId = emailChannel?.ID ?? sender.CommunicationProviderID;

    const resolver = new JurisdictionResolver({
      Jurisdictions: jurisdictions,
      JurisdictionMembers: jmRes.Results as MJJurisdictionMemberEntity[],
      ComplianceRuleTypes: rtRes.Results as MJCommunicationComplianceRuleTypeEntity[],
      ComplianceRegimes: regRes.Results as MJCommunicationComplianceRegimeEntity[],
      ComplianceRegimeJurisdictions: rjRes.Results as MJCommunicationComplianceRegimeJurisdictionEntity[],
      ComplianceRegimeRules: rrRes.Results as MJCommunicationComplianceRegimeRuleEntity[],
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

/** Server implementation of `Communications.CreateSendingDomain`. */
@RegisterClass(BaseRemotableOperation, COMMS_CREATE_SENDING_DOMAIN_KEY)
export class CommsCreateSendingDomainServerOperation extends CommunicationsCreateSendingDomainOperation {
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

    let domain: MJCommunicationSendingDomainEntity | undefined;
    try {
      domain = await loadSendingDomain(provider, input.DomainID, user);
    } catch (err) {
      return { Success: false, ErrorMessage: err instanceof Error ? err.message : String(err) };
    }
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

/** Server implementation of `Communications.VerifySendingDomain`. */
@RegisterClass(BaseRemotableOperation, COMMS_VERIFY_SENDING_DOMAIN_KEY)
export class CommsVerifySendingDomainServerOperation extends CommunicationsVerifySendingDomainOperation {
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

    let domain: MJCommunicationSendingDomainEntity | undefined;
    try {
      domain = await loadSendingDomain(provider, input.DomainID, user);
    } catch (err) {
      return { Success: false, ErrorMessage: err instanceof Error ? err.message : String(err) };
    }
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
      domain.DNSRecords = JSON.stringify(MergeDnsValidationRecords(domain.DNSRecords, result.DNSRecords));
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

/** Server implementation of `Communications.DeleteSendingDomain`. */
@RegisterClass(BaseRemotableOperation, COMMS_DELETE_SENDING_DOMAIN_KEY)
export class CommsDeleteSendingDomainServerOperation extends CommunicationsDeleteSendingDomainOperation {
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

    let domain: MJCommunicationSendingDomainEntity | undefined;
    try {
      domain = await loadSendingDomain(provider, input.DomainID, user);
    } catch (err) {
      return { Success: false, ErrorMessage: err instanceof Error ? err.message : String(err) };
    }
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

/** Server implementation of `Communications.RevokeSuppression`. */
@RegisterClass(BaseRemotableOperation, COMMS_REVOKE_SUPPRESSION_KEY)
export class CommsRevokeSuppressionServerOperation extends CommunicationsRevokeSuppressionOperation {
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
    try {
      // The revocation and its consent-audit row commit together, or neither does.
      await RunInEntityTransaction(asTransactionalProvider(provider), async () => {
        supp.Status = 'Revoked';
        supp.RevokedAt = new Date();
        if (!(await supp.Save())) {
          throw new AdminWriteFailedError(supp.LatestResult?.CompleteMessage || 'Failed to revoke suppression');
        }
        await saveSuppressionAudit(provider, user, supp.ID, 'Revoked', { Status: prevStatus }, { Status: 'Revoked' });
      });
    } catch (ex) {
      if (ex instanceof AdminWriteFailedError) {
        return { Success: false, ErrorMessage: ex.message };
      }
      throw ex;
    }

    const warning = await clearDownstreamSuppression(provider, supp, user);
    await restoreEndpointIfNoActiveSuppressions(provider, supp.CommunicationEndpointID, user);
    return { Success: true, WarningMessage: warning };
  }
}

/** Server implementation of `Communications.BlockEndpoint`. */
@RegisterClass(BaseRemotableOperation, COMMS_BLOCK_ENDPOINT_KEY)
export class CommsBlockEndpointServerOperation extends CommunicationsBlockEndpointOperation {
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

    try {
      // The re-check, the suppression and its audit row run in one transaction, so no block
      // exists without its audit row. Two concurrent blocks of one address cannot both be saved:
      // UX_CommunicationSuppression_ActiveAdminBlock allows one active Admin Block per endpoint.
      const suppressionID = await RunInEntityTransaction(asTransactionalProvider(provider), () => createAdminBlock(provider, user, endpoint));
      return { Success: true, SuppressionID: suppressionID };
    } catch (ex) {
      if (!(ex instanceof AdminWriteFailedError)) throw ex;
      // The transaction rolled back. If a concurrent request blocked the address first, the
      // address is blocked, which is what was asked: report that block.
      const winner = await findActiveAdminBlock(provider, user, endpoint.ID);
      if (winner.Success && winner.SuppressionID) {
        return { Success: true, SuppressionID: winner.SuppressionID };
      }
      return { Success: false, ErrorMessage: ex.message };
    }
  }
}

/**
 * The request's provider as one that can open entity transactions, when it is one. The transaction
 * members live on `IEntityDataProvider`, not `IMetadataProvider`; every server database provider
 * implements both. Without them `RunInEntityTransaction` runs the work unguarded.
 */
function asTransactionalProvider(
  provider: IMetadataProvider,
): Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> | undefined {
  return isTransactionalProvider(provider) ? provider : undefined;
}

function isTransactionalProvider(
  provider: object,
): provider is Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> {
  return 'BeginEntityTransaction' in provider && typeof provider.BeginEntityTransaction === 'function';
}

/** Reads the endpoint's active Admin Block, if it has one. */
async function findActiveAdminBlock(
  provider: IMetadataProvider,
  user: UserInfo,
  endpointID: string,
): Promise<{ Success: boolean; SuppressionID?: string; ErrorMessage?: string }> {
  const rv = RunView.FromMetadataProvider(provider);
  const res = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Communication Suppressions',
      ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpointID)}' AND Reason='Admin Block' AND Status='Active'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  if (!res.Success) {
    return { Success: false, ErrorMessage: res.ErrorMessage || 'Failed checking existing Admin Block suppressions' };
  }
  return { Success: true, SuppressionID: res.Results[0]?.ID };
}

/** Returns the endpoint's existing active Admin Block, or creates and audits one. */
async function createAdminBlock(
  provider: IMetadataProvider,
  user: UserInfo,
  endpoint: MJCommunicationEndpointEntity,
): Promise<string> {
  const existing = await findActiveAdminBlock(provider, user, endpoint.ID);
  if (!existing.Success) {
    throw new AdminWriteFailedError(existing.ErrorMessage ?? 'Failed checking existing Admin Block suppressions');
  }
  if (existing.SuppressionID) {
    return existing.SuppressionID;
  }

  const supp = await provider.GetEntityObject<MJCommunicationSuppressionEntity>('MJ: Communication Suppressions', user);
  supp.CommunicationEndpointID = endpoint.ID;
  supp.BaseMessageTypeID = endpoint.BaseMessageTypeID;
  supp.Reason = 'Admin Block';
  supp.Source = 'Admin';
  supp.Status = 'Active';
  supp.EffectiveAt = new Date();
  if (!(await supp.Save())) {
    throw new AdminWriteFailedError(supp.LatestResult?.CompleteMessage || 'Failed to create Admin Block suppression');
  }
  await saveSuppressionAudit(provider, user, supp.ID, 'Created', null, { Reason: 'Admin Block', Status: 'Active' });
  return supp.ID;
}

/** Writes the consent-audit row for an admin change to a suppression; throws when it cannot. */
async function saveSuppressionAudit(
  provider: IMetadataProvider,
  user: UserInfo,
  suppressionID: string,
  action: MJCommunicationConsentAuditLogEntity['Action'],
  previous: object | null,
  next: object,
): Promise<void> {
  const audit = await provider.GetEntityObject<MJCommunicationConsentAuditLogEntity>('MJ: Communication Consent Audit Logs', user);
  audit.CommunicationSuppressionID = suppressionID;
  audit.Action = action;
  audit.PreviousValue = previous ? JSON.stringify(previous) : null;
  audit.NewValue = JSON.stringify(next);
  audit.Source = 'Admin';
  audit.ChangedByUserID = user.ID;
  if (!(await audit.Save())) {
    throw new AdminWriteFailedError(`Failed to save consent audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
}

export function LoadCommsAdminOperations(): void {
  // Ensures bundler retains @RegisterClass side effects for all Communications Admin operations.
}
