import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

const engine = {
    CreateAPIKey: vi.fn(),
    RevokeAPIKey: vi.fn(),
};
const base = {
    Config: vi.fn(async () => undefined),
    GetScopeByPath: vi.fn((path: string): { ID: string } | undefined => ({ ID: `scope-${path}` })),
    GetApplicationByName: vi.fn((name: string): { ID: string } | undefined => (name === 'MJAPI' ? { ID: 'app-mjapi' } : undefined)),
};

vi.mock('@memberjunction/api-keys', () => ({ GetAPIKeyEngine: () => engine }));
vi.mock('@memberjunction/api-keys-base', () => ({ APIKeysEngineBase: { get Instance() { return base; } } }));

import { CreateExcelConnectionKey, EXCEL_CONNECTION_KEY_LABEL } from '../connection';

interface SavedRecord {
    Entity: string;
    Values: Record<string, unknown>;
}

const user = { ID: 'user-1', Name: 'Ada Lovelace', Email: 'ada@example.org' } as UserInfo;
const now = new Date('2026-10-30T12:00:00.000Z');

function providerSaving(saved: SavedRecord[], failOn?: string): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entity: string) => {
            const values: Record<string, unknown> = {};
            const record = new Proxy(values, {
                get(target, prop) {
                    if (prop === 'Save') {
                        return async () => {
                            if (entity === failOn) {
                                return false;
                            }
                            saved.push({ Entity: entity, Values: { ...target } });
                            return true;
                        };
                    }
                    if (prop === 'LatestResult') {
                        return { CompleteMessage: 'permission denied' };
                    }
                    return target[prop as string];
                },
            });
            return record;
        }),
    } as unknown as IMetadataProvider;
}

describe('CreateExcelConnectionKey', () => {
    beforeEach(() => {
        engine.CreateAPIKey.mockReset().mockResolvedValue({ Success: true, RawKey: 'mj_sk_raw', APIKeyId: 'key-1' });
        engine.RevokeAPIKey.mockReset().mockResolvedValue(true);
        base.GetScopeByPath.mockClear();
        base.GetApplicationByName.mockClear();
    });

    it('creates the key as the user, scoped to view:run and query:run, bound to MJAPI, expiring', async () => {
        const saved: SavedRecord[] = [];
        const provider = providerSaving(saved);
        const key = await CreateExcelConnectionKey(user, provider, 90, now);

        expect(engine.CreateAPIKey).toHaveBeenCalledWith(
            expect.objectContaining({ UserId: 'user-1', Label: EXCEL_CONNECTION_KEY_LABEL, ExpiresAt: new Date('2027-01-28T12:00:00.000Z') }),
            user, provider);
        expect(saved).toEqual([
            { Entity: 'MJ: API Key Scopes', Values: { APIKeyID: 'key-1', ScopeID: 'scope-view:run', ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0 } },
            { Entity: 'MJ: API Key Scopes', Values: { APIKeyID: 'key-1', ScopeID: 'scope-query:run', ResourcePattern: '*', PatternType: 'Include', IsDeny: false, Priority: 0 } },
            { Entity: 'MJ: API Key Applications', Values: { APIKeyID: 'key-1', ApplicationID: 'app-mjapi' } },
        ]);
        expect(key).toEqual({ APIKey: 'mj_sk_raw', APIKeyID: 'key-1', ExpiresAt: new Date('2027-01-28T12:00:00.000Z'), Label: EXCEL_CONNECTION_KEY_LABEL });
        expect(engine.RevokeAPIKey).not.toHaveBeenCalled();
    });

    it('skips the application binding when the server defines no MJAPI application', async () => {
        base.GetApplicationByName.mockReturnValueOnce(undefined);
        const saved: SavedRecord[] = [];
        await CreateExcelConnectionKey(user, providerSaving(saved), 90, now);
        expect(saved.map(s => s.Entity)).toEqual(['MJ: API Key Scopes', 'MJ: API Key Scopes']);
    });

    it('revokes the new key when a scope can\'t be saved, so no unscoped key is left', async () => {
        const provider = providerSaving([], 'MJ: API Key Scopes');
        await expect(CreateExcelConnectionKey(user, provider, 90, now)).rejects.toThrow(/ask an administrator/);
        expect(engine.RevokeAPIKey).toHaveBeenCalledWith('key-1', user, provider);
    });

    it('revokes the new key when the application binding fails', async () => {
        const provider = providerSaving([], 'MJ: API Key Applications');
        await expect(CreateExcelConnectionKey(user, provider, 90, now)).rejects.toThrow(/limited to MJAPI/);
        expect(engine.RevokeAPIKey).toHaveBeenCalledWith('key-1', user, provider);
    });

    it('creates nothing when a scope is missing on the server', async () => {
        base.GetScopeByPath.mockImplementationOnce(() => undefined);
        await expect(CreateExcelConnectionKey(user, providerSaving([]), 90, now)).rejects.toThrow(/no "view:run" API scope/);
        expect(engine.CreateAPIKey).not.toHaveBeenCalled();
    });

    it('explains a refused key creation', async () => {
        engine.CreateAPIKey.mockResolvedValueOnce({ Success: false, Error: 'Permission denied' });
        await expect(CreateExcelConnectionKey(user, providerSaving([]), 90, now)).rejects.toThrow(/Permission denied.*ask an administrator/);
        expect(engine.RevokeAPIKey).not.toHaveBeenCalled();
    });
});
