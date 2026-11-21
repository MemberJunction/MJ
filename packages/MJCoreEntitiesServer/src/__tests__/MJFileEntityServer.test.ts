/**
 * Unit tests for `MJFileEntityServer` — once an `MJ: Files` row exists, where its bytes live (`ProviderID`,
 * `ProviderKey`) is server-owned. Every file-ID route reads, signs or deletes the object those fields name, so a client
 * that could re-point an existing row could make a row other users trust serve or delete a different object.
 *
 * The generated base (`MJFileEntity`) is mocked to a settable stub with per-field Dirty/OldValue/Value state (the
 * approach MJUserRoleEntityServer.test.ts uses); `Save()` on the stub routes through `Validate()` the way
 * `BaseEntity.Save()` does, and skips it for `ReplayOnly`, so these tests exercise the real Save → Validate composition.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

interface StubField {
    Dirty: boolean;
    OldValue: string | null;
    Value: string | null;
}

vi.mock('@memberjunction/core-entities', () => {
    class StubFileEntity {
        public IsSaved = true;
        public SuperSaveWrites = 0;
        public LastRefusal: string | null = null;
        protected fields = new Map<string, StubField>();

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }

        public SetField(name: string, oldValue: string | null, value: string | null): void {
            this.fields.set(name, { Dirty: oldValue !== value, OldValue: oldValue, Value: value });
        }

        public Validate(): { Success: boolean; Errors: Array<{ Source: string; Message: string }> } {
            return { Success: true, Errors: [] };
        }

        public async Save(options?: { ReplayOnly?: boolean }): Promise<boolean> {
            if (!options?.ReplayOnly && !this.Validate().Success) {
                return false;
            }
            this.SuperSaveWrites++;
            return true;
        }

        public RegisterResultHistoryEntry(result: { Message?: string }): void {
            this.LastRefusal = result.Message ?? null;
        }
    }
    return { MJFileEntity: StubFileEntity };
});

import { EntitySaveOptions } from '@memberjunction/core';
import { MJFileEntityServer } from '../custom/MJFileEntityServer.server.js';

/** The stub's test-only surface, reached without widening the class under test. */
interface StubHost {
    IsSaved: boolean;
    SuperSaveWrites: number;
    LastRefusal: string | null;
    SetField(name: string, oldValue: string | null, value: string | null): void;
}

const PROVIDER_A = 'AAAAAAAA-0000-4000-8000-000000000001';
const PROVIDER_B = 'BBBBBBBB-0000-4000-8000-000000000002';

function existingRow(): { entity: MJFileEntityServer; host: StubHost } {
    const entity = new MJFileEntityServer();
    const host = entity as unknown as StubHost;
    host.SetField('ProviderID', PROVIDER_A, PROVIDER_A);
    host.SetField('ProviderKey', 'me/mine.pdf', 'me/mine.pdf');
    return { entity, host };
}

describe('MJFileEntityServer — storage location is server-owned on an existing row', () => {
    it('refuses a client change to ProviderKey (re-pointing the row at another object)', async () => {
        const { entity, host } = existingRow();
        host.SetField('ProviderKey', 'me/mine.pdf', 'hr/secret.pdf');
        const result = entity.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map(e => e.Source)).toEqual(['ProviderKey']);
        expect(await entity.Save()).toBe(false);
        expect(host.SuperSaveWrites).toBe(0);
    });

    it('refuses a client change to ProviderID, but not a re-cased spelling of the same ID', async () => {
        const { entity, host } = existingRow();
        host.SetField('ProviderID', PROVIDER_A, PROVIDER_B);
        expect(entity.Validate().Success).toBe(false);

        host.SetField('ProviderID', PROVIDER_A, PROVIDER_A.toLowerCase());
        expect(entity.Validate().Success).toBe(true);
    });

    it('refuses the change on a ReplayOnly save too, recording why', async () => {
        const { entity, host } = existingRow();
        host.SetField('ProviderKey', 'me/mine.pdf', null);
        const replay = new EntitySaveOptions();
        replay.ReplayOnly = true;
        expect(await entity.Save(replay)).toBe(false);
        expect(host.SuperSaveWrites).toBe(0);
        expect(host.LastRefusal).toMatch(/ProviderKey cannot be changed/);
    });

    it('lets trusted server code re-point a row when it opts in', async () => {
        const { entity, host } = existingRow();
        host.SetField('ProviderKey', 'me/mine.pdf', 'archive/mine.pdf');
        entity.AllowStorageLocationChange = true;
        expect(await entity.Save()).toBe(true);
        expect(host.SuperSaveWrites).toBe(1);
    });

    it('saves an existing row whose location is unchanged, and a new row with a location (the create path is gated by the routes)', async () => {
        const { entity, host } = existingRow();
        expect(await entity.Save()).toBe(true);

        const created = new MJFileEntityServer();
        const createdHost = created as unknown as StubHost;
        createdHost.IsSaved = false;
        createdHost.SetField('ProviderID', null, PROVIDER_A);
        createdHost.SetField('ProviderKey', null, 'artifacts/2026-10-07/x/report.pdf');
        expect(await created.Save()).toBe(true);
        expect(host.SuperSaveWrites + createdHost.SuperSaveWrites).toBe(2);
    });
});
