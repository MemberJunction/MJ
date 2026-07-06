/**
 * Unit tests for `MJAISkillEntityServer.Save()` — the CreatedByUserID ownership default:
 * on a NEW record with no explicit `CreatedByUserID`, the server subclass fills it from
 * `ContextCurrentUser` before delegating to `super.Save()`. Explicit values, already-saved
 * records, and missing-context saves are left untouched.
 *
 * The heavy generated base (`MJAISkillEntity`) is mocked to a minimal settable stub whose
 * `Save()` records the invocation and resolves true, so the test exercises ONLY the
 * defaulting logic the subclass adds. `@RegisterClass` is neutralized.
 */
import { describe, it, expect, vi } from 'vitest';

// Neutralize the class-factory registration decorator.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual };
});

// Minimal settable base standing in for the generated `MJAISkillEntity`. Its Save()
// records that it was called and resolves true so the subclass's defaulting is what's
// under test.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJAISkillEntity {
        public CreatedByUserID: string | undefined = undefined;
        public ContextCurrentUser: { ID: string } | undefined = undefined;
        public saveCalled = false;
        private _saved = false;
        public get IsSaved(): boolean {
            return this._saved;
        }
        public markSaved(): void {
            this._saved = true;
        }
        public async Save(): Promise<boolean> {
            this.saveCalled = true;
            return true;
        }
    }
    return { MJAISkillEntity: MockMJAISkillEntity };
});

import { MJAISkillEntityServer } from '../custom/MJAISkillEntityServer.server';

type TestEntity = MJAISkillEntityServer & {
    ContextCurrentUser: { ID: string } | undefined;
    saveCalled: boolean;
    markSaved(): void;
};

function makeEntity(opts: {
    createdByUserID?: string;
    contextUserID?: string;
    alreadySaved?: boolean;
}): TestEntity {
    const entity = new MJAISkillEntityServer() as TestEntity;
    if (opts.createdByUserID) entity.CreatedByUserID = opts.createdByUserID;
    if (opts.contextUserID) entity.ContextCurrentUser = { ID: opts.contextUserID };
    if (opts.alreadySaved) entity.markSaved();
    return entity;
}

describe('MJAISkillEntityServer.Save — CreatedByUserID ownership default', () => {
    it('defaults CreatedByUserID to the context user on a NEW record when unset', async () => {
        const entity = makeEntity({ contextUserID: 'USER-1' });
        const saved = await entity.Save();
        expect(saved).toBe(true);
        expect(entity.CreatedByUserID).toBe('USER-1');
        expect(entity.saveCalled).toBe(true);
    });

    it('does NOT overwrite an explicitly set CreatedByUserID', async () => {
        const entity = makeEntity({ createdByUserID: 'OWNER-9', contextUserID: 'USER-1' });
        await entity.Save();
        expect(entity.CreatedByUserID).toBe('OWNER-9');
    });

    it('does NOT touch CreatedByUserID on an already-saved record', async () => {
        const entity = makeEntity({ contextUserID: 'USER-1', alreadySaved: true });
        await entity.Save();
        expect(entity.CreatedByUserID).toBeUndefined();
    });

    it('leaves CreatedByUserID unset when there is no ContextCurrentUser (super.Save decides)', async () => {
        const entity = makeEntity({});
        const saved = await entity.Save();
        expect(entity.CreatedByUserID).toBeUndefined();
        expect(saved).toBe(true); // mock base resolves true; real base would fail validation
    });
});
