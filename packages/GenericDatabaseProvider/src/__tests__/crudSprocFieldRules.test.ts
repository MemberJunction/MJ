import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import {
    shouldIncludeFieldInParams,
    needsClearCompanionBroadRule,
    projectedParamCount,
    useJsonArgShape,
    CRUDSprocType,
} from '../crudSprocFieldRules';

/**
 * Synthetic field-info builder. Sets only the properties the rules read,
 * leaves everything else undefined — the rules under test don't touch
 * those, and pinning them down would tie the tests to unrelated EntityFieldInfo
 * surface that's outside the contract we care about here.
 */
function field(overrides: Partial<EntityFieldInfo>): EntityFieldInfo {
    return {
        Name: 'Synthetic',
        IsVirtual: false,
        IsSpecialDateField: false,
        IsPrimaryKey: false,
        AutoIncrement: false,
        AllowsNull: true,
        AllowUpdateAPI: true,
        ...overrides,
    } as EntityFieldInfo;
}

function entity(fields: EntityFieldInfo[]): EntityInfo {
    return { Name: 'Synthetic', Fields: fields } as EntityInfo;
}

describe('crudSprocFieldRules', () => {
    describe('shouldIncludeFieldInParams', () => {
        const cases: { name: string; field: Partial<EntityFieldInfo>; expectedByVerb: Record<CRUDSprocType, boolean> }[] = [
            {
                name: 'virtual field',
                field: { IsVirtual: true, IsPrimaryKey: false, AllowUpdateAPI: true },
                expectedByVerb: { create: false, update: false, delete: false },
            },
            {
                name: 'special-date field (e.g. __mj_CreatedAt)',
                field: { IsSpecialDateField: true, AllowUpdateAPI: true },
                expectedByVerb: { create: false, update: false, delete: false },
            },
            {
                name: 'primary key, non-auto-increment',
                field: { IsPrimaryKey: true, AutoIncrement: false },
                expectedByVerb: { create: true, update: true, delete: true },
            },
            {
                name: 'primary key, auto-increment',
                field: { IsPrimaryKey: true, AutoIncrement: true },
                // create: excluded — DB supplies the PK; update: included; delete: included.
                expectedByVerb: { create: false, update: true, delete: true },
            },
            {
                name: 'non-PK with AllowUpdateAPI = true',
                field: { IsPrimaryKey: false, AllowUpdateAPI: true },
                // delete only takes PKs.
                expectedByVerb: { create: true, update: true, delete: false },
            },
            {
                name: 'non-PK with AllowUpdateAPI = false',
                field: { IsPrimaryKey: false, AllowUpdateAPI: false },
                expectedByVerb: { create: false, update: false, delete: false },
            },
        ];

        for (const c of cases) {
            for (const verb of ['create', 'update', 'delete'] as CRUDSprocType[]) {
                it(`${c.name} → ${verb}: ${c.expectedByVerb[verb]}`, () => {
                    expect(shouldIncludeFieldInParams(field(c.field), verb)).toBe(c.expectedByVerb[verb]);
                });
            }
        }
    });

    describe('needsClearCompanionBroadRule', () => {
        it('returns true for nullable field', () => {
            expect(needsClearCompanionBroadRule(field({ AllowsNull: true }))).toBe(true);
        });

        it('returns false for NOT NULL field', () => {
            expect(needsClearCompanionBroadRule(field({ AllowsNull: false }))).toBe(false);
        });

        it('does NOT depend on HasDefaultValue (broad rule)', () => {
            // Narrow rule (the PG override being phased out) returns false here;
            // broad rule must return true regardless of default state.
            expect(needsClearCompanionBroadRule(field({ AllowsNull: true, HasDefaultValue: false } as Partial<EntityFieldInfo>))).toBe(true);
            expect(needsClearCompanionBroadRule(field({ AllowsNull: true, HasDefaultValue: true } as Partial<EntityFieldInfo>))).toBe(true);
        });
    });

    describe('projectedParamCount', () => {
        it('counts only PKs for delete (no _Clear companions)', () => {
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false }),
                field({ Name: 'Name', IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true }),
                field({ Name: 'Description', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true }),
            ]);
            expect(projectedParamCount(e, 'delete')).toBe(1);
        });

        it('counts base fields + _Clear companions for nullable non-PK fields on update', () => {
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false }),
                field({ Name: 'NotNullCol', IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true }),
                field({ Name: 'NullableCol1', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: 'NullableCol2', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true }),
            ]);
            // 4 base fields included (PK + non-null + 2 nullable) + 2 _Clear companions for the nullables.
            expect(projectedParamCount(e, 'update')).toBe(6);
        });

        it('does not emit _Clear companions for PK fields even when AllowsNull is true', () => {
            // Defensive case: PKs should never be nullable in practice, but if metadata
            // claims they are, the predicate must not emit a _Clear for the PK.
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: true }),
                field({ Name: 'OtherNullable', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true }),
            ]);
            // 2 base + 1 _Clear (only the non-PK nullable).
            expect(projectedParamCount(e, 'update')).toBe(3);
        });

        it('excludes virtual and special-date fields from base count and _Clear count', () => {
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false }),
                field({ Name: 'VirtualCol', IsVirtual: true, AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: '__mj_CreatedAt', IsSpecialDateField: true, AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: 'RealCol', AllowsNull: true, AllowUpdateAPI: true }),
            ]);
            // Only ID + RealCol included; RealCol contributes 1 base + 1 _Clear.
            expect(projectedParamCount(e, 'update')).toBe(3);
        });

        it('excludes auto-increment PK on create but includes on update', () => {
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AutoIncrement: true, AllowsNull: false }),
                field({ Name: 'Name', AllowsNull: false, AllowUpdateAPI: true }),
            ]);
            expect(projectedParamCount(e, 'create')).toBe(1); // just Name; PK excluded
            expect(projectedParamCount(e, 'update')).toBe(2); // ID + Name
        });
    });

    describe('useJsonArgShape', () => {
        it('returns false when limit is Infinity (SQL Server case)', () => {
            // Build an entity well past 100 args to confirm Infinity short-circuits.
            const fields: EntityFieldInfo[] = [field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false })];
            for (let i = 0; i < 200; i++) {
                fields.push(field({ Name: `Col${i}`, AllowsNull: true, AllowUpdateAPI: true }));
            }
            const e = entity(fields);
            expect(useJsonArgShape(e, 'update', Infinity)).toBe(false);
        });

        it('returns true when projected count meets the limit exactly', () => {
            // 5 base fields + 4 _Clear companions = 9 args projected; limit 9 → at the threshold.
            const e = entity([
                field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false }),
                field({ Name: 'A', AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: 'B', AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: 'C', AllowsNull: true, AllowUpdateAPI: true }),
                field({ Name: 'D', AllowsNull: true, AllowUpdateAPI: true }),
            ]);
            expect(projectedParamCount(e, 'update')).toBe(9);
            expect(useJsonArgShape(e, 'update', 9)).toBe(true);
            expect(useJsonArgShape(e, 'update', 10)).toBe(false);
        });

        it('spDelete never busts a realistic limit', () => {
            // Even an entity with 300 nullable cols delete-projects to 1 (just the PK).
            const fields: EntityFieldInfo[] = [field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false })];
            for (let i = 0; i < 300; i++) {
                fields.push(field({ Name: `Col${i}`, AllowsNull: true, AllowUpdateAPI: true }));
            }
            const e = entity(fields);
            expect(useJsonArgShape(e, 'delete', 90)).toBe(false);
            expect(projectedParamCount(e, 'delete')).toBe(1);
        });

        it('models the AIPromptRun-shaped wide entity (busts PG limit, not SS limit)', () => {
            // 99 columns total: 1 PK (non-null), 17 non-null non-PK, 81 nullable non-PK.
            // Broad rule: 99 base + 81 _Clear = 180 projected.
            const fields: EntityFieldInfo[] = [field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false })];
            for (let i = 0; i < 17; i++) {
                fields.push(field({ Name: `NotNull${i}`, AllowsNull: false, AllowUpdateAPI: true }));
            }
            for (let i = 0; i < 81; i++) {
                fields.push(field({ Name: `Nullable${i}`, AllowsNull: true, AllowUpdateAPI: true }));
            }
            const e = entity(fields);
            expect(projectedParamCount(e, 'update')).toBe(180);
            expect(useJsonArgShape(e, 'update', 90)).toBe(true); // PG → JSON-arg
            expect(useJsonArgShape(e, 'update', Infinity)).toBe(false); // SS → typed-arg
        });

        it('models the ScheduledJob-shaped narrow entity (stays typed-arg on PG)', () => {
            // 31 columns total: 1 PK, 16 non-null non-PK, 14 nullable non-PK.
            // Broad rule: 31 base + 14 _Clear = 45 projected.
            const fields: EntityFieldInfo[] = [field({ Name: 'ID', IsPrimaryKey: true, AllowsNull: false })];
            for (let i = 0; i < 16; i++) {
                fields.push(field({ Name: `NotNull${i}`, AllowsNull: false, AllowUpdateAPI: true }));
            }
            for (let i = 0; i < 14; i++) {
                fields.push(field({ Name: `Nullable${i}`, AllowsNull: true, AllowUpdateAPI: true }));
            }
            const e = entity(fields);
            expect(projectedParamCount(e, 'update')).toBe(45);
            expect(useJsonArgShape(e, 'update', 90)).toBe(false); // PG → typed-arg with broad-rule _Clear
        });
    });
});
