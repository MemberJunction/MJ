/**
 * @fileoverview The orchestration of mid-session identity verification, written against **ports** so the
 * whole policy surface (every refusal, every limit, deadline extension, single use) is unit-testable
 * without a database, a mail server or a PubSub.
 *
 * {@link RealtimeSessionVerificationWorkflow} owns the decisions and their order; the injected
 * {@link VerificationPorts} own the side effects (read the session, write its `Config`, send the email,
 * publish the event, write the audit row). `RealtimeSessionVerificationService` wires the real ports.
 *
 * ## Operations
 *
 * | Operation | Caller | What it does |
 * |---|---|---|
 * | {@link RealtimeSessionVerificationWorkflow.RequestVerification} | the session's own principal | validates, applies policy + limits, stores a pending verification, emails link + code |
 * | {@link RealtimeSessionVerificationWorkflow.SubmitCode} | the session's own principal | redeems the typed code |
 * | {@link RealtimeSessionVerificationWorkflow.RedeemLink} | anyone holding the emailed link (public route) | redeems the link token |
 * | {@link RealtimeSessionVerificationWorkflow.GetStatus} | the session's own principal | reads the current state (the durable backstop for a missed event) |
 *
 * ## What a successful verification does — and does not do
 *
 * It records the verified identity on the session, **extends the session's deadline** when policy says
 * to, publishes `identity.verified`, and writes an audit entry. It does **not** create an MJ user, swap
 * the session's principal, or link a Person/User: the principal never changes, so ownership and
 * row-level security are untouched. Linking the verified email to a record is an application decision,
 * made by a server-side subscriber to the event.
 *
 * ## Concurrency
 *
 * Operations on one session are serialised in-process (a per-session mutex) so two simultaneous
 * redemptions cannot both pass, and every write re-reads the session's current state first. Across
 * *replicas* the database offers no compare-and-swap on `Config`, so strict single-use and attempt
 * counting are exact per instance and best-effort across them: the worst a cross-replica race can do is
 * let two simultaneous redemptions of the same valid secret both succeed (they converge on the same
 * verified identity) or let a burst of parallel guesses count as one attempt. The per-session attempt
 * rate limiter and the code's 6-digit space bound the latter.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import type { IdentityVerifiedEventPayload } from '@memberjunction/ai-core-plus';
import { AuthorizeSessionAccess } from './sessionAccess.js';
import { SlidingWindowRateLimiter } from './SlidingWindowRateLimiter.js';
import {
    EvaluateEmailDomainPolicy,
    ParseEmailAddress,
    ReadIdentityVerificationPolicyLayer,
    ResolveIdentityVerificationPolicy,
    type IdentityVerificationPolicy,
    type ResolvedIdentityVerificationPolicy,
} from './verificationPolicy.js';
import {
    ComputeVerifiedDeadline,
    EvaluateRedemption,
    IssueVerification,
    NormalizeVerificationCode,
    ParseConfigObject,
    ParseVerificationToken,
    ReadIdentityVerificationState,
    SanitizeVerificationName,
    WriteIdentityVerificationState,
    type IdentityVerificationState,
    type VerifiedIdentity,
} from './verificationCore.js';
import { BuildVerificationEmail } from './verificationPages.js';

// ───────────────────────── ports ─────────────────────────

/** Who is calling. A `principal` is an authenticated GraphQL caller; a `link` is the public verify route. */
export type VerificationCaller =
    | {
          Kind: 'principal';
          /** The authenticated user the server built from the caller's token — the source of truth for ownership. */
          ContextUser: UserInfo;
          /** The request-scoped provider. */
          Provider: IMetadataProvider;
          /** The caller's network address, for abuse limits only. */
          ClientIp?: string;
      }
    | { Kind: 'link'; ClientIp?: string };

/** The principal variant of {@link VerificationCaller}. */
export type PrincipalCaller = Extract<VerificationCaller, { Kind: 'principal' }>;

/** A read of a session, reduced to what verification needs. */
export interface SessionSnapshot {
    AgentSessionID: string;
    /** `AIAgentSession.UserID`. */
    OwnerUserID: string;
    /** `Conversation.ExternalID` (anonymous scope id), or null. */
    ConversationExternalID: string | null;
    Status: 'Active' | 'Idle' | 'Closed';
    /** `AIAgentSession.Config` as stored. */
    ConfigRaw: string | null;
    /** When the session started, epoch ms. */
    StartedAtMs: number;
}

/** A read-modify-write of a session's `Config`: given the CURRENT snapshot, decide what to write. */
export type ConfigMutation<T> = (current: SessionSnapshot) => { NextConfigRaw: string | null; Outcome: T };

/** Result of {@link VerificationPorts.MutateSessionConfig}. */
export interface ConfigMutationResult<T> {
    /** The session as read just before the mutation; undefined when it could not be read. */
    Session?: SessionSnapshot;
    /** What the mutation returned; undefined when it never ran. */
    Outcome?: T;
    /** True when a write was requested AND succeeded. */
    Persisted: boolean;
    /** Why a requested write (or the read) failed. */
    ErrorMessage?: string;
}

/** An email to send. */
export interface OutboundEmail {
    To: string;
    Subject: string;
    Text: string;
    Html: string;
}

/** What the audit trail records for a completed verification. */
export interface VerificationAuditEntry {
    AgentSessionID: string;
    OwnerUserID: string;
    Email: string;
    Method: VerifiedIdentity['Method'];
    ClientIp?: string;
    /** The session's deadline after verification, when it was extended. */
    MaxSessionDeadlineIso?: string;
}

/** Settings the workflow reads (resolved from server config by the service). */
export interface VerificationSettings {
    /** Master switch. Must be false when no {@link VerificationSettings.CodeHashKey} is available. */
    Enabled: boolean;
    /**
     * Server-only key the typed code is HMAC'd under before it is stored. It must never reach a client or a
     * session row: the session owner can read their own `Config`, and without this key a six-digit code
     * hash cannot be reversed offline. See `HashVerificationCode`.
     */
    CodeHashKey: string;
    /** Base policy layer from server config. */
    PolicyDefaults: IdentityVerificationPolicy;
    /** Base URL for the emailed link, no trailing slash; undefined ⇒ the feature cannot send. */
    PublicBaseUrl: string | undefined;
    /** Limits applied in memory (0 disables a limit). */
    RateLimits: {
        SendWindowMs: number;
        PerIpSends: number;
        PerEmailDomainSends: number;
        PerEmailSends: number;
        CodeAttemptWindowMs: number;
        PerSessionCodeAttempts: number;
    };
}

/** Every side effect the workflow needs. */
export interface VerificationPorts {
    GetSettings(): VerificationSettings;
    /** Current time, epoch ms. */
    Now(): number;
    /**
     * Loads a session as the CALLER (so row-level security is the first gate). For a `link` caller there is
     * no identity to load as, so the real port reads as the configured service principal.
     */
    LoadSession(agentSessionId: string, caller: VerificationCaller): Promise<SessionSnapshot | null>;
    /** Re-reads the session fresh, runs `mutate` on it, and persists the returned `Config` (trusted write). */
    MutateSessionConfig<T>(agentSessionId: string, caller: VerificationCaller, mutate: ConfigMutation<T>): Promise<ConfigMutationResult<T>>;
    /** Sends an email. Must not throw; reports failure in the result. */
    SendEmail(email: OutboundEmail): Promise<{ Success: boolean; ErrorMessage?: string }>;
    /** Publishes `identity.verified` to the session. Must not throw. */
    PublishVerified(
        routing: { AgentSessionID: string; OwnerUserID: string; ScopeKey: string | null },
        payload: IdentityVerifiedEventPayload,
    ): { Success: boolean; ErrorMessage?: string };
    /** Records the audit entry. Must not throw. */
    WriteAudit(entry: VerificationAuditEntry): Promise<void>;
}

// ───────────────────────── results ─────────────────────────

/** Machine-readable failure reasons. Stable: clients branch on these. */
export type VerificationErrorCode =
    | 'verification_unavailable' // feature off / not configured
    | 'invalid_input' // missing/blank name or malformed session id
    | 'invalid_email' // not an acceptable address
    | 'session_not_found' // no such session, or not yours (indistinguishable on purpose)
    | 'session_closed' // the session has ended
    | 'domain_blocked' // the address's domain is on the block list
    | 'consumer_domain' // policy requires a business address
    | 'send_limit_reached' // the session has used all its verification emails
    | 'rate_limited' // too many requests (IP / domain / address / attempts)
    | 'email_send_failed' // the email could not be delivered; nothing was consumed
    | 'no_pending_verification' // nothing to redeem
    | 'code_expired' // the pending verification expired
    | 'invalid_code' // wrong code
    | 'attempts_exhausted' // too many wrong codes; request a new one
    | 'invalid_link' // the link token is not redeemable (uniformly: unknown, malformed, expired, used)
    | 'persist_failed'; // the server could not record the outcome

/** Where a session stands. */
export type VerificationStateName = 'unverified' | 'pending' | 'verified';

/** Result of every workflow operation. */
export interface VerificationOperationResult {
    Success: boolean;
    /** The session's verification state after the operation (best knowledge; `unverified` on early refusals). */
    VerificationState: VerificationStateName;
    ErrorCode?: VerificationErrorCode;
    /** A message safe to show a person. */
    Message?: string;
    /** When the pending link/code expires (ISO). */
    ExpiresAt?: string;
    /** Verification emails this session may still trigger. */
    SendsRemaining?: number;
    /** Wrong code entries left before the pending verification is voided. */
    AttemptsRemaining?: number;
    /** Seconds to wait before retrying, when rate limited. */
    RetryAfterSeconds?: number;
    /** The verified address, once verified. */
    VerifiedEmail?: string;
    /** When verification completed (ISO). */
    VerifiedAt?: string;
    /** The session's deadline after verification, when it was extended (ISO). */
    MaxSessionDeadlineIso?: string;
}

/** Builds a failure result. */
function failure(
    code: VerificationErrorCode,
    message: string,
    extra: Partial<VerificationOperationResult> = {},
): VerificationOperationResult {
    return { Success: false, VerificationState: 'unverified', ErrorCode: code, Message: message, ...extra };
}

/** Result for a session that is already verified (idempotent success). */
function alreadyVerified(state: IdentityVerificationState): VerificationOperationResult {
    return {
        Success: true,
        VerificationState: 'verified',
        VerifiedEmail: state.Verified?.Email,
        VerifiedAt: state.Verified?.VerifiedAt,
        Message: 'Your email is already verified.',
    };
}

const SESSION_NOT_FOUND = 'Session not found.';
const UNAVAILABLE = 'Email verification is not available.';

// ───────────────────────── workflow ─────────────────────────

/** Mutation outcomes of the request step. */
type StoreOutcome = { Kind: 'stored'; SendCount: number } | { Kind: 'already_verified' } | { Kind: 'send_limit' };

/** Mutation outcome of a redemption: the engine's decision plus the deadline it wrote. */
interface RedemptionMutationOutcome {
    Decision: ReturnType<typeof EvaluateRedemption>;
    DeadlineIso: string | undefined;
}

/**
 * The decisions and their order. See the module header for the contract.
 */
export class RealtimeSessionVerificationWorkflow {
    private readonly ipLimiter: SlidingWindowRateLimiter;
    private readonly domainLimiter: SlidingWindowRateLimiter;
    private readonly emailLimiter: SlidingWindowRateLimiter;
    private readonly codeLimiter: SlidingWindowRateLimiter;
    private readonly locks = new Map<string, Promise<void>>();

    constructor(private readonly ports: VerificationPorts) {
        const limits = ports.GetSettings().RateLimits;
        this.ipLimiter = new SlidingWindowRateLimiter({ Limit: limits.PerIpSends, WindowMs: limits.SendWindowMs });
        this.domainLimiter = new SlidingWindowRateLimiter({ Limit: limits.PerEmailDomainSends, WindowMs: limits.SendWindowMs });
        this.emailLimiter = new SlidingWindowRateLimiter({ Limit: limits.PerEmailSends, WindowMs: limits.SendWindowMs });
        this.codeLimiter = new SlidingWindowRateLimiter({ Limit: limits.PerSessionCodeAttempts, WindowMs: limits.CodeAttemptWindowMs });
    }

    /** Whether the feature is switched on. */
    public get IsEnabled(): boolean {
        return this.ports.GetSettings().Enabled;
    }

    /**
     * Asks to verify `Email` for the caller's session: validates, applies policy and limits, stores a
     * pending verification (hashes only) and emails a one-time link plus a typed code.
     *
     * Nothing is consumed unless the email is actually sent: a delivery failure rolls the stored state back.
     */
    public async RequestVerification(
        input: { AgentSessionID: string; Name: string; Email: string },
        caller: PrincipalCaller,
    ): Promise<VerificationOperationResult> {
        const settings = this.ports.GetSettings();
        if (!settings.Enabled || !settings.PublicBaseUrl) {
            return failure('verification_unavailable', UNAVAILABLE);
        }
        const name = SanitizeVerificationName(input.Name);
        if (!name) {
            return failure('invalid_input', 'Please enter your name.');
        }
        const email = ParseEmailAddress(input.Email);
        if (!email.Ok) {
            return failure('invalid_email', 'Please enter a valid email address.');
        }
        return this.withSessionLock(input.AgentSessionID, async () => {
            const access = await this.authorize(input.AgentSessionID, caller, false);
            if (access.Ok === false) {
                return access.Result;
            }
            const state = ReadIdentityVerificationState(access.Session.ConfigRaw, ReadIdentityVerificationPolicyLayer);
            if (state.Verified) {
                return alreadyVerified(state);
            }
            const policy = ResolveIdentityVerificationPolicy([settings.PolicyDefaults, state.Policy]);
            const refusal = this.checkRequestRefusals(email, state, policy, caller);
            return refusal ?? this.issueAndSend(access.Session, { Email: email.Email, Name: name }, policy, caller, settings);
        });
    }

    /**
     * Redeems the typed code for the caller's session. Wrong entries are counted against the pending
     * verification and void it at `maxCodeAttempts`; submissions are also rate limited per session.
     */
    public async SubmitCode(
        input: { AgentSessionID: string; Code: string },
        caller: PrincipalCaller,
    ): Promise<VerificationOperationResult> {
        const settings = this.ports.GetSettings();
        if (!settings.Enabled) {
            return failure('verification_unavailable', UNAVAILABLE);
        }
        if (!IsValidUUID(input.AgentSessionID)) {
            return failure('session_not_found', SESSION_NOT_FOUND);
        }
        const gate = this.codeLimiter.TryConsume(input.AgentSessionID.toLowerCase(), this.ports.Now());
        if (!gate.Allowed) {
            return failure('rate_limited', 'Too many attempts. Please wait a moment and try again.', {
                RetryAfterSeconds: Math.ceil(gate.RetryAfterMs / 1000),
            });
        }
        const code = NormalizeVerificationCode(input.Code);
        if (!code) {
            // Cannot match any stored code, so it must not burn the person's attempts either.
            return failure('invalid_code', 'That code is not valid. Check it and try again.');
        }
        return this.withSessionLock(input.AgentSessionID, async () => {
            const access = await this.authorize(input.AgentSessionID, caller, false);
            if (access.Ok === false) {
                return access.Result;
            }
            return this.redeem(input.AgentSessionID, caller, { Kind: 'code', Code: code, AgentSessionID: input.AgentSessionID });
        });
    }

    /**
     * Redeems an emailed link token. The capability IS the token, so there is no principal; every
     * failure — malformed, unknown, expired, used, voided — is the same result so the response cannot
     * be used to learn anything about a session.
     */
    public async RedeemLink(token: string, caller: Extract<VerificationCaller, { Kind: 'link' }>): Promise<VerificationOperationResult> {
        if (!this.ports.GetSettings().Enabled) {
            return failure('verification_unavailable', UNAVAILABLE);
        }
        const parsed = ParseVerificationToken(token);
        if (!parsed) {
            return failure('invalid_link', 'This link is no longer valid.');
        }
        return this.withSessionLock(parsed.AgentSessionID, () =>
            this.redeem(parsed.AgentSessionID, caller, { Kind: 'token', Token: token }),
        );
    }

    /**
     * Reads the session's verification state. This is the **durable** counterpart of the
     * `identity.verified` event: a subscriber that was disconnected when the event fired recovers by
     * asking here.
     */
    public async GetStatus(input: { AgentSessionID: string }, caller: PrincipalCaller): Promise<VerificationOperationResult> {
        const settings = this.ports.GetSettings();
        if (!settings.Enabled) {
            return failure('verification_unavailable', UNAVAILABLE);
        }
        const access = await this.authorize(input.AgentSessionID, caller, true);
        if (access.Ok === false) {
            return access.Result;
        }
        const state = ReadIdentityVerificationState(access.Session.ConfigRaw, ReadIdentityVerificationPolicyLayer);
        if (state.Verified) {
            return alreadyVerified(state);
        }
        const policy = ResolveIdentityVerificationPolicy([settings.PolicyDefaults, state.Policy]);
        const pendingLive = state.Pending && Date.parse(state.Pending.ExpiresAt) > this.ports.Now() ? state.Pending : undefined;
        return {
            Success: true,
            VerificationState: pendingLive ? 'pending' : 'unverified',
            ExpiresAt: pendingLive?.ExpiresAt,
            SendsRemaining: Math.max(0, policy.maxSendsPerSession - state.SendCount),
            AttemptsRemaining: pendingLive ? Math.max(0, policy.maxCodeAttempts - pendingLive.CodeAttempts) : undefined,
        };
    }

    // ───────────── request internals ─────────────

    /** The policy and limit refusals of a request, in order; null when the request may proceed. */
    private checkRequestRefusals(
        email: { Email: string; Domain: string },
        state: IdentityVerificationState,
        policy: ResolvedIdentityVerificationPolicy,
        caller: PrincipalCaller,
    ): VerificationOperationResult | null {
        const domain = EvaluateEmailDomainPolicy(email.Domain, policy);
        if (domain.Allowed === false) {
            return domain.Reason === 'domain_blocked'
                ? failure('domain_blocked', 'Email addresses from that domain cannot be used here.')
                : failure('consumer_domain', 'Please use your work email address.');
        }
        if (state.SendCount >= policy.maxSendsPerSession) {
            return failure('send_limit_reached', 'The maximum number of verification emails for this conversation has been reached.', {
                SendsRemaining: 0,
            });
        }
        return this.checkSendRateLimits(email, caller.ClientIp);
    }

    /** Applies the per-IP, per-domain and per-address send limits; null when all admit the send. */
    private checkSendRateLimits(email: { Email: string; Domain: string }, clientIp: string | undefined): VerificationOperationResult | null {
        const now = this.ports.Now();
        const decisions = [
            clientIp ? this.ipLimiter.TryConsume(clientIp, now) : { Allowed: true, RetryAfterMs: 0 },
            this.domainLimiter.TryConsume(email.Domain, now),
            this.emailLimiter.TryConsume(email.Email, now),
        ];
        const refused = decisions.find((decision) => !decision.Allowed);
        if (!refused) {
            return null;
        }
        return failure('rate_limited', 'Too many verification requests. Please try again later.', {
            RetryAfterSeconds: Math.ceil(refused.RetryAfterMs / 1000),
        });
    }

    /** Stores the pending verification, emails it, and rolls the store back if the email cannot be sent. */
    private async issueAndSend(
        session: SessionSnapshot,
        recipient: { Email: string; Name: string },
        policy: ResolvedIdentityVerificationPolicy,
        caller: PrincipalCaller,
        settings: VerificationSettings,
    ): Promise<VerificationOperationResult> {
        const issued = IssueVerification({
            AgentSessionID: session.AgentSessionID,
            Email: recipient.Email,
            Name: recipient.Name,
            TtlMinutes: policy.linkTtlMinutes,
            NowMs: this.ports.Now(),
            CodeHashKey: settings.CodeHashKey,
        });
        const stored = await this.ports.MutateSessionConfig<StoreOutcome>(session.AgentSessionID, caller, (current) => {
            const state = ReadIdentityVerificationState(current.ConfigRaw, ReadIdentityVerificationPolicyLayer);
            if (state.Verified) {
                return { NextConfigRaw: null, Outcome: { Kind: 'already_verified' } };
            }
            if (state.SendCount >= policy.maxSendsPerSession) {
                return { NextConfigRaw: null, Outcome: { Kind: 'send_limit' } };
            }
            const next: IdentityVerificationState = { ...state, SendCount: state.SendCount + 1, Pending: issued.Pending };
            return { NextConfigRaw: WriteIdentityVerificationState(current.ConfigRaw, next), Outcome: { Kind: 'stored', SendCount: next.SendCount } };
        });
        const early = this.requestStoreRefusal(stored);
        if (early || stored.Outcome?.Kind !== 'stored') {
            return early ?? failure('persist_failed', 'We could not start verification. Please try again.');
        }
        const email = BuildVerificationEmail({
            Name: recipient.Name,
            Code: issued.Code,
            LinkUrl: `${settings.PublicBaseUrl}/realtime/verify/${issued.Token}`,
            TtlMinutes: policy.linkTtlMinutes,
        });
        const sent = await this.ports.SendEmail({ To: recipient.Email, Subject: email.Subject, Text: email.Text, Html: email.Html });
        if (!sent.Success) {
            LogError(`RealtimeSessionVerification: email to the verifier of session ${session.AgentSessionID} failed: ${sent.ErrorMessage ?? 'unknown error'}`);
            await this.rollbackPending(session.AgentSessionID, caller, issued.Pending.TokenHash);
            return failure('email_send_failed', 'We could not send the email. Please check the address and try again.');
        }
        return {
            Success: true,
            VerificationState: 'pending',
            ExpiresAt: issued.Pending.ExpiresAt,
            SendsRemaining: Math.max(0, policy.maxSendsPerSession - stored.Outcome.SendCount),
            Message: 'We emailed you a link and a code.',
        };
    }

    /** Maps a failed/short-circuited store into a result; null when the pending verification was stored. */
    private requestStoreRefusal(stored: ConfigMutationResult<StoreOutcome>): VerificationOperationResult | null {
        if (stored.Outcome?.Kind === 'already_verified') {
            return { Success: true, VerificationState: 'verified', Message: 'Your email is already verified.' };
        }
        if (stored.Outcome?.Kind === 'send_limit') {
            return failure('send_limit_reached', 'The maximum number of verification emails for this conversation has been reached.', {
                SendsRemaining: 0,
            });
        }
        if (!stored.Persisted) {
            return failure('persist_failed', 'We could not start verification. Please try again.');
        }
        return null;
    }

    /** Removes the pending verification (and the send it counted) if it is still the one we stored. */
    private async rollbackPending(agentSessionId: string, caller: PrincipalCaller, tokenHash: string): Promise<void> {
        const result = await this.ports.MutateSessionConfig<void>(agentSessionId, caller, (current) => {
            const state = ReadIdentityVerificationState(current.ConfigRaw, ReadIdentityVerificationPolicyLayer);
            if (state.Pending?.TokenHash !== tokenHash) {
                return { NextConfigRaw: null, Outcome: undefined };
            }
            const { Pending: _dropped, ...rest } = state;
            return { NextConfigRaw: WriteIdentityVerificationState(current.ConfigRaw, { ...rest, SendCount: Math.max(0, state.SendCount - 1) }), Outcome: undefined };
        });
        if (!result.Persisted && result.ErrorMessage) {
            LogError(`RealtimeSessionVerification: could not roll back the pending verification of session ${agentSessionId}: ${result.ErrorMessage}`);
        }
    }

    // ───────────── redemption internals ─────────────

    /**
     * Shared by the code and link paths: re-read the session, decide the redemption on its CURRENT
     * state, persist the resulting state (and the extended deadline on success), and on success
     * publish the event and write the audit entry.
     */
    private async redeem(
        agentSessionId: string,
        caller: VerificationCaller,
        credential: Parameters<typeof EvaluateRedemption>[1],
    ): Promise<VerificationOperationResult> {
        const settings = this.ports.GetSettings();
        const nowMs = this.ports.Now();
        const result = await this.ports.MutateSessionConfig<RedemptionMutationOutcome>(agentSessionId, caller, (current) => {
            const state = ReadIdentityVerificationState(current.ConfigRaw, ReadIdentityVerificationPolicyLayer);
            const policy = ResolveIdentityVerificationPolicy([settings.PolicyDefaults, state.Policy]);
            const decision = EvaluateRedemption(state, credential, nowMs, policy, settings.CodeHashKey);
            const deadlineIso =
                decision.Outcome === 'verified' && current.Status !== 'Closed'
                    ? ComputeVerifiedDeadline({
                          CurrentDeadlineIso: readDeadline(current.ConfigRaw),
                          SessionStartedAtMs: current.StartedAtMs,
                          VerifiedMaxSeconds: policy.verifiedMaxSeconds,
                      })
                    : undefined;
            const changed = decision.Next !== state;
            return {
                NextConfigRaw: changed ? WriteIdentityVerificationState(current.ConfigRaw, decision.Next, deadlineIso) : null,
                Outcome: { Decision: decision, DeadlineIso: deadlineIso },
            };
        });
        if (!result.Session || !result.Outcome) {
            // The session could not be read (or does not exist). For the link that is "invalid"; for the code
            // path the caller was already authorized, so it is a server fault.
            return caller.Kind === 'link'
                ? failure('invalid_link', 'This link is no longer valid.')
                : failure('persist_failed', 'We could not check that code. Please try again.');
        }
        const { Decision, DeadlineIso } = result.Outcome;
        if (Decision.Outcome === 'verified') {
            return this.completeVerification(result.Session, result.Persisted, result.ErrorMessage, Decision.Verified, DeadlineIso, caller);
        }
        return this.refusalResult(Decision, caller);
    }

    /** Success path: surface persistence failure, otherwise publish + audit and build the result. */
    private async completeVerification(
        session: SessionSnapshot,
        persisted: boolean,
        persistError: string | undefined,
        verified: VerifiedIdentity,
        deadlineIso: string | undefined,
        caller: VerificationCaller,
    ): Promise<VerificationOperationResult> {
        if (!persisted) {
            LogError(`RealtimeSessionVerification: verified session ${session.AgentSessionID} but could not persist it: ${persistError ?? 'unknown error'}`);
            return failure('persist_failed', 'We could not record your verification. Please try again.');
        }
        if (session.Status !== 'Closed') {
            this.ports.PublishVerified(
                { AgentSessionID: session.AgentSessionID, OwnerUserID: session.OwnerUserID, ScopeKey: session.ConversationExternalID },
                {
                    VerifiedEmail: verified.Email,
                    VerifiedName: verified.Name,
                    VerifiedAt: verified.VerifiedAt,
                    Method: verified.Method,
                    MaxSessionDeadlineIso: deadlineIso,
                },
            );
        }
        await this.ports.WriteAudit({
            AgentSessionID: session.AgentSessionID,
            OwnerUserID: session.OwnerUserID,
            Email: verified.Email,
            Method: verified.Method,
            ClientIp: caller.ClientIp,
            MaxSessionDeadlineIso: deadlineIso,
        });
        LogStatus(`RealtimeSessionVerification: session ${session.AgentSessionID} verified by ${verified.Method}${deadlineIso ? `; deadline extended to ${deadlineIso}` : ''}.`);
        return {
            Success: true,
            VerificationState: 'verified',
            VerifiedEmail: verified.Email,
            VerifiedAt: verified.VerifiedAt,
            MaxSessionDeadlineIso: deadlineIso,
            Message: "You're verified.",
        };
    }

    /** Maps a rejected redemption to a result (uniform for the link path). */
    private refusalResult(
        decision: Extract<ReturnType<typeof EvaluateRedemption>, { Outcome: 'rejected' }>,
        caller: VerificationCaller,
    ): VerificationOperationResult {
        if (caller.Kind === 'link') {
            return failure('invalid_link', 'This link is no longer valid.');
        }
        switch (decision.Reason) {
            case 'already_verified':
                return alreadyVerified(decision.Next);
            case 'no_pending':
                return failure('no_pending_verification', 'There is no verification waiting. Request a new email.');
            case 'expired':
                return failure('code_expired', 'That code has expired. Request a new email.');
            case 'attempts_exhausted':
                return failure('attempts_exhausted', 'Too many incorrect codes. Request a new email.', { AttemptsRemaining: 0 });
            case 'invalid':
            default:
                return failure('invalid_code', 'That code is not correct.', { VerificationState: 'pending', AttemptsRemaining: decision.AttemptsRemaining });
        }
    }

    // ───────────── shared internals ─────────────

    /**
     * Loads the session as the caller and applies {@link AuthorizeSessionAccess}. Not-found and
     * not-yours are the same result so a caller cannot enumerate other people's session ids; the real
     * reason is logged server-side.
     */
    private async authorize(
        agentSessionId: string,
        caller: PrincipalCaller,
        allowClosed: boolean,
    ): Promise<{ Ok: true; Session: SessionSnapshot } | { Ok: false; Result: VerificationOperationResult }> {
        const notFound = { Ok: false as const, Result: failure('session_not_found', SESSION_NOT_FOUND) };
        if (!IsValidUUID(agentSessionId)) {
            return notFound;
        }
        const session = await this.ports.LoadSession(agentSessionId, caller);
        if (!session) {
            return notFound;
        }
        const decision = AuthorizeSessionAccess(
            { SessionUserID: session.OwnerUserID, ConversationExternalID: session.ConversationExternalID },
            caller.ContextUser,
        );
        if (decision.Allowed === false) {
            LogError(`RealtimeSessionVerification: refused user ${caller.ContextUser.ID} on session ${agentSessionId} (${decision.Reason}).`);
            return notFound;
        }
        if (!allowClosed && session.Status === 'Closed') {
            return { Ok: false, Result: failure('session_closed', 'This conversation has ended.') };
        }
        return { Ok: true, Session: session };
    }

    /** Serialises operations on one session within this process (see the module header). */
    private async withSessionLock<T>(agentSessionId: string, work: () => Promise<T>): Promise<T> {
        const key = agentSessionId.toLowerCase();
        const previous = this.locks.get(key) ?? Promise.resolve();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.then(() => gate);
        this.locks.set(key, tail);
        try {
            await previous;
            return await work();
        } finally {
            release();
            if (this.locks.get(key) === tail) {
                this.locks.delete(key);
            }
        }
    }
}

/** The stored `maxSessionDeadlineIso`, when it is a string. */
function readDeadline(configRaw: string | null): string | undefined {
    const value = ParseConfigObject(configRaw)['maxSessionDeadlineIso'];
    return typeof value === 'string' ? value : undefined;
}
