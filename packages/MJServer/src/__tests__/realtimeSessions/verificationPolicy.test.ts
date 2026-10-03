import { describe, it, expect } from 'vitest';
import {
    DEFAULT_CONSUMER_EMAIL_DOMAINS,
    DEFAULT_LINK_TTL_MINUTES,
    DEFAULT_MAX_CODE_ATTEMPTS,
    DEFAULT_MAX_SENDS_PER_SESSION,
    EvaluateEmailDomainPolicy,
    ExtractIdentityVerificationPolicyFromRealtimeConfig,
    ParseEmailAddress,
    ReadIdentityVerificationPolicyLayer,
    ResolveIdentityVerificationPolicy,
    TightenSessionDeadline,
} from '../../realtimeSessions/verificationPolicy.js';

describe('DEFAULT_CONSUMER_EMAIL_DOMAINS', () => {
    it('covers the major consumer mailbox providers named in the design', () => {
        for (const domain of ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
            'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'yandex.com', 'mail.com', 'zoho.com']) {
            expect(DEFAULT_CONSUMER_EMAIL_DOMAINS).toContain(domain);
        }
    });

    it('is lower-case with no leading @ or whitespace', () => {
        for (const domain of DEFAULT_CONSUMER_EMAIL_DOMAINS) {
            expect(domain).toBe(domain.trim().toLowerCase().replace(/^@/, ''));
        }
    });
});

describe('ParseEmailAddress', () => {
    it('normalises case and whitespace and splits the domain', () => {
        expect(ParseEmailAddress('  Pat.Smith@Example.COM ')).toEqual({ Ok: true, Email: 'pat.smith@example.com', Domain: 'example.com' });
    });

    it('accepts plus-addressing and subdomains', () => {
        expect(ParseEmailAddress('pat+tag@mail.corp.example.co.uk')).toMatchObject({ Ok: true, Domain: 'mail.corp.example.co.uk' });
    });

    it.each([
        ['empty', ''],
        ['no at sign', 'pat.example.com'],
        ['two at signs', 'a@b@example.com'],
        ['no tld', 'pat@localhost'],
        ['display-name form', 'Pat <pat@example.com>'],
        ['embedded whitespace', 'pat smith@example.com'],
        ['header injection', 'pat@example.com\r\nBcc: victim@example.com'],
        ['quoted local part', '"pat"@example.com'],
        ['angle brackets', '<pat@example.com>'],
        ['trailing dot domain', 'pat@example.com.'],
        ['leading-hyphen label', 'pat@-example.com'],
        ['overlong', `${'a'.repeat(250)}@example.com`],
    ])('rejects %s', (_label, raw) => {
        expect(ParseEmailAddress(raw)).toEqual({ Ok: false });
    });
});

describe('ReadIdentityVerificationPolicyLayer', () => {
    it('reads every well-typed knob', () => {
        expect(
            ReadIdentityVerificationPolicyLayer({
                requireBusinessDomain: true,
                blockedDomains: ['@Competitor.com ', 'x.io'],
                consumerDomains: ['freemail.example'],
                linkTtlMinutes: 15,
                maxSendsPerSession: 2,
                maxCodeAttempts: 4,
                unverifiedMaxSeconds: 300,
                verifiedMaxSeconds: 3600,
            }),
        ).toEqual({
            requireBusinessDomain: true,
            blockedDomains: ['competitor.com', 'x.io'],
            consumerDomains: ['freemail.example'],
            linkTtlMinutes: 15,
            maxSendsPerSession: 2,
            maxCodeAttempts: 4,
            unverifiedMaxSeconds: 300,
            verifiedMaxSeconds: 3600,
        });
    });

    it('ignores wrong-typed values instead of coercing them', () => {
        expect(
            ReadIdentityVerificationPolicyLayer({
                requireBusinessDomain: 'yes',
                blockedDomains: 'a.com',
                linkTtlMinutes: '30',
                maxSendsPerSession: Number.NaN,
                unverifiedMaxSeconds: -5,
                verifiedMaxSeconds: 0,
            }),
        ).toEqual({});
    });

    it('treats non-objects as an empty layer', () => {
        expect(ReadIdentityVerificationPolicyLayer(null)).toEqual({});
        expect(ReadIdentityVerificationPolicyLayer('x')).toEqual({});
        expect(ReadIdentityVerificationPolicyLayer([1])).toEqual({});
    });

    it('caps a session-duration knob at 24 hours', () => {
        expect(ReadIdentityVerificationPolicyLayer({ verifiedMaxSeconds: 10 ** 9 }).verifiedMaxSeconds).toBe(24 * 3600);
    });
});

describe('ExtractIdentityVerificationPolicyFromRealtimeConfig', () => {
    it('reads channels.config.IdentityVerification and the session caps', () => {
        const layer = ExtractIdentityVerificationPolicyFromRealtimeConfig({
            channels: { config: { IdentityVerification: { requireBusinessDomain: true, linkTtlMinutes: 10 } } },
            session: { unverifiedMaxSeconds: 180, verifiedMaxSeconds: 1800 },
        });
        expect(layer).toEqual({ requireBusinessDomain: true, linkTtlMinutes: 10, unverifiedMaxSeconds: 180, verifiedMaxSeconds: 1800 });
    });

    it('lets the session section win over caps inside the channel config', () => {
        const layer = ExtractIdentityVerificationPolicyFromRealtimeConfig({
            channels: { config: { IdentityVerification: { verifiedMaxSeconds: 100 } } },
            session: { verifiedMaxSeconds: 200 },
        });
        expect(layer.verifiedMaxSeconds).toBe(200);
    });

    it('returns an empty layer for anything without the relevant sections', () => {
        expect(ExtractIdentityVerificationPolicyFromRealtimeConfig(undefined)).toEqual({});
        expect(ExtractIdentityVerificationPolicyFromRealtimeConfig({})).toEqual({});
        expect(ExtractIdentityVerificationPolicyFromRealtimeConfig({ channels: 'x', session: 4 })).toEqual({});
        expect(ExtractIdentityVerificationPolicyFromRealtimeConfig({ session: { turnDetection: {} } })).toEqual({});
    });
});

describe('ResolveIdentityVerificationPolicy', () => {
    it('applies defaults when no layer says anything', () => {
        const policy = ResolveIdentityVerificationPolicy([]);
        expect(policy).toMatchObject({
            requireBusinessDomain: false,
            blockedDomains: [],
            linkTtlMinutes: DEFAULT_LINK_TTL_MINUTES,
            maxSendsPerSession: DEFAULT_MAX_SENDS_PER_SESSION,
            maxCodeAttempts: DEFAULT_MAX_CODE_ATTEMPTS,
            unverifiedMaxSeconds: undefined,
            verifiedMaxSeconds: undefined,
        });
        expect(policy.consumerDomains).toEqual([...DEFAULT_CONSUMER_EMAIL_DOMAINS]);
    });

    it('lets later (more specific) layers win per knob and skips undefined layers', () => {
        const policy = ResolveIdentityVerificationPolicy([
            { requireBusinessDomain: true, linkTtlMinutes: 60, maxSendsPerSession: 5 },
            undefined,
            { linkTtlMinutes: 10 },
        ]);
        expect(policy.requireBusinessDomain).toBe(true);
        expect(policy.linkTtlMinutes).toBe(10);
        expect(policy.maxSendsPerSession).toBe(5);
    });

    it('clamps every numeric knob into a safe range', () => {
        const low = ResolveIdentityVerificationPolicy([{ linkTtlMinutes: -3, maxSendsPerSession: 0, maxCodeAttempts: 0 }]);
        expect([low.linkTtlMinutes, low.maxSendsPerSession, low.maxCodeAttempts]).toEqual([1, 1, 1]);
        const high = ResolveIdentityVerificationPolicy([{ linkTtlMinutes: 10 ** 6, maxSendsPerSession: 10 ** 6, maxCodeAttempts: 10 ** 6 }]);
        expect([high.linkTtlMinutes, high.maxSendsPerSession, high.maxCodeAttempts]).toEqual([1440, 20, 10]);
    });

    it('replaces the built-in consumer list when a layer supplies one, but ignores an empty override', () => {
        expect(ResolveIdentityVerificationPolicy([{ consumerDomains: ['freemail.example'] }]).consumerDomains).toEqual(['freemail.example']);
        expect(ResolveIdentityVerificationPolicy([{ consumerDomains: [] }]).consumerDomains).toEqual([...DEFAULT_CONSUMER_EMAIL_DOMAINS]);
    });
});

describe('EvaluateEmailDomainPolicy', () => {
    const resolve = (layer: Parameters<typeof ResolveIdentityVerificationPolicy>[0][number]) => ResolveIdentityVerificationPolicy([layer]);

    it('allows anything when no rule applies', () => {
        expect(EvaluateEmailDomainPolicy('gmail.com', resolve({}))).toEqual({ Allowed: true });
    });

    it('refuses consumer domains only when a business domain is required', () => {
        expect(EvaluateEmailDomainPolicy('gmail.com', resolve({ requireBusinessDomain: true }))).toEqual({ Allowed: false, Reason: 'consumer_domain' });
        expect(EvaluateEmailDomainPolicy('acme.com', resolve({ requireBusinessDomain: true }))).toEqual({ Allowed: true });
    });

    it('matches consumer entries as parent domains but never as substrings', () => {
        const policy = resolve({ requireBusinessDomain: true });
        expect(EvaluateEmailDomainPolicy('eu.outlook.com', policy)).toEqual({ Allowed: false, Reason: 'consumer_domain' });
        expect(EvaluateEmailDomainPolicy('notgmail.com', policy)).toEqual({ Allowed: true });
        expect(EvaluateEmailDomainPolicy('gmail.com.evil.io', policy)).toEqual({ Allowed: true });
    });

    it('honours an overridden consumer list', () => {
        const policy = resolve({ requireBusinessDomain: true, consumerDomains: ['freemail.example'] });
        expect(EvaluateEmailDomainPolicy('freemail.example', policy)).toEqual({ Allowed: false, Reason: 'consumer_domain' });
        expect(EvaluateEmailDomainPolicy('gmail.com', policy)).toEqual({ Allowed: true });
    });

    it('refuses blocked domains (exact and subdomain) even when business-domain is not required', () => {
        const policy = resolve({ blockedDomains: ['competitor.com'] });
        expect(EvaluateEmailDomainPolicy('competitor.com', policy)).toEqual({ Allowed: false, Reason: 'domain_blocked' });
        expect(EvaluateEmailDomainPolicy('mail.competitor.com', policy)).toEqual({ Allowed: false, Reason: 'domain_blocked' });
        expect(EvaluateEmailDomainPolicy('notcompetitor.com', policy)).toEqual({ Allowed: true });
    });

    it('reports a blocked domain ahead of the consumer rule', () => {
        const policy = resolve({ requireBusinessDomain: true, blockedDomains: ['gmail.com'] });
        expect(EvaluateEmailDomainPolicy('gmail.com', policy)).toEqual({ Allowed: false, Reason: 'domain_blocked' });
    });
});

describe('TightenSessionDeadline', () => {
    const now = Date.parse('2026-10-02T12:00:00.000Z');

    it('uses the candidate when nothing is stamped yet', () => {
        expect(TightenSessionDeadline(undefined, now + 60_000)).toBe('2026-10-02T12:01:00.000Z');
    });

    it('never loosens an earlier existing deadline', () => {
        expect(TightenSessionDeadline('2026-10-02T12:00:30.000Z', now + 60_000)).toBe('2026-10-02T12:00:30.000Z');
    });

    it('tightens a later existing deadline', () => {
        expect(TightenSessionDeadline('2026-10-02T13:00:00.000Z', now + 60_000)).toBe('2026-10-02T12:01:00.000Z');
    });

    it('ignores an unparseable existing deadline', () => {
        expect(TightenSessionDeadline('garbage', now + 60_000)).toBe('2026-10-02T12:01:00.000Z');
    });
});
