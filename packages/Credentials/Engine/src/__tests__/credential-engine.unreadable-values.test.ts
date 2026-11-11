/**
 * CredentialEngine — a credential whose `Values` cannot be read must fail, not resolve empty.
 *
 * The production case: a peer server's cache event delivered a credential row with `Values`
 * still encrypted (`$ENC$…`). The engine used to log the JSON parse error and return `{}`, so
 * `GetCredential` reported success with no secret, recorded a successful decrypt, and touched
 * `LastUsedAt`. These tests drive the real `GetCredential` against a seeded engine.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCredentialEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '../CredentialEngine';
import { CredentialValuesUnreadableError } from '../expiration';

const API_KEY_TYPE_ID = '00000000-0000-0000-0000-0000000000A1';
const CREDENTIAL_ID = '00000000-0000-0000-0000-0000000000C1';
const CIPHERTEXT = '$ENC$$85B8A1C2-0000-0000-0000-000000000000$AES-256-GCM$iv$tag$c2VjcmV0LXN0dWZm';
const user = { ID: '00000000-0000-0000-0000-0000000000F1', Name: 'Tester', IsActive: true, UserRoles: [] } as unknown as UserInfo;

interface EngineInternals {
    /** Real BaseEngine flag and the package's `__mocks__/core.ts` flag — set both so either implementation reports loaded. */
    _loaded: boolean;
    _isLoaded: boolean;
    _provider: IMetadataProvider | undefined;
    _credentials: MJCredentialEntity[];
    _credentialTypes: MJCredentialTypeEntity[];
    logAccess: (credential: MJCredentialEntity | null, contextUser: UserInfo | undefined, details: { success: boolean }) => Promise<void>;
    updateLastUsedAt: () => Promise<void>;
}

function seedEngine(values: string) {
    const engine = CredentialEngine.Instance;
    const internals = engine as unknown as EngineInternals;
    const provider = {} as IMetadataProvider;
    internals._loaded = true;
    internals._isLoaded = true;
    internals._provider = provider;
    Object.defineProperty(engine, 'ProviderToUse', { configurable: true, get: () => provider });
    internals._credentialTypes = [{ ID: API_KEY_TYPE_ID, Name: 'API Key' } as unknown as MJCredentialTypeEntity];
    internals._credentials = [{
        ID: CREDENTIAL_ID,
        Name: 'Callback Key',
        CredentialTypeID: API_KEY_TYPE_ID,
        Values: values,
        IsActive: true,
        IsDefault: true,
        ExpiresAt: null,
    } as unknown as MJCredentialEntity];
    const accessLog: boolean[] = [];
    internals.logAccess = async (_credential, _contextUser, details) => {
        accessLog.push(details.success);
    };
    const touch = vi.fn(async () => undefined);
    internals.updateLastUsedAt = touch;
    return { engine, accessLog, touch };
}

async function resolveError(values: string): Promise<CredentialValuesUnreadableError> {
    const { engine } = seedEngine(values);
    const error = await engine.GetCredential('Callback Key', { contextUser: user }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(CredentialValuesUnreadableError);
    return error as CredentialValuesUnreadableError;
}

describe('CredentialEngine unreadable values', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves values stored as a JSON object', async () => {
        const { engine } = seedEngine(JSON.stringify({ apiKey: 'sk-test123' }));
        const resolved = await engine.GetCredential<{ apiKey: string }>('Callback Key', { contextUser: user });
        expect(resolved.values.apiKey).toBe('sk-test123');
    });

    it('resolves empty values as an empty object', async () => {
        const { engine } = seedEngine('');
        const resolved = await engine.GetCredential('Callback Key', { contextUser: user });
        expect(resolved.values).toEqual({});
    });

    it('rejects values that are still encrypted and says so', async () => {
        const error = await resolveError(CIPHERTEXT);
        expect(error.StillEncrypted).toBe(true);
        expect(error.CredentialID).toBe(CREDENTIAL_ID);
        expect(error.message).toContain('still encrypted');
    });

    it('rejects values that are not JSON without quoting them', async () => {
        const error = await resolveError('sk-plaintext-secret');
        expect(error.StillEncrypted).toBe(false);
        expect(error.message).not.toContain('sk-plaintext');
    });

    it('never quotes ciphertext in the message', async () => {
        const error = await resolveError(CIPHERTEXT);
        expect(error.message).not.toContain('$ENC$');
    });

    it('rejects JSON that is not an object', async () => {
        await resolveError(JSON.stringify(['a', 'b']));
        await resolveError(JSON.stringify('just a string'));
    });

    it('records a failed access and does not touch LastUsedAt', async () => {
        const { engine, accessLog, touch } = seedEngine(CIPHERTEXT);
        await expect(engine.GetCredential('Callback Key', { contextUser: user })).rejects.toThrow(CredentialValuesUnreadableError);
        expect(accessLog).toEqual([false]);
        expect(touch).not.toHaveBeenCalled();
    });
});
