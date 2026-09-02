/**
 * Unit tests for credential expiration handling.
 *
 * Covers the pure evaluation logic in `expiration.ts` — the single source of
 * truth the engine and its consumers both route through — plus the typed
 * resolution errors.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    evaluateExpiration,
    isExpired,
    DEFAULT_EXPIRATION_CONFIG,
    DEFAULT_EXPIRATION_WARNING_WINDOW_MS,
    CredentialExpirationConfig,
    CredentialExpiredError,
    CredentialNotFoundError,
    CredentialResolutionError
} from '../expiration';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** Builds a config from the defaults with selected overrides. */
function config(overrides: Partial<CredentialExpirationConfig> = {}): CredentialExpirationConfig {
    return { ...DEFAULT_EXPIRATION_CONFIG, ...overrides };
}

/** An instant `ms` milliseconds away from NOW. */
function offset(ms: number): Date {
    return new Date(NOW.getTime() + ms);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('evaluateExpiration - no expiry set', () => {
    it('treats null as valid forever', () => {
        const result = evaluateExpiration(null, config(), NOW);
        expect(result.status).toBe('valid');
        expect(result.expiresAt).toBeNull();
        expect(result.msUntilExpiration).toBeNull();
        expect(result.daysUntilExpiration).toBeNull();
        expect(result.usable).toBe(true);
    });

    it('treats undefined and empty string as valid forever', () => {
        expect(evaluateExpiration(undefined, config(), NOW).status).toBe('valid');
        expect(evaluateExpiration('', config(), NOW).status).toBe('valid');
    });
});

describe('evaluateExpiration - future expiry', () => {
    it('reports valid when expiry is beyond the warning window', () => {
        const result = evaluateExpiration(offset(90 * DAY), config(), NOW);
        expect(result.status).toBe('valid');
        expect(result.usable).toBe(true);
        expect(result.daysUntilExpiration).toBe(90);
    });

    it('reports expiring-soon inside the warning window', () => {
        const result = evaluateExpiration(offset(10 * DAY), config(), NOW);
        expect(result.status).toBe('expiring-soon');
        expect(result.usable).toBe(true);
        expect(result.daysUntilExpiration).toBe(10);
    });

    it('treats the warning window edge as expiring-soon', () => {
        const result = evaluateExpiration(offset(DEFAULT_EXPIRATION_WARNING_WINDOW_MS), config(), NOW);
        expect(result.status).toBe('expiring-soon');
    });

    it('treats one millisecond beyond the warning window as valid', () => {
        const result = evaluateExpiration(offset(DEFAULT_EXPIRATION_WARNING_WINDOW_MS + 1), config(), NOW);
        expect(result.status).toBe('valid');
    });

    it('rounds a partial day up, so hours remaining never reads as zero days', () => {
        const result = evaluateExpiration(offset(8 * 60 * 60 * 1000), config(), NOW);
        expect(result.daysUntilExpiration).toBe(1);
        expect(result.status).toBe('expiring-soon');
    });

    it('honors a custom warning window', () => {
        const narrow = config({ warningWindowMs: 2 * DAY });
        expect(evaluateExpiration(offset(10 * DAY), narrow, NOW).status).toBe('valid');
        expect(evaluateExpiration(offset(DAY), narrow, NOW).status).toBe('expiring-soon');
    });
});

describe('evaluateExpiration - expired', () => {
    it('blocks an expired credential under the default policy', () => {
        const result = evaluateExpiration(offset(-DAY), config(), NOW);
        expect(result.status).toBe('expired');
        expect(result.usable).toBe(false);
        expect(result.withinGrace).toBe(false);
        expect(result.daysUntilExpiration).toBe(-1);
        expect(result.msUntilExpiration).toBe(-DAY);
    });

    it('treats the expiry instant itself as expired', () => {
        const result = evaluateExpiration(NOW, config(), NOW);
        expect(result.status).toBe('expired');
        expect(result.usable).toBe(false);
        // Exactly at the boundary there is no partial day either way.
        expect(result.daysUntilExpiration).toBe(0);
    });

    it('allows an expired credential through under a warn policy', () => {
        const result = evaluateExpiration(offset(-30 * DAY), config({ policy: 'warn' }), NOW);
        expect(result.status).toBe('expired');
        expect(result.usable).toBe(true);
    });

    it('still reports expired inside the grace period, but marks it usable', () => {
        const withGrace = config({ graceMs: 3 * DAY });
        const result = evaluateExpiration(offset(-DAY), withGrace, NOW);
        // Status must stay truthful so dashboards and audit logs are not misled.
        expect(result.status).toBe('expired');
        expect(result.withinGrace).toBe(true);
        expect(result.usable).toBe(true);
    });

    it('blocks once the grace period is exhausted', () => {
        const withGrace = config({ graceMs: 3 * DAY });
        const result = evaluateExpiration(offset(-4 * DAY), withGrace, NOW);
        expect(result.withinGrace).toBe(false);
        expect(result.usable).toBe(false);
    });

    it('treats the grace boundary as still within grace', () => {
        const withGrace = config({ graceMs: 3 * DAY });
        expect(evaluateExpiration(offset(-3 * DAY), withGrace, NOW).withinGrace).toBe(true);
    });

    it('ignores a negative grace period rather than extending validity', () => {
        const result = evaluateExpiration(offset(-1), config({ graceMs: -DAY }), NOW);
        expect(result.usable).toBe(false);
    });
});

describe('evaluateExpiration - input shapes', () => {
    it('accepts an ISO string, as delivered over a JSON transport', () => {
        const result = evaluateExpiration(offset(5 * DAY).toISOString(), config(), NOW);
        expect(result.status).toBe('expiring-soon');
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.daysUntilExpiration).toBe(5);
    });

    it('accepts a Date instance', () => {
        expect(evaluateExpiration(offset(-DAY), config(), NOW).status).toBe('expired');
    });

    it('treats an unparseable value as non-expiring and logs it', () => {
        // A malformed timestamp is a data-integrity bug. Failing closed on it
        // would turn that bug into an outage, so it fails open, loudly.
        const result = evaluateExpiration('not-a-date', config(), NOW);
        expect(result.status).toBe('valid');
        expect(result.usable).toBe(true);
        expect(result.expiresAt).toBeNull();
    });
});

describe('isExpired', () => {
    it('answers the yes/no question without policy nuance', () => {
        expect(isExpired(offset(-DAY), NOW)).toBe(true);
        expect(isExpired(offset(DAY), NOW)).toBe(false);
        expect(isExpired(null, NOW)).toBe(false);
    });

    it('reports expired even where a grace period would allow use', () => {
        // isExpired describes the credential, not the policy decision.
        expect(isExpired(offset(-1), NOW)).toBe(true);
    });
});

describe('typed resolution errors', () => {
    it('CredentialExpiredError carries the details an operator needs', () => {
        const expiresAt = offset(-2 * DAY);
        const err = new CredentialExpiredError('OpenAI', expiresAt, 'cred-123', 2);

        expect(err).toBeInstanceOf(CredentialExpiredError);
        expect(err).toBeInstanceOf(CredentialResolutionError);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('CredentialExpiredError');
        expect(err.credentialName).toBe('OpenAI');
        expect(err.credentialId).toBe('cred-123');
        expect(err.expiresAt).toBe(expiresAt);
        expect(err.daysSinceExpiration).toBe(2);
        expect(err.message).toContain('Credential expired: OpenAI');
        expect(err.message).toContain(expiresAt.toISOString());
    });

    it('CredentialNotFoundError keeps the pre-existing message verbatim', () => {
        // Callers already match on this string; the subclass must not change it.
        const err = new CredentialNotFoundError('SendGrid');
        expect(err.message).toBe('Credential not found: SendGrid');
        expect(err).toBeInstanceOf(CredentialResolutionError);
        expect(err.credentialName).toBe('SendGrid');
    });

    it('distinguishes expired from not-found', () => {
        const expired: unknown = new CredentialExpiredError('A', NOW, null, 0);
        const missing: unknown = new CredentialNotFoundError('A');

        expect(expired instanceof CredentialExpiredError).toBe(true);
        expect(missing instanceof CredentialExpiredError).toBe(false);
        expect(missing instanceof CredentialNotFoundError).toBe(true);
    });
});
