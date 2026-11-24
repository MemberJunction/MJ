import { vi } from 'vitest';
import {
  BaseCommunicationPrincipal,
  BaseCommunicationProvider,
  CommunicationEngineBase,
  MessageResult,
  PrincipalAttributes,
  PrincipalMessageContext,
  PrincipalRecordRef,
  ProcessedMessage,
  ProviderCredentialsBase,
  ResolvedEndpoint,
} from '@memberjunction/communication-types';
import { AuthorizationInfo, AuthorizationRoleInfo, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationProviderMessageTypeEntity,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
// Registers the compliance rule drivers with the ClassFactory, as the package entry point does.
import '../../compliance/rules';
import type { ComplianceMetadataSource } from '../../compliance/JurisdictionResolver';
import { ComputeEndpointHash, PrincipalRecordKey } from '../../DefaultCommunicationPrincipal';
import { FakeCommsDb, FakeRow } from './FakeCommsDb';

export const ENTITY = {
  Senders: 'MJ: Communication Senders',
  SenderPermissions: 'MJ: Communication Sender Permissions',
  SendingDomains: 'MJ: Communication Sending Domains',
  Endpoints: 'MJ: Communication Endpoints',
  Suppressions: 'MJ: Communication Suppressions',
  Preferences: 'MJ: Communication Preferences',
  PrincipalPreferences: 'MJ: Communication Principal Preferences',
  Runs: 'MJ: Communication Runs',
  Logs: 'MJ: Communication Logs',
} as const;

/** Fixed identifiers. Lower-case on purpose: the database hands them back upper-case. */
export const IDS = {
  ChannelEmail: '11111111-1111-4111-8111-111111111111',
  Provider: '22222222-2222-4222-8222-222222222222',
  ProviderMessageType: '33333333-3333-4333-8333-333333333333',
  Sender: '44444444-4444-4444-8444-444444444444',
  ParentSender: '44444444-4444-4444-8444-4444444444aa',
  ContactsEntity: '55555555-5555-4555-8555-555555555555',
  SystemUser: '66666666-6666-4666-8666-666666666666',
  CallerUser: '77777777-7777-4777-8777-777777777777',
  SendRole: '88888888-8888-4888-8888-888888888888',
  Credential: '99999999-9999-4999-8999-999999999999',
  Preference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const;

export const PROVIDER_NAME = 'Fake Email Provider';
const PRINCIPAL_DRIVER_KEY = 'FakeCommsPrincipalDriver';

export function SameID(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

// ---------------------------------------------------------------------------
// Provider fake
// ---------------------------------------------------------------------------

export type ProviderBehavior = 'succeed' | 'fail' | 'throw';

export interface ProviderAttempt {
  Message: ProcessedMessage;
  Credentials?: ProviderCredentialsBase;
  Behavior: ProviderBehavior;
}

/** Send provider with three modes: accept the message, return a failed result, or throw. */
export class FakeSendProvider {
  public DefaultBehavior: ProviderBehavior = 'succeed';
  public readonly Attempts: ProviderAttempt[] = [];
  private readonly behaviorByAddress = new Map<string, ProviderBehavior>();

  public SetBehaviorFor(address: string, behavior: ProviderBehavior): void {
    this.behaviorByAddress.set(address.toLowerCase(), behavior);
  }

  /** Messages the provider accepted, i.e. what actually left the building. */
  public get Delivered(): ProcessedMessage[] {
    return this.Attempts.filter((a) => a.Behavior === 'succeed').map((a) => a.Message);
  }

  public AsProvider(): BaseCommunicationProvider {
    const sendOnly: Pick<BaseCommunicationProvider, 'SendSingleMessage'> = {
      SendSingleMessage: async (message, credentials) => this.send(message, credentials),
    };
    return sendOnly as BaseCommunicationProvider;
  }

  private send(message: ProcessedMessage, credentials?: ProviderCredentialsBase): MessageResult {
    const behavior = this.behaviorByAddress.get(String(message.To).toLowerCase()) ?? this.DefaultBehavior;
    this.Attempts.push({ Message: message, Credentials: credentials, Behavior: behavior });
    if (behavior === 'throw') {
      throw new Error('Simulated provider outage: ECONNRESET');
    }
    const result = new MessageResult();
    result.Message = message;
    result.Success = behavior === 'succeed';
    result.Error = behavior === 'succeed' ? '' : '550 5.1.1 mailbox unavailable';
    result.ProviderMessageID = behavior === 'succeed' ? `pm-${this.Attempts.length}` : undefined;
    return result;
  }
}

// ---------------------------------------------------------------------------
// Principal driver fake
// ---------------------------------------------------------------------------

type HookFn = (contexts: PrincipalMessageContext[]) => void | Promise<void>;

/** Shared state for {@link FakePrincipalDriver}: the ClassFactory builds a new driver per lookup. */
export const PrincipalDriverState = {
  Endpoints: new Map<string, ResolvedEndpoint[]>(),
  Attributes: new Map<string, PrincipalAttributes>(),
  Jurisdictions: new Map<string, string | null>(),
  ResolveEndpointsError: undefined as Error | undefined,
  PreProcess: undefined as HookFn | undefined,
  PostProcess: undefined as HookFn | undefined,
  PreProcessCalls: 0,
  PostProcessCalls: 0,
  Reset(): void {
    this.Endpoints.clear();
    this.Attributes.clear();
    this.Jurisdictions.clear();
    this.ResolveEndpointsError = undefined;
    this.PreProcess = undefined;
    this.PostProcess = undefined;
    this.PreProcessCalls = 0;
    this.PostProcessCalls = 0;
  },
};

class FakePrincipalDriver extends BaseCommunicationPrincipal {
  public async ResolveEndpoints(records: PrincipalRecordRef[]): Promise<Map<string, ResolvedEndpoint[]>> {
    if (PrincipalDriverState.ResolveEndpointsError) {
      throw PrincipalDriverState.ResolveEndpointsError;
    }
    const out = new Map<string, ResolvedEndpoint[]>();
    for (const record of records) {
      const endpoints = PrincipalDriverState.Endpoints.get(PrincipalRecordKey(record));
      if (endpoints) out.set(PrincipalRecordKey(record), endpoints);
    }
    return out;
  }

  public async ResolveJurisdiction(): Promise<Map<string, string | null>> {
    return new Map(PrincipalDriverState.Jurisdictions);
  }

  public async ResolveAttributes(): Promise<Map<string, PrincipalAttributes>> {
    return new Map(PrincipalDriverState.Attributes);
  }

  public override async PreProcess(contexts: PrincipalMessageContext[]): Promise<void> {
    PrincipalDriverState.PreProcessCalls++;
    await PrincipalDriverState.PreProcess?.(contexts);
  }

  public override async PostProcess(contexts: PrincipalMessageContext[]): Promise<void> {
    PrincipalDriverState.PostProcessCalls++;
    await PrincipalDriverState.PostProcess?.(contexts);
  }
}

MJGlobal.Instance.ClassFactory.Register(BaseCommunicationPrincipal, FakePrincipalDriver, PRINCIPAL_DRIVER_KEY);

// ---------------------------------------------------------------------------
// Compliance metadata
// ---------------------------------------------------------------------------

export function EmptyCompliance(): ComplianceMetadataSource {
  return {
    Jurisdictions: [],
    JurisdictionMembers: [],
    ComplianceRegimes: [],
    ComplianceRuleTypes: [],
    ComplianceRegimeRules: [],
    ComplianceRegimeJurisdictions: [],
  };
}

const REGIME_ID = 'cccc0001-0000-4000-8000-000000000001';
const RULE_TYPE = {
  Unsubscribe: 'bbbb0002-0000-4000-8000-000000000002',
  SenderId: 'bbbb0003-0000-4000-8000-000000000003',
  QuietHours: 'bbbb0004-0000-4000-8000-000000000004',
};

function marketingRule(id: string, ruleTypeID: string, parameters: Record<string, unknown>): MJCommunicationComplianceRegimeRuleEntity {
  return {
    ID: id,
    CommunicationComplianceRegimeID: REGIME_ID,
    CommunicationComplianceRuleTypeID: ruleTypeID,
    BaseMessageTypeID: null,
    MessageClass: 'Marketing',
    Parameters: JSON.stringify(parameters),
    Status: 'Active',
  } as MJCommunicationComplianceRegimeRuleEntity;
}

/**
 * A CAN-SPAM-shaped regime that applies when the recipient jurisdiction is unknown: Marketing mail
 * needs a one-click header, a footer unsubscribe link and the sender's postal address.
 * `AlwaysQuietHours` adds a quiet-hours window covering the whole day, so Marketing mail is deferred
 * no matter what time the test runs.
 */
export function MarketingCompliance(options: { AlwaysQuietHours?: boolean } = {}): ComplianceMetadataSource {
  const rules = [
    marketingRule('rule-unsub', RULE_TYPE.Unsubscribe, { oneClickHeader: 'required', footerLink: 'required' }),
    marketingRule('rule-sender', RULE_TYPE.SenderId, { requirePostalAddress: true }),
  ];
  if (options.AlwaysQuietHours) {
    rules.push(
      marketingRule('rule-quiet', RULE_TYPE.QuietHours, {
        windows: [
          { startHour: 0, endHour: 12 },
          { startHour: 12, endHour: 24 },
        ],
      }),
    );
  }
  return {
    ...EmptyCompliance(),
    ComplianceRegimes: [
      {
        ID: REGIME_ID,
        Name: 'Test CAN-SPAM',
        AppliesBy: 'Recipient',
        AppliesWhenJurisdictionUnknown: true,
        Status: 'Active',
      } as MJCommunicationComplianceRegimeEntity,
    ],
    ComplianceRuleTypes: [
      {
        ID: RULE_TYPE.Unsubscribe,
        Name: 'UnsubscribeMechanism',
        DriverClass: 'UnsubscribeMechanismRuleDriver',
        Status: 'Active',
      } as MJCommunicationComplianceRuleTypeEntity,
      {
        ID: RULE_TYPE.SenderId,
        Name: 'SenderIdentification',
        DriverClass: 'SenderIdentificationRuleDriver',
        Status: 'Active',
      } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RULE_TYPE.QuietHours, Name: 'QuietHours', DriverClass: 'QuietHoursRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
    ],
    ComplianceRegimeRules: rules,
  };
}

// ---------------------------------------------------------------------------
// Engine wiring
// ---------------------------------------------------------------------------

export interface InstallOptions {
  Compliance?: ComplianceMetadataSource;
  RequireVerifiedDomain?: boolean;
  /** The provider's `DeliveryGuarantee`. Defaults to `'At Most Once'`, as the database does. */
  ProviderDeliveryGuarantee?: 'At Most Once' | 'At Least Once';
}

export interface InstalledEngine {
  /** The engine's own bookkeeping user (`CommunicationEngineBase.Instance.ContextUser`). */
  SystemUser: UserInfo;
  /** The user on whose behalf `Send` is called. Holds {@link IDS.SendRole}. */
  CallerUser: UserInfo;
}

/**
 * Points `CommunicationEngineBase.Instance` at the fake database and a one-provider, one-principal
 * metadata set. `StartRun` / `EndRun` stay real, so runs are rows with real save semantics.
 */
export function InstallCommsEngine(db: FakeCommsDb, options: InstallOptions = {}): InstalledEngine {
  const engine = CommunicationEngineBase.Instance;
  const compliance = options.Compliance ?? EmptyCompliance();
  const systemUser = new UserInfo(undefined, { ID: IDS.SystemUser, Name: 'System', Email: 'system@example.org', UserRoles: [] });
  const callerUser = new UserInfo(undefined, {
    ID: IDS.CallerUser,
    Name: 'Caller',
    Email: 'caller@example.org',
    UserRoles: [{ UserID: IDS.CallerUser, RoleID: IDS.SendRole }],
  });

  const messageType = {
    ID: IDS.ProviderMessageType,
    CommunicationProviderID: IDS.Provider,
    CommunicationBaseMessageTypeID: IDS.ChannelEmail,
    Name: 'Email',
  } as MJCommunicationProviderMessageTypeEntity;
  const provider = {
    ID: IDS.Provider,
    Name: PROVIDER_NAME,
    RequireVerifiedDomain: options.RequireVerifiedDomain ?? false,
    DeliveryGuarantee: options.ProviderDeliveryGuarantee ?? 'At Most Once',
    MessageTypes: [messageType],
  } as CommunicationEngineBase['Providers'][number];
  const principal = {
    ID: 'principal-contacts',
    EntityID: IDS.ContactsEntity,
    Status: 'Active',
    DriverClass: PRINCIPAL_DRIVER_KEY,
  } as MJCommunicationPrincipalEntity;

  const dbProvider = db.Provider;
  Object.defineProperty(dbProvider, 'AuthorizationRoles', {
    value: [
      new AuthorizationRoleInfo({ ID: 'ar-send-tx', AuthorizationID: 'auth-send-transactional', RoleID: IDS.SendRole, Type: 'Allow' }),
    ],
    configurable: true,
  });
  Object.defineProperty(dbProvider, 'Authorizations', {
    value: [
      new AuthorizationInfo(
        {
          ID: 'auth-send-transactional',
          Name: 'Communications: Send Transactional',
          IsActive: true,
          ParentID: null,
        },
        dbProvider,
      ),
    ],
    configurable: true,
  });
  vi.spyOn(engine, 'ProviderToUse', 'get').mockReturnValue(dbProvider);
  vi.spyOn(engine, 'ContextUser', 'get').mockReturnValue(systemUser);
  vi.spyOn(engine, 'Providers', 'get').mockReturnValue([provider]);
  vi.spyOn(engine, 'Principals', 'get').mockReturnValue([principal]);
  vi.spyOn(engine, 'SenderTypes', 'get').mockReturnValue([]);
  vi.spyOn(engine, 'SuppressionPolicies', 'get').mockReturnValue([]);
  vi.spyOn(engine, 'Jurisdictions', 'get').mockReturnValue(compliance.Jurisdictions);
  vi.spyOn(engine, 'JurisdictionMembers', 'get').mockReturnValue(compliance.JurisdictionMembers);
  vi.spyOn(engine, 'ComplianceRegimes', 'get').mockReturnValue(compliance.ComplianceRegimes);
  vi.spyOn(engine, 'ComplianceRuleTypes', 'get').mockReturnValue(compliance.ComplianceRuleTypes);
  vi.spyOn(engine, 'ComplianceRegimeRules', 'get').mockReturnValue(compliance.ComplianceRegimeRules);
  vi.spyOn(engine, 'ComplianceRegimeJurisdictions', 'get').mockReturnValue(compliance.ComplianceRegimeJurisdictions);

  return { SystemUser: systemUser, CallerUser: callerUser };
}

// ---------------------------------------------------------------------------
// Seed helpers (rows as the database would hold them)
// ---------------------------------------------------------------------------

export function SeedSender(db: FakeCommsDb, overrides: FakeRow = {}): FakeRow {
  return db.Seed(ENTITY.Senders, {
    ID: IDS.Sender,
    Name: 'Newsletter',
    Status: 'Active',
    IsDefault: true,
    ParentSenderID: null,
    CommunicationSenderTypeID: null,
    FromEmail: 'news@example.org',
    FromPhone: null,
    FromName: 'Example News',
    PostalAddress: '1 Main St, Springfield',
    PreferenceCenterURL: null,
    JurisdictionID: null,
    CommunicationProviderID: IDS.Provider,
    CredentialID: null,
    SendingDomain: 'example.org',
    EnforcementMode: null,
    TemplateContext: null,
    Configuration: null,
    ...overrides,
  });
}

export function SeedEndpoint(db: FakeCommsDb, address: string, overrides: FakeRow = {}): FakeRow {
  const normalized = address.trim().toLowerCase();
  return db.Seed(ENTITY.Endpoints, {
    BaseMessageTypeID: IDS.ChannelEmail,
    NormalizedValue: normalized,
    ValueHash: ComputeEndpointHash(normalized),
    Domain: normalized.slice(normalized.lastIndexOf('@') + 1),
    Status: 'Active',
    SoftBounceCount: 0,
    LastSentAt: null,
    LastDeliveredAt: null,
    LastBouncedAt: null,
    LastEngagedAt: null,
    ...overrides,
  });
}

export function SeedSuppression(db: FakeCommsDb, overrides: FakeRow): FakeRow {
  return db.Seed(ENTITY.Suppressions, {
    CommunicationEndpointID: null,
    EntityID: null,
    RecordID: null,
    CommunicationSenderID: null,
    CommunicationPreferenceID: null,
    BaseMessageTypeID: null,
    Reason: 'Admin Block',
    Source: 'Admin',
    Status: 'Active',
    EffectiveAt: new Date('2026-01-01T00:00:00Z'),
    ExpiresAt: null,
    RevokedAt: null,
    CommunicationSuppressionPolicyID: null,
    ...overrides,
  });
}

export function SeedRun(db: FakeCommsDb, overrides: FakeRow = {}): FakeRow {
  return db.Seed(ENTITY.Runs, {
    UserID: IDS.SystemUser,
    Direction: 'Sending',
    Status: 'Pending',
    StartedAt: new Date(),
    EndedAt: null,
    ...overrides,
  });
}

/** Registers a principal record with the fake driver, backed by a real endpoint row. */
export function SeedPrincipal(db: FakeCommsDb, recordID: string, address: string, endpoint?: FakeRow): { Ref: PrincipalRecordRef; Endpoint: FakeRow } {
  const endpointRow = endpoint ?? SeedEndpoint(db, address);
  const ref: PrincipalRecordRef = { EntityID: IDS.ContactsEntity, RecordID: recordID };
  PrincipalDriverState.Endpoints.set(PrincipalRecordKey(ref), [
    {
      CommunicationEndpointID: String(endpointRow.ID),
      ChannelID: IDS.ChannelEmail,
      NormalizedValue: String(endpointRow.NormalizedValue),
      ValueHash: String(endpointRow.ValueHash),
      RawValue: address,
      Domain: endpointRow.Domain === null ? undefined : String(endpointRow.Domain),
    },
  ]);
  return { Ref: ref, Endpoint: endpointRow };
}
