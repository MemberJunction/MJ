/**
 * @fileoverview The policy a realtime session's identity verification is held to — pure, no I/O.
 *
 * Policy arrives in layers and the most specific layer wins:
 *
 *   1. built-in defaults (this file)
 *   2. server config  — `realtime.identityVerification` in `mj.config.cjs`
 *   3. the config cascade — `channels.config.IdentityVerification` (+ `session.unverifiedMaxSeconds` /
 *      `session.verifiedMaxSeconds`) resolved for this session at mint, **snapshotted onto the session**
 *
 * Layer 3 is stored server-side on the session at mint and never read from the client: a request to
 * verify carries only `{ agentSessionId, name, email }`, so a caller cannot choose the rules it is
 * judged by.
 *
 * @module @memberjunction/server/realtimeSessions
 */

/**
 * Consumer ("free mail") email domains, matched exactly or as a parent of the address's domain.
 *
 * **Curated, not exhaustive**, and deliberately about *consumer mailbox providers*, not about
 * disposable/throwaway domains (a different, much larger, constantly-moving list). A deployment can
 * replace it entirely through `consumerDomains`. Lower-case, no leading `@`.
 */
export const DEFAULT_CONSUMER_EMAIL_DOMAINS: readonly string[] = [
    // Google
    'gmail.com', 'googlemail.com',
    // Yahoo / AOL (Verizon Media lineage)
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.co.jp', 'yahoo.ca', 'yahoo.com.au', 'yahoo.com.br',
    'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'ymail.com', 'rocketmail.com', 'aol.com', 'aim.com',
    // Microsoft consumer
    'outlook.com', 'outlook.fr', 'outlook.de', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
    'hotmail.it', 'hotmail.es', 'live.com', 'live.co.uk', 'live.fr', 'msn.com',
    // Apple
    'icloud.com', 'me.com', 'mac.com',
    // Privacy-focused
    'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com', 'fastmail.fm',
    // Portal / regional
    'gmx.com', 'gmx.net', 'gmx.de', 'gmx.us', 'web.de', 'mail.com', 'zoho.com', 'zohomail.com',
    'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com', 'sina.com', 'naver.com',
    'daum.net', 'hanmail.net', 'rediffmail.com', 'orange.fr', 'free.fr', 'laposte.net', 'libero.it', 't-online.de',
    // ISP mailboxes
    'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net',
    'earthlink.net', 'juno.com', 'optonline.net', 'btinternet.com', 'sky.com', 'virginmedia.com',
    'shaw.ca', 'rogers.com', 'bell.net',
];

/**
 * The knobs of identity verification, in the shape an administrator authors them (JSON in the config
 * cascade or `mj.config.cjs`). Every field is optional; absent means "inherit the next layer".
 *
 * Members are camelCase on purpose: they ARE the JSON config keys (`mj.config.cjs`,
 * `channels.config.IdentityVerification`, and the snapshot stored on the session). Renaming one would
 * rename a configuration key that deployments and stored sessions already use.
 */
export interface IdentityVerificationPolicy {
    /** Refuse consumer mailbox domains (see {@link DEFAULT_CONSUMER_EMAIL_DOMAINS}). Default `false`. */
    requireBusinessDomain?: boolean;
    /** Domains refused outright (matched exactly or as a parent domain), whatever else is allowed. */
    blockedDomains?: string[];
    /** REPLACES the built-in consumer-domain list when set (and non-empty). */
    consumerDomains?: string[];
    /** Minutes an emailed link/code stays redeemable. Default 30, clamped to 1–1440. */
    linkTtlMinutes?: number;
    /** Most verification emails one session may trigger. Default 3, clamped to 1–20. */
    maxSendsPerSession?: number;
    /** Most wrong code entries before the pending verification is voided. Default 5, clamped to 1–10. */
    maxCodeAttempts?: number;
    /**
     * Session duration cap while UNVERIFIED, in seconds. Stamped at mint as the session's absolute
     * deadline. Absent ⇒ no cap from this layer.
     */
    unverifiedMaxSeconds?: number;
    /**
     * Session duration cap once VERIFIED, in seconds (measured from the session's start). On
     * verification the deadline is moved out to this — never pulled in. Absent ⇒ verification does not
     * change the deadline.
     */
    verifiedMaxSeconds?: number;
}

/**
 * A policy with every knob resolved. camelCase for the same reason as {@link IdentityVerificationPolicy}:
 * it is that shape with its defaults applied.
 */
export interface ResolvedIdentityVerificationPolicy {
    requireBusinessDomain: boolean;
    blockedDomains: string[];
    consumerDomains: string[];
    linkTtlMinutes: number;
    maxSendsPerSession: number;
    maxCodeAttempts: number;
    unverifiedMaxSeconds: number | undefined;
    verifiedMaxSeconds: number | undefined;
}

/** Built-in numeric defaults. */
export const DEFAULT_LINK_TTL_MINUTES = 30;
export const DEFAULT_MAX_SENDS_PER_SESSION = 3;
export const DEFAULT_MAX_CODE_ATTEMPTS = 5;

const MIN_LINK_TTL_MINUTES = 1;
const MAX_LINK_TTL_MINUTES = 24 * 60;
const MIN_MAX_SENDS = 1;
const MAX_MAX_SENDS = 20;
const MIN_MAX_ATTEMPTS = 1;
const MAX_MAX_ATTEMPTS = 10;
/** Sanity ceiling for a session-duration knob: 24 h. A larger value is a config mistake, not a policy. */
const MAX_SESSION_SECONDS = 24 * 60 * 60;

/** True for a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number, or undefined. */
function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A positive finite number within the session-duration ceiling, or undefined. */
function readSessionSeconds(value: unknown): number | undefined {
    const n = readNumber(value);
    return n !== undefined && n > 0 ? Math.min(Math.floor(n), MAX_SESSION_SECONDS) : undefined;
}

/** A list of non-empty strings, normalised to lower-case domains without a leading `@`; undefined when not a list. */
function readDomainList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
        .filter((entry) => entry.length > 0);
}

/**
 * Reads ONE policy layer from untrusted JSON (a cascade section, a stored snapshot, a config file).
 * Every field is type-checked; anything that is not the right type is ignored rather than coerced.
 *
 * @param raw - the layer, as parsed JSON of unknown shape
 */
export function ReadIdentityVerificationPolicyLayer(raw: unknown): IdentityVerificationPolicy {
    if (!isRecord(raw)) {
        return {};
    }
    const layer: IdentityVerificationPolicy = {};
    if (typeof raw['requireBusinessDomain'] === 'boolean') {
        layer.requireBusinessDomain = raw['requireBusinessDomain'];
    }
    const blocked = readDomainList(raw['blockedDomains']);
    if (blocked) {
        layer.blockedDomains = blocked;
    }
    const consumer = readDomainList(raw['consumerDomains']);
    if (consumer) {
        layer.consumerDomains = consumer;
    }
    const ttl = readNumber(raw['linkTtlMinutes']);
    if (ttl !== undefined) {
        layer.linkTtlMinutes = ttl;
    }
    const sends = readNumber(raw['maxSendsPerSession']);
    if (sends !== undefined) {
        layer.maxSendsPerSession = sends;
    }
    const attempts = readNumber(raw['maxCodeAttempts']);
    if (attempts !== undefined) {
        layer.maxCodeAttempts = attempts;
    }
    const unverified = readSessionSeconds(raw['unverifiedMaxSeconds']);
    if (unverified !== undefined) {
        layer.unverifiedMaxSeconds = unverified;
    }
    const verified = readSessionSeconds(raw['verifiedMaxSeconds']);
    if (verified !== undefined) {
        layer.verifiedMaxSeconds = verified;
    }
    return layer;
}

/**
 * Extracts the session-scoped policy layer from a RESOLVED realtime configuration (the object the
 * config cascade produced at mint).
 *
 * Reads, defensively and without depending on the cascade's TypeScript types (so this keeps working as
 * the cascade gains fields):
 *
 * - `channels.config.IdentityVerification` — the verification channel's own knobs
 * - `session.unverifiedMaxSeconds` / `session.verifiedMaxSeconds` — the duration caps
 *
 * Duration caps in the channel's own config are honoured too; the `session` section wins when both
 * are present, because it is the dedicated, documented home for them.
 *
 * @param realtimeConfig - the effective `realtime` section (`EffectiveConfig.realtime`), or anything
 * @returns the layer; `{}` when the cascade carries nothing relevant
 */
export function ExtractIdentityVerificationPolicyFromRealtimeConfig(realtimeConfig: unknown): IdentityVerificationPolicy {
    if (!isRecord(realtimeConfig)) {
        return {};
    }
    const channels = realtimeConfig['channels'];
    const channelConfig = isRecord(channels) && isRecord(channels['config']) ? channels['config']['IdentityVerification'] : undefined;
    const layer = ReadIdentityVerificationPolicyLayer(channelConfig);
    const session = realtimeConfig['session'];
    if (isRecord(session)) {
        const unverified = readSessionSeconds(session['unverifiedMaxSeconds']);
        if (unverified !== undefined) {
            layer.unverifiedMaxSeconds = unverified;
        }
        const verified = readSessionSeconds(session['verifiedMaxSeconds']);
        if (verified !== undefined) {
            layer.verifiedMaxSeconds = verified;
        }
    }
    return layer;
}

/** Clamps `value` into `[min, max]`, falling back to `fallback` when it is not a finite number. */
function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
    return value === undefined ? fallback : Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Merges policy layers (later layers win per knob) into a fully-resolved policy, applying defaults
 * and clamping every numeric knob into a safe range. An empty `consumerDomains` in a layer is treated
 * as absent (it would silently turn `requireBusinessDomain` into a no-op).
 *
 * @param layers - lowest-precedence first; `undefined` entries are skipped
 */
export function ResolveIdentityVerificationPolicy(
    layers: ReadonlyArray<IdentityVerificationPolicy | undefined>,
): ResolvedIdentityVerificationPolicy {
    const merged: IdentityVerificationPolicy = {};
    for (const layer of layers) {
        if (!layer) {
            continue;
        }
        for (const key of Object.keys(layer) as Array<keyof IdentityVerificationPolicy>) {
            const value = layer[key];
            if (value === undefined) {
                continue;
            }
            if (key === 'consumerDomains' && Array.isArray(value) && value.length === 0) {
                continue;
            }
            (merged as Record<string, unknown>)[key] = value;
        }
    }
    return {
        requireBusinessDomain: merged.requireBusinessDomain ?? false,
        blockedDomains: merged.blockedDomains ?? [],
        consumerDomains: merged.consumerDomains ?? [...DEFAULT_CONSUMER_EMAIL_DOMAINS],
        linkTtlMinutes: clamp(merged.linkTtlMinutes, MIN_LINK_TTL_MINUTES, MAX_LINK_TTL_MINUTES, DEFAULT_LINK_TTL_MINUTES),
        maxSendsPerSession: clamp(merged.maxSendsPerSession, MIN_MAX_SENDS, MAX_MAX_SENDS, DEFAULT_MAX_SENDS_PER_SESSION),
        maxCodeAttempts: clamp(merged.maxCodeAttempts, MIN_MAX_ATTEMPTS, MAX_MAX_ATTEMPTS, DEFAULT_MAX_CODE_ATTEMPTS),
        unverifiedMaxSeconds: merged.unverifiedMaxSeconds,
        verifiedMaxSeconds: merged.verifiedMaxSeconds,
    };
}

/** True when `domain` equals `entry` or is a subdomain of it. */
function domainMatches(domain: string, entry: string): boolean {
    return domain === entry || domain.endsWith(`.${entry}`);
}

/** Outcome of {@link ParseEmailAddress}. */
export type ParsedEmail = { Ok: true; Email: string; Domain: string } | { Ok: false };

/** RFC-5321 maximum length of a forward-path. */
const MAX_EMAIL_LENGTH = 254;
/** A pragmatic address check: one `@`, a dotted domain of safe labels, no whitespace/control/angle characters. */
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/**
 * Normalises and validates an email address (trim + lower-case). Deliberately conservative: it rejects
 * anything with whitespace, control characters, quotes, angle brackets or a display-name form, because
 * the address is about to be placed in a message header and a link context.
 *
 * @param raw - what the person typed
 */
export function ParseEmailAddress(raw: string): ParsedEmail {
    const email = (raw ?? '').trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
        return { Ok: false };
    }
    return { Ok: true, Email: email, Domain: email.slice(email.lastIndexOf('@') + 1) };
}

/** Outcome of {@link EvaluateEmailDomainPolicy}. */
export type EmailPolicyDecision = { Allowed: true } | { Allowed: false; Reason: 'domain_blocked' | 'consumer_domain' };

/**
 * Applies the domain rules of a policy to an address's domain: `blockedDomains` first (always wins),
 * then — when `requireBusinessDomain` — the consumer-domain list.
 *
 * @param domain - lower-case domain of the (already parsed) address
 */
export function EvaluateEmailDomainPolicy(domain: string, policy: ResolvedIdentityVerificationPolicy): EmailPolicyDecision {
    if (policy.blockedDomains.some((entry) => domainMatches(domain, entry))) {
        return { Allowed: false, Reason: 'domain_blocked' };
    }
    if (policy.requireBusinessDomain && policy.consumerDomains.some((entry) => domainMatches(domain, entry))) {
        return { Allowed: false, Reason: 'consumer_domain' };
    }
    return { Allowed: true };
}

/**
 * Tightens a session deadline: returns the earlier of the existing deadline (ISO) and `candidateMs`,
 * as an ISO string. Used at mint so a configured unverified cap never LOOSENS a deadline another rule
 * (the widget voice cap) already set.
 *
 * @param existingIso - the deadline already stamped, if any
 * @param candidateMs - the candidate deadline, epoch ms
 */
export function TightenSessionDeadline(existingIso: string | undefined, candidateMs: number): string {
    const existingMs = existingIso ? Date.parse(existingIso) : Number.NaN;
    return new Date(Number.isNaN(existingMs) ? candidateMs : Math.min(existingMs, candidateMs)).toISOString();
}
