/**
 * @fileoverview Pure functional core of mid-session identity verification — no DB, no email, no clock
 * of its own. Everything here is deterministic given its inputs (modulo crypto randomness) and is
 * unit-testable with plain assertions.
 *
 * ## What is stored, and where
 *
 * The verification state of a session lives in `AIAgentSession.Config` under the key
 * `identityVerification` (a server-authoritative key — see `sessionConfigGuard` in
 * `@memberjunction/core-entities-server`). It is an {@link IdentityVerificationState}: the policy
 * snapshot taken at mint, how many emails the session has triggered, at most one *pending*
 * verification, and — once done — the verified identity.
 *
 * ## Secrets
 *
 * Nothing redeemable is ever stored: only hashes.
 *
 * - The **link token** is `mj_rv_<session id>_<256 random bits>`. The session id is deliberately part of
 *   it so redemption is a primary-key lookup instead of a scan; it is not a secret. Only the SHA-256 of
 *   the whole token is stored, and it is compared in constant time.
 * - The **typed code** is 6 digits (the fallback for opening the email on another device). Six digits
 *   cannot be made brute-force-proof by hashing — a million candidates is nothing — so its protection is
 *   structural: it expires, it is single-use, it is voided after {@link IdentityVerificationPolicy.maxCodeAttempts}
 *   wrong entries, only the session's own principal can submit it, and submissions are rate-limited.
 *   It is salted and bound to the session id so equal codes do not produce equal stored hashes.
 *
 * Token generation and hashing reuse the magic-link module's primitives (`HashToken`).
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HashToken } from '../auth/magicLink/magicLinkCore.js';
import type { IdentityVerificationPolicy, ResolvedIdentityVerificationPolicy } from './verificationPolicy.js';

/** Prefix of a verification link token (mirrors `mj_ml_` / `mj_sk_`). */
export const VERIFICATION_TOKEN_PREFIX = 'mj_rv_';

/** Number of digits in the typed code. */
export const VERIFICATION_CODE_LENGTH = 6;

/** Longest name accepted, in characters. */
export const MAX_VERIFICATION_NAME_LENGTH = 100;

/** A verification that has been requested and not yet redeemed. Holds hashes only. */
export interface PendingVerification {
    /** SHA-256 (base64url) of the link token. */
    TokenHash: string;
    /** Salted, server-keyed HMAC-SHA-256 (base64url) of the typed code. */
    CodeHash: string;
    /** Random per-verification salt for {@link PendingVerification.CodeHash}. */
    CodeSalt: string;
    /** The address the link and code were sent to (normalised). */
    Email: string;
    /** The name given with the request (sanitised, length-capped). */
    Name: string;
    /** ISO instant the verification was requested. */
    RequestedAt: string;
    /** ISO instant after which neither the link nor the code redeems. */
    ExpiresAt: string;
    /** Wrong code entries so far. */
    CodeAttempts: number;
}

/** The proven identity of a verified session. */
export interface VerifiedIdentity {
    Email: string;
    Name: string;
    /** ISO instant the verification completed. */
    VerifiedAt: string;
    /** How it was proven. */
    Method: 'link' | 'code';
}

/** The whole verification state of one session (the value of `Config.identityVerification`). */
export interface IdentityVerificationState {
    /** The session-scoped policy layer, snapshotted at mint. Absent when the cascade carried none. */
    Policy?: IdentityVerificationPolicy;
    /** How many verification emails this session has triggered (a send that failed to deliver does not count). */
    SendCount: number;
    /** The outstanding verification, if any. A new request replaces it. */
    Pending?: PendingVerification;
    /** Set once verified. */
    Verified?: VerifiedIdentity;
}

/** A state with nothing in it. */
export function EmptyIdentityVerificationState(): IdentityVerificationState {
    return { SendCount: 0 };
}

/** True for a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/** Reads a pending verification from untrusted JSON; undefined unless every field is well-formed. */
function readPending(value: unknown): PendingVerification | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const { TokenHash, CodeHash, CodeSalt, Email, Name, RequestedAt, ExpiresAt, CodeAttempts } = value;
    if (
        !isNonEmptyString(TokenHash) || !isNonEmptyString(CodeHash) || !isNonEmptyString(CodeSalt) ||
        !isNonEmptyString(Email) || typeof Name !== 'string' || !isNonEmptyString(RequestedAt) ||
        !isNonEmptyString(ExpiresAt) || typeof CodeAttempts !== 'number' || !Number.isFinite(CodeAttempts)
    ) {
        return undefined;
    }
    return { TokenHash, CodeHash, CodeSalt, Email, Name, RequestedAt, ExpiresAt, CodeAttempts };
}

/** Reads a verified identity from untrusted JSON; undefined unless every field is well-formed. */
function readVerified(value: unknown): VerifiedIdentity | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const { Email, Name, VerifiedAt, Method } = value;
    if (!isNonEmptyString(Email) || typeof Name !== 'string' || !isNonEmptyString(VerifiedAt) || (Method !== 'link' && Method !== 'code')) {
        return undefined;
    }
    return { Email, Name, VerifiedAt, Method };
}

/**
 * Reads the verification state out of a session's `Config` JSON. Tolerant by design: a missing,
 * malformed or partial value yields an empty / partial state rather than an exception, because a
 * garbled state must never be the reason a session cannot be addressed.
 *
 * @param configRaw - `AIAgentSession.Config` as stored
 * @param readPolicy - reads a policy layer from untrusted JSON (injected to keep this module free of policy wiring)
 */
export function ReadIdentityVerificationState(
    configRaw: string | null | undefined,
    readPolicy: (raw: unknown) => IdentityVerificationPolicy,
): IdentityVerificationState {
    const config = ParseConfigObject(configRaw);
    const stored = config['identityVerification'];
    if (!isRecord(stored)) {
        return EmptyIdentityVerificationState();
    }
    const sends = stored['SendCount'];
    const state: IdentityVerificationState = {
        SendCount: typeof sends === 'number' && Number.isFinite(sends) && sends >= 0 ? Math.floor(sends) : 0,
    };
    const policy = readPolicy(stored['Policy']);
    if (Object.keys(policy).length > 0) {
        state.Policy = policy;
    }
    const pending = readPending(stored['Pending']);
    if (pending) {
        state.Pending = pending;
    }
    const verified = readVerified(stored['Verified']);
    if (verified) {
        state.Verified = verified;
    }
    return state;
}

/** Parses a `Config` JSON string into a plain object; anything else is `{}`. */
export function ParseConfigObject(raw: string | null | undefined): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Returns `configRaw` with `identityVerification` (and, when given, `maxSessionDeadlineIso`) replaced,
 * preserving every other key verbatim.
 *
 * @param configRaw - the stored Config
 * @param state - the new verification state
 * @param deadlineIso - a new absolute deadline to write, or undefined to leave the existing one alone
 */
export function WriteIdentityVerificationState(
    configRaw: string | null | undefined,
    state: IdentityVerificationState,
    deadlineIso?: string,
): string {
    const config = ParseConfigObject(configRaw);
    config['identityVerification'] = state;
    if (deadlineIso !== undefined) {
        config['maxSessionDeadlineIso'] = deadlineIso;
    }
    return JSON.stringify(config);
}

// ───────────────────────── tokens, codes, hashing ─────────────────────────

/** Lower-case 32-hex form of a UUID (the dashes dropped), or null when it is not a UUID. */
function compactUUID(uuid: string): string | null {
    const compact = uuid.replace(/-/g, '').toLowerCase();
    return /^[0-9a-f]{32}$/.test(compact) ? compact : null;
}

/** Re-inserts the dashes of a compact UUID. */
function expandUUID(compact: string): string {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

/**
 * Generates a verification link token bound (by construction) to one session.
 *
 * @param agentSessionId - the session the token redeems against
 * @throws Error when `agentSessionId` is not a UUID — a programming error, never user input
 */
export function GenerateVerificationToken(agentSessionId: string): string {
    const compact = compactUUID(agentSessionId);
    if (!compact) {
        throw new Error(`GenerateVerificationToken: '${agentSessionId}' is not a session id`);
    }
    return `${VERIFICATION_TOKEN_PREFIX}${compact}_${randomBytes(32).toString('hex')}`;
}

/** The structure of a token, once parsed. */
export interface ParsedVerificationToken {
    /** The session id embedded in the token (dashed, lower-case). Not a secret and not yet trusted. */
    AgentSessionID: string;
}

/** Token shape: prefix, 32 hex of session id, `_`, 64 hex of randomness. */
const TOKEN_PATTERN = new RegExp(`^${VERIFICATION_TOKEN_PREFIX}([0-9a-f]{32})_[0-9a-f]{64}$`);

/**
 * Parses a presented token's structure. Success means "well-formed", NOT "valid": validity is decided
 * only by comparing hashes ({@link EvaluateRedemption}).
 *
 * @returns the embedded session id, or null for anything malformed
 */
export function ParseVerificationToken(token: string): ParsedVerificationToken | null {
    const match = typeof token === 'string' ? TOKEN_PATTERN.exec(token) : null;
    return match ? { AgentSessionID: expandUUID(match[1]) } : null;
}

/** Generates a uniformly random numeric code of {@link VERIFICATION_CODE_LENGTH} digits. */
export function GenerateVerificationCode(): string {
    return randomInt(0, 10 ** VERIFICATION_CODE_LENGTH).toString().padStart(VERIFICATION_CODE_LENGTH, '0');
}

/**
 * Normalises a typed code: strips spaces and dashes (people type "123 456"). Returns null unless the
 * result is exactly {@link VERIFICATION_CODE_LENGTH} digits.
 */
export function NormalizeVerificationCode(input: string): string | null {
    const stripped = (input ?? '').replace(/[\s-]/g, '');
    return new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(stripped) ? stripped : null;
}

/** Hash stored for a link token. */
export function HashVerificationToken(token: string): string {
    return HashToken(token);
}

/**
 * Hash stored for a code: an HMAC-SHA-256 under a SERVER-ONLY key, salted and bound to the session so
 * equal codes never hash equal.
 *
 * The key is what makes this safe. A code is only six digits, and the session's owner — the very person
 * being verified — can read their own `Session.Config`, hash and salt included. A plain (even salted)
 * hash would let them recover the code offline in about a million guesses without ever opening the
 * inbox, bypassing the attempt cap entirely. Without the key the stored value is useless to a reader.
 *
 * @param code - the normalised six-digit code
 * @param salt - the per-verification salt stored beside the hash
 * @param agentSessionId - the session the code is bound to
 * @param key - the server-only key (`realtime.identityVerification.hmacSecret`); must be non-empty
 */
export function HashVerificationCode(code: string, salt: string, agentSessionId: string, key: string): string {
    if (!key) {
        throw new Error('HashVerificationCode requires a non-empty server key.');
    }
    return createHmac('sha256', key).update(`rv-code:${agentSessionId.toLowerCase()}:${salt}:${code}`).digest('base64url');
}

/**
 * Constant-time equality of two hash strings. Both are re-hashed to a fixed length first, so neither
 * the comparison time nor an early length check reveals how much of a guess was right.
 */
export function HashesEqual(a: string, b: string): boolean {
    const digestA = createHash('sha256').update(a).digest();
    const digestB = createHash('sha256').update(b).digest();
    return timingSafeEqual(digestA, digestB);
}

/**
 * Sanitises a display name: collapses whitespace, strips control characters and the characters that
 * could shape markup or a header (`<`, `>`, `"`), and caps the length. The result is for display
 * only — it is still HTML-escaped wherever it is rendered.
 *
 * @returns the cleaned name, or null when nothing usable is left
 */
export function SanitizeVerificationName(raw: string): string | null {
    const cleaned = (raw ?? '')
        // eslint-disable-next-line no-control-regex -- stripping control characters is the point
        .replace(/[\u0000-\u001F\u007F-\u009F<>"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_VERIFICATION_NAME_LENGTH)
        .trim();
    return cleaned.length > 0 ? cleaned : null;
}

// ───────────────────────── issuing ─────────────────────────

/** What {@link IssueVerification} produces: the state to store and the secrets to send. */
export interface IssuedVerification {
    /** Store this. Contains hashes only. */
    Pending: PendingVerification;
    /** Send this in the link. Never store it. */
    Token: string;
    /** Send this as the typed code. Never store it. */
    Code: string;
}

/**
 * Creates a fresh pending verification for a session.
 *
 * @param args.AgentSessionID - the session being verified
 * @param args.Email - the normalised address the secrets will be sent to
 * @param args.Name - the sanitised name
 * @param args.TtlMinutes - how long the secrets stay redeemable
 * @param args.NowMs - the current time, epoch ms
 */
export function IssueVerification(args: {
    AgentSessionID: string;
    Email: string;
    Name: string;
    TtlMinutes: number;
    NowMs: number;
    /** The server-only code-hash key (see {@link HashVerificationCode}). */
    CodeHashKey: string;
}): IssuedVerification {
    const token = GenerateVerificationToken(args.AgentSessionID);
    const code = GenerateVerificationCode();
    const salt = randomBytes(16).toString('base64url');
    return {
        Token: token,
        Code: code,
        Pending: {
            TokenHash: HashVerificationToken(token),
            CodeHash: HashVerificationCode(code, salt, args.AgentSessionID, args.CodeHashKey),
            CodeSalt: salt,
            Email: args.Email,
            Name: args.Name,
            RequestedAt: new Date(args.NowMs).toISOString(),
            ExpiresAt: new Date(args.NowMs + args.TtlMinutes * 60_000).toISOString(),
            CodeAttempts: 0,
        },
    };
}

// ───────────────────────── redemption ─────────────────────────

/** What a person presents to redeem a verification. */
export type VerificationCredential =
    | { Kind: 'token'; Token: string }
    | { Kind: 'code'; Code: string; AgentSessionID: string };

/** Why a redemption was refused. */
export type RedemptionRefusal =
    | 'already_verified' // the session is already verified (code path; idempotent for the caller)
    | 'no_pending' // nothing outstanding to redeem
    | 'expired' // past ExpiresAt; the pending verification has been cleared
    | 'invalid' // the secret did not match
    | 'attempts_exhausted'; // too many wrong codes; the pending verification has been voided

/** Outcome of {@link EvaluateRedemption}. `Next` is the state to persist in every case. */
export type RedemptionOutcome =
    | { Outcome: 'verified'; Next: IdentityVerificationState; Verified: VerifiedIdentity }
    | { Outcome: 'rejected'; Reason: RedemptionRefusal; Next: IdentityVerificationState; AttemptsRemaining?: number };

/** `state` with the pending verification removed. */
function withoutPending(state: IdentityVerificationState): IdentityVerificationState {
    const { Pending: _removed, ...rest } = state;
    return rest;
}

/**
 * Decides a redemption attempt and returns the state to persist. Pure: the caller supplies the time.
 *
 * Properties this function guarantees (and the tests pin):
 *
 * - **Single use.** A success removes the pending verification, so neither the link nor the code works again.
 * - **Expiry.** Past `ExpiresAt` nothing redeems, and the stale pending verification is cleared.
 * - **Bounded guessing.** A wrong code increments `CodeAttempts`; reaching `maxCodeAttempts` voids the
 *   pending verification (a new request — itself capped by `maxSendsPerSession` — is needed). A wrong
 *   *token* changes nothing: 256 random bits are not guessable, and counting them would let a stranger
 *   burn a legitimate person's pending link just by hitting the URL.
 * - **Constant-time compares.** Secrets are compared via {@link HashesEqual}.
 *
 * @param state - the session's current verification state
 * @param credential - what was presented
 * @param nowMs - the current time, epoch ms
 * @param policy - the resolved policy (for `maxCodeAttempts`)
 * @param codeHashKey - the server-only code-hash key (see {@link HashVerificationCode})
 */
export function EvaluateRedemption(
    state: IdentityVerificationState,
    credential: VerificationCredential,
    nowMs: number,
    policy: Pick<ResolvedIdentityVerificationPolicy, 'maxCodeAttempts'>,
    codeHashKey: string,
): RedemptionOutcome {
    if (state.Verified) {
        return { Outcome: 'rejected', Reason: 'already_verified', Next: state };
    }
    const pending = state.Pending;
    if (!pending) {
        return { Outcome: 'rejected', Reason: 'no_pending', Next: state };
    }
    if (nowMs >= Date.parse(pending.ExpiresAt) || Number.isNaN(Date.parse(pending.ExpiresAt))) {
        return { Outcome: 'rejected', Reason: 'expired', Next: withoutPending(state) };
    }
    if (credential.Kind === 'token') {
        return HashesEqual(HashVerificationToken(credential.Token), pending.TokenHash)
            ? verifiedOutcome(state, pending, 'link', nowMs)
            : { Outcome: 'rejected', Reason: 'invalid', Next: state };
    }
    const presented = HashVerificationCode(credential.Code, pending.CodeSalt, credential.AgentSessionID, codeHashKey);
    if (HashesEqual(presented, pending.CodeHash)) {
        return verifiedOutcome(state, pending, 'code', nowMs);
    }
    return wrongCodeOutcome(state, pending, policy.maxCodeAttempts);
}

/** The success outcome: pending cleared, identity recorded. */
function verifiedOutcome(
    state: IdentityVerificationState,
    pending: PendingVerification,
    method: VerifiedIdentity['Method'],
    nowMs: number,
): RedemptionOutcome {
    const verified: VerifiedIdentity = {
        Email: pending.Email,
        Name: pending.Name,
        VerifiedAt: new Date(nowMs).toISOString(),
        Method: method,
    };
    return { Outcome: 'verified', Next: { ...withoutPending(state), Verified: verified }, Verified: verified };
}

/** The wrong-code outcome: one more attempt spent, voiding the pending verification at the cap. */
function wrongCodeOutcome(
    state: IdentityVerificationState,
    pending: PendingVerification,
    maxCodeAttempts: number,
): RedemptionOutcome {
    const attempts = pending.CodeAttempts + 1;
    if (attempts >= maxCodeAttempts) {
        return { Outcome: 'rejected', Reason: 'attempts_exhausted', Next: withoutPending(state), AttemptsRemaining: 0 };
    }
    return {
        Outcome: 'rejected',
        Reason: 'invalid',
        Next: { ...state, Pending: { ...pending, CodeAttempts: attempts } },
        AttemptsRemaining: maxCodeAttempts - attempts,
    };
}

// ───────────────────────── deadline ─────────────────────────

/**
 * The session deadline after a successful verification, or `undefined` when verification should not
 * change it.
 *
 * Verification only ever **extends** a deadline that exists: a session with no deadline stays
 * uncapped, and a `verifiedMaxSeconds` shorter than what is already granted never pulls a deadline in.
 * The new deadline is measured from the session's start, so `verifiedMaxSeconds` means "a verified
 * session may run this long in total", the same meaning `unverifiedMaxSeconds` has.
 *
 * @param args.CurrentDeadlineIso - the stamped deadline, if any
 * @param args.SessionStartedAtMs - when the session started, epoch ms
 * @param args.VerifiedMaxSeconds - the verified cap from policy, if any
 * @returns the new ISO deadline, or undefined for "leave it alone"
 */
export function ComputeVerifiedDeadline(args: {
    CurrentDeadlineIso: string | undefined;
    SessionStartedAtMs: number;
    VerifiedMaxSeconds: number | undefined;
}): string | undefined {
    if (!args.VerifiedMaxSeconds || args.VerifiedMaxSeconds <= 0 || !args.CurrentDeadlineIso) {
        return undefined;
    }
    const currentMs = Date.parse(args.CurrentDeadlineIso);
    const candidateMs = args.SessionStartedAtMs + args.VerifiedMaxSeconds * 1000;
    if (Number.isNaN(currentMs) || Number.isNaN(candidateMs) || candidateMs <= currentMs) {
        return undefined;
    }
    return new Date(candidateMs).toISOString();
}
