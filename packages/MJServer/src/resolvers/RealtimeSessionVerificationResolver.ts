/**
 * @fileoverview GraphQL operations for **mid-session identity verification** of a realtime session.
 *
 * A person talking to an agent (often an anonymous widget guest) proves they control an email address
 * without leaving the conversation. Three operations, all callable only as the session's OWN principal:
 *
 * | Operation | Kind | Purpose |
 * |---|---|---|
 * | `RequestRealtimeSessionVerification(agentSessionId, name, email)` | mutation | store a pending verification and email a one-time link + a typed code |
 * | `SubmitRealtimeSessionVerificationCode(agentSessionId, code)` | mutation | redeem the typed code (the fallback for opening the email on another device) |
 * | `RealtimeSessionVerificationStatus(agentSessionId)` | query | read the current state — the durable backstop for a missed `identity.verified` event |
 *
 * The emailed link is redeemed on a different surface — the public `GET/POST /realtime/verify` routes
 * (`RealtimeVerifyRouter`) — because the person opening it holds no MJ token.
 *
 * The decisions, policy and limits live in `realtimeSessions/verificationWorkflow.ts`; this resolver
 * only identifies the caller from the server-authenticated payload and maps the result. Note that it
 * reads `userPayload.userRecord` directly and does **not** use `ResolverBase.GetUserFromPayload`: that
 * helper falls back to an email lookup in the user cache, which would drop an anonymous guest's
 * per-session scope — and a scope-less anonymous principal must never be treated as a named owner of
 * the shared Anonymous user's sessions. No authenticated `userRecord` means no access.
 *
 * @module @memberjunction/server
 */

import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import type { UserInfo } from '@memberjunction/core';
import type { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { NoLog } from '../logging/NoLog.js';
import { RealtimeSessionVerificationService } from '../realtimeSessions/RealtimeSessionVerificationService.js';
import type { PrincipalCaller, VerificationOperationResult } from '../realtimeSessions/verificationWorkflow.js';

/** Result of every verification operation. */
@ObjectType()
export class RealtimeSessionVerificationResult {
    /** True when the operation did what was asked. */
    @Field(() => Boolean)
    Success: boolean;

    /** The session's verification state after the operation: `unverified`, `pending` or `verified`. */
    @Field(() => String)
    VerificationState: string;

    /**
     * Machine-readable failure reason when `Success` is false — e.g. `invalid_email`, `consumer_domain`,
     * `domain_blocked`, `rate_limited`, `send_limit_reached`, `invalid_code`, `attempts_exhausted`,
     * `code_expired`, `session_not_found`, `session_closed`, `verification_unavailable`.
     */
    @Field(() => String, { nullable: true })
    ErrorCode?: string;

    /** A message safe to show a person. */
    @Field(() => String, { nullable: true })
    Message?: string;

    /** ISO instant the pending link/code expires. */
    @Field(() => String, { nullable: true })
    ExpiresAt?: string;

    /** Verification emails this session may still trigger. */
    @Field(() => Int, { nullable: true })
    SendsRemaining?: number;

    /** Wrong code entries left before the pending verification is voided. */
    @Field(() => Int, { nullable: true })
    AttemptsRemaining?: number;

    /** Seconds to wait before retrying, when rate limited. */
    @Field(() => Int, { nullable: true })
    RetryAfterSeconds?: number;

    /** The verified address, once verified. */
    @Field(() => String, { nullable: true })
    VerifiedEmail?: string;

    /** ISO instant verification completed. */
    @Field(() => String, { nullable: true })
    VerifiedAt?: string;

    /** The session's new absolute deadline (ISO) when verification extended it. The server enforces it; this is informational. */
    @Field(() => String, { nullable: true })
    MaxSessionDeadlineIso?: string;
}

/** Maps the workflow result onto the GraphQL type. */
function toResult(result: VerificationOperationResult): RealtimeSessionVerificationResult {
    return { ...result };
}

/** The result for a caller with no usable authenticated identity. */
function notAuthenticated(): RealtimeSessionVerificationResult {
    return { Success: false, VerificationState: 'unverified', ErrorCode: 'session_not_found', Message: 'Session not found.' };
}

@Resolver()
export class RealtimeSessionVerificationResolver {
    /**
     * Ask to verify an email for your realtime session. Applies the session's policy (business-domain
     * rules, blocked domains, send and rate limits), then emails a one-time link plus a short code.
     *
     * @param agentSessionId - your `MJ: AI Agent Sessions` id
     * @param name - the name to greet in the email (sanitised and length-capped server-side)
     * @param email - the address to verify
     */
    @Mutation(() => RealtimeSessionVerificationResult)
    async RequestRealtimeSessionVerification(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('name', () => String) name: string,
        @Arg('email', () => String) @NoLog email: string,
        @Ctx() context: AppContext,
    ): Promise<RealtimeSessionVerificationResult> {
        const caller = this.callerFrom(context);
        if (!caller) {
            return notAuthenticated();
        }
        return toResult(
            await RealtimeSessionVerificationService.Instance.RequestVerification(
                { AgentSessionID: agentSessionId, Name: name, Email: email },
                caller,
            ),
        );
    }

    /**
     * Redeem the typed code from the verification email. Single use; voided after too many wrong entries.
     *
     * @param agentSessionId - your `MJ: AI Agent Sessions` id
     * @param code - the code from the email (spaces and dashes are ignored)
     */
    @Mutation(() => RealtimeSessionVerificationResult)
    async SubmitRealtimeSessionVerificationCode(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('code', () => String) @NoLog code: string,
        @Ctx() context: AppContext,
    ): Promise<RealtimeSessionVerificationResult> {
        const caller = this.callerFrom(context);
        if (!caller) {
            return notAuthenticated();
        }
        return toResult(await RealtimeSessionVerificationService.Instance.SubmitCode({ AgentSessionID: agentSessionId, Code: code }, caller));
    }

    /**
     * Read the current verification state of your realtime session. Use it after a reconnect: session
     * events have no replay, so this is how a client that missed `identity.verified` finds out.
     *
     * @param agentSessionId - your `MJ: AI Agent Sessions` id
     */
    @Query(() => RealtimeSessionVerificationResult)
    async RealtimeSessionVerificationStatus(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Ctx() context: AppContext,
    ): Promise<RealtimeSessionVerificationResult> {
        const caller = this.callerFrom(context);
        if (!caller) {
            return notAuthenticated();
        }
        return toResult(await RealtimeSessionVerificationService.Instance.GetStatus({ AgentSessionID: agentSessionId }, caller));
    }

    /**
     * Builds the caller from the server-authenticated payload, or null when there is none. Identity comes
     * from `userPayload.userRecord` ONLY (see the module header).
     */
    private callerFrom(context: AppContext): PrincipalCaller | null {
        const contextUser = context.userPayload?.userRecord as UserInfo | undefined;
        const provider = GetReadWriteProvider(context.providers);
        if (!contextUser?.ID || !provider) {
            return null;
        }
        return { Kind: 'principal', ContextUser: contextUser, Provider: provider, ClientIp: context.ClientIp };
    }
}
