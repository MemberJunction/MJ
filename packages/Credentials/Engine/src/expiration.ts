import { LogError } from "@memberjunction/core";

/**
 * How the engine reacts when a credential's `ExpiresAt` has passed.
 *
 * - `'block'` — refuse to hand out the credential; `getCredential()` throws
 *   {@link CredentialExpiredError}. This is the default and matches the
 *   documented contract of the `Credential.ExpiresAt` column ("Expired
 *   credentials are treated as inactive").
 * - `'warn'` — hand the credential out anyway, but mark the result as expired
 *   and emit a warning. Intended as a temporary escape hatch while an
 *   organization cleans up stale expiry dates; it is NOT a safe steady state.
 */
export type CredentialExpirationPolicy = 'block' | 'warn';

/**
 * Lifecycle state of a credential relative to the current clock.
 *
 * - `'valid'`      — no expiry set, or expiry is further out than the warning window.
 * - `'expiring-soon'` — expiry is in the future but inside the warning window.
 * - `'expired'`    — expiry is at or before now.
 */
export type CredentialExpirationStatus = 'valid' | 'expiring-soon' | 'expired';

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Default warning window: 30 days.
 *
 * Deliberately matches the window the Credentials dashboard already uses for
 * its "expiring soon" KPI, so the number an operator sees in the UI and the
 * point at which the engine starts warning are the same.
 */
export const DEFAULT_EXPIRATION_WARNING_WINDOW_MS = 30 * MS_PER_DAY;

/**
 * Configuration governing how credential expiry is enforced.
 */
export interface CredentialExpirationConfig {
    /**
     * What to do with an expired credential. Defaults to `'block'`.
     */
    policy: CredentialExpirationPolicy;

    /**
     * How far ahead of expiry a credential is reported as `'expiring-soon'`.
     * Defaults to {@link DEFAULT_EXPIRATION_WARNING_WINDOW_MS} (30 days).
     *
     * This only affects reporting and warning logs — it never blocks.
     */
    warningWindowMs: number;

    /**
     * Grace period after expiry during which a `'block'` policy still allows
     * the credential through (loudly). Defaults to `0` — no grace.
     *
     * Set this when a hard cutoff at the expiry instant is riskier than a
     * short, noisy overrun (for example, an overnight batch job that would
     * otherwise fail at midnight with nobody watching). Grace does not change
     * the reported {@link CredentialExpirationStatus} — an expired credential
     * inside grace still reports `'expired'`, so dashboards and audit logs
     * tell the truth.
     */
    graceMs: number;
}

/**
 * The default expiration configuration: fail closed, warn 30 days out, no grace.
 */
export const DEFAULT_EXPIRATION_CONFIG: CredentialExpirationConfig = {
    policy: 'block',
    warningWindowMs: DEFAULT_EXPIRATION_WARNING_WINDOW_MS,
    graceMs: 0
};

/**
 * The result of evaluating a credential's expiry against the clock.
 */
export interface CredentialExpirationEvaluation {
    /** Lifecycle state relative to now. */
    status: CredentialExpirationStatus;

    /**
     * The normalized expiry instant, or null when the credential never expires
     * (or carried an unparseable value — see {@link evaluateExpiration}).
     */
    expiresAt: Date | null;

    /**
     * Milliseconds until expiry. Negative once expiry has passed. Null when
     * there is no expiry.
     */
    msUntilExpiration: number | null;

    /**
     * Whole days until expiry, rounded away from zero, so a credential with
     * eight hours left reports `1` rather than `0`. Negative once expiry has
     * passed (`-2` means "expired two days ago"). Null when there is no expiry.
     */
    daysUntilExpiration: number | null;

    /**
     * True when the credential is expired but still inside the configured
     * grace period. Always false when the credential is not expired.
     */
    withinGrace: boolean;

    /**
     * Whether the credential may be handed to a caller under the configured
     * policy. False only for an expired credential under `'block'` that has
     * exhausted its grace period.
     */
    usable: boolean;
}

/**
 * Normalizes the many shapes `ExpiresAt` arrives in.
 *
 * The generated entity types the column as `Date | null`, but the value
 * survives a GraphQL/JSON round trip as an ISO string, so both are accepted.
 *
 * An unparseable value is treated as "no expiry" (and logged) rather than as
 * "expired". A malformed timestamp is a data-integrity bug, and failing closed
 * on it would convert that bug into an outage across every credential that
 * shares the defect. This mirrors the existing precedent in the MobileApp auth
 * store, where an unknown expiry is treated as not-expired.
 */
function normalizeExpiresAt(expiresAt: Date | string | null | undefined): Date | null {
    if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
        return null;
    }

    const parsed = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
        LogError(`Credential expiration: unparseable ExpiresAt value ${JSON.stringify(expiresAt)} — treating the credential as non-expiring.`);
        return null;
    }

    return parsed;
}

/**
 * Converts a signed millisecond delta to whole days, rounded away from zero,
 * normalizing `-0` to `0`.
 */
function toWholeDays(ms: number): number {
    const days = ms >= 0 ? Math.ceil(ms / MS_PER_DAY) : -Math.ceil(-ms / MS_PER_DAY);
    return days === 0 ? 0 : days;
}

/**
 * Evaluates a credential's expiry against the clock and the configured policy.
 *
 * This is the single source of truth for "is this credential expired?" — every
 * caller, in this package and outside it, should route through here rather than
 * comparing dates by hand, so that the warning window, grace period, and
 * unparseable-value handling stay consistent.
 *
 * @param expiresAt - The credential's `ExpiresAt` value, in any of its transport shapes.
 * @param config - Expiration configuration. Defaults to {@link DEFAULT_EXPIRATION_CONFIG}.
 * @param now - The instant to evaluate against. Injectable for testing; defaults to the current time.
 */
export function evaluateExpiration(
    expiresAt: Date | string | null | undefined,
    config: CredentialExpirationConfig = DEFAULT_EXPIRATION_CONFIG,
    now: Date = new Date()
): CredentialExpirationEvaluation {
    const normalized = normalizeExpiresAt(expiresAt);

    // No expiry set — the credential is valid forever.
    if (!normalized) {
        return {
            status: 'valid',
            expiresAt: null,
            msUntilExpiration: null,
            daysUntilExpiration: null,
            withinGrace: false,
            usable: true
        };
    }

    const msUntilExpiration = normalized.getTime() - now.getTime();

    // Still in the future: valid, or close enough to warn about.
    if (msUntilExpiration > 0) {
        const warningWindowMs = Math.max(0, config.warningWindowMs);
        return {
            status: msUntilExpiration <= warningWindowMs ? 'expiring-soon' : 'valid',
            expiresAt: normalized,
            msUntilExpiration,
            daysUntilExpiration: toWholeDays(msUntilExpiration),
            withinGrace: false,
            usable: true
        };
    }

    // At or past the expiry instant. The boundary counts as expired.
    // `graceMs > 0` is required: without it, a credential sitting exactly on its
    // expiry instant has an overrun of zero, which would satisfy `0 <= 0` and
    // slip through even though no grace was configured.
    const graceMs = Math.max(0, config.graceMs);
    const withinGrace = graceMs > 0 && -msUntilExpiration <= graceMs;

    return {
        status: 'expired',
        expiresAt: normalized,
        msUntilExpiration,
        daysUntilExpiration: toWholeDays(msUntilExpiration),
        withinGrace,
        usable: config.policy === 'warn' || withinGrace
    };
}

/**
 * Convenience predicate for callers that only need a yes/no answer and do not
 * care about the warning window or grace period.
 */
export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
    return evaluateExpiration(expiresAt, DEFAULT_EXPIRATION_CONFIG, now).status === 'expired';
}

/**
 * Base class for credential resolution failures, so callers can distinguish a
 * credential problem from any other error thrown out of the engine.
 */
export class CredentialResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
        // Preserve `instanceof` across the ES5 downlevel target.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when a credential exists but is past its expiry and the active policy
 * refuses to hand it out.
 *
 * Callers should treat this as a configuration problem to be surfaced to an
 * operator — retrying will not help, and falling back to a different credential
 * is only correct where the caller genuinely has alternatives (as the AI prompt
 * runner does when walking its credential bindings).
 */
export class CredentialExpiredError extends CredentialResolutionError {
    /** The credential's ID, when resolution got far enough to know it. */
    public readonly credentialId: string | null;

    /** The credential's name as requested. */
    public readonly credentialName: string;

    /** The instant the credential expired. */
    public readonly expiresAt: Date;

    /** Whole days since expiry (positive). */
    public readonly daysSinceExpiration: number;

    constructor(credentialName: string, expiresAt: Date, credentialId: string | null, daysSinceExpiration: number) {
        super(
            `Credential expired: ${credentialName} expired on ${expiresAt.toISOString()} ` +
            `(${daysSinceExpiration} day(s) ago). Update the credential's value and expiration date, ` +
            `or clear ExpiresAt if it no longer expires.`
        );
        this.credentialId = credentialId;
        this.credentialName = credentialName;
        this.expiresAt = expiresAt;
        this.daysSinceExpiration = daysSinceExpiration;
    }
}

/**
 * Thrown when no credential matches the requested name or ID.
 *
 * The message is deliberately unchanged from the string the engine threw before
 * this class existed, so existing callers that match on message text keep working.
 */
export class CredentialNotFoundError extends CredentialResolutionError {
    /** The credential name that was requested. */
    public readonly credentialName: string;

    constructor(credentialName: string) {
        super(`Credential not found: ${credentialName}`);
        this.credentialName = credentialName;
    }
}
