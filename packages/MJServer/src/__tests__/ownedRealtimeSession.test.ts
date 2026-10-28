import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    LoadOwnedRealtimeSession, RealtimeSessionNotFoundError, RealtimeSessionOwnershipError,
} from '../realtimeSessions/ownedRealtimeSession.js';

const SESSION = '11111111-1111-4111-8111-111111111111';
const OWNER = { ID: 'AAAAAAAA-0000-4000-8000-000000000001' } as unknown as UserInfo;
const STRANGER = { ID: 'BBBBBBBB-0000-4000-8000-000000000002' } as unknown as UserInfo;

function providerWith(row: { UserID: string } | null): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => ({
            UserID: row?.UserID ?? '',
            Load: vi.fn(async () => row !== null),
        })),
    } as unknown as IMetadataProvider;
}

describe('LoadOwnedRealtimeSession', () => {
    it('returns the session when the caller owns it (UUIDs compared case-insensitively)', async () => {
        const session = await LoadOwnedRealtimeSession(SESSION, OWNER, providerWith({ UserID: OWNER.ID.toLowerCase() }));
        expect(session.UserID).toBe(OWNER.ID.toLowerCase());
    });

    it('throws RealtimeSessionNotFoundError when the row does not load', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, OWNER, providerWith(null)))
            .rejects.toBeInstanceOf(RealtimeSessionNotFoundError);
        await expect(LoadOwnedRealtimeSession(SESSION, OWNER, providerWith(null)))
            .rejects.toThrow(`Realtime session ${SESSION} not found`);
    });

    it('throws RealtimeSessionOwnershipError for another user', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, STRANGER, providerWith({ UserID: OWNER.ID })))
            .rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
        await expect(LoadOwnedRealtimeSession(SESSION, STRANGER, providerWith({ UserID: OWNER.ID })))
            .rejects.toThrow('Not authorized: you do not own this realtime session');
    });

    it('skips loading MJ: Conversations when the caller is a standard named user without a scope identity', async () => {
        const getEntityObject = vi.fn(async (name: string) => ({
            UserID: OWNER.ID,
            ConversationID: '22222222-2222-4222-8222-222222222222',
            Load: vi.fn(async () => name === 'MJ: AI Agent Sessions'),
        }));
        const prov = { GetEntityObject: getEntityObject } as unknown as IMetadataProvider;

        await LoadOwnedRealtimeSession(SESSION, OWNER, prov);

        expect(getEntityObject).toHaveBeenCalledTimes(1);
        expect(getEntityObject).toHaveBeenCalledWith('MJ: AI Agent Sessions', OWNER);
    });
});
