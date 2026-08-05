import { describe, it, expect } from 'vitest';
import { BaseEngine } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

/**
 * Regression coverage for the duplicate-row bug in BaseEngine's event-driven cache maintenance.
 *
 * `findEntityIndexByPrimaryKeys` locates a cached entity by matching its primary-key values so an
 * 'update' event can be applied IN PLACE. It compared PK values with a raw `===`, which is wrong for
 * UUID columns: the SAME id can arrive with different casing depending on its source — a client-minted
 * LOWERCASE uuid from `BaseEntity.NewRecord` vs. an UPPERCASE value loaded from SQL Server. On a case
 * mismatch `===` returns -1 ("not found"), and the caller's "not found → add it" branch APPENDS a
 * second copy of the row into the engine cache, so every consumer (pickers, dashboards) shows it twice.
 *
 * The fix drives the comparison off metadata (`EntityFieldInfo.IsUniqueIdentifier`, PG-aware) →
 * `UUIDsEqual` for UUID columns, strict `===` for everything else. These tests would FAIL before the
 * fix (case 1) and pin the non-UUID strictness the fix must preserve (cases 3/4).
 *
 * Out of scope (untouched by the fix): the no-PK-metadata fallback branch (`primaryKeys.length === 0`),
 * which has no `EntityFieldInfo` to consult and is not the reported bug.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // no-op — these tests call findIndex() directly
    }
    /** Expose the protected method under test. */
    public findIndex(dataArray: BaseEntity[], target: BaseEntity): number {
        return this.findEntityIndexByPrimaryKeys(dataArray, target);
    }
}

interface PKSpec { Name: string; IsUniqueIdentifier: boolean; }

/** Minimal BaseEntity stand-in: findEntityIndexByPrimaryKeys reads only EntityInfo.PrimaryKeys and e[pk.Name]. */
function makeEntity(pkSpecs: PKSpec[], values: Record<string, unknown>): BaseEntity {
    return {
        EntityInfo: { Name: 'Test', PrimaryKeys: pkSpecs },
        PrimaryKey: { ToString: () => Object.values(values).map(String).join('|') },
        ...values,
    } as unknown as BaseEntity;
}

const UUID_UPPER = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const UUID_LOWER = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UUID_OTHER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const UUID_PK: PKSpec[] = [{ Name: 'ID', IsUniqueIdentifier: true }];

describe('BaseEngine.findEntityIndexByPrimaryKeys — UUID case-insensitive PK match', () => {
    const engine = new TestEngine();

    it('matches a cached UPPERCASE UUID against an incoming LOWERCASE UUID (the duplicate-row bug)', () => {
        const cached = [makeEntity(UUID_PK, { ID: UUID_UPPER })];
        const incoming = makeEntity(UUID_PK, { ID: UUID_LOWER });
        // Pre-fix this returned -1 → caller appended a duplicate. Post-fix it's found at index 0.
        expect(engine.findIndex(cached, incoming)).toBe(0);
    });

    it('matches lowercase-cached against uppercase-incoming (the reverse direction)', () => {
        const cached = [makeEntity(UUID_PK, { ID: UUID_LOWER })];
        expect(engine.findIndex(cached, makeEntity(UUID_PK, { ID: UUID_UPPER }))).toBe(0);
    });

    it('finds the right row among several when only casing differs', () => {
        const cached = [
            makeEntity(UUID_PK, { ID: UUID_OTHER }),
            makeEntity(UUID_PK, { ID: UUID_UPPER }),
        ];
        expect(engine.findIndex(cached, makeEntity(UUID_PK, { ID: UUID_LOWER }))).toBe(1);
    });

    it('still returns -1 for genuinely different UUIDs (case-insensitivity is not over-matching)', () => {
        const cached = [makeEntity(UUID_PK, { ID: UUID_UPPER })];
        expect(engine.findIndex(cached, makeEntity(UUID_PK, { ID: UUID_OTHER }))).toBe(-1);
    });

    it('keeps STRICT case-sensitive equality for non-UUID string PKs', () => {
        // Codes/slugs are case-sensitive; the UUID relaxation must not leak to other string PKs.
        const codePK: PKSpec[] = [{ Name: 'Code', IsUniqueIdentifier: false }];
        const cached = [makeEntity(codePK, { Code: 'ABC' })];
        expect(engine.findIndex(cached, makeEntity(codePK, { Code: 'abc' }))).toBe(-1);
        expect(engine.findIndex(cached, makeEntity(codePK, { Code: 'ABC' }))).toBe(0);
    });

    it('handles a composite PK: UUID column case-insensitive, non-UUID column strict', () => {
        const compositePK: PKSpec[] = [
            { Name: 'ID', IsUniqueIdentifier: true },
            { Name: 'Code', IsUniqueIdentifier: false },
        ];
        const cached = [makeEntity(compositePK, { ID: UUID_UPPER, Code: 'X1' })];
        // UUID differs only in case AND the strict code matches → found.
        expect(engine.findIndex(cached, makeEntity(compositePK, { ID: UUID_LOWER, Code: 'X1' }))).toBe(0);
        // UUID matches (case-insensitive) but the strict code differs → NOT found.
        expect(engine.findIndex(cached, makeEntity(compositePK, { ID: UUID_LOWER, Code: 'x1' }))).toBe(-1);
    });

    it('keeps strict equality for numeric PKs (int identity columns)', () => {
        const intPK: PKSpec[] = [{ Name: 'ID', IsUniqueIdentifier: false }];
        const cached = [makeEntity(intPK, { ID: 42 })];
        expect(engine.findIndex(cached, makeEntity(intPK, { ID: 42 }))).toBe(0);
        expect(engine.findIndex(cached, makeEntity(intPK, { ID: 7 }))).toBe(-1);
    });
});
