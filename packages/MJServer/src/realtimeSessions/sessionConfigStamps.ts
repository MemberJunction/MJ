/**
 * @fileoverview What the session-start path stamps into a new realtime session's `Config` for identity
 * verification: the policy snapshot, the unverified duration cap, and any verified identity carried
 * forward from the session being resumed.
 *
 * Split in two so the decision is testable without a database:
 *
 * - {@link BuildMintConfigStamps} — **pure**. Given the resolved realtime config, the existing `Config`
 *   and an optional inherited identity, returns the `Config` to write (or `null` when there is nothing
 *   to stamp).
 * - {@link LoadInheritedVerifiedIdentity} — the one read: the prior session's verified identity, only
 *   when the new caller is authorized on that prior session.
 *
 * Everything stamped here lives under server-authoritative keys (`identityVerification`,
 * `maxSessionDeadlineIso`); the caller writes it inside `RunWithTrustedSessionConfigWrites`.
 *
 * ## Resume after the cap
 *
 * If an unverified session hits its cap before the person verifies, the janitor closes it. A verify link
 * redeemed afterwards still records the verification on that (closed) session, and a **new** session
 * started with `lastSessionId` pointing at it inherits the verified identity (and, with it, the
 * `verifiedMaxSeconds` cap instead of the unverified one). Inheritance requires the same ownership/scope
 * authorization as any other access to the prior session, so a stranger cannot adopt someone else's
 * verification by naming their session id.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AuthorizeSessionAccess, LoadSessionForAccess } from './sessionAccess.js';
import {
    ExtractIdentityVerificationPolicyFromRealtimeConfig,
    ReadIdentityVerificationPolicyLayer,
    TightenSessionDeadline,
} from './verificationPolicy.js';
import {
    ParseConfigObject,
    ReadIdentityVerificationState,
    WriteIdentityVerificationState,
    type IdentityVerificationState,
    type VerifiedIdentity,
} from './verificationCore.js';

/** The `Config` to persist at session start. */
export interface MintConfigStampPlan {
    NextConfigRaw: string;
}

/**
 * Decides what to stamp into a freshly created session's `Config`.
 *
 * - **Policy snapshot.** The cascade's verification layer (`channels.config.IdentityVerification` plus the
 *   duration caps) is copied onto the session, so the rules a person is held to are fixed at mint,
 *   server-side, and cannot be chosen by the caller later.
 * - **Duration cap.** When the cascade configures `unverifiedMaxSeconds` (or, for a session that inherited
 *   a verified identity, `verifiedMaxSeconds`), the session's absolute deadline is set to now + cap —
 *   applied to ANY principal, not only widget guests — and never loosens a tighter deadline already
 *   stamped (the widget voice cap).
 * - **Inherited identity.** A verified identity carried forward from the resumed session.
 *
 * @param args.EffectiveRealtime - `EffectiveConfig.realtime` of the resolved config (any shape; read defensively)
 * @param args.ExistingConfigRaw - the session's current `Config`
 * @param args.InheritedVerified - verified identity from the session being resumed, if any
 * @param args.NowMs - the current time, epoch ms
 * @returns the `Config` to write, or `null` when nothing needs stamping
 */
export function BuildMintConfigStamps(args: {
    EffectiveRealtime: unknown;
    ExistingConfigRaw: string | null;
    InheritedVerified?: VerifiedIdentity;
    NowMs: number;
}): MintConfigStampPlan | null {
    const layer = ExtractIdentityVerificationPolicyFromRealtimeConfig(args.EffectiveRealtime);
    const hasPolicy = Object.keys(layer).length > 0;
    if (!hasPolicy && !args.InheritedVerified) {
        return null;
    }
    const existingState = ReadIdentityVerificationState(args.ExistingConfigRaw, ReadIdentityVerificationPolicyLayer);
    const state: IdentityVerificationState = {
        ...existingState,
        ...(hasPolicy ? { Policy: layer } : {}),
        ...(args.InheritedVerified ? { Verified: args.InheritedVerified } : {}),
    };
    const capSeconds = args.InheritedVerified ? (layer.verifiedMaxSeconds ?? layer.unverifiedMaxSeconds) : layer.unverifiedMaxSeconds;
    const existingDeadline = ParseConfigObject(args.ExistingConfigRaw)['maxSessionDeadlineIso'];
    const deadlineIso = capSeconds
        ? TightenSessionDeadline(typeof existingDeadline === 'string' ? existingDeadline : undefined, args.NowMs + capSeconds * 1000)
        : undefined;
    return { NextConfigRaw: WriteIdentityVerificationState(args.ExistingConfigRaw, state, deadlineIso) };
}

/**
 * The verified identity of the session being resumed, when the caller may inherit it.
 *
 * Reads the prior session as the caller and requires {@link AuthorizeSessionAccess} to allow it; any
 * failure (no such session, not the caller's, unreadable) yields `undefined` — inheritance is a
 * convenience and must never block a session start.
 *
 * @param lastSessionId - the `lastSessionId` the client supplied at start
 * @param contextUser - the starting caller
 * @param provider - request-scoped provider
 */
export async function LoadInheritedVerifiedIdentity(
    lastSessionId: string | undefined,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<VerifiedIdentity | undefined> {
    if (!lastSessionId) {
        return undefined;
    }
    const prior = await LoadSessionForAccess(lastSessionId, contextUser, provider);
    if (!prior) {
        return undefined;
    }
    const decision = AuthorizeSessionAccess(
        { SessionUserID: prior.Session.UserID, ConversationExternalID: prior.ConversationExternalID },
        contextUser,
    );
    if (decision.Allowed === false) {
        return undefined;
    }
    return ReadIdentityVerificationState(prior.Session.Config_, ReadIdentityVerificationPolicyLayer).Verified;
}
