/**
 * EntitySubClassGeneratorBase — related-record collection emission.
 *
 * CodeGen turns `EntityRelationship.RelatedRecordCollection` (a JSON policy object) plus the row's
 * own `RelatedEntity` / `RelatedEntityJoinField` columns into a `DeclareRelatedRecords(...)`
 * declaration on the generated entity subclass.
 *
 * WHAT THESE TESTS PROTECT
 *
 * 1. **Nothing is emitted unless opted in.** Every existing relationship has a NULL column, and the
 *    generated output for those entities must be byte-identical to before this feature.
 * 2. **The two column-backed values win.** `RelatedEntity` and `RelatedEntityJoinField` come from
 *    the row, never the JSON — duplicating them would create two sources of truth with the JSON
 *    copy silently winning.
 * 3. **Bad metadata is skipped, not fatal, and never emits uncompilable code.** A single malformed
 *    row must not abort a CodeGen run and leave the repo with no generated entities at all. A `Name`
 *    that isn't a valid identifier, or a duplicate one, would produce a TypeScript error inside a
 *    100k-line generated file — a miserable thing to diagnose, so it is refused where the offending
 *    row can be named.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    EntityFieldInfo: class {},
    EntityRelationshipInfo: class {},
    EntityFieldValueListType: { None: 'None', List: 'List', ListOrUserEntry: 'ListOrUserEntry' },
    EntityInfo: class {},
    Metadata: vi.fn(),
    TypeScriptTypeFromSQLType: vi.fn(() => 'string'),
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, default: { ...actual, existsSync: vi.fn().mockReturnValue(true) } };
});

vi.mock('mssql', () => ({ default: {} }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));
vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class { static generatedValidators: unknown[] = []; },
}));
vi.mock('../Config/config', () => ({ mj_core_schema: '__mj', configInfo: {} }));
vi.mock('./sql_logging', () => ({ SQLLogging: class {} }));
vi.mock('../Misc/util', () => ({
    makeDir: vi.fn(),
    sortBySequenceAndCreatedAt: vi.fn((items: unknown[]) => [...items]),
}));

import { EntitySubClassGeneratorBase, RelatedRecordCollectionConfig } from '../Misc/entity_subclasses_codegen';
import { logError } from '../Misc/status_logging';
import type { EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';

/** Builds a relationship row, defaulting to a valid one-to-many with a collection declared. */
function makeRelationship(overrides: Record<string, unknown> = {}): EntityRelationshipInfo {
    return {
        RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
        RelatedEntityJoinField: 'OrderHeaderID',
        RelatedEntityClassName: 'OrderLine',
        Type: 'One To Many',
        RelatedRecordCollection: JSON.stringify({ Name: 'Lines' }),
        ...overrides,
    } as unknown as EntityRelationshipInfo;
}

/** Builds an entity carrying the supplied relationships. */
function makeEntity(relationships: EntityRelationshipInfo[]): EntityInfo {
    return { Name: 'MJ_BizApps_Orders: Orders', RelatedEntities: relationships } as unknown as EntityInfo;
}

/** Convenience: a relationship whose config is the given object. */
function withConfig(config: Partial<RelatedRecordCollectionConfig>, overrides: Record<string, unknown> = {}) {
    return makeRelationship({ RelatedRecordCollection: JSON.stringify(config), ...overrides });
}

beforeEach(() => {
    vi.mocked(logError).mockClear();
});

describe('GenerateRelatedRecordCollections — opt-in', () => {
    it('emits nothing when the entity has no relationships at all', () => {
        expect(EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([]))).toBe('');
    });

    it('emits nothing when RelatedRecordCollection is null — the default for every existing row', () => {
        const entity = makeEntity([makeRelationship({ RelatedRecordCollection: null })]);
        expect(EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity)).toBe('');
    });

    it('emits nothing when RelatedRecordCollection is whitespace', () => {
        const entity = makeEntity([makeRelationship({ RelatedRecordCollection: '   ' })]);
        expect(EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity)).toBe('');
    });

    it('tolerates a null RelatedEntities array', () => {
        const entity = { Name: 'X', RelatedEntities: null } as unknown as EntityInfo;
        expect(EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity)).toBe('');
    });
});

describe('GenerateRelatedRecordCollections — emission', () => {
    it('emits a typed readonly declaration using the related entity class name', () => {
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([makeRelationship()]));

        expect(out).toContain('public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({');
        expect(out).toContain("Name: 'Lines'");
    });

    it('appends the Entity suffix — RelatedEntityClassName is the BASE name, not the generated class', () => {
        // Regression. `EntityRelationship.RelatedEntityClassName` holds the base name (`MJActionParam`),
        // while the class this generator emits alongside is `${ClassName}Entity` (`MJActionParamEntity`).
        // Emitting the bare name produced a 100k-line file that could not compile —
        // `Cannot find name 'MJActionParam'` — for all eight core collections at once. The original
        // fixture hid it by pre-suffixing the input, which real metadata never does.
        const relationship = makeRelationship({ RelatedEntityClassName: 'MJActionParam' });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain('this.DeclareRelatedRecords<MJActionParamEntity>({');
        expect(out).not.toContain('DeclareRelatedRecords<MJActionParam>(');
    });

    it('takes RelatedEntity and RelatedEntityJoinField from the ROW, not the JSON', () => {
        // The JSON tries to override both. The row must win — otherwise the blob becomes a second,
        // silently-authoritative source of truth for values that already have columns.
        const relationship = withConfig({
            Name: 'Lines',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...({ RelatedEntity: 'WRONG: Entity', RelatedEntityJoinField: 'WrongField' } as any),
        });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain("RelatedEntity: 'MJ_BizApps_Orders: Order Lines'");
        expect(out).toContain("RelatedEntityJoinField: 'OrderHeaderID'");
        expect(out).not.toContain('WRONG: Entity');
        expect(out).not.toContain('WrongField');
    });

    it('omits optional properties that were not supplied, so defaults come from the runtime', () => {
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([makeRelationship()]));

        expect(out).not.toContain('Load:');
        expect(out).not.toContain('OnRemove:');
        expect(out).not.toContain('OrderBy:');
        expect(out).not.toContain('Sequence:');
        expect(out).not.toContain('ClearAfterSave:');
    });

    it('emits every supplied option', () => {
        const relationship = withConfig({
            Name: 'Lines',
            OrderBy: 'LineNumber ASC',
            Load: 'eager',
            OnRemove: 'orphan',
            Sequence: { Field: 'LineNumber', From: 5 },
            ClearAfterSave: true,
        });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain("OrderBy: 'LineNumber ASC'");
        expect(out).toContain("Load: 'eager'");
        expect(out).toContain("OnRemove: 'orphan'");
        expect(out).toContain("Sequence: { Field: 'LineNumber', From: 5 }");
        expect(out).toContain('ClearAfterSave: true');
    });

    it('defaults Sequence.From to 1 when omitted', () => {
        const relationship = withConfig({ Name: 'Lines', Sequence: { Field: 'LineNumber' } });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain("Sequence: { Field: 'LineNumber', From: 1 }");
    });

    it('omits ClearAfterSave when explicitly false rather than emitting a redundant default', () => {
        const relationship = withConfig({ Name: 'Lines', ClearAfterSave: false });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).not.toContain('ClearAfterSave');
    });

    it('falls back to BaseEntity when the related entity has no generated class name', () => {
        // Untyped is a worse developer experience; a build break is worse still.
        const relationship = makeRelationship({ RelatedEntityClassName: null });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain('this.DeclareRelatedRecords<BaseEntity>({');
    });

    it('escapes single quotes so an apostrophe in an entity name cannot break the literal', () => {
        const relationship = makeRelationship({ RelatedEntity: "Bob's Lines" });
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));

        expect(out).toContain("RelatedEntity: 'Bob\\'s Lines'");
    });

    it('emits one declaration per declared relationship', () => {
        const entity = makeEntity([
            withConfig({ Name: 'Lines' }),
            withConfig({ Name: 'Charges' }, {
                RelatedEntity: 'MJ_BizApps_Orders: Order Charges',
                RelatedEntityJoinField: 'OrderHeaderID',
                RelatedEntityClassName: 'OrderCharge',
            }),
        ]);
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity);

        expect(out).toContain('public readonly Lines =');
        expect(out).toContain('public readonly Charges =');
    });

    it('points the reader at the metadata row rather than the generated file', () => {
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([makeRelationship()]));
        expect(out).toContain('edit that row, not this file');
    });
});

describe('GenerateRelatedRecordCollections — invalid metadata is skipped, never fatal', () => {
    /** Asserts the entity produced no output and exactly one error was logged. */
    function expectSkipped(relationship: EntityRelationshipInfo, messageFragment: string) {
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(makeEntity([relationship]));
        expect(out).toBe('');
        expect(vi.mocked(logError)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(logError).mock.calls[0][0]).toContain(messageFragment);
    }

    it('skips malformed JSON', () => {
        expectSkipped(makeRelationship({ RelatedRecordCollection: '{ not json' }), 'not valid JSON');
    });

    it('skips a JSON array', () => {
        expectSkipped(makeRelationship({ RelatedRecordCollection: '[]' }), 'expected a JSON object');
    });

    it('skips a config with no Name', () => {
        expectSkipped(withConfig({ OrderBy: 'X' } as Partial<RelatedRecordCollectionConfig>), "'Name' is required");
    });

    it('skips a Name that is not a valid TypeScript identifier', () => {
        // Would emit `public readonly Order Lines = ...` — a syntax error in the generated file.
        expectSkipped(withConfig({ Name: 'Order Lines' }), 'not a valid TypeScript identifier');
    });

    it('skips a relationship with no join field, since related records cannot be filtered', () => {
        expectSkipped(makeRelationship({ RelatedEntityJoinField: '' }), 'no RelatedEntityJoinField');
    });

    it('skips a many-to-many relationship', () => {
        // No single owning FK, so stamp-the-key and delete-orphans semantics do not apply.
        expectSkipped(makeRelationship({ Type: 'Many To Many' }), "only 'One To Many'");
    });

    it('skips an invalid Load mode', () => {
        expectSkipped(withConfig({ Name: 'Lines', Load: 'sometimes' as never }), 'invalid Load');
    });

    it('skips an invalid OnRemove mode', () => {
        expectSkipped(withConfig({ Name: 'Lines', OnRemove: 'maybe' as never }), 'invalid OnRemove');
    });

    it('skips a Sequence with no Field', () => {
        expectSkipped(withConfig({ Name: 'Lines', Sequence: {} as never }), "Sequence requires a 'Field'");
    });

    it('skips a duplicate collection name but keeps the first', () => {
        const entity = makeEntity([
            withConfig({ Name: 'Lines' }),
            withConfig({ Name: 'Lines' }, { RelatedEntity: 'Other: Lines' }),
        ]);
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity);

        // Exactly one declaration — a second identical member would not compile.
        expect(out.match(/public readonly Lines =/g)).toHaveLength(1);
        expect(vi.mocked(logError).mock.calls[0][0]).toContain('duplicate collection name');
    });

    it('treats duplicate names case-insensitively', () => {
        const entity = makeEntity([
            withConfig({ Name: 'Lines' }),
            withConfig({ Name: 'lines' }, { RelatedEntity: 'Other: Lines' }),
        ]);
        EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity);
        expect(vi.mocked(logError).mock.calls[0][0]).toContain('duplicate collection name');
    });

    it('still emits the valid declarations when a sibling is invalid', () => {
        // One bad row must not cost the whole entity its collections.
        const entity = makeEntity([
            makeRelationship({ RelatedRecordCollection: '{ broken' }),
            withConfig({ Name: 'Charges' }, {
                RelatedEntity: 'MJ_BizApps_Orders: Order Charges',
                RelatedEntityClassName: 'OrderCharge',
            }),
        ]);
        const out = EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(entity);

        expect(out).toContain('public readonly Charges =');
        expect(vi.mocked(logError)).toHaveBeenCalledTimes(1);
    });

    it('names the entity and related entity in every error so the row can be found', () => {
        EntitySubClassGeneratorBase.GenerateRelatedRecordCollections(
            makeEntity([makeRelationship({ RelatedRecordCollection: '{ broken' })]),
        );
        const message = vi.mocked(logError).mock.calls[0][0] as string;
        expect(message).toContain('MJ_BizApps_Orders: Orders');
        expect(message).toContain('MJ_BizApps_Orders: Order Lines');
    });
});

describe('ParseRelatedRecordCollectionConfig', () => {
    it('returns the parsed config for a valid row', () => {
        const config = EntitySubClassGeneratorBase.ParseRelatedRecordCollectionConfig(
            makeEntity([]),
            withConfig({ Name: 'Lines', Load: 'never' }),
        );
        expect(config).toEqual({ Name: 'Lines', Load: 'never' });
    });

    it('accepts all three Load modes and all three OnRemove modes', () => {
        for (const Load of ['explicit', 'eager', 'never'] as const) {
            expect(
                EntitySubClassGeneratorBase.ParseRelatedRecordCollectionConfig(
                    makeEntity([]), withConfig({ Name: 'Lines', Load }),
                ),
            ).not.toBeNull();
        }
        for (const OnRemove of ['delete', 'orphan', 'refuse'] as const) {
            expect(
                EntitySubClassGeneratorBase.ParseRelatedRecordCollectionConfig(
                    makeEntity([]), withConfig({ Name: 'Lines', OnRemove }),
                ),
            ).not.toBeNull();
        }
    });

    it('accepts a relationship with no Type set rather than assuming many-to-many', () => {
        const config = EntitySubClassGeneratorBase.ParseRelatedRecordCollectionConfig(
            makeEntity([]),
            makeRelationship({ Type: null }),
        );
        expect(config).not.toBeNull();
    });
});
