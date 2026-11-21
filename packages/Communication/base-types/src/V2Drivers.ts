import { UserInfo } from '@memberjunction/core';
import type { MJCommunicationSenderEntity } from '@memberjunction/core-entities';
import type {
  ComplianceEvalContext,
  ComplianceRuleOutcome,
  MessagePayload,
  NormalizedActivityEvent,
  PrincipalAttributes,
  PrincipalRecordRef,
  ResolvedEndpoint,
  SendingEnvelope,
} from './V2Types';

/**
 * Controlled message context passed to PreProcess and PostProcess hooks.
 * Hooks cannot directly mutate protected compliance elements (To, From,
 * List-Unsubscribe, List-Unsubscribe-Post, compliance footer, mj_log_id).
 */
export interface PrincipalMessageContext {
  /** The envelope of the send. */
  readonly Envelope: Readonly<SendingEnvelope>;
  /** The recipient's principal record. */
  readonly Principal: PrincipalRecordRef;
  /** The endpoint the message is going to. */
  readonly Endpoint: ResolvedEndpoint;
  /** The message content before hook additions, the compliance footer and tracking are applied. */
  readonly Payload: Readonly<MessagePayload>;

  /**
   * Adds HTML and/or plain-text content before (`'header'`) or after (`'footer'`) the body. Footer
   * content is placed before the compliance footer, never after it.
   */
  AddContent(location: 'header' | 'footer', content: { html?: string; text?: string }): void;
  /**
   * Sets a custom message header. `List-Unsubscribe`, `List-Unsubscribe-Post`, `From` and `To` are
   * ignored.
   */
  SetHeader(name: string, value: string): void;
  /**
   * Replaces the subject and/or preview text. `CorrelationData` is accepted by the type but the
   * dispatcher does not currently apply it.
   */
  RequestMutation(
    mutation: Partial<Pick<MessagePayload, 'Subject' | 'PreviewText'>> & {
      CorrelationData?: Record<string, unknown>;
    },
  ): void;
}

/**
 * Base class for principal entity adapters registered via @RegisterClass(BaseCommunicationPrincipal, driverClass).
 * All resolution and hook methods are batch-shaped (arrays in, Maps out) to avoid per-message DB round trips.
 */
export abstract class BaseCommunicationPrincipal {
  /**
   * Returns the endpoints each record can be reached at on the given channel, keyed by `<EntityID
   * lower-cased>:<RecordID>`. Every returned endpoint must already exist in `MJ: Communication
   * Endpoints` (create the row if it does not), because the gate and the log reference it by ID.
   * The first endpoint in each array is the one the dispatcher uses. Records with no address are
   * left out of the map.
   *
   * @param records - Principal records, all of the entity this driver is registered for.
   * @param channelID - `MJ: Communication Base Message Types` ID.
   * @param contextUser - User the lookup runs as.
   */
  public abstract ResolveEndpoints(
    records: PrincipalRecordRef[],
    channelID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, ResolvedEndpoint[]>>;

  /**
   * Returns each record's jurisdiction as an `MJ: Jurisdictions` ID or `Code` (for example `DE` or
   * `US-CA`), or `null` when unknown, keyed like {@link ResolveEndpoints}. An unknown jurisdiction
   * makes every regime with `AppliesWhenJurisdictionUnknown` apply.
   */
  public abstract ResolveJurisdiction(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, string | null>>;

  /**
   * Returns the attributes rule drivers and templates read for each record, keyed like {@link
   * ResolveEndpoints}.
   */
  public abstract ResolveAttributes(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, PrincipalAttributes>>;

  /**
   * Called once per recipient immediately before a message is finalized. Use the context's methods
   * to add content, set headers or change the subject. The default does nothing.
   */
  public async PreProcess(_contexts: PrincipalMessageContext[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }

  /**
   * Called directly after {@link PreProcess} with the same contexts, before the compliance footer
   * and tracking are applied. The default does nothing.
   */
  public async PostProcess(_contexts: PrincipalMessageContext[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }

  /**
   * Called by the activity worker after it has processed a batch, with the events whose principal
   * belongs to this driver's entity. Use it to mirror delivery or engagement state onto your own
   * records. An error thrown here is logged and does not fail the batch. The default does nothing.
   */
  public async OnActivity(_events: NormalizedActivityEvent[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }
}

/**
 * Optional base class for custom sender type drivers registered via
 * @RegisterClass(BaseCommunicationSender, driverClass).
 */
export abstract class BaseCommunicationSender {
  /**
   * Returns extra template data for a sender, laid over the `TemplateContext` JSON of the sender
   * and its ancestors and exposed to templates as `Sender`. The result is cached per sender for 60
   * seconds.
   *
   * @param _sender - The sending sender.
   * @param _ancestors - Its parent senders, nearest first.
   * @param _contextUser - User the lookup runs as.
   */
  public async ResolveTemplateContext(
    _sender: MJCommunicationSenderEntity,
    _ancestors: MJCommunicationSenderEntity[],
    _contextUser: UserInfo,
  ): Promise<Record<string, unknown>> {
    return {};
  }
}

/**
 * Base class for compliance rule drivers registered via
 * @RegisterClass(BaseComplianceRule, driverClass).
 */
export abstract class BaseComplianceRule<TMerged = Record<string, unknown>> {
  /**
   * Combines the `Parameters` of every active rule of this type across the applicable regimes into
   * the single strictest requirement. Called with the parsed JSON object of each matching rule
   * (always at least one). The result is stored in the audit snapshot under the rule type's `Name`
   * and passed to {@link Evaluate}.
   */
  public abstract MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): TMerged;

  /**
   * Decides whether this recipient may be sent to under the merged requirement, and which
   * obligations the message must carry. Runs synchronously once per recipient, so it must not
   * perform I/O; everything it may read is on the context.
   */
  public abstract Evaluate(merged: TMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome;
}

/**
 * Base class for automated suppression policy drivers registered via
 * @RegisterClass(BaseCommunicationSuppressionPolicy, driverClass).
 */
export abstract class BaseCommunicationSuppressionPolicy {
  /**
   * Called by the activity worker once per processed batch for every `Active` row in `MJ:
   * Communication Suppression Policies` whose `DriverClass` names this class. Endpoint health has
   * already been updated when it runs. Create suppressions here when the policy's condition is met.
   * An error thrown here is logged and does not fail the batch.
   *
   * @param events - The events processed in this batch (all types, all endpoints).
   * @param parameters - The policy row's `Parameters`, parsed from JSON (an empty object when blank
   *   or malformed).
   * @param contextUser - User to read and write as.
   */
  public abstract Evaluate(
    events: NormalizedActivityEvent[],
    parameters: Record<string, unknown>,
    contextUser: UserInfo,
  ): Promise<void>;
}
