import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider, GetReadWriteProvider } from '../util.js';
import { IsOwner } from '../auth/actionAuthorization.js';
import { AuthorizationEvaluator, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
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
import { CredentialEngine } from '@memberjunction/credentials';
import type {
  BaseMessageResult,
  MessageClass,
  ProviderCredentialsBase,
} from '@memberjunction/communication-types';
import { EscapeSQLString, IndexByUUID, UUIDsEqual } from '@memberjunction/global';

@ObjectType()
export class CommsSendingDomainAuthResult {
  @Field()
  Success!: boolean;

  @Field({ nullable: true })
  Verified?: boolean;

  @Field({ nullable: true })
  Status?: string;

  @Field({ nullable: true })
  ProviderDomainID?: string;

  @Field({ nullable: true })
  DNSRecordsJSON?: string;

  @Field({ nullable: true })
  ErrorMessage?: string;
}

@ObjectType()
export class CommsAdminMutationResult {
  @Field()
  Success!: boolean;

  @Field({ nullable: true })
  ErrorMessage?: string;

  @Field({ nullable: true })
  WarningMessage?: string;
}

@InputType()
export class CommsGateSimulationInput {
  @Field()
  SenderID!: string;

  @Field({ nullable: true })
  PrincipalID?: string;

  @Field({ nullable: true })
  RecordID?: string;

  @Field({ nullable: true })
  PreferenceID?: string;

  @Field()
  MessageClass!: string;

  @Field({ nullable: true })
  RecipientJurisdictionID?: string;
}

@ObjectType()
export class CommsGateSimulationResult {
  @Field()
  Success!: boolean;

  @Field({ nullable: true })
  Decision?: string;

  @Field({ nullable: true })
  Reason?: string;

  @Field({ nullable: true })
  Detail?: string;

  @Field({ nullable: true })
  ResultJSON?: string;

  @Field({ nullable: true })
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

function requireCommsAdmin(context: AppContext): string | null {
  const user = context.userPayload?.userRecord;
  if (!user) {
    return 'Authentication required';
  }
  if (IsOwner(user)) {
    return null;
  }
  const authorizations =
    GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true })?.Authorizations ?? [];
  const commsAuth = authorizations.find(
    (a) => a.Name?.trim().toLowerCase() === 'communications: admin',
  );
  if (commsAuth && new AuthorizationEvaluator().UserCanExecuteWithAncestors(commsAuth, user, authorizations)) {
    return null;
  }
  return 'Owner privileges or "Communications: Admin" authorization required for Communications Admin operations';
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

@Resolver()
export class CommsAdminResolver {
  @Query(() => CommsGateSimulationResult)
  public async SimulateCommsComplianceGate(
    @Arg('Input') input: CommsGateSimulationInput,
    @Ctx() context: AppContext,
  ): Promise<CommsGateSimulationResult> {
    const authError = requireCommsAdmin(context);
    if (authError) {
      return { Success: false, ErrorMessage: authError };
    }
    const user = context.userPayload!.userRecord!;

    const mdProvider = GetReadWriteProvider(context.providers) as IMetadataProvider;
    await CommunicationEngine.Instance.Config(false, user, mdProvider);

    const rv = RunView.FromMetadataProvider(mdProvider);
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

  @Mutation(() => CommsSendingDomainAuthResult)
  public async CreateCommsSendingDomain(
    @Arg('DomainID') domainId: string,
    @Ctx() context: AppContext,
  ): Promise<CommsSendingDomainAuthResult> {
    const authError = requireCommsAdmin(context);
    if (authError) {
      return { Success: false, ErrorMessage: authError };
    }
    const user = context.userPayload!.userRecord!;

    const mdProvider = GetReadWriteProvider(context.providers) as IMetadataProvider;
    await CommunicationEngine.Instance.Config(false, user, mdProvider);

    const domain = await this.loadSendingDomain(mdProvider, domainId, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${domainId}' not found` };
    }

    const providerEntity = CommunicationEngine.Instance.Providers.find((p) =>
      UUIDsEqual(p.ID, domain.CommunicationProviderID),
    );
    if (!providerEntity) {
      return { Success: false, ErrorMessage: 'Communication provider not found for sending domain' };
    }

    const provider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
    const credentials = await this.resolveDomainCredentials(domain, user);
    const result = await provider.CreateDomainAuthentication({ Domain: domain.Domain }, credentials);
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

  @Mutation(() => CommsSendingDomainAuthResult)
  public async VerifyCommsSendingDomain(
    @Arg('DomainID') domainId: string,
    @Ctx() context: AppContext,
  ): Promise<CommsSendingDomainAuthResult> {
    const authError = requireCommsAdmin(context);
    if (authError) {
      return { Success: false, ErrorMessage: authError };
    }
    const user = context.userPayload!.userRecord!;

    const mdProvider = GetReadWriteProvider(context.providers) as IMetadataProvider;
    await CommunicationEngine.Instance.Config(false, user, mdProvider);

    const domain = await this.loadSendingDomain(mdProvider, domainId, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${domainId}' not found` };
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

    const provider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
    const credentials = await this.resolveDomainCredentials(domain, user);
    const result = await provider.VerifyDomainAuthentication(
      {
        ProviderDomainID: domain.ProviderDomainID,
        Domain: domain.Domain,
      },
      credentials,
    );

    const now = new Date();
    domain.LastVerifiedAt = now;
    if (result.DNSRecords && result.DNSRecords.length > 0) {
      domain.DNSRecords = JSON.stringify(result.DNSRecords);
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

  @Mutation(() => CommsAdminMutationResult)
  public async DeleteCommsSendingDomain(
    @Arg('DomainID') domainId: string,
    @Ctx() context: AppContext,
  ): Promise<CommsAdminMutationResult> {
    const authError = requireCommsAdmin(context);
    if (authError) {
      return { Success: false, ErrorMessage: authError };
    }
    const user = context.userPayload!.userRecord!;

    const mdProvider = GetReadWriteProvider(context.providers) as IMetadataProvider;
    await CommunicationEngine.Instance.Config(false, user, mdProvider);

    const domain = await this.loadSendingDomain(mdProvider, domainId, user);
    if (!domain) {
      return { Success: false, ErrorMessage: `Sending domain '${domainId}' not found` };
    }

    if (domain.ProviderDomainID) {
      const providerEntity = CommunicationEngine.Instance.Providers.find((p) =>
        UUIDsEqual(p.ID, domain.CommunicationProviderID),
      );
      if (providerEntity) {
        const provider = CommunicationEngine.Instance.GetProvider(providerEntity.Name);
        const credentials = await this.resolveDomainCredentials(domain, user);
        const delRes = await provider.DeleteDomainAuthentication(
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

  @Mutation(() => CommsAdminMutationResult)
  public async RevokeCommsSuppression(
    @Arg('SuppressionID') suppressionId: string,
    @Ctx() context: AppContext,
  ): Promise<CommsAdminMutationResult> {
    const authError = requireCommsAdmin(context);
    if (authError) {
      return { Success: false, ErrorMessage: authError };
    }
    const user = context.userPayload!.userRecord!;

    const mdProvider = GetReadWriteProvider(context.providers) as IMetadataProvider;
    await CommunicationEngine.Instance.Config(false, user, mdProvider);

    const supp = await mdProvider.GetEntityObject<MJCommunicationSuppressionEntity>(
      'MJ: Communication Suppressions',
      user,
    );
    if (!(await supp.Load(suppressionId))) {
      return { Success: false, ErrorMessage: `Suppression '${suppressionId}' not found` };
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

    const audit = await mdProvider.GetEntityObject<MJCommunicationConsentAuditLogEntity>(
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
      LogError(`RevokeCommunicationSuppression: failed to save audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const warning = await this.clearDownstreamSuppression(mdProvider, supp, user);
    await this.restoreEndpointIfNoActiveSuppressions(mdProvider, supp.CommunicationEndpointID, user);
    return { Success: true, WarningMessage: warning };
  }

  private async restoreEndpointIfNoActiveSuppressions(
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

  private async clearDownstreamSuppression(
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

    const providerEntities = await this.resolveProvidersForSuppression(mdProvider, supp, user);
    const suppressionType = mapReasonToSuppressionType(supp.Reason);
    if (!suppressionType) {
      // Internal MJ suppressions (Admin Block, Policy) must not clear genuine provider bounce/spam lists
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
        LogError(`[CommsAdminResolver] Failed clearing downstream suppression on ${pe.Name}: ${msg}`);
        warnings.push(`${pe.Name}: ${msg}`);
      }
    }

    return warnings.length > 0 ? warnings.join('; ') : undefined;
  }

  private async resolveProvidersForSuppression(
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

  private async resolveDomainCredentials(
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

  private async loadSendingDomain(
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
}
