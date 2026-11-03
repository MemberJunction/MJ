import { describe, it, expect } from 'vitest';
import {
    CreateHandoffKeyPair,
    CreateHandoffState,
    DecodeBase64Url,
    EncodeBase64Url,
    EXCEL_HANDOFF_VERSION,
    ExcelConnectionPayload,
    ExportHandoffPublicKey,
    IsHandoffToken,
    OpenConnectionPayload,
    SealConnectionPayload,
} from '../handoff';

function payload(state: string, overrides: Partial<ExcelConnectionPayload> = {}): ExcelConnectionPayload {
    return {
        Version: EXCEL_HANDOFF_VERSION,
        State: state,
        APIKey: 'mj_sk_' + 'a'.repeat(64),
        GraphQLUrl: 'https://mj.example.org/graphql',
        UserName: 'Ada Lovelace',
        UserEmail: 'ada@example.org',
        ExpiresAt: '2027-01-28T00:00:00.000Z',
        ...overrides,
    };
}

describe('sign-in handoff', () => {
    it('seals a payload that only the matching private key opens', async () => {
        const keys = await CreateHandoffKeyPair();
        const state = CreateHandoffState();
        const sealed = await SealConnectionPayload(await ExportHandoffPublicKey(keys.publicKey), payload(state));
        expect(IsHandoffToken(sealed)).toBe(true);
        expect(sealed).not.toContain('mj_sk_');
        await expect(OpenConnectionPayload(keys.privateKey, sealed, state)).resolves.toEqual(payload(state));
    });

    it('refuses an answer meant for another sign-in', async () => {
        const keys = await CreateHandoffKeyPair();
        const sealed = await SealConnectionPayload(await ExportHandoffPublicKey(keys.publicKey), payload('state-a'));
        await expect(OpenConnectionPayload(keys.privateKey, sealed, 'state-b')).rejects.toThrow(/wasn't for this window/);
    });

    it('cannot be opened with a different key pair', async () => {
        const mine = await CreateHandoffKeyPair();
        const theirs = await CreateHandoffKeyPair();
        const sealed = await SealConnectionPayload(await ExportHandoffPublicKey(mine.publicKey), payload('s'));
        await expect(OpenConnectionPayload(theirs.privateKey, sealed, 's')).rejects.toThrow();
    });

    it('refuses a payload whose GraphQL URL is not http(s)', async () => {
        const keys = await CreateHandoffKeyPair();
        const sealed = await SealConnectionPayload(await ExportHandoffPublicKey(keys.publicKey), payload('s', { GraphQLUrl: 'javascript:alert(1)' }));
        await expect(OpenConnectionPayload(keys.privateKey, sealed, 's')).rejects.toThrow(/incomplete/);
    });

    it('refuses malformed text before touching crypto', async () => {
        const keys = await CreateHandoffKeyPair();
        await expect(SealConnectionPayload('not base64url!', payload('s'))).rejects.toThrow(/malformed/);
        await expect(OpenConnectionPayload(keys.privateKey, 'has spaces', 's')).rejects.toThrow(/malformed/);
    });

    it('makes a different state each time', () => {
        expect(CreateHandoffState()).not.toBe(CreateHandoffState());
        expect(IsHandoffToken(CreateHandoffState())).toBe(true);
    });

    it('round-trips base64url, with and without padding', () => {
        const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
        const text = EncodeBase64Url(bytes);
        expect(text).not.toMatch(/[+/=]/);
        expect(Array.from(DecodeBase64Url(text))).toEqual(Array.from(bytes));
        expect(Array.from(DecodeBase64Url(text + '=='))).toEqual(Array.from(bytes));
    });
});
