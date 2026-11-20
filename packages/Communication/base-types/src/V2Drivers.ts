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
  readonly Envelope: Readonly<SendingEnvelope>;
  readonly Principal: PrincipalRecordRef;
  readonly Endpoint: ResolvedEndpoint;
  readonly Payload: Readonly<MessagePayload>;

  AddContent(location: 'header' | 'footer', content: { html?: string; text?: string }): void;
  SetHeader(name: string, value: string): void;
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
  public abstract ResolveEndpoints(
    records: PrincipalRecordRef[],
    channelID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, ResolvedEndpoint[]>>;

  public abstract ResolveJurisdiction(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, string | null>>;

  public abstract ResolveAttributes(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, PrincipalAttributes>>;

  public async PreProcess(_contexts: PrincipalMessageContext[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }

  public async PostProcess(_contexts: PrincipalMessageContext[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }

  public async OnActivity(_events: NormalizedActivityEvent[], _contextUser: UserInfo): Promise<void> {
    // Default no-op
  }
}

/**
 * Optional base class for custom sender type drivers registered via
 * @RegisterClass(BaseCommunicationSender, driverClass).
 */
export abstract class BaseCommunicationSender {
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
  public abstract MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): TMerged;

  public abstract Evaluate(merged: TMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome;
}

/**
 * Base class for automated suppression policy drivers registered via
 * @RegisterClass(BaseCommunicationSuppressionPolicy, driverClass).
 */
export abstract class BaseCommunicationSuppressionPolicy {
  public abstract Evaluate(
    events: NormalizedActivityEvent[],
    parameters: Record<string, unknown>,
    contextUser: UserInfo,
  ): Promise<void>;
}
