import type {
  MJCommunicationActivityEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Entity-derived value-list unions (never hand-copied)
// ---------------------------------------------------------------------------

export type MessageClass = NonNullable<MJCommunicationPreferenceEntity['MessageClass']>;
export type NormalizedActivityEventType = MJCommunicationActivityEntity['EventType'];
export type SuppressionReason = MJCommunicationSuppressionEntity['Reason'];
export type SuppressionSource = MJCommunicationSuppressionEntity['Source'];
export type ConsentSource = MJCommunicationPrincipalPreferenceEntity['ConsentSource'];
export type PreferenceState = MJCommunicationPrincipalPreferenceEntity['State'];
export type OptInMethod = NonNullable<MJCommunicationPrincipalPreferenceEntity['OptInMethod']>;
export type EnforcementMode = NonNullable<MJCommunicationSenderEntity['EnforcementMode']>;
export type SendingDomainStatus = MJCommunicationSendingDomainEntity['Status'];
export type EndpointStatus = MJCommunicationEndpointEntity['Status'];

// ---------------------------------------------------------------------------
// Core V2 Dispatch & Payload DTOs
// ---------------------------------------------------------------------------

export interface PrincipalRecordRef {
  EntityID: string;
  RecordID: string;
  RecordData?: Record<string, unknown>;
}

export interface MessagePayload {
  Subject?: string;
  PreviewText?: string;
  Body?: string;
  HTMLBody?: string;
  Headers?: Record<string, string>;
}

export interface SendingEnvelope {
  SenderID?: string;
  PreferenceID?: string;
  MessageClass: MessageClass;
  ChannelID: string;
  ProviderID?: string;
  ScheduledAt?: Date;
  TrackOpens?: boolean;
  TrackClicks?: boolean;
  DryRun?: boolean;
  CorrelationData?: Record<string, unknown>;
}

export interface EndpointTarget {
  CommunicationEndpointID?: string;
  Address?: string;
}

export interface RecipientSendTarget {
  Principal?: PrincipalRecordRef;
  Endpoint?: EndpointTarget;
  PayloadOverride?: Partial<MessagePayload>;
  CorrelationData?: Record<string, unknown>;
}

export interface SendToPrincipalsParams {
  Envelope: SendingEnvelope;
  Payload?: MessagePayload;
  Recipients: RecipientSendTarget[];
  /** Optional existing CommunicationRun ID (used by comms.dispatch chunk workers to avoid creating duplicate runs). */
  CommunicationRunID?: string;
}

export interface ResolvedEndpoint {
  CommunicationEndpointID: string;
  ChannelID: string;
  NormalizedValue: string;
  ValueHash: string;
  RawValue: string;
  Domain?: string;
  /** Optional loaded entity returned by `ResolveEndpoints` to avoid redundant re-queries. */
  EndpointEntity?: MJCommunicationEndpointEntity;
}

export interface PrincipalAttributes {
  FullName?: string;
  Timezone?: string;
  PreferredLanguage?: string;
  IsExistingCustomer?: boolean;
}

export type SendV2OutcomeStatus = 'Queued' | 'Sent' | 'Blocked' | 'Deferred' | 'Failed';

export interface SendV2RecipientOutcome {
  Principal?: PrincipalRecordRef;
  Endpoint?: ResolvedEndpoint;
  CommunicationLogID?: string;
  Status: SendV2OutcomeStatus;
  Reason?: string;
  Detail?: string;
  DeferUntil?: Date;
}

export interface SendV2Result {
  Success: boolean;
  CommunicationRunID?: string;
  IsAsyncRun: boolean;
  TotalCount: number;
  QueuedCount: number;
  BlockedCount: number;
  DeferredCount: number;
  Outcomes?: SendV2RecipientOutcome[];
  ErrorMessage?: string;
}

// ---------------------------------------------------------------------------
// Pre-Flight Eligibility & Compliance DTOs
// ---------------------------------------------------------------------------

export interface EvaluateEligibilityParams {
  Envelope: SendingEnvelope;
  Recipients: Array<{
    Principal?: PrincipalRecordRef;
    Endpoint?: EndpointTarget;
  }>;
}

export interface ComplianceObligations {
  RequireOneClickHeader: boolean;
  RequireFooterUnsubscribe: boolean;
  RequireSenderPostalAddress: boolean;
  SenderPostalAddress?: string;
  SenderName?: string;
  AllowOpenPixel: boolean;
  AllowClickTracking: boolean;
  UnsubscribeURL?: string;
  PreferenceCenterURL?: string;
}

export interface SendableRecipient {
  Principal?: PrincipalRecordRef;
  Endpoint: ResolvedEndpoint;
  Decision: 'Allowed' | 'Deferred';
  DeferUntil?: Date;
  Obligations: ComplianceObligations;
  AuditSnapshot?: ComplianceAuditSnapshot;
  SenderTemplateContext?: Record<string, unknown>;
  PrincipalAttributes?: PrincipalAttributes;
}

export interface BlockedRecipient {
  Principal?: PrincipalRecordRef;
  Endpoint?: ResolvedEndpoint;
  Reason: string;
  Detail?: string;
}

export interface EvaluateEligibilityResult {
  Sendable: SendableRecipient[];
  Blocked: BlockedRecipient[];
}

export interface ComplianceAuditSnapshot {
  EnforcementMode: EnforcementMode;
  ApplicableRegimes: string[];
  ExpandedRecipientJurisdictions: string[];
  ExpandedSenderJurisdictions: string[];
  MergedRules: Record<string, Record<string, unknown>>;
  OverrideApplied?: string;
}

export interface ComplianceGateResult {
  Decision: 'Allowed' | 'Blocked' | 'Deferred';
  Reason?: string;
  Detail?: string;
  SuppressionID?: string;
  DeferUntil?: Date;
  Obligations: ComplianceObligations;
  AuditSnapshot: ComplianceAuditSnapshot;
}

export interface ComplianceEvalContext {
  Sender: MJCommunicationSenderEntity;
  SenderAncestors: string[];
  Principal?: PrincipalRecordRef;
  Endpoint: MJCommunicationEndpointEntity;
  Preference?: MJCommunicationPreferenceEntity;
  MessageClass: MessageClass;
  ChannelID: string;
  PrincipalPreference?: MJCommunicationPrincipalPreferenceEntity;
  PrincipalAttributes?: PrincipalAttributes;
  Now: Date;
}

export interface ComplianceRuleOutcome {
  Passed: boolean;
  Decision?: 'Blocked' | 'Deferred';
  FailureReason?: string;
  DeferUntil?: Date;
  ObligationsPatch?: Partial<ComplianceObligations>;
}

// ---------------------------------------------------------------------------
// Activity Telemetry & Sending Domain Auth DTOs
// ---------------------------------------------------------------------------

export interface NormalizedActivityEvent {
  CommunicationLogID?: string;
  CommunicationEndpointID?: string;
  CommunicationSenderID?: string;
  CommunicationProviderID: string;
  NormalizedAddress: string;
  ValueHash?: string;
  Principal?: PrincipalRecordRef;
  EventType: NormalizedActivityEventType;
  OccurredAt: Date;
  Source?: 'API' | 'Admin' | 'Import' | 'One-Click Header' | 'Preference Center' | 'Provider Webhook';
  ProviderEventID?: string;
  ProviderMessageID?: string;
  UnsubscribeToken?: string;
  TrackingToken?: string;
  TargetURL?: string;
  BounceCode?: string;
  BounceReason?: string;
  DropReason?: string;
  IsMachineEvent: boolean;
  IPAddress?: string;
  UserAgent?: string;
  CorrelationData?: Record<string, unknown>;
  RawPayload?: Record<string, unknown>;
}

export interface DomainDNSRecord {
  Type: 'CNAME' | 'TXT' | 'MX';
  Purpose: 'DKIM' | 'SPF' | 'DMARC' | 'ReturnPath';
  Host: string;
  Value: string;
  Validated: boolean;
  LastError?: string;
}

export interface CreateDomainAuthParams {
  Domain: string;
  Subdomain?: string;
}

export interface CreateDomainAuthResult {
  Success: boolean;
  ErrorMessage?: string;
  ProviderDomainID?: string;
  DNSRecords: DomainDNSRecord[];
}

export interface VerifyDomainAuthParams {
  ProviderDomainID: string;
  Domain: string;
}

export interface VerifyDomainAuthResult {
  Success: boolean;
  ErrorMessage?: string;
  Verified: boolean;
  DNSRecords: DomainDNSRecord[];
}

export interface DeleteDomainAuthParams {
  ProviderDomainID: string;
}

// ---------------------------------------------------------------------------
// Phase 5 (Layer 2) Interface Contract — Documented for Separation of Concerns
// ---------------------------------------------------------------------------

export interface RenderAndSendParams {
  Envelope: SendingEnvelope;
  EntityID?: string;
  Recipients: Array<{
    Principal: PrincipalRecordRef;
    Endpoint?: EndpointTarget;
    ContextData?: Record<string, unknown>;
    CorrelationData?: Record<string, unknown>;
  }>;
  Templates: {
    SubjectTemplateID?: string;
    BodyTemplateID?: string;
    HTMLBodyTemplateID?: string;
    SharedContextData?: Record<string, unknown>;
  };
  AutoAppendComplianceFooter?: boolean;
  RenderMode?: 'WorkQueue' | 'Inline';
}

export interface ITemplatedCommunicationService {
  RenderAndSend(params: RenderAndSendParams): Promise<SendV2Result>;
}
