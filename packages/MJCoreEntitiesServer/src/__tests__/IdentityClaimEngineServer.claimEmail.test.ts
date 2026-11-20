import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sendSingleMessage: vi.fn(async (_provider: string, _type: string, _message: object) => ({ Success: true })),
}));

vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: { Instance: { Config: vi.fn(async () => undefined), SendSingleMessage: mocks.sendSingleMessage } },
}));
vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: { Config: vi.fn(async () => undefined), Templates: [] } },
}));

import { IdentityClaimEngineServer } from '../engines/IdentityClaimEngineServer.js';
import type { MJIdentityClaimEntity, MJIdentityClaimTypeEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

type SendClaimEmail = (
    claim: MJIdentityClaimEntity,
    claimType: MJIdentityClaimTypeEntity,
    params: Record<string, unknown>,
    rawToken?: string,
    contextUser?: UserInfo,
) => Promise<boolean>;

describe('IdentityClaimEngineServer claim email', () => {
    it('marks the claim email as containing secrets, so its link is not logged', async () => {
        const engine = IdentityClaimEngineServer.Instance as unknown as { sendClaimEmail: SendClaimEmail };
        const claim = { ID: 'claim-1', NormalizedEmail: 'claimant@example.com', ExpiresAt: new Date(Date.now() + 86400000) } as MJIdentityClaimEntity;
        const claimType = { Name: 'Access' } as MJIdentityClaimTypeEntity;

        const sent = await engine.sendClaimEmail.call(engine, claim, claimType, { ClaimBaseURL: 'https://portal.test' }, 'marker-token');

        expect(sent).toBe(true);
        expect(mocks.sendSingleMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendSingleMessage.mock.calls[0][2]).toMatchObject({ ContainsSecrets: true });
    });
});
