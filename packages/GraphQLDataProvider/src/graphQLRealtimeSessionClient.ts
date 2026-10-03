import { gql } from 'graphql-request';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { LogError } from '@memberjunction/core';
import { ParseRealtimeSessionEvent, IsRealtimeSessionEventOfType } from '@memberjunction/ai-core-plus';
import type {
    RealtimeSessionEvent,
    RealtimeSessionEventType,
    RealtimeSessionEventWire,
    UnknownRealtimeSessionEvent,
} from '@memberjunction/ai-core-plus';
import { GraphQLDataProvider } from './graphQLDataProvider';

/**
 * Typed client for the **realtime session** GraphQL surface served by MJServer: mid-session identity
 * verification (request an emailed link + code, submit the code, read the state) and the
 * `RealtimeSessionEvents` subscription that tells a live session when something happened to it.
 *
 * It is the transport the browser realtime runtime and the embeddable widget use. Every operation is
 * authorized server-side as the session's own principal; this class adds typing, JSON parsing and an
 * error contract, never logic.
 *
 * ## Error contract
 * The three request/response methods never throw. A transport or server fault is returned as a
 * {@link RealtimeSessionVerificationResult} with `Success: false` and `ErrorCode: 'transport_error'`
 * (a client-side code the server never sends). Sensitive input — the email address and the typed code —
 * is never written to a log.
 *
 * ## Subscription contract
 * {@link GraphQLRealtimeSessionClient.SubscribeToSessionEvents} yields parsed, validated events. Events
 * have **no replay**: a client that was disconnected when one fired recovers the durable state with
 * {@link GraphQLRealtimeSessionClient.GetVerificationStatus}. The observable completes (it does not error)
 * when the provider recycles an expired-token socket; re-subscribe, then read the status once, to resume.
 *
 * @example
 * ```typescript
 * const client = new GraphQLRealtimeSessionClient(GraphQLDataProvider.Instance);
 * const sub = client.SubscribeToSessionEventsOfType(sessionId, 'identity.verified').subscribe((e) => {
 *     console.log('verified', e.Payload.VerifiedEmail);
 * });
 * const sent = await client.RequestVerification({ AgentSessionID: sessionId, Name: 'Pat', Email: 'pat@acme.com' });
 * if (!sent.Success) show(sent.Message);
 * ```
 */

/** Where a session stands in identity verification. */
export type RealtimeSessionVerificationState = 'unverified' | 'pending' | 'verified';

/**
 * Failure codes the server returns, stable enough to branch on. The server may add codes over time, so
 * {@link RealtimeSessionVerificationResult.ErrorCode} is typed `string`; use
 * {@link IsKnownRealtimeSessionVerificationErrorCode} to narrow.
 */
export type RealtimeSessionVerificationErrorCode =
    | 'verification_unavailable'
    | 'invalid_input'
    | 'invalid_email'
    | 'session_not_found'
    | 'session_closed'
    | 'domain_blocked'
    | 'consumer_domain'
    | 'send_limit_reached'
    | 'rate_limited'
    | 'email_send_failed'
    | 'no_pending_verification'
    | 'code_expired'
    | 'invalid_code'
    | 'attempts_exhausted'
    | 'invalid_link'
    | 'persist_failed'
    /** Client-side only: the request never produced a usable server response. */
    | 'transport_error';

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<RealtimeSessionVerificationErrorCode>([
    'verification_unavailable',
    'invalid_input',
    'invalid_email',
    'session_not_found',
    'session_closed',
    'domain_blocked',
    'consumer_domain',
    'send_limit_reached',
    'rate_limited',
    'email_send_failed',
    'no_pending_verification',
    'code_expired',
    'invalid_code',
    'attempts_exhausted',
    'invalid_link',
    'persist_failed',
    'transport_error',
]);

/** True when `code` is one of the {@link RealtimeSessionVerificationErrorCode}s this client knows. */
export function IsKnownRealtimeSessionVerificationErrorCode(code: string | undefined): code is RealtimeSessionVerificationErrorCode {
    return code !== undefined && KNOWN_ERROR_CODES.has(code);
}

/** Input for {@link GraphQLRealtimeSessionClient.RequestVerification}. */
export interface RequestRealtimeSessionVerificationInput {
    /** The `MJ: AI Agent Sessions` id of the caller's own session. */
    AgentSessionID: string;
    /** The name to greet in the email (sanitised and length-capped server-side). */
    Name: string;
    /** The address to verify. Never logged by this client. */
    Email: string;
}

/** Input for {@link GraphQLRealtimeSessionClient.SubmitVerificationCode}. */
export interface SubmitRealtimeSessionVerificationCodeInput {
    /** The `MJ: AI Agent Sessions` id of the caller's own session. */
    AgentSessionID: string;
    /** The code from the email; spaces and dashes are ignored server-side. Never logged by this client. */
    Code: string;
}

/** The outcome of any verification operation. */
export interface RealtimeSessionVerificationResult {
    /** True when the operation did what was asked. */
    Success: boolean;
    /** The session's verification state after the operation. */
    VerificationState: RealtimeSessionVerificationState;
    /** Machine-readable failure reason when {@link Success} is false. */
    ErrorCode?: string;
    /** A message safe to show a person. */
    Message?: string;
    /** ISO instant the pending link and code expire. */
    ExpiresAt?: string;
    /** Verification emails this session may still trigger. */
    SendsRemaining?: number;
    /** Wrong code entries left before the pending verification is voided. */
    AttemptsRemaining?: number;
    /** Seconds to wait before retrying, when rate limited. */
    RetryAfterSeconds?: number;
    /** The verified address, once verified. */
    VerifiedEmail?: string;
    /** ISO instant verification completed. */
    VerifiedAt?: string;
    /** The session's new absolute deadline (ISO) when verification extended it. The server enforces it; this is informational. */
    MaxSessionDeadlineIso?: string;
}

/** The selection shared by every verification operation (kept in one place so the three never drift). */
const RESULT_FIELDS = `
    Success
    VerificationState
    ErrorCode
    Message
    ExpiresAt
    SendsRemaining
    AttemptsRemaining
    RetryAfterSeconds
    VerifiedEmail
    VerifiedAt
    MaxSessionDeadlineIso
`;

const REQUEST_MUTATION = gql`
    mutation RequestRealtimeSessionVerification($agentSessionId: String!, $name: String!, $email: String!) {
        RequestRealtimeSessionVerification(agentSessionId: $agentSessionId, name: $name, email: $email) {
            ${RESULT_FIELDS}
        }
    }
`;

const SUBMIT_MUTATION = gql`
    mutation SubmitRealtimeSessionVerificationCode($agentSessionId: String!, $code: String!) {
        SubmitRealtimeSessionVerificationCode(agentSessionId: $agentSessionId, code: $code) {
            ${RESULT_FIELDS}
        }
    }
`;

const STATUS_QUERY = gql`
    query RealtimeSessionVerificationStatus($agentSessionId: String!) {
        RealtimeSessionVerificationStatus(agentSessionId: $agentSessionId) {
            ${RESULT_FIELDS}
        }
    }
`;

const EVENTS_SUBSCRIPTION = gql`
    subscription RealtimeSessionEvents($agentSessionId: String!) {
        RealtimeSessionEvents(agentSessionId: $agentSessionId) {
            Type
            AgentSessionID
            OccurredAt
            PayloadJson
        }
    }
`;

/** The server's raw result: optional fields arrive as `null`, which this client normalises to `undefined`. */
interface RawVerificationResult {
    Success: boolean;
    VerificationState: string;
    ErrorCode?: string | null;
    Message?: string | null;
    ExpiresAt?: string | null;
    SendsRemaining?: number | null;
    AttemptsRemaining?: number | null;
    RetryAfterSeconds?: number | null;
    VerifiedEmail?: string | null;
    VerifiedAt?: string | null;
    MaxSessionDeadlineIso?: string | null;
}

/** The subscription's per-event payload envelope. */
interface RawSessionEventsMessage {
    RealtimeSessionEvents?: RealtimeSessionEventWire | null;
}

/** Any event this client can deliver. */
export type RealtimeSessionClientEvent = RealtimeSessionEvent | UnknownRealtimeSessionEvent;

/** A client-side failure in the server's result shape. */
function transportFailure(operation: string, error: unknown): RealtimeSessionVerificationResult {
    // Deliberately logs only the operation and the error text — never the variables (email, code).
    LogError(`GraphQLRealtimeSessionClient.${operation} failed`, undefined, error);
    return {
        Success: false,
        VerificationState: 'unverified',
        ErrorCode: 'transport_error',
        Message: 'We could not reach the server. Please try again.',
    };
}

/** Narrows an arbitrary string to a verification state, treating anything unrecognised as `unverified`. */
function toState(value: string): RealtimeSessionVerificationState {
    return value === 'pending' || value === 'verified' ? value : 'unverified';
}

/** Strips nulls so callers can use optional chaining and `=== undefined`. */
function normalise(raw: RawVerificationResult): RealtimeSessionVerificationResult {
    const result: RealtimeSessionVerificationResult = { Success: !!raw.Success, VerificationState: toState(raw.VerificationState) };
    if (raw.ErrorCode != null) result.ErrorCode = raw.ErrorCode;
    if (raw.Message != null) result.Message = raw.Message;
    if (raw.ExpiresAt != null) result.ExpiresAt = raw.ExpiresAt;
    if (raw.SendsRemaining != null) result.SendsRemaining = raw.SendsRemaining;
    if (raw.AttemptsRemaining != null) result.AttemptsRemaining = raw.AttemptsRemaining;
    if (raw.RetryAfterSeconds != null) result.RetryAfterSeconds = raw.RetryAfterSeconds;
    if (raw.VerifiedEmail != null) result.VerifiedEmail = raw.VerifiedEmail;
    if (raw.VerifiedAt != null) result.VerifiedAt = raw.VerifiedAt;
    if (raw.MaxSessionDeadlineIso != null) result.MaxSessionDeadlineIso = raw.MaxSessionDeadlineIso;
    return result;
}

/** Thin, strongly-typed transport for realtime session verification and session events. */
export class GraphQLRealtimeSessionClient {
    private readonly _dataProvider: GraphQLDataProvider;

    /**
     * @param dataProvider - the provider whose connection (and credentials) every operation uses. In an
     *   Angular component pass `this.ProviderToUse`, not a global.
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Asks the server to email a one-time link and a typed code to prove control of an address. Subject to
     * the session's policy and limits; a refusal comes back as `Success: false` with an `ErrorCode`.
     *
     * @returns the outcome; on success `VerificationState` is `pending` and `ExpiresAt` says until when
     */
    public async RequestVerification(input: RequestRealtimeSessionVerificationInput): Promise<RealtimeSessionVerificationResult> {
        return this.execute('RequestVerification', REQUEST_MUTATION, 'RequestRealtimeSessionVerification', {
            agentSessionId: input.AgentSessionID,
            name: input.Name,
            email: input.Email,
        });
    }

    /**
     * Redeems the typed code from the verification email (the fallback when the link was opened on another
     * device). Single use; too many wrong codes void the pending verification.
     */
    public async SubmitVerificationCode(input: SubmitRealtimeSessionVerificationCodeInput): Promise<RealtimeSessionVerificationResult> {
        return this.execute('SubmitVerificationCode', SUBMIT_MUTATION, 'SubmitRealtimeSessionVerificationCode', {
            agentSessionId: input.AgentSessionID,
            code: input.Code,
        });
    }

    /**
     * Reads the session's current verification state. Use it on (re)connect: session events are not
     * replayed, so this is how a client that missed `identity.verified` finds out.
     */
    public async GetVerificationStatus(agentSessionId: string): Promise<RealtimeSessionVerificationResult> {
        return this.execute('GetVerificationStatus', STATUS_QUERY, 'RealtimeSessionVerificationStatus', { agentSessionId });
    }

    /**
     * Subscribes to the events addressed to one of the caller's own sessions. Each emission is a validated,
     * typed event; malformed events are dropped (and logged), and events of a type this client version does
     * not know arrive as {@link UnknownRealtimeSessionEvent} so a newer server never breaks an older client.
     *
     * The server refuses the subscription — as an error on the observable — when the session is not the
     * caller's. Unsubscribing tears the subscription down.
     */
    public SubscribeToSessionEvents(agentSessionId: string): Observable<RealtimeSessionClientEvent> {
        return this._dataProvider.Subscribe(EVENTS_SUBSCRIPTION, { agentSessionId }).pipe(
            map((message: RawSessionEventsMessage) => this.parseMessage(message)),
            filter((event): event is RealtimeSessionClientEvent => event !== null),
        );
    }

    /**
     * Like {@link SubscribeToSessionEvents} but narrowed to one known event type, so a handler gets a fully
     * typed payload.
     *
     * @param agentSessionId - the caller's session
     * @param type - a key of the shared event payload map, e.g. `'identity.verified'`
     */
    public SubscribeToSessionEventsOfType<T extends RealtimeSessionEventType>(
        agentSessionId: string,
        type: T,
    ): Observable<RealtimeSessionEvent<T>> {
        return this.SubscribeToSessionEvents(agentSessionId).pipe(
            filter((event): event is RealtimeSessionEvent<T> => IsRealtimeSessionEventOfType(event, type)),
        );
    }

    /** Runs one request/response operation under the never-throws contract. */
    private async execute(
        operation: string,
        document: string,
        field: string,
        variables: Record<string, string>,
    ): Promise<RealtimeSessionVerificationResult> {
        try {
            const response = await this._dataProvider.ExecuteGQL(document, variables);
            const raw: RawVerificationResult | undefined = response?.[field];
            if (!raw) {
                throw new Error('Invalid response from server');
            }
            return normalise(raw);
        } catch (error: unknown) {
            return transportFailure(operation, error);
        }
    }

    /** Parses one subscription message; null for an empty or malformed one. */
    private parseMessage(message: RawSessionEventsMessage): RealtimeSessionClientEvent | null {
        const wire = message?.RealtimeSessionEvents;
        if (!wire) {
            return null;
        }
        const event = ParseRealtimeSessionEvent(wire);
        if (!event) {
            LogError(`GraphQLRealtimeSessionClient: dropped a malformed '${String(wire.Type)}' session event.`);
        }
        return event;
    }
}
