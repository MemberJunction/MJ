/**
 * @fileoverview The outbound-call gate shared by every telephony carrier (Twilio, Vonage, RingCentral).
 *
 * `PlaceTwilioCall` / `PlaceVonageCall` / `PlaceRingCentralCall` are ordinary GraphQL mutations, so any
 * logged-in user can invoke them. Without a gate that is a toll-fraud primitive: dial premium-rate numbers
 * from a company account, or run an agent the caller has no right to run. Every outbound call is therefore
 * authorized here, in one place, before the carrier is touched:
 *
 * 1. the agent identity must be active and belong to this carrier;
 * 2. the destination must be well-formed E.164, inside the allowed prefixes and outside the blocked ones;
 * 3. the caller must be allowed to RUN the identity's agent (the same `AIAgentPermissionHelper` check the
 *    realtime widget path applies);
 * 4. the caller must be under their hourly call budget.
 *
 * The decision logic is pure (collaborators are injected), so it is unit-tested without a database or a
 * carrier. Destinations are masked to their last four digits in every log line.
 *
 * **Rate limiting is per process.** The limiter is an in-memory sliding window; with N MJAPI instances a user
 * can place up to N × the configured limit. A shared limiter is a follow-up.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import type { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** Default destination allow-list: NANP only. */
export const DEFAULT_ALLOWED_PREFIXES: readonly string[] = ['+1'];

/**
 * Default destination block-list. The `+1` allow-list covers the whole North American Numbering Plan, which
 * includes premium-rate exchanges (900, 976) and a set of Caribbean countries that share country code 1 but
 * are international calls with international rates — the classic toll-fraud / "one-ring" destinations. They are
 * blocked by default. Territories of the United States (+1340 USVI, +1670 Northern Marianas, +1671 Guam,
 * +1684 American Samoa, +1787/+1939 Puerto Rico) bill as domestic calls and are deliberately NOT blocked.
 *
 * Operators can replace the whole list via `telephony.outbound.blockedPrefixes`, and should additionally enable
 * the carrier's own geographic permissions (see DEPLOYMENT.md) — this list is a backstop, not the only control.
 */
export const DEFAULT_BLOCKED_PREFIXES: readonly string[] = [
    // Premium-rate / pay-per-call
    '+1900',
    '+1976',
    // Caribbean NANP countries (international rates, common fraud destinations)
    '+1242', // Bahamas
    '+1246', // Barbados
    '+1264', // Anguilla
    '+1268', // Antigua and Barbuda
    '+1284', // British Virgin Islands
    '+1345', // Cayman Islands
    '+1441', // Bermuda
    '+1473', // Grenada
    '+1649', // Turks and Caicos
    '+1658', // Jamaica
    '+1664', // Montserrat
    '+1721', // Sint Maarten
    '+1758', // Saint Lucia
    '+1767', // Dominica
    '+1784', // Saint Vincent and the Grenadines
    '+1809', // Dominican Republic
    '+1829', // Dominican Republic
    '+1849', // Dominican Republic
    '+1868', // Trinidad and Tobago
    '+1869', // Saint Kitts and Nevis
    '+1876', // Jamaica
];

/** Default per-user hourly outbound call budget. */
export const DEFAULT_MAX_CALLS_PER_USER_PER_HOUR = 20;

/** How often the rate limiter sweeps users whose window has emptied (at most). */
const SWEEP_INTERVAL_MS = 60 * 1000;

/** The sliding-window length of the rate limiter. */
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** The raw `telephony.outbound` config block (all fields optional; defaults apply). */
export interface OutboundPolicySettings {
    /** Destination prefixes a call may go to (E.164, e.g. `+1`). An EMPTY list refuses every destination. */
    allowedPrefixes?: string[];
    /** Destination prefixes that are always refused, even when an allowed prefix matches. */
    blockedPrefixes?: string[];
    /** Max outbound calls one user may place per rolling hour. */
    maxCallsPerUserPerHour?: number;
}

/** The effective, validated policy. */
export interface OutboundCallPolicy {
    AllowedPrefixes: string[];
    BlockedPrefixes: string[];
    MaxCallsPerUserPerHour: number;
}

/** Machine-readable refusal category (the human message is {@link OutboundAuthorization.Reason}). */
export type OutboundRefusalCode =
    | 'identity-inactive'
    | 'wrong-carrier'
    | 'invalid-number'
    | 'prefix-not-allowed'
    | 'prefix-blocked'
    | 'agent-not-permitted'
    | 'rate-limited'
    | 'at-capacity';

/** The verdict of {@link AuthorizeOutboundCall}. */
export type OutboundAuthorization = { Allowed: true } | { Allowed: false; Code: OutboundRefusalCode; Reason: string };

/**
 * Thrown by a carrier service's `PlaceOutboundCall` when {@link AuthorizeOutboundCall} refuses the call. Its
 * `message` is safe to return to the caller; the refusal has already been logged with full detail.
 */
export class OutboundCallRefusedError extends Error {
    constructor(
        message: string,
        public readonly Code: OutboundRefusalCode,
    ) {
        super(message);
        this.name = 'OutboundCallRefusedError';
    }
}

/** What the gate needs to know about the call being requested. */
export interface OutboundCallRequest {
    /** The user placing the call. */
    User: UserInfo;
    /** The agent identity (caller-id) the call originates from — already loaded by the carrier service. */
    AgentIdentity: Pick<MJAIBridgeAgentIdentityEntity, 'ID' | 'AgentID' | 'ProviderID' | 'IsActive'>;
    /** The `MJ: AI Bridge Providers` row id of THIS carrier — the identity must belong to it. */
    CarrierProviderID: string;
    /** The destination number as supplied by the caller. */
    ToNumber: string;
}

/** The collaborators {@link AuthorizeOutboundCall} uses (production defaults exist for the agent check). */
export interface OutboundGuardDeps {
    Policy: OutboundCallPolicy;
    Limiter: OutboundRateLimiter;
    /** Whether the user may RUN the agent. Defaults to {@link CanUserRunAgent}. */
    CanRunAgent?: (agentId: string, user: UserInfo) => Promise<boolean>;
}

/**
 * Whether a user may run an agent — the permission check the realtime widget path applies
 * (`AIAgentPermissionHelper.HasPermission(..., 'run')`), reused here so telephony cannot bypass it.
 * Fails closed (the helper returns `false` on any lookup error).
 */
export async function CanUserRunAgent(agentId: string, user: UserInfo): Promise<boolean> {
    return AIAgentPermissionHelper.HasPermission(agentId, user, 'run');
}

/** Whether a string is a plausible E.164 number: `+`, a non-zero first digit, 7–15 digits total. */
export function IsValidE164(value: string): boolean {
    return /^\+[1-9]\d{6,14}$/.test(value);
}

/** Masks a number for logs: everything but the last four characters becomes `*`. */
export function MaskNumber(value: string): string {
    const trimmed = (value ?? '').trim();
    if (trimmed.length <= 4) {
        return '*'.repeat(trimmed.length);
    }
    return '*'.repeat(trimmed.length - 4) + trimmed.slice(-4);
}

/**
 * Builds the effective policy from the raw config block, applying defaults and dropping malformed prefixes
 * (logged — a typo'd prefix must not silently widen the allow-list or shrink the block-list).
 */
export function ResolveOutboundPolicy(settings?: OutboundPolicySettings): OutboundCallPolicy {
    return {
        AllowedPrefixes: normalizePrefixes(settings?.allowedPrefixes ?? [...DEFAULT_ALLOWED_PREFIXES], 'allowedPrefixes'),
        BlockedPrefixes: normalizePrefixes(settings?.blockedPrefixes ?? [...DEFAULT_BLOCKED_PREFIXES], 'blockedPrefixes'),
        MaxCallsPerUserPerHour: normalizeLimit(settings?.maxCallsPerUserPerHour),
    };
}

/** Trims prefixes and keeps only `+<digits>` ones, logging the rest. */
function normalizePrefixes(prefixes: string[], settingName: string): string[] {
    const kept: string[] = [];
    for (const raw of prefixes) {
        const prefix = (raw ?? '').trim();
        if (/^\+\d+$/.test(prefix)) {
            kept.push(prefix);
        } else {
            LogError(`[Telephony] ignoring malformed telephony.outbound.${settingName} entry '${raw}' (expected '+' followed by digits).`);
        }
    }
    return kept;
}

/** A non-finite or non-positive limit falls back to the default rather than disabling the limiter. */
function normalizeLimit(value: number | undefined): number {
    return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : DEFAULT_MAX_CALLS_PER_USER_PER_HOUR;
}

/**
 * An in-memory sliding-window rate limiter: at most `max` calls per user per rolling window. **Per process**
 * (see the file header). Time is injectable for tests.
 */
export class OutboundRateLimiter {
    private readonly calls = new Map<string, number[]>();
    private lastSweepMs = 0;

    constructor(
        private readonly maxCalls: number,
        private readonly windowMs: number = RATE_WINDOW_MS,
        private readonly now: () => number = Date.now,
    ) {}

    /** Number of users currently tracked (observability / tests). */
    public get TrackedUserCount(): number {
        return this.calls.size;
    }

    /**
     * Counts a call against the user's budget if one remains.
     *
     * @param userId The caller's user id (compared case-insensitively — SQL Server and PostgreSQL disagree).
     * @returns `true` when the call is within budget (and has been recorded); `false` when the budget is spent.
     */
    public TryConsume(userId: string): boolean {
        const key = userId.toLowerCase();
        const cutoff = this.now() - this.windowMs;
        this.sweepIfDue(cutoff);
        const recent = (this.calls.get(key) ?? []).filter((t) => t > cutoff);
        if (recent.length >= this.maxCalls) {
            this.calls.set(key, recent);
            return false;
        }
        recent.push(this.now());
        this.calls.set(key, recent);
        return true;
    }

    /**
     * Drops every user whose window has emptied. Pruning only the user being served would not help — a user who
     * never calls again is never served — so each call opportunistically sweeps the whole map, at most once per
     * {@link SWEEP_INTERVAL_MS}. Behaviour for live users is unchanged.
     */
    private sweepIfDue(cutoff: number): void {
        const now = this.now();
        if (now - this.lastSweepMs < Math.min(this.windowMs, SWEEP_INTERVAL_MS)) {
            return;
        }
        this.lastSweepMs = now;
        for (const [key, times] of this.calls) {
            if (!times.some((t) => t > cutoff)) {
                this.calls.delete(key);
            }
        }
    }
}

/** Why a destination is refused by the prefix lists, or `undefined` when it is allowed. */
function checkDestinationPrefixes(policy: OutboundCallPolicy, toNumber: string): { Code: OutboundRefusalCode; Reason: string } | undefined {
    if (policy.BlockedPrefixes.some((p) => toNumber.startsWith(p))) {
        return { Code: 'prefix-blocked', Reason: 'The destination number is in a blocked range.' };
    }
    if (!policy.AllowedPrefixes.some((p) => toNumber.startsWith(p))) {
        return { Code: 'prefix-not-allowed', Reason: 'The destination number is outside the allowed calling ranges.' };
    }
    return undefined;
}

/**
 * Checks a destination the AGENT asked to transfer a live call to against the same E.164 rule and
 * allow/block prefix lists as outbound calls. A transfer sends a caller to a number the model chose, so it is
 * as much a toll-fraud primitive as an outbound dial and must not be a way around the gate. The rate budget is
 * not spent (a transfer places no new call from the account).
 *
 * @param policy The effective outbound policy.
 * @param toNumber The requested destination.
 * @returns `{Allowed:true, Number}` with the trimmed number, or the refusal with a caller-safe reason.
 */
export function CheckTransferDestination(
    policy: OutboundCallPolicy,
    toNumber: string,
): { Allowed: true; Number: string } | { Allowed: false; Code: OutboundRefusalCode; Reason: string } {
    const to = (toNumber ?? '').trim();
    if (!IsValidE164(to)) {
        return { Allowed: false, Code: 'invalid-number', Reason: 'The destination must be an E.164 number such as +14155550123.' };
    }
    const refusal = checkDestinationPrefixes(policy, to);
    if (refusal) {
        LogError(`[Telephony] call transfer refused (${refusal.Code}) for destination ${MaskNumber(to)}: ${refusal.Reason}`);
        return { Allowed: false, ...refusal };
    }
    return { Allowed: true, Number: to };
}

/** Why the identity cannot be used for this carrier, or `undefined` when it can. */
function checkIdentity(request: OutboundCallRequest): { Code: OutboundRefusalCode; Reason: string } | undefined {
    if (!request.AgentIdentity.IsActive) {
        return { Code: 'identity-inactive', Reason: `Agent identity '${request.AgentIdentity.ID}' is not active.` };
    }
    if (!UUIDsEqual(request.AgentIdentity.ProviderID, request.CarrierProviderID)) {
        return { Code: 'wrong-carrier', Reason: `Agent identity '${request.AgentIdentity.ID}' does not belong to this carrier.` };
    }
    return undefined;
}

/**
 * Authorizes one outbound call. Checks run cheapest-first and the rate budget is spent LAST, so a refused
 * request never consumes budget. Every refusal is logged with the user id, identity id, reason and the
 * masked destination.
 *
 * @param request The call being requested.
 * @param deps The policy, limiter and (optionally) the agent-permission check.
 * @returns `{Allowed:true}`, or the refusal with a caller-safe `Reason`.
 */
export async function AuthorizeOutboundCall(request: OutboundCallRequest, deps: OutboundGuardDeps): Promise<OutboundAuthorization> {
    const refusal = await findRefusal(request, deps);
    if (!refusal) {
        return { Allowed: true };
    }
    LogError(
        `[Telephony] outbound call refused (${refusal.Code}) for user ${request.User.ID}, identity ${request.AgentIdentity.ID}, ` +
            `destination ${MaskNumber(request.ToNumber)}: ${refusal.Reason}`,
    );
    return { Allowed: false, Code: refusal.Code, Reason: refusal.Reason };
}

/** Runs the checks in order and returns the first refusal, or `undefined` when the call may proceed. */
async function findRefusal(request: OutboundCallRequest, deps: OutboundGuardDeps): Promise<{ Code: OutboundRefusalCode; Reason: string } | undefined> {
    const identityRefusal = checkIdentity(request);
    if (identityRefusal) {
        return identityRefusal;
    }
    const to = (request.ToNumber ?? '').trim();
    if (!IsValidE164(to)) {
        return { Code: 'invalid-number', Reason: 'The destination must be an E.164 number such as +14155550123.' };
    }
    const prefixRefusal = checkDestinationPrefixes(deps.Policy, to);
    if (prefixRefusal) {
        return prefixRefusal;
    }
    const canRun = deps.CanRunAgent ?? CanUserRunAgent;
    if (!(await canRun(request.AgentIdentity.AgentID, request.User))) {
        return { Code: 'agent-not-permitted', Reason: 'You do not have permission to run this agent.' };
    }
    if (!deps.Limiter.TryConsume(request.User.ID)) {
        return { Code: 'rate-limited', Reason: 'Outbound call limit reached; try again later.' };
    }
    return undefined;
}
