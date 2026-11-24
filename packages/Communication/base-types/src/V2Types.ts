import type {
  MJCommunicationActivityEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationProviderEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Entity-derived value-list unions (never hand-copied)
// ---------------------------------------------------------------------------

/**
 * What a send does when its outcome is unknown: the provider may have accepted the message, but
 * the result was never recorded (the worker died, or saving the log failed after the provider
 * call). Derived from `MJ: Communication Providers`.`DeliveryGuarantee`.
 *
 * - `'At Most Once'` (the default): never resend. The message is reported `Failed` with reason
 *   `OutcomeUnknown` and left for reconciliation, so **a recipient may miss it**.
 * - `'At Least Once'`: resend once the log has been stuck for 15 minutes, so **a recipient may get
 *   it twice**.
 *
 * The setting is taken from the first of these that has one: `SendingEnvelope.DeliveryGuarantee`,
 * the run, the sender, the sender's ancestors (nearest first), then the provider.
 */
export type DeliveryGuarantee = MJCommunicationProviderEntity['DeliveryGuarantee'];

/**
 * How a message is classified for compliance, from least to most restricted: `'Transactional'` <
 * `'Operational'` < `'Marketing'`. Derived from `MJ: Communication Preferences`.`MessageClass`.
 *
 * - `'Transactional'`: a message the recipient needs (receipt, password reset). The built-in rule
 *   drivers let it through, and suppressions other than `Hard Bounce` / `Invalid Address` do not
 *   apply to it unless they are scoped to the envelope's preference. It is still blocked by an
 *   endpoint that is `Hard Bounced`, `Invalid` or `Erased` and, when the envelope names a
 *   preference, by an opt-out of that preference.
 * - `'Operational'`: service messages that are not strictly required. Treated as non-transactional
 *   by suppressions and by the built-in rule drivers.
 * - `'Marketing'`: promotional content. The seeded regimes attach their rules to this class.
 *
 * An envelope may not use a class less strict than its preference's class (the gate answers
 * `MessageClassMismatch`).
 */
export type MessageClass = NonNullable<MJCommunicationPreferenceEntity['MessageClass']>;
/**
 * Provider-neutral delivery and engagement event names (`'Queued'`, `'Sent'`, `'Delivered'`,
 * `'Deferred'`, `'Soft Bounce'`, `'Hard Bounce'`, `'Dropped'`, `'Spam Complaint'`,
 * `'Unsubscribed'`, `'Opened'`, `'Clicked'`). Derived from `MJ: Communication
 * Activities`.`EventType`. The activity worker acts on `Delivered`, the two bounce types,
 * `Dropped`, `Spam Complaint`, `Unsubscribed`, `Opened` and `Clicked`; the others are only
 * recorded.
 */
export type NormalizedActivityEventType = MJCommunicationActivityEntity['EventType'];
/**
 * Why an address or principal is suppressed (`'Hard Bounce'`, `'Invalid Address'`, `'Spam
 * Complaint'`, `'Admin Block'`, `'User Unsubscribe'`, `'Policy'`). Derived from `MJ: Communication
 * Suppressions`.`Reason`. `Hard Bounce` and `Invalid Address` block every message class and cannot
 * be relaxed by `EnforcementMode`; the other reasons block non-transactional messages (and, for
 * `User Unsubscribe` / `Policy` rows scoped to a preference, every class sent under that
 * preference).
 */
export type SuppressionReason = MJCommunicationSuppressionEntity['Reason'];
/**
 * Where a suppression came from (`'Provider Webhook'`, `'One-Click Header'`, `'Preference Center'`,
 * `'Policy'`, `'Admin'`, `'API'`, `'Import'`). Derived from `MJ: Communication
 * Suppressions`.`Source`.
 */
export type SuppressionSource = MJCommunicationSuppressionEntity['Source'];
/**
 * Where a consent decision was captured (`'Signup Form'`, `'Preference Center'`, `'One-Click
 * Header'`, `'Provider Webhook'`, `'Admin'`, `'API'`, `'Import'`). Derived from `MJ: Communication
 * Principal Preferences`.`ConsentSource`. Only `Signup Form` and `Preference Center` count as the
 * recipient's own express action when the gate decides whether a later opt-in overrides an earlier
 * unsubscribe.
 */
export type ConsentSource = MJCommunicationPrincipalPreferenceEntity['ConsentSource'];
/**
 * A principal's state for one preference: `'Opted In'`, `'Opted Out'`, or `'Pending'` (double
 * opt-in requested but not yet confirmed; blocks Operational and Marketing sends). Derived from
 * `MJ: Communication Principal Preferences`.`State`.
 */
export type PreferenceState = MJCommunicationPrincipalPreferenceEntity['State'];
/**
 * How an opt-in was obtained: `'Single'` (one action) or `'Double'` (confirmed through a second
 * step, such as `POST /comms/confirm/:token`). Derived from `MJ: Communication Principal
 * Preferences`.`OptInMethod`.
 */
export type OptInMethod = NonNullable<MJCommunicationPrincipalPreferenceEntity['OptInMethod']>;
/**
 * How gate decisions are applied. `'Enforce'` blocks and defers as decided. `'Shadow'` lets the
 * message through but keeps the would-be reason in the result. `'Off'` lets it through with no
 * reason. A `Hard Bounce`, `Invalid Address` or `Erased` block is enforced in every mode. Derived
 * from `MJ: Communication Senders`.`EnforcementMode`; a sender with no value uses
 * `V2DispatchConfig.InstanceEnforcementMode`, then `'Enforce'`.
 */
export type EnforcementMode = NonNullable<MJCommunicationSenderEntity['EnforcementMode']>;
/**
 * Lifecycle of a sending domain's DNS authentication: `'Pending'` (registered with the provider,
 * DNS not yet validated), `'Verified'`, `'Failed'`, `'Revoked'`. Derived from `MJ: Communication
 * Sending Domains`.`Status`.
 */
export type SendingDomainStatus = MJCommunicationSendingDomainEntity['Status'];
/**
 * Deliverability state of one address: `'Active'`, `'Soft Bouncing'`, `'Hard Bounced'`,
 * `'Invalid'`, `'Complained'`, `'Erased'`. Derived from `MJ: Communication Endpoints`.`Status`.
 * `Hard Bounced`, `Invalid` and `Erased` block every send; `Complained` blocks non-transactional
 * sends.
 */
export type EndpointStatus = MJCommunicationEndpointEntity['Status'];

// ---------------------------------------------------------------------------
// Core V2 Dispatch & Payload DTOs
// ---------------------------------------------------------------------------

/**
 * Points at the record a message is for: a row in any entity registered in `MJ: Communication
 * Principals` (or any entity at all, which then falls back to `DefaultCommunicationPrincipal`).
 */
export interface PrincipalRecordRef {
  /** `MJ: Entities` ID of the entity the record belongs to. */
  EntityID: string;
  /**
   * The record's primary key value as a string. Suppressions, principal preferences and logs store
   * and compare this exact string.
   */
  RecordID: string;
  /**
   * The record's field values, when the caller already has them. The default principal driver reads
   * addresses, jurisdiction and attributes from here instead of querying, and templated sends
   * expose it to templates as `Recipient`.
   */
  RecordData?: Record<string, unknown>;
}

/**
 * The content of one message. Every field is optional so the same shape serves as the shared
 * payload and as a per-recipient override.
 */
export interface MessagePayload {
  /** Subject line (email). */
  Subject?: string;
  /**
   * Preheader text. Principal hooks can override it, but the dispatcher does not currently pass it
   * to the provider.
   */
  PreviewText?: string;
  /** Plain-text body. The plain-text compliance footer is appended to it. */
  Body?: string;
  /**
   * HTML body. Link rewriting, the HTML compliance footer and the open pixel are applied to it;
   * when it is empty the message is sent as text only.
   */
  HTMLBody?: string;
  /**
   * Extra message headers, passed to the provider as given. `List-Unsubscribe` and
   * `List-Unsubscribe-Post` are overwritten whenever the gate requires the one-click header.
   */
  Headers?: Record<string, string>;
}

/**
 * Who is sending, on which channel, and under which rules. Shared by every recipient of one send.
 */
export interface SendingEnvelope {
  /** `MJ: Communication Senders` ID. Omit to use the `Active` sender with `IsDefault = 1`. */
  SenderID?: string;
  /**
   * `MJ: Communication Preferences` ID (the topic this message belongs to). When set, the gate
   * checks the recipient's opt-in state for it; when omitted, only suppressions, endpoint status
   * and regime rules apply.
   */
  PreferenceID?: string;
  /** Compliance class of the message. See {@link MessageClass}. */
  MessageClass: MessageClass;
  /**
   * `MJ: Communication Base Message Types` ID (Email, SMS, ...). Selects which endpoints, rules and
   * suppressions apply.
   */
  ChannelID: string;
  /**
   * `MJ: Communication Providers` ID. Defaults to the sender's `CommunicationProviderID`; if
   * neither is set, the one active sending provider that supports the channel is used, and the
   * send fails when there is none or more than one.
   */
  ProviderID?: string;
  /**
   * Overrides the run, sender and provider setting for this send. See {@link DeliveryGuarantee}.
   */
  DeliveryGuarantee?: DeliveryGuarantee;
  /**
   * Send no earlier than this time. A future value stores each sendable recipient as a `Pending`
   * log that the scheduled sweep dispatches later.
   */
  ScheduledAt?: Date;
  /**
   * Set `false` to leave out the open pixel. Otherwise the pixel is added when the gate allows it
   * and the message has an HTML body.
   */
  TrackOpens?: boolean;
  /**
   * Set `false` to leave links untouched. Otherwise links are rewritten when the gate allows it,
   * the message has an HTML body and a tracking HMAC secret is configured.
   */
  TrackClicks?: boolean;
  /**
   * Passed to the provider as `Message.DryRun`: the provider runs its full pipeline without
   * delivering.
   */
  DryRun?: boolean;
  /**
   * Caller data stored as JSON on each `MJ: Communication Logs` row and merged into the activity
   * events later correlated to that log.
   * Never sent to the provider.
   */
  CorrelationData?: Record<string, unknown>;
}

/** Names the address to send to. Give one of the two fields. */
export interface EndpointTarget {
  /** ID of an existing `MJ: Communication Endpoints` row. */
  CommunicationEndpointID?: string;
  /**
   * A raw email address or phone number. It is normalized and matched to an existing endpoint for
   * the channel; if none exists, the recipient's principal endpoints are used instead, and a
   * recipient with no principal is blocked with `NoEndpoint`.
   */
  Address?: string;
}

/** One recipient of a send: a principal record, an explicit endpoint, or both. */
export interface RecipientSendTarget {
  /**
   * The record the message is for. Needed for preference checks, principal-level suppressions,
   * jurisdiction and attribute lookup, and principal driver hooks.
   */
  Principal?: PrincipalRecordRef;
  /** Overrides the address resolved from the principal. Required when `Principal` is omitted. */
  Endpoint?: EndpointTarget;
  /**
   * Per-recipient content laid over `SendToPrincipalsParams.Payload`. Fields replace the shared
   * ones; `Headers` are merged.
   */
  PayloadOverride?: Partial<MessagePayload>;
  /**
   * Per-recipient caller data. Carried on the type and through `comms.render` batches, but the
   * dispatcher does not currently persist it; only `SendingEnvelope.CorrelationData` reaches the
   * log.
   */
  CorrelationData?: Record<string, unknown>;
}

/** Input to `CommunicationEngine.Send()`: one envelope, one shared payload, many recipients. */
export interface SendToPrincipalsParams {
  /** Sender, channel, class and options for the whole send. */
  Envelope: SendingEnvelope;
  /**
   * Content shared by all recipients. Optional when every recipient carries a `PayloadOverride`.
   */
  Payload?: MessagePayload;
  /**
   * Who to send to. More recipients than `V2DispatchConfig.AsyncThreshold` are split into
   * `comms.dispatch` work items when a work-queue publisher is configured.
   */
  Recipients: RecipientSendTarget[];
  /**
   * Existing CommunicationRun to add to (comms.dispatch chunks, templated batches). A run passed in
   * belongs to the caller: `Send()` does not end it, so the caller must call `EndRun` once every
   * chunk has finished, or passes `RunChunk` so the last chunk ends it.
   */
  CommunicationRunID?: string;
  /**
   * This call's place in a run split into chunks (`Index` is 0-based, `Count` the total). Every
   * exit of the call records a `MJ: Communication Run Chunks` row for it, and the chunk that brings
   * the count to the run's `ChunkCount` ends the run, however the chunks interleave or are
   * redelivered. Ignored without `CommunicationRunID`.
   */
  RunChunk?: RunChunkPosition;
}

/** Position of one chunk in a run split across work items. See `SendToPrincipalsParams.RunChunk`. */
export interface RunChunkPosition {
  /** 0-based chunk number, unique within the run. */
  Index: number;
  /** Total number of chunks in the run. The same on every chunk. */
  Count: number;
}

/** An address resolved to its `MJ: Communication Endpoints` row. */
export interface ResolvedEndpoint {
  /** ID of the endpoint row. */
  CommunicationEndpointID: string;
  /** `MJ: Communication Base Message Types` ID the endpoint belongs to. */
  ChannelID: string;
  /**
   * Canonical address: lower-cased email, or digits with an optional leading `+` for phone numbers.
   * This is the value sent to the provider.
   */
  NormalizedValue: string;
  /**
   * SHA-256 hex digest of `NormalizedValue`. The stable key for an address; it survives GDPR
   * erasure, so suppressions keep working after the address itself is removed.
   */
  ValueHash: string;
  /**
   * The address as read from the source record or request, trimmed. Equal to `NormalizedValue` when
   * the endpoint was looked up by ID.
   */
  RawValue: string;
  /** Domain part of an email address. */
  Domain?: string;
  /** Optional loaded entity returned by `ResolveEndpoints` to avoid redundant re-queries. */
  EndpointEntity?: MJCommunicationEndpointEntity;
}

/**
 * Facts about a principal that rule drivers and templates use. Resolved by the principal driver's
 * `ResolveAttributes`.
 */
export interface PrincipalAttributes {
  /** Display name, available to templates as `Recipient.FullName`. */
  FullName?: string;
  /** IANA time zone (for example `America/Chicago`). Used first when evaluating quiet hours. */
  Timezone?: string;
  /** Language tag for the recipient. Informational; no built-in rule reads it. */
  PreferredLanguage?: string;
  /**
   * Whether an existing customer relationship exists. Enables the soft opt-in exception under an
   * opt-in consent model.
   */
  IsExistingCustomer?: boolean;
}

/**
 * Result for one recipient. `'Sent'`: the provider accepted the message. `'Blocked'`: the gate or
 * an obligation check stopped it. `'Deferred'`: stored as a `Pending` log to send later (quiet
 * hours or `ScheduledAt`). `'Failed'`: the provider or log bookkeeping failed. `'DryRun'`: the
 * envelope was a dry run and the provider accepted it without delivering; the log is `Complete`
 * with `IsDryRun` set. `'Queued'` is reserved; the dispatcher does
 * not currently return it.
 *
 * A `'Failed'` outcome with reason `OutcomeUnknown` means a previous attempt may already have
 * reached the provider and the delivery guarantee is At Most Once, so it was not resent; reconcile
 * it from the provider's delivery events. See {@link DeliveryGuarantee}.
 */
export type SendV2OutcomeStatus = 'Queued' | 'Sent' | 'Blocked' | 'Deferred' | 'Failed' | 'DryRun';

/** What happened to one recipient of an inline send. */
export interface SendV2RecipientOutcome {
  /** The recipient's principal, when one was given. */
  Principal?: PrincipalRecordRef;
  /** The endpoint chosen for the recipient. Absent when none could be resolved. */
  Endpoint?: ResolvedEndpoint;
  /**
   * `MJ: Communication Logs` row written for this recipient. Blocked recipients have none unless
   * they were blocked after the log was created.
   */
  CommunicationLogID?: string;
  /** See {@link SendV2OutcomeStatus}. */
  Status: SendV2OutcomeStatus;
  /**
   * Short machine-readable cause for `Blocked` and `Failed` outcomes, such as a suppression reason,
   * `ComplianceRegime`, `OptedOut`, `NoEndpoint`, `ObligationValidationFailed` or
   * `LogCreationFailed`.
   */
  Reason?: string;
  /** Human-readable explanation, or the provider's error text. */
  Detail?: string;
  /** When a `Deferred` message becomes due. */
  DeferUntil?: Date;
}

/** Result of `CommunicationEngine.Send()` or `ITemplatedCommunicationService.RenderAndSend()`. */
export interface SendV2Result {
  /**
   * `false` only when the send could not start (no sender, no permission, no provider, unverified
   * domain, run not created). Individual blocked or failed recipients do not make it `false`; read
   * the counts and `Outcomes`.
   */
  Success: boolean;
  /** `MJ: Communication Runs` row that groups this send's logs. */
  CommunicationRunID?: string;
  /**
   * `true` when the recipients were handed to the work queue. Eligibility is then evaluated by the
   * workers, and `Outcomes` is not returned by `Send()`.
   */
  IsAsyncRun: boolean;
  /** Number of recipients passed in. */
  TotalCount: number;
  /** Recipients the provider accepted (inline) or that were handed to the work queue (async). */
  QueuedCount: number;
  /**
   * Recipients the gate blocked. A send that fails its pre-flight checks (sender, permission,
   * provider, verified domain) reports every recipient as blocked.
   */
  BlockedCount: number;
  /** Recipients stored for later dispatch. */
  DeferredCount: number;
  /** Recipients of a dry run that the provider accepted without delivering. Not counted in `QueuedCount`. */
  DryRunCount?: number;
  /** Per-recipient results. Present for inline sends. */
  Outcomes?: SendV2RecipientOutcome[];
  /** Why the send could not start, or the joined batch errors of an in-process templated send. */
  ErrorMessage?: string;
}

// ---------------------------------------------------------------------------
// Pre-Flight Eligibility & Compliance DTOs
// ---------------------------------------------------------------------------

/**
 * Input to `CommunicationEngine.EvaluateEligibility()`: the same envelope and recipients a send
 * would use, without content.
 */
export interface EvaluateEligibilityParams {
  /** Sender, channel, class and preference to evaluate under. */
  Envelope: SendingEnvelope;
  /** Recipients to evaluate, each a principal, an explicit endpoint, or both. */
  Recipients: Array<{
    Principal?: PrincipalRecordRef;
    Endpoint?: EndpointTarget;
  }>;
}

/**
 * What the applicable regimes require the outgoing message to carry, and which tracking they allow.
 * Produced by the gate, patched by rule drivers, and enforced by the dispatcher.
 */
export interface ComplianceObligations {
  /**
   * Add `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC
   * 8058).
   */
  RequireOneClickHeader: boolean;
  /**
   * The body must contain the unsubscribe link. The dispatcher appends a footer with it and, in
   * `Enforce` mode, blocks the message if the link is missing from the final body.
   */
  RequireFooterUnsubscribe: boolean;
  /** The body must contain the sender's postal address. Enforced like the footer link. */
  RequireSenderPostalAddress: boolean;
  /** The sender's `PostalAddress`. */
  SenderPostalAddress?: string;
  /** The sender's `FromName`, falling back to its `Name`. */
  SenderName?: string;
  /** Whether the open-tracking pixel may be added. */
  AllowOpenPixel: boolean;
  /** Whether links may be rewritten for click tracking. */
  AllowClickTracking: boolean;
  /**
   * Recipient-specific unsubscribe link. Filled in at dispatch as `<tracking
   * base>/comms/unsubscribe/<UnsubscribeToken>`; not set by `EvaluateEligibility()`.
   */
  UnsubscribeURL?: string;
  /** The sender's `PreferenceCenterURL`, when it hosts its own preference center. */
  PreferenceCenterURL?: string;
}

/** A recipient the gate did not block. */
export interface SendableRecipient {
  /** The recipient's principal, when one was given. */
  Principal?: PrincipalRecordRef;
  /** The endpoint the message will go to. */
  Endpoint: ResolvedEndpoint;
  /** `'Allowed'` to send now, or `'Deferred'` to send at `DeferUntil`. */
  Decision: 'Allowed' | 'Deferred';
  /** Earliest send time for a deferred recipient. */
  DeferUntil?: Date;
  /** What the message to this recipient must carry. */
  Obligations: ComplianceObligations;
  /**
   * The regimes, jurisdictions and merged rules behind the decision. Stored on the log's
   * `ComplianceDecision`.
   */
  AuditSnapshot?: ComplianceAuditSnapshot;
  /**
   * The sender's merged `TemplateContext` (ancestors first, then the sender, then its sender-type
   * driver). Exposed to templates as `Sender`.
   */
  SenderTemplateContext?: Record<string, unknown>;
  /** Attributes resolved for the principal. */
  PrincipalAttributes?: PrincipalAttributes;
}

/** A recipient the gate will not send to. */
export interface BlockedRecipient {
  /** The recipient's principal, when one was given. */
  Principal?: PrincipalRecordRef;
  /** The endpoint that was evaluated. Absent when none could be resolved. */
  Endpoint?: ResolvedEndpoint;
  /**
   * Machine-readable cause: `SenderNotFound`, `NoEndpoint`, `EndpointNotFound`, a {@link
   * SuppressionReason}, `Erased`, `ComplianceRegime`, `PreferenceDisabled`, `MessageClassMismatch`,
   * `DoubleOptInPending` or `OptedOut`.
   */
  Reason: string;
  /** Human-readable explanation. */
  Detail?: string;
}

/** Recipients split by gate decision. Every input recipient appears in exactly one list. */
export interface EvaluateEligibilityResult {
  /** Recipients that may be sent to now or later. */
  Sendable: SendableRecipient[];
  /** Recipients that must not be sent to. */
  Blocked: BlockedRecipient[];
}

/** The inputs behind one gate decision, kept for audit. */
export interface ComplianceAuditSnapshot {
  /** The mode the decision was made under. */
  EnforcementMode: EnforcementMode;
  /** Names of the `MJ: Communication Compliance Regimes` that applied. */
  ApplicableRegimes: string[];
  /**
   * Codes of the recipient's jurisdiction and every group containing it (for example `DE`, `EU`,
   * `EEA`). Empty when the jurisdiction is unknown.
   */
  ExpandedRecipientJurisdictions: string[];
  /** The same expansion for the sender's jurisdiction. */
  ExpandedSenderJurisdictions: string[];
  /**
   * The strictest merged parameters per rule type, keyed by rule type `Name` (for example
   * `ConsentModel`).
   */
  MergedRules: Record<string, Record<string, unknown>>;
  /**
   * Set to `OptionB:PreferenceResubscribe` when a later express opt-in for the envelope's
   * preference overrode an earlier unsubscribe-all suppression.
   */
  OverrideApplied?: string;
}

/** The gate's decision for one recipient. */
export interface ComplianceGateResult {
  /** `'Allowed'`, `'Blocked'` or `'Deferred'`, after `EnforcementMode` has been applied. */
  Decision: 'Allowed' | 'Blocked' | 'Deferred';
  /**
   * Machine-readable cause of a block or deferral (see {@link BlockedRecipient.Reason};
   * `QuietHours` for deferrals). In `Shadow` mode it is kept on an `Allowed` result.
   */
  Reason?: string;
  /** Human-readable explanation. */
  Detail?: string;
  /** The `MJ: Communication Suppressions` row that caused the block, when one did. */
  SuppressionID?: string;
  /** When a deferred message may be sent. */
  DeferUntil?: Date;
  /** What the message must carry. */
  Obligations: ComplianceObligations;
  /** The inputs behind the decision. */
  AuditSnapshot: ComplianceAuditSnapshot;
}

/** Everything a compliance rule driver may read about one recipient of one send. */
export interface ComplianceEvalContext {
  /** The sending `MJ: Communication Senders` row. */
  Sender: MJCommunicationSenderEntity;
  /**
   * IDs of the sender's parent senders, nearest first. A suppression scoped to an ancestor also
   * applies to this sender.
   */
  SenderAncestors: string[];
  /** The recipient's principal, when one was given. */
  Principal?: PrincipalRecordRef;
  /** The endpoint row the message would go to. */
  Endpoint: MJCommunicationEndpointEntity;
  /** The envelope's preference, when `PreferenceID` was set. */
  Preference?: MJCommunicationPreferenceEntity;
  /** The envelope's message class. */
  MessageClass: MessageClass;
  /** `MJ: Communication Base Message Types` ID of the send. */
  ChannelID: string;
  /**
   * The principal's row for the envelope's preference, preferring a sender-specific row over a
   * global one. Absent when the principal has never chosen.
   */
  PrincipalPreference?: MJCommunicationPrincipalPreferenceEntity;
  /** Attributes resolved for the principal. */
  PrincipalAttributes?: PrincipalAttributes;
  /**
   * The evaluation time. Use it instead of `new Date()` so a batch is evaluated at one instant and
   * tests are deterministic.
   */
  Now: Date;
}

/** What a rule driver returns from `Evaluate`. */
export interface ComplianceRuleOutcome {
  /** `true` when the rule does not object to the send. */
  Passed: boolean;
  /**
   * For a failed rule: `'Blocked'` (the default) or `'Deferred'`. A deferral takes effect only when
   * `DeferUntil` is set; without it the failure is ignored.
   */
  Decision?: 'Blocked' | 'Deferred';
  /** Why the rule failed. Becomes the gate result's `Detail`. */
  FailureReason?: string;
  /** Earliest time the message may be sent, for a deferral. */
  DeferUntil?: Date;
  /**
   * Obligation fields to set. Applied whether or not the rule passed; a later rule's patch
   * overwrites an earlier one for the same field.
   */
  ObligationsPatch?: Partial<ComplianceObligations>;
}

// ---------------------------------------------------------------------------
// Activity Telemetry & Sending Domain Auth DTOs
// ---------------------------------------------------------------------------

/**
 * One delivery or engagement event in provider-neutral form. Providers produce these from webhooks;
 * MJ's own open, click and unsubscribe routes produce them too.
 * `CommsActivityWorker.ProcessActivityBatch()` consumes them.
 */
export interface NormalizedActivityEvent {
  /**
   * The log the event belongs to, when the provider echoed it back. Otherwise the worker finds the
   * log by `UnsubscribeToken`, `TrackingToken` or `ProviderMessageID`.
   */
  CommunicationLogID?: string;
  /** The endpoint the event is about. Filled in from the log, or by address hash. */
  CommunicationEndpointID?: string;
  /** The sender of the original message. Filled in from the log. */
  CommunicationSenderID?: string;
  /**
   * `MJ: Communication Providers` ID that reported the event. Together with `ProviderEventID` it is
   * the deduplication key.
   */
  CommunicationProviderID: string;
  /** The recipient address, lower-cased. May be empty for events identified by token. */
  NormalizedAddress: string;
  /** SHA-256 of the normalized address, when the producer already has it. */
  ValueHash?: string;
  /** The recipient's principal. Filled in from the log when absent. */
  Principal?: PrincipalRecordRef;
  /** What happened. See {@link NormalizedActivityEventType}. */
  EventType: NormalizedActivityEventType;
  /** When the event happened, as reported by its source. */
  OccurredAt: Date;
  /**
   * How the event reached MJ. Recorded as the source of any suppression or consent change it
   * causes; defaults to `'Provider Webhook'`.
   */
  Source?: 'API' | 'Admin' | 'Import' | 'One-Click Header' | 'Preference Center' | 'Provider Webhook';
  /**
   * The provider's unique ID for this event. Events that carry one are processed at most once per
   * provider.
   */
  ProviderEventID?: string;
  /**
   * The provider's ID for the message, matched against `MJ: Communication
   * Logs`.`ProviderMessageID`.
   */
  ProviderMessageID?: string;
  /** The log's `UnsubscribeToken`, for events from the unsubscribe routes. */
  UnsubscribeToken?: string;
  /** The log's `TrackingToken`, for events from the open and click routes. */
  TrackingToken?: string;
  /** The link that was clicked. */
  TargetURL?: string;
  /** The provider's bounce status code. */
  BounceCode?: string;
  /** The provider's bounce text. Stored as the suppression note for a hard bounce. */
  BounceReason?: string;
  /**
   * Why the provider dropped the message. A reason containing `invalid`, `bounced`, `unsubscribed`
   * or `spam` creates the matching suppression; any other reason is only recorded.
   */
  DropReason?: string;
  /**
   * `true` when an open or click came from a mail proxy or link scanner rather than a person. The
   * worker also sets it from the user agent. Machine events do not update the endpoint's
   * `LastEngagedAt`.
   */
  IsMachineEvent: boolean;
  /** Client IP address of the open, click or unsubscribe request. */
  IPAddress?: string;
  /** Client user agent of the open, click or unsubscribe request. */
  UserAgent?: string;
  /** Caller data. The log's `CorrelationData` is merged underneath it during correlation. */
  CorrelationData?: Record<string, unknown>;
  /** The provider's original event object. */
  RawPayload?: Record<string, unknown>;
}

/** One DNS record a sending domain needs, and whether it currently validates. */
export interface DomainDNSRecord {
  /** DNS record type to create. */
  Type: 'CNAME' | 'TXT' | 'MX';
  /** What the record authenticates. */
  Purpose: 'DKIM' | 'SPF' | 'DMARC' | 'ReturnPath';
  /** Record name (host) to create. */
  Host: string;
  /** Record value to set. */
  Value: string;
  /** Whether the record currently validates. */
  Validated: boolean;
  /** Why the last validation of this record failed. */
  LastError?: string;
}

/** Input to `BaseCommunicationProvider.CreateDomainAuthentication()`. */
export interface CreateDomainAuthParams {
  /** The domain to authenticate, for example `example.org`. */
  Domain: string;
  /**
   * Optional subdomain for the provider's return-path records, when the provider supports choosing
   * one.
   */
  Subdomain?: string;
}

/** Result of registering a sending domain with a provider. */
export interface CreateDomainAuthResult {
  /** Whether the provider accepted the registration. */
  Success: boolean;
  /**
   * Why registration failed, including when the provider does not support domain authentication.
   */
  ErrorMessage?: string;
  /**
   * The provider's ID for the registration. Stored on `MJ: Communication Sending
   * Domains`.`ProviderDomainID` and passed back to verify and delete.
   */
  ProviderDomainID?: string;
  /** The records the domain owner must publish. */
  DNSRecords: DomainDNSRecord[];
}

/** Input to `BaseCommunicationProvider.VerifyDomainAuthentication()`. */
export interface VerifyDomainAuthParams {
  /** The provider's ID returned when the domain was registered. */
  ProviderDomainID: string;
  /** The domain being verified. */
  Domain: string;
}

/** Result of asking a provider to validate a sending domain's DNS records. */
export interface VerifyDomainAuthResult {
  /** Whether the check itself ran. `true` does not mean the domain is verified. */
  Success: boolean;
  /** Why the check could not run. */
  ErrorMessage?: string;
  /** Whether every required record validated. */
  Verified: boolean;
  /** Per-record validation results. */
  DNSRecords: DomainDNSRecord[];
}

/** Input to `BaseCommunicationProvider.DeleteDomainAuthentication()`. */
export interface DeleteDomainAuthParams {
  /** The provider's ID for the registration to remove. */
  ProviderDomainID: string;
}

// ---------------------------------------------------------------------------
// Phase 5 (Layer 2) Interface Contract — Documented for Separation of Concerns
// ---------------------------------------------------------------------------

/**
 * Input to {@link ITemplatedCommunicationService.RenderAndSend}: a V2 send whose content comes from
 * MJ templates rendered per recipient.
 */
export interface RenderAndSendParams {
  /** Sender, channel, class and options for the whole send. */
  Envelope: SendingEnvelope;
  /**
   * `MJ: Entities` ID of the recipients' entity. Used to load related-entity data for
   * `Entity`-typed template parameters.
   */
  EntityID?: string;
  /**
   * Recipients to render and send to. Each has a `Principal` (required), an optional `Endpoint`
   * override, `ContextData` merged into that recipient's template data, and `CorrelationData`.
   */
  Recipients: Array<{
    Principal: PrincipalRecordRef;
    Endpoint?: EndpointTarget;
    ContextData?: Record<string, unknown>;
    CorrelationData?: Record<string, unknown>;
  }>;
  /**
   * `MJ: Templates` IDs for the subject, plain-text body and HTML body, plus `SharedContextData`
   * merged into every recipient's template data. When no HTML template is given, the body
   * template's HTML content is used for the HTML body.
   */
  Templates: {
    SubjectTemplateID?: string;
    BodyTemplateID?: string;
    HTMLBodyTemplateID?: string;
    SharedContextData?: Record<string, unknown>;
  };
  /**
   * Append the required sender postal address to the rendered bodies, so previews show it. Defaults
   * to `false`. The dispatcher appends the full compliance footer, including the unsubscribe link,
   * at dispatch whether or not this is set.
   */
  AutoAppendComplianceFooter?: boolean;
  /**
   * `'WorkQueue'` (the default) renders in `comms.render` batches when a publisher is configured.
   * `'Inline'` renders and sends in the calling process and returns per-recipient outcomes.
   */
  RenderMode?: 'WorkQueue' | 'Inline';
}

/**
 * Contract for the templated (Layer 2) send service. Declared here so packages can depend on the
 * contract without depending on its implementation, `TemplatedCommunicationService` in
 * `@memberjunction/entity-communications-server`.
 */
export interface ITemplatedCommunicationService {
  /**
   * Evaluates eligibility, renders templates for the sendable recipients, and dispatches them
   * through `CommunicationEngine.Send()`.
   */
  RenderAndSend(params: RenderAndSendParams): Promise<SendV2Result>;
}
