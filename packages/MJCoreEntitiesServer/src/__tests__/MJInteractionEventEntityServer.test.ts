import { describe, it, expect, vi } from 'vitest';
import { BaseEntityResult, EntityPermissionType, ValidationResult } from '@memberjunction/core';

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
        public ID = 'test-event-id';
        private _saved = false;
        private _results: BaseEntityResult[] = [];

        public get IsSaved(): boolean {
            return this._saved;
        }

        public markSaved(): void {
            this._saved = true;
        }

        public CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
            return true;
        }

        public Validate(): ValidationResult {
            return { Success: true, Errors: [] };
        }

        public RegisterResultHistoryEntry(result: BaseEntityResult): void {
            this._results.push(result);
        }

        public get LatestResult(): BaseEntityResult | undefined {
            return this._results.length > 0 ? this._results[this._results.length - 1] : undefined;
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

    describe('Validate', () => {
        it('passes validation for unsaved entity', () => {
            const entity = makeEntity(false);
            const val = entity.Validate();
            expect(val.Success).toBe(true);
            expect(val.Errors.length).toBe(0);
        });

        it('fails validation for already saved entity', () => {
            const entity = makeEntity(true);
            const val = entity.Validate();
            expect(val.Success).toBe(false);
            expect(val.Errors.length).toBeGreaterThan(0);
            expect(val.Errors[0].Message).toMatch(/append-only: updates are prohibited/i);
        });
    });

    describe('Save', () => {
        it('allows saving a new record', async () => {
            const entity = makeEntity(false);
            const result = await entity.Save();
            expect(result).toBe(true);
            expect(entity.saveCalled).toBe(true);
        });

        it('refuses and returns false with LatestResult when saving an already saved record', async () => {
            const entity = makeEntity(true);
            const result = await entity.Save();
            expect(result).toBe(false);
            expect(entity.saveCalled).toBe(false);
            expect(entity.LatestResult?.Message).toMatch(/append-only: updates are prohibited/i);
        });
    });

    describe('Delete', () => {
        it('refuses and returns false with LatestResult when attempting to delete', async () => {
            const entity = makeEntity(true);
            const result = await entity.Delete();
            expect(result).toBe(false);
            expect(entity.deleteCalled).toBe(false);
            expect(entity.LatestResult?.Message).toMatch(/append-only: deletes are prohibited/i);
        });
    });
});
