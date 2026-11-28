import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    RegisterDataHook,
    GetDataHooks,
    ClearAllDataHooks,
    RegisterPostRunViewProtectedEntity,
    IsPostRunViewProtectedEntity,
    GetPostRunViewProtectedEntities,
    ClearPostRunViewProtectedEntities,
} from '../generic/dataHooks.js';

describe('PostRunView protected entity registry', () => {
    let savedProtected: string[];

    beforeEach(() => {
        savedProtected = Array.from(GetPostRunViewProtectedEntities());
        ClearPostRunViewProtectedEntities();
    });

    afterEach(() => {
        ClearPostRunViewProtectedEntities();
        for (const name of savedProtected) {
            RegisterPostRunViewProtectedEntity(name);
        }
        ClearAllDataHooks();
    });

    it('registers and detects protected entities (exact, trimmed, and case-insensitive)', () => {
        expect(IsPostRunViewProtectedEntity('MJ: Artifact Versions')).toBe(false);

        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');

        expect(IsPostRunViewProtectedEntity('MJ: Artifact Versions')).toBe(true);
        expect(IsPostRunViewProtectedEntity('  mj: artifact versions  ')).toBe(true);
        expect(IsPostRunViewProtectedEntity('MJ: ARTIFACT VERSIONS')).toBe(true);
        expect(IsPostRunViewProtectedEntity('MJ: Accounts')).toBe(false);
    });

    it('ignores empty/whitespace names and deduplicates case-insensitively', () => {
        RegisterPostRunViewProtectedEntity('');
        RegisterPostRunViewProtectedEntity('   ');
        RegisterPostRunViewProtectedEntity('MJ: Artifacts');
        RegisterPostRunViewProtectedEntity('mj: artifacts');
        RegisterPostRunViewProtectedEntity('  MJ: Artifacts  ');

        const registered = GetPostRunViewProtectedEntities();
        expect(registered.size).toBe(1);
        expect(registered.has('MJ: Artifacts')).toBe(true);
    });

    it('returns a defensive snapshot from GetPostRunViewProtectedEntities', () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        const snapshot = GetPostRunViewProtectedEntities();
        expect(snapshot.has('MJ: Artifact Versions')).toBe(true);

        // Mutating a new copy or clearing later should not retroactively corrupt snapshots
        ClearPostRunViewProtectedEntities();
        expect(snapshot.has('MJ: Artifact Versions')).toBe(true);
        expect(GetPostRunViewProtectedEntities().size).toBe(0);
    });

    it('keeps protected entity registrations intact when ClearAllDataHooks is called', () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        RegisterDataHook('PostRunView', () => undefined);
        expect(GetDataHooks('PostRunView').length).toBe(1);

        ClearAllDataHooks();

        expect(GetDataHooks('PostRunView').length).toBe(0);
        expect(IsPostRunViewProtectedEntity('MJ: Artifact Versions')).toBe(true);
        expect(GetPostRunViewProtectedEntities().has('MJ: Artifact Versions')).toBe(true);
    });

    it('clears all protected entities only when ClearPostRunViewProtectedEntities is called', () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifacts');
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        expect(GetPostRunViewProtectedEntities().size).toBe(2);

        ClearPostRunViewProtectedEntities();

        expect(GetPostRunViewProtectedEntities().size).toBe(0);
        expect(IsPostRunViewProtectedEntity('MJ: Artifacts')).toBe(false);
        expect(IsPostRunViewProtectedEntity('MJ: Artifact Versions')).toBe(false);
    });
});
