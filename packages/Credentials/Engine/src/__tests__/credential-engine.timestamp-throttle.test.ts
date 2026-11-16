/**
 * CredentialEngine — LastUsedAt / LastValidatedAt touches are throttled per credential.
 *
 * Each touch is a full-row save. Across processes that save can revert a change another server
 * commits to the same row in the meantime (write-all-columns `spUpdate`, issue #4339): with a touch
 * on every read, a key rotated through one server was reverted by another server's touch in 13 of
 * 20 trials of a multi-process reproduction. These tests drive the real throttle and write queue;
 * only the database save (`touchCredentialTimestamp`) is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCredentialEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '../CredentialEngine';

const API_KEY_TYPE_ID = '00000000-0000-0000-0000-0000000000A1';
const CREDENTIAL_A = '00000000-0000-0000-0000-0000000000C1';
const CREDENTIAL_B = '00000000-0000-0000-0000-0000000000C2';
const user = { ID: '00000000-0000-0000-0000-0000000000F1', Name: 'Tester', IsActive: true, UserRoles: [] } as unknown as UserInfo;

type Column = 'LastUsedAt' | 'LastValidatedAt';

interface EngineInternals {
    /** Real BaseEngine flag and the package's `__mocks__/core.ts` flag — set both so either implementation reports loaded. */
    _loaded: boolean;
    _isLoaded: boolean;
    _provider: IMetadataProvider | undefined;
    _credentials: MJCredentialEntity[];
    _credentialTypes: MJCredentialTypeEntity[];
    _lastTimestampTouchAt: Map<string, number>;
    logAccess: () => Promise<void>;
    touchCredentialTimestamp: (credentialId: string, column: Column, contextUser: UserInfo) => Promise<boolean>;
    updateLastUsedAt: (credentialId: string, contextUser: UserInfo) => Promise<void>;
    updateLastValidatedAt: (credentialId: string, contextUser: UserInfo) => Promise<void>;
}

function credentialRow(id: string, name: string): MJCredentialEntity {
    return {
        ID: id, Name: name, CredentialTypeID: API_KEY_TYPE_ID, Values: JSON.stringify({ apiKey: 'k' }),
        IsActive: true, IsDefault: false, ExpiresAt: null,
    } as unknown as MJCredentialEntity;
}

/** Seeds the singleton and replaces the database save with a recorder whose outcome a test can set. */
function seedEngine() {
    const engine = CredentialEngine.Instance;
    const internals = engine as unknown as EngineInternals;
    const provider = {} as IMetadataProvider;
    internals._loaded = true;
    internals._isLoaded = true;
    internals._provider = provider;
    Object.defineProperty(engine, 'ProviderToUse', { configurable: true, get: () => provider });
    internals._credentialTypes = [{ ID: API_KEY_TYPE_ID, Name: 'API Key' } as unknown as MJCredentialTypeEntity];
    internals._credentials = [credentialRow(CREDENTIAL_A, 'Key A'), credentialRow(CREDENTIAL_B, 'Key B')];
    internals._lastTimestampTouchAt.clear();
    internals.logAccess = async () => undefined;
    engine.TimestampTouchIntervalMs = 60_000;
    const saves: Array<{ id: string; column: Column }> = [];
    let outcome = true;
    internals.touchCredentialTimestamp = async (id, column) => {
        await new Promise(resolve => setTimeout(resolve, 0)); // a save is a round trip
        saves.push({ id, column });
        return outcome;
    };
    return { engine, internals, saves, failNextSaves: () => { outcome = false; }, succeedSaves: () => { outcome = true; } };
}

/** Lets the fire-and-forget touch that GetCredential starts run to completion. */
async function drain(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

describe('CredentialEngine timestamp touch throttle', () => {
    let clock = 1_700_000_000_000;

    beforeEach(() => {
        clock = 1_700_000_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => clock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('touches LastUsedAt once for repeated reads within the interval', async () => {
        const { engine, saves } = seedEngine();
        for (let i = 0; i < 3; i++) {
            await engine.GetCredential('Key A', { contextUser: user });
            await drain();
        }
        expect(saves).toEqual([{ id: CREDENTIAL_A, column: 'LastUsedAt' }]);
    });

    it('schedules one touch for a burst of concurrent reads', async () => {
        const { internals, saves } = seedEngine();
        await Promise.all(Array.from({ length: 5 }, () => internals.updateLastUsedAt(CREDENTIAL_A, user)));
        expect(saves).toHaveLength(1);
    });

    it('touches again once the interval has passed', async () => {
        const { engine, internals, saves } = seedEngine();
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        clock += engine.TimestampTouchIntervalMs - 1;
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        expect(saves).toHaveLength(1);
        clock += 1;
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        expect(saves).toHaveLength(2);
    });

    it('touches on every read when the interval is 0', async () => {
        const { engine, internals, saves } = seedEngine();
        engine.TimestampTouchIntervalMs = 0;
        for (let i = 0; i < 3; i++) {
            await internals.updateLastUsedAt(CREDENTIAL_A, user);
        }
        expect(saves).toHaveLength(3);
    });

    it('retries on the next read when a touch did not save', async () => {
        const { internals, saves, failNextSaves, succeedSaves } = seedEngine();
        failNextSaves();
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        succeedSaves();
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        expect(saves).toHaveLength(2);
    });

    it('throttles each credential and each column separately', async () => {
        const { internals, saves } = seedEngine();
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        await internals.updateLastUsedAt(CREDENTIAL_B, user);
        await internals.updateLastValidatedAt(CREDENTIAL_A, user);
        await internals.updateLastUsedAt(CREDENTIAL_A, user);
        await internals.updateLastValidatedAt(CREDENTIAL_A, user);
        expect(saves).toEqual([
            { id: CREDENTIAL_A, column: 'LastUsedAt' },
            { id: CREDENTIAL_B, column: 'LastUsedAt' },
            { id: CREDENTIAL_A, column: 'LastValidatedAt' },
        ]);
    });
});
