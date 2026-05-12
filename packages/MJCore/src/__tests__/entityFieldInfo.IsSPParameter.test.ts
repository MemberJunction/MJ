/**
 * EntityFieldInfo.IsSPParameter Tests
 *
 * Locks in the contract that decides whether a field appears as a parameter
 * in the entity's spCreate / spUpdate stored procedure. Both CodeGen (when
 * emitting the SP body) and the runtime data providers (when building the
 * EXEC argument list) call this predicate, so it MUST stay symmetric — drift
 * between the SP signature and the EXEC argument list produces "Procedure or
 * function has too many/few arguments specified" errors at save time.
 *
 * Coverage matrix:
 *
 *   • View-only virtual fields (joined display names, denormalized lookups)
 *     → excluded from BOTH spCreate and spUpdate
 *   • SQL Server computed / PostgreSQL generated columns
 *     → excluded from BOTH (defense in depth: today IsComputed implies
 *       IsVirtual=1, but the predicate must hold if those flags decouple)
 *   • IS-A parent fields on a child entity (IsVirtual=1, AllowUpdateAPI=1)
 *     → excluded from the CHILD's SPs (saved separately via _parentEntity.Save)
 *   • Special date fields (__mj_CreatedAt, __mj_UpdatedAt, __mj_DeletedAt)
 *     → excluded (set by SP / trigger, never by caller)
 *   • Primary keys
 *     → always included on update
 *     → included on create UNLESS auto-increment (auto-incr PK isn't in the
 *       SP signature at all; the DB assigns it)
 *   • Regular columns
 *     → governed by AllowUpdateAPI
 */

import { describe, it, expect } from 'vitest';
import { EntityFieldInfo } from '../generic/entityInfo';

/**
 * Builds an EntityFieldInfo with sensible defaults plus the provided overrides.
 * Keeps the per-test setup focused on the flags under test instead of
 * boilerplate every time.
 */
function makeField(overrides: Partial<{
    Name: string;
    IsPrimaryKey: boolean;
    AutoIncrement: boolean;
    IsVirtual: boolean;
    IsComputed: boolean;
    AllowUpdateAPI: boolean;
    Type: string;
}>): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: 'f-test',
        EntityID: 'ent-test',
        Name: overrides.Name ?? 'SomeField',
        Type: overrides.Type ?? 'nvarchar',
        Sequence: 1,
        Status: 'Active',
        IsPrimaryKey: overrides.IsPrimaryKey ?? false,
        AutoIncrement: overrides.AutoIncrement ?? false,
        IsVirtual: overrides.IsVirtual ?? false,
        IsComputed: overrides.IsComputed ?? false,
        AllowUpdateAPI: overrides.AllowUpdateAPI ?? true,
    });
}

describe('EntityFieldInfo.IsSPParameter', () => {
    describe('Virtual fields (view-only joined columns)', () => {
        it('excludes IsVirtual=1 from spCreate', () => {
            const f = makeField({ IsVirtual: true, AllowUpdateAPI: false });
            expect(f.IsSPParameter(false)).toBe(false);
        });

        it('excludes IsVirtual=1 from spUpdate', () => {
            const f = makeField({ IsVirtual: true, AllowUpdateAPI: false });
            expect(f.IsSPParameter(true)).toBe(false);
        });

        it('excludes IsVirtual=1 even when AllowUpdateAPI=1 (IS-A parent field case)', () => {
            // IS-A parent fields on a child entity carry IsVirtual=1 AND
            // AllowUpdateAPI=1 (editable via the parent save chain). The CHILD's
            // SP must not list them as parameters — they go to the parent's SP
            // when BaseEntity.Save() recursively saves the _parentEntity.
            const f = makeField({ IsVirtual: true, AllowUpdateAPI: true });
            expect(f.IsSPParameter(false)).toBe(false);
            expect(f.IsSPParameter(true)).toBe(false);
        });
    });

    describe('Computed / generated columns', () => {
        it('excludes IsComputed=1 from spCreate', () => {
            const f = makeField({ IsComputed: true });
            expect(f.IsSPParameter(false)).toBe(false);
        });

        it('excludes IsComputed=1 from spUpdate', () => {
            const f = makeField({ IsComputed: true });
            expect(f.IsSPParameter(true)).toBe(false);
        });

        it('excludes IsComputed=1 even with IsVirtual=0 (defense for future decoupling)', () => {
            // Today IsComputed=1 implies IsVirtual=1 (per the PR that introduced
            // IsComputed). If those flags ever decouple — e.g. a true on-disk
            // computed column that isn't view-only — the predicate must still
            // refuse to include it as an SP parameter because INSERT/UPDATE
            // cannot target a computed column at the SQL layer.
            const f = makeField({ IsVirtual: false, IsComputed: true });
            expect(f.IsSPParameter(false)).toBe(false);
            expect(f.IsSPParameter(true)).toBe(false);
        });
    });

    describe('Special date fields', () => {
        it('excludes __mj_CreatedAt from spCreate', () => {
            // The SP body sets this from GETUTCDATE() — caller must not pass it.
            const f = makeField({ Name: '__mj_CreatedAt', Type: 'datetimeoffset' });
            expect(f.IsSPParameter(false)).toBe(false);
        });

        it('excludes __mj_UpdatedAt from spUpdate', () => {
            // Same as above — the SP body / trigger refreshes this; caller must not.
            const f = makeField({ Name: '__mj_UpdatedAt', Type: 'datetimeoffset' });
            expect(f.IsSPParameter(true)).toBe(false);
        });

        it('excludes __mj_DeletedAt (soft-delete tombstone)', () => {
            const f = makeField({ Name: '__mj_DeletedAt', Type: 'datetimeoffset' });
            expect(f.IsSPParameter(false)).toBe(false);
            expect(f.IsSPParameter(true)).toBe(false);
        });
    });

    describe('Primary keys', () => {
        it('includes non-auto-increment PK on spCreate (SP declares with default; caller may override)', () => {
            const f = makeField({
                Name: 'ID',
                IsPrimaryKey: true,
                AutoIncrement: false,
                AllowUpdateAPI: false,
                Type: 'uniqueidentifier',
            });
            expect(f.IsSPParameter(false)).toBe(true);
        });

        it('excludes auto-increment PK on spCreate (DB assigns)', () => {
            // The SP body doesn't expose @ID for auto-increment PKs — the
            // database supplies the value via IDENTITY / SEQUENCE.
            const f = makeField({
                Name: 'ID',
                IsPrimaryKey: true,
                AutoIncrement: true,
                AllowUpdateAPI: false,
                Type: 'int',
            });
            expect(f.IsSPParameter(false)).toBe(false);
        });

        it('includes PK on spUpdate regardless of AutoIncrement (needed to identify row)', () => {
            const f1 = makeField({
                Name: 'ID', IsPrimaryKey: true, AutoIncrement: false,
                AllowUpdateAPI: false, Type: 'uniqueidentifier',
            });
            const f2 = makeField({
                Name: 'ID', IsPrimaryKey: true, AutoIncrement: true,
                AllowUpdateAPI: false, Type: 'int',
            });
            expect(f1.IsSPParameter(true)).toBe(true);
            expect(f2.IsSPParameter(true)).toBe(true);
        });
    });

    describe('Non-PK regular columns', () => {
        it('includes when AllowUpdateAPI=1', () => {
            const f = makeField({ AllowUpdateAPI: true });
            expect(f.IsSPParameter(false)).toBe(true);
            expect(f.IsSPParameter(true)).toBe(true);
        });

        it('excludes when AllowUpdateAPI=0', () => {
            const f = makeField({ AllowUpdateAPI: false });
            expect(f.IsSPParameter(false)).toBe(false);
            expect(f.IsSPParameter(true)).toBe(false);
        });
    });

    describe('Regression: virtual-field leak into SP call', () => {
        it('Artifact-Version-style virtual fields (Artifact, User, File) are excluded', () => {
            // Reproduces the regression that motivated IsSPParameter: virtual
            // columns from the entity's vw* view (Artifact, User, File on
            // MJ: Artifact Versions) leaking into the EXEC arg list for
            // spCreateArtifactVersion, triggering SQL Server's "too many
            // arguments specified" error. The predicate must exclude them
            // unconditionally — independent of whatever AllowUpdateAPI happens
            // to be set to.
            const artifactName = makeField({ Name: 'Artifact', IsVirtual: true, AllowUpdateAPI: false });
            const userName     = makeField({ Name: 'User',     IsVirtual: true, AllowUpdateAPI: false });
            const fileName     = makeField({ Name: 'File',     IsVirtual: true, AllowUpdateAPI: false });

            for (const f of [artifactName, userName, fileName]) {
                expect(f.IsSPParameter(false)).toBe(false);
                expect(f.IsSPParameter(true)).toBe(false);
            }
        });
    });
});
