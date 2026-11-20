import { Arg, Ctx, Field, Mutation, ObjectType, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationProviderEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import type { BaseMessageResult, ProviderCredentialsBase } from '@memberjunction/communication-types';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

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
  @Mutation(() => CommsSendingDomainAuthResult)
  public async CreateCommsSendingDomain(
    @Arg('DomainID') domainId: string,
    @Ctx() context: AppContext,
  ): Promise<CommsSendingDomainAuthResult> {
    const user = context.userPayload?.userRecord;
    if (!user) {
      return { Success: false, ErrorMessage: 'Authentication required' };
    }

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
    const result = await provider.CreateDomainAuthentication({ Domain: domain.Domain });
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
    const user = context.userPayload?.userRecord;
    if (!user) {
      return { Success: false, ErrorMessage: 'Authentication required' };
    }

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
    const result = await provider.VerifyDomainAuthentication({
      ProviderDomainID: domain.ProviderDomainID,
      Domain: domain.Domain,
    });

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
    const user = context.userPayload?.userRecord;
    if (!user) {
      return { Success: false, ErrorMessage: 'Authentication required' };
    }

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
        const delRes = await provider.DeleteDomainAuthentication({
          ProviderDomainID: domain.ProviderDomainID,
        });
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
    const user = context.userPayload?.userRecord;
    if (!user) {
      return { Success: false, ErrorMessage: 'Authentication required' };
    }

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
    await audit.Save();

    const warning = await this.clearDownstreamSuppression(mdProvider, supp, user);
    return { Success: true, WarningMessage: warning };
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
