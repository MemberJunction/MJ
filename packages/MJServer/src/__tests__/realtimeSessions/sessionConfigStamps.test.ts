import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BuildMintConfigStamps, LoadInheritedVerifiedIdentity } from '../../realtimeSessions/sessionConfigStamps.js';
import type { VerifiedIdentity } from '../../realtimeSessions/verificationCore.js';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const VERIFIED: VerifiedIdentity = { Email: 'pat@acme.com', Name: 'Pat', VerifiedAt: '2026-10-02T11:00:00.000Z', Method: 'link' };
const configOf = (plan: { NextConfigRaw: string } | null) => JSON.parse((plan as { NextConfigRaw: string }).NextConfigRaw) as Record<string, unknown>;

describe('BuildMintConfigStamps', () => {
    it('stamps nothing when the cascade carries no verification policy and nothing is inherited', () => {
        expect(BuildMintConfigStamps({ EffectiveRealtime: undefined, ExistingConfigRaw: '{"targetAgentID":"t"}', NowMs: NOW })).toBeNull();
        expect(BuildMintConfigStamps({ EffectiveRealtime: { session: { turnDetection: {} } }, ExistingConfigRaw: null, NowMs: NOW })).toBeNull();
    });

    it('snapshots the channel policy onto the session and preserves every other key', () => {
        const plan = BuildMintConfigStamps({
            EffectiveRealtime: { channels: { config: { IdentityVerification: { requireBusinessDomain: true, maxSendsPerSession: 2 } } } },
            ExistingConfigRaw: '{"targetAgentID":"t","mediaCollectionID":"m"}',
            NowMs: NOW,
        });
        const config = configOf(plan);
        expect(config).toMatchObject({ targetAgentID: 't', mediaCollectionID: 'm' });
        expect(config['identityVerification']).toEqual({ SendCount: 0, Policy: { requireBusinessDomain: true, maxSendsPerSession: 2 } });
        expect(config['maxSessionDeadlineIso']).toBeUndefined();
    });

    it('stamps the unverified cap as the absolute deadline for ANY principal (not only widget guests)', () => {
        const plan = BuildMintConfigStamps({ EffectiveRealtime: { session: { unverifiedMaxSeconds: 300 } }, ExistingConfigRaw: '{}', NowMs: NOW });
        expect(configOf(plan)['maxSessionDeadlineIso']).toBe('2026-10-02T12:05:00.000Z');
    });

    it('never loosens a tighter deadline already stamped (the widget voice cap)', () => {
        const tighter = BuildMintConfigStamps({
            EffectiveRealtime: { session: { unverifiedMaxSeconds: 600 } },
            ExistingConfigRaw: JSON.stringify({ maxSessionDeadlineIso: '2026-10-02T12:02:00.000Z' }),
            NowMs: NOW,
        });
        expect(configOf(tighter)['maxSessionDeadlineIso']).toBe('2026-10-02T12:02:00.000Z');
        const looser = BuildMintConfigStamps({
            EffectiveRealtime: { session: { unverifiedMaxSeconds: 60 } },
            ExistingConfigRaw: JSON.stringify({ maxSessionDeadlineIso: '2026-10-02T12:10:00.000Z' }),
            NowMs: NOW,
        });
        expect(configOf(looser)['maxSessionDeadlineIso']).toBe('2026-10-02T12:01:00.000Z');
    });

    it('does not touch the deadline when only a verified cap is configured (it applies after verification)', () => {
        const plan = BuildMintConfigStamps({ EffectiveRealtime: { session: { verifiedMaxSeconds: 3600 } }, ExistingConfigRaw: '{}', NowMs: NOW });
        const config = configOf(plan);
        expect(config['maxSessionDeadlineIso']).toBeUndefined();
        expect((config['identityVerification'] as { Policy: unknown }).Policy).toEqual({ verifiedMaxSeconds: 3600 });
    });

    it('carries an inherited verified identity forward even with no policy, and applies the VERIFIED cap to such a session', () => {
        const noPolicy = BuildMintConfigStamps({ EffectiveRealtime: undefined, ExistingConfigRaw: '{}', InheritedVerified: VERIFIED, NowMs: NOW });
        expect((configOf(noPolicy)['identityVerification'] as { Verified: unknown }).Verified).toEqual(VERIFIED);

        const capped = BuildMintConfigStamps({
            EffectiveRealtime: { session: { unverifiedMaxSeconds: 300, verifiedMaxSeconds: 1800 } },
            ExistingConfigRaw: '{}',
            InheritedVerified: VERIFIED,
            NowMs: NOW,
        });
        expect(configOf(capped)['maxSessionDeadlineIso']).toBe('2026-10-02T12:30:00.000Z');

        const fallsBack = BuildMintConfigStamps({
            EffectiveRealtime: { session: { unverifiedMaxSeconds: 300 } },
            ExistingConfigRaw: '{}',
            InheritedVerified: VERIFIED,
            NowMs: NOW,
        });
        expect(configOf(fallsBack)['maxSessionDeadlineIso']).toBe('2026-10-02T12:05:00.000Z');
    });

    it('keeps existing verification state when stamping (a re-stamp must not reset the send count)', () => {
        const plan = BuildMintConfigStamps({
            EffectiveRealtime: { channels: { config: { IdentityVerification: { requireBusinessDomain: true } } } },
            ExistingConfigRaw: JSON.stringify({ identityVerification: { SendCount: 2 } }),
            NowMs: NOW,
        });
        expect((configOf(plan)['identityVerification'] as { SendCount: number }).SendCount).toBe(2);
    });
});

describe('LoadInheritedVerifiedIdentity', () => {
    const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
    const STRANGER = 'AAAAAAAA-0000-4000-8000-000000000002';
    const PRIOR = 'BBBBBBBB-0000-4000-8000-000000000001';
    const config = JSON.stringify({ identityVerification: { SendCount: 1, Verified: VERIFIED } });

    const provider = (opts: { found?: boolean; owner?: string; externalId?: string | null; config?: string | null } = {}): IMetadataProvider =>
        ({
            GetEntityObject: vi.fn(async (name: string) => {
                if (name === 'MJ: AI Agent Sessions') {
                    return { ID: PRIOR, UserID: opts.owner ?? OWNER, ConversationID: 'C1', Config_: opts.config === undefined ? config : opts.config, Load: vi.fn(async () => opts.found ?? true) };
                }
                return { ExternalID: opts.externalId ?? null, Load: vi.fn(async () => true) };
            }),
        }) as unknown as IMetadataProvider;

    const user = (over: Partial<UserInfo> = {}) => ({ ID: OWNER, ...over }) as UserInfo;

    it('returns the prior session\'s verified identity for its owner', async () => {
        expect(await LoadInheritedVerifiedIdentity(PRIOR, user(), provider())).toEqual(VERIFIED);
    });

    it('returns undefined with no lastSessionId, an unknown session, or an unverified prior', async () => {
        expect(await LoadInheritedVerifiedIdentity(undefined, user(), provider())).toBeUndefined();
        expect(await LoadInheritedVerifiedIdentity(PRIOR, user(), provider({ found: false }))).toBeUndefined();
        expect(await LoadInheritedVerifiedIdentity(PRIOR, user(), provider({ config: '{}' }))).toBeUndefined();
    });

    it('refuses to hand a stranger someone else\'s verification by naming their session id', async () => {
        expect(await LoadInheritedVerifiedIdentity(PRIOR, user({ ID: STRANGER }), provider())).toBeUndefined();
    });

    it('refuses another anonymous guest (same Anonymous user, different scope) and accepts the same guest', async () => {
        const prov = provider({ externalId: 'scope-A' });
        const guest = (scope: string) => user({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: scope } });
        expect(await LoadInheritedVerifiedIdentity(PRIOR, guest('scope-B'), prov)).toBeUndefined();
        expect(await LoadInheritedVerifiedIdentity(PRIOR, guest('scope-A'), prov)).toEqual(VERIFIED);
    });
});
