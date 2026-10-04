import { describe, it, expect, vi } from 'vitest';
import { EntityPermissionType } from '@memberjunction/core';

// Neutralize the class-factory registration decorator.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockMJInteractionEventEntity {
        public saveCalled = false;
        public deleteCalled = false;
        private _saved = false;

        public get IsSaved(): boolean {
            return this._saved;
        }

        public markSaved(): void {
            this._saved = true;
        }

        public CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
            return true;
        }

        public async Save(): Promise<boolean> {
            this.saveCalled = true;
            return true;
        }

        public async Delete(): Promise<boolean> {
            this.deleteCalled = true;
            return true;
        }
    }
    return { MJInteractionEventEntity: MockMJInteractionEventEntity };
});

import { MJInteractionEventEntityServer } from '../custom/MJInteractionEventEntityServer.server';

type TestEntity = MJInteractionEventEntityServer & {
    saveCalled: boolean;
    deleteCalled: boolean;
    markSaved(): void;
};

describe('MJInteractionEventEntityServer', () => {
    const makeEntity = (isSaved = false): TestEntity => {
        const entity = new MJInteractionEventEntityServer() as TestEntity;
        if (isSaved) {
            entity.markSaved();
        }
        return entity;
    };

    describe('CheckPermissions', () => {
        it('allows Read permission check', () => {
            const entity = makeEntity();
            expect(entity.CheckPermissions(EntityPermissionType.Read, true)).toBe(true);
        });

        it('allows Create permission check', () => {
            const entity = makeEntity();
            expect(entity.CheckPermissions(EntityPermissionType.Create, true)).toBe(true);
        });

        it('rejects Update permission check without throwing when throwError is false', () => {
            const entity = makeEntity();
            expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        });

        it('throws on Update permission check when throwError is true', () => {
            const entity = makeEntity();
            expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/append-only/i);
        });

        it('rejects Delete permission check without throwing when throwError is false', () => {
            const entity = makeEntity();
            expect(entity.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);
        });

        it('throws on Delete permission check when throwError is true', () => {
            const entity = makeEntity();
            expect(() => entity.CheckPermissions(EntityPermissionType.Delete, true)).toThrow(/append-only/i);
        });
    });

    describe('Save', () => {
        it('allows saving a new record', async () => {
            const entity = makeEntity(false);
            const result = await entity.Save();
            expect(result).toBe(true);
            expect(entity.saveCalled).toBe(true);
        });

        it('throws when saving an already saved record', async () => {
            const entity = makeEntity(true);
            await expect(entity.Save()).rejects.toThrow(/append-only/i);
            expect(entity.saveCalled).toBe(false);
        });
    });

    describe('Delete', () => {
        it('always throws when attempting to delete', async () => {
            const entity = makeEntity(true);
            await expect(entity.Delete()).rejects.toThrow(/append-only/i);
            expect(entity.deleteCalled).toBe(false);
        });
    });
});
