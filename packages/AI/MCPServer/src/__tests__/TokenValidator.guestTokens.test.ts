/**
 * MJAPI registers its magic-link issuer in the shared AuthProviderFactory, so MCP would otherwise
 * accept a magic-link or widget guest JWT. MJAPI narrows those guests to their invite scope; MCP
 * cannot, so it refuses them outright. Widget guest tokens are built on the magic-link claims, so
 * the one `mj_magic_link` claim covers both.
 */
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@memberjunction/server', () => ({
    getSigningKeys: vi.fn(),
    extractUserInfoFromPayload: vi.fn(),
    verifyUserRecord: vi.fn(),
}));

import { ValidateBearerToken } from '../auth/TokenValidator.js';

function token(claims: Record<string, unknown>): string {
    const exp = Math.floor(Date.now() / 1000) + 600;
    return jwt.sign({ iss: 'https://mjapi.example.test/issuer', sub: 'guest-1', exp, ...claims }, 'test-secret');
}

describe('ValidateBearerToken and MJAPI guest tokens', () => {
    it('REGRESSION: refuses a magic-link session token before looking up its issuer', async () => {
        const result = await ValidateBearerToken(token({ mj_magic_link: true, email: 'guest@example.test' }));

        expect(result.valid).toBe(false);
        expect(result.error?.code).toBe('invalid_token');
        expect(result.error?.message).toMatch(/magic-link|guest/i);
    });

    it('refuses a widget guest token, which carries the magic-link claims too', async () => {
        const result = await ValidateBearerToken(token({ mj_magic_link: true, mj_widget_id: 'w1', mj_anon: true }));

        expect(result.valid).toBe(false);
        expect(result.error?.code).toBe('invalid_token');
        expect(result.error?.message).toMatch(/magic-link|guest/i);
    });

    it('lets an ordinary token continue to issuer lookup', async () => {
        const result = await ValidateBearerToken(token({ email: 'person@example.test' }));

        // No providers are registered in this test, so an ordinary token stops at the issuer check.
        expect(result.error?.code).toBe('unknown_issuer');
    });
});
