import { describe, it, expect } from 'vitest';
import { CloneConfigValidator, CloneConfigEntityMeta } from '../CloneConfigValidator';

describe('CloneConfigValidator', () => {
    const baseEntity: CloneConfigEntityMeta = {
        Name: 'TestEntity',
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
            { Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true },
            { Name: 'ComputedTotal', IsPrimaryKey: false, Type: 'decimal', IsSPParameter: (forUpdate) => false },
            { Name: 'Status', IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true },
            { Name: 'ParentID', IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntity: 'TestEntity', IsSPParameter: () => true },
            { Name: 'UIConfig', IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true },
            { Name: 'NonStringCol', IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true },
        ],
        Relationships: [
            { ID: 'rel-items', Name: 'Items', RelatedEntity: 'TestItem', RelatedEntityJoinField: 'ParentID' },
        ],
        CloneConfiguration: {
            Enabled: true,
        },
    };

    it('reports error on unknown fields in Exclude, Reset, Ownership, PromptFor', () => {
        const entity: CloneConfigEntityMeta = {
            ...baseEntity,
            CloneConfiguration: {
                Enabled: true,
                Fields: {
                    Exclude: ['FakeField1'],
                    Reset: { FakeField2: 'val' },
                    Ownership: ['FakeField3'],
                    PromptFor: ['FakeField4'],
                },
            },
        };

        const errors = CloneConfigValidator.Validate(entity);
        expect(errors).toHaveLength(4);
        expect(errors.every((e) => e.Severity === 'Error')).toBe(true);
        expect(errors.some((e) => e.Message.includes('FakeField1'))).toBe(true);
        expect(errors.some((e) => e.Message.includes('FakeField2'))).toBe(true);
        expect(errors.some((e) => e.Message.includes('FakeField3'))).toBe(true);
        expect(errors.some((e) => e.Message.includes('FakeField4'))).toBe(true);
    });

    it('reports error when PromptFor or ServerAllocated references non-writable field', () => {
        const entity: CloneConfigEntityMeta = {
            ...baseEntity,
            CloneConfiguration: {
                Enabled: true,
                Fields: {
                    PromptFor: ['ComputedTotal'],
                    ServerAllocated: ['ComputedTotal'],
                },
            },
        };

        const errors = CloneConfigValidator.Validate(entity);
        expect(errors).toHaveLength(2);
        expect(errors[0].Message).toContain('not writable on insert');
        expect(errors[1].Message).toContain('not writable on insert');
    });

    it('reports error on unknown relationship key', () => {
        const entity: CloneConfigEntityMeta = {
            ...baseEntity,
            CloneConfiguration: {
                Enabled: true,
                Relationships: {
                    UnknownChildRelationship: { Policy: 'Deep' },
                },
            },
        };

        const errors = CloneConfigValidator.Validate(entity);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain("Relationship key 'UnknownChildRelationship' does not match");
    });

    it('validates caps: MaxDepth and MaxRecords must be positive', () => {
        const entity: CloneConfigEntityMeta = {
            ...baseEntity,
            CloneConfiguration: {
                Enabled: true,
                MaxDepth: 0,
                MaxRecords: -5,
            },
        };

        const errors = CloneConfigValidator.Validate(entity);
        expect(errors).toHaveLength(2);
        expect(errors[0].Message).toContain('MaxDepth must be a positive integer');
        expect(errors[1].Message).toContain('MaxRecords must be a positive integer');
    });

    it('reports error when JsonRemap targets non-string column', () => {
        const entity: CloneConfigEntityMeta = {
            ...baseEntity,
            CloneConfiguration: {
                Enabled: true,
                Fields: {
                    JsonRemap: [
                        { Field: 'NonStringCol', Preset: 'dashboard-ui-config' },
                    ],
                },
            },
        };

        const errors = CloneConfigValidator.Validate(entity);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('JsonRemap requires a string or JSON column');
    });

    it('validates Derivation.Field must be a self-FK', () => {
        const entityNotSelfFk: CloneConfigEntityMeta = {
            ...baseEntity,
            Fields: [
                ...baseEntity.Fields,
                { Name: 'OtherFK', IsPrimaryKey: false, RelatedEntity: 'OtherTable', IsSPParameter: () => true },
            ],
            CloneConfiguration: {
                Enabled: true,
                Derivation: {
                    Field: 'OtherFK',
                },
            },
        };

        const errors = CloneConfigValidator.Validate(entityNotSelfFk);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('must be a self-FK pointing to');
    });

    describe('Strict-Mode Drift Guard (§13.3)', () => {
        it('fails validation when strict mode is enabled and unclassified fields exist', () => {
            const entity: CloneConfigEntityMeta = {
                ...baseEntity,
                CloneConfiguration: {
                    Enabled: true,
                    Fields: {
                        Strict: true,
                        Copy: ['Name'], // Status, ParentID, UIConfig, NonStringCol are unclassified!
                    },
                },
            };

            const errors = CloneConfigValidator.Validate(entity);
            expect(errors).toHaveLength(1);
            expect(errors[0].PropertyPath).toBe('Fields.Strict');
            expect(errors[0].Message).toContain('unclassified fields detected');
            expect(errors[0].Message).toContain('Status');
            expect(errors[0].Message).toContain('ParentID');
        });

        it('passes validation when strict mode is enabled and all fields are classified', () => {
            const entity: CloneConfigEntityMeta = {
                ...baseEntity,
                CloneConfiguration: {
                    Enabled: true,
                    Fields: {
                        Strict: true,
                        Copy: ['Name', 'ParentID'],
                        Reset: { Status: 'Draft' },
                        JsonRemap: [{ Field: 'UIConfig', Preset: 'dashboard-ui-config' }],
                        Exclude: ['NonStringCol'],
                    },
                },
            };

            const errors = CloneConfigValidator.Validate(entity);
            expect(errors).toHaveLength(0);
        });
    });

    describe('structural checks', () => {
        const withConfig = (CloneConfiguration: CloneConfigEntityMeta['CloneConfiguration'], extra: Partial<CloneConfigEntityMeta> = {}) =>
            CloneConfigValidator.Validate({ ...baseEntity, ...extra, CloneConfiguration });

        it('rejects non-integer and non-positive caps', () => {
            const found = withConfig({ Enabled: true, MaxDepth: 2.5, MaxRecords: 0 });
            expect(found.map((e) => e.PropertyPath).sort()).toEqual(['MaxDepth', 'MaxRecords']);
        });

        it('rejects a policy that is not Deep, Reference or Skip, wherever it appears', () => {
            const found = withConfig({
                Enabled: true,
                Relationships: { [baseEntity.Relationships?.[0]?.RelatedEntity ?? 'X']: { Policy: 'Shallow' } },
                Descendants: { Anything: { Policy: 'deep' } },
                Presets: [{ Key: 'p', Label: 'P', Relationships: { Anything: { Policy: 'Maybe' } } }],
            });
            expect(found.filter((e) => e.PropertyPath.endsWith('.Policy')).map((e) => e.PropertyPath)).toHaveLength(3);
        });

        it('rejects a JsonRemap entry with neither Rules nor a Preset, and a rule without Path or Mode', () => {
            const empty = withConfig({ Enabled: true, Fields: { JsonRemap: [{ Field: 'UIConfig' }] } });
            expect(empty.map((e) => e.Message)).toEqual([expect.stringContaining('neither Rules nor a Preset')]);

            const bad = withConfig({ Enabled: true, Fields: { JsonRemap: [{ Field: 'UIConfig', Rules: [{ Path: 'a.b' } as { Path: string; Mode: string }] }] } });
            expect(bad.map((e) => e.PropertyPath)).toEqual(['Fields.JsonRemap[UIConfig].Rules']);
        });

        it('warns, without blocking, on keys this release does not honor', () => {
            const found = withConfig({
                Enabled: true,
                Naming: { Fields: ['Name'] },
                Hooks: { PostCloneAction: 'Notify' },
                Relationships: { Anything: { Policy: 'Deep', PreserveSequence: true } },
            } as CloneConfigEntityMeta['CloneConfiguration']);
            const unhonored = found.filter((e) => e.Message.includes('not honored'));
            expect(unhonored.map((e) => e.PropertyPath)).toEqual(['Naming.Fields', 'Hooks.PostCloneAction', 'Relationships[Anything].PreserveSequence']);
            expect(unhonored.every((e) => e.Severity === 'Warning')).toBe(true);
            const inPreset = withConfig({ Enabled: true, Presets: [{ Key: 'p', Label: 'P', Relationships: { Anything: { Policy: 'Deep', IncludeWhen: 'x' } } }] } as CloneConfigEntityMeta['CloneConfiguration']);
            expect(inPreset.filter((e) => e.Message.includes('not honored')).map((e) => e.PropertyPath)).toEqual(['Presets[p].Relationships[Anything].IncludeWhen']);
        });

        it('refuses prompt naming that leaves a rename field neither prompted nor set by a rule', () => {
            const users = (fields: Partial<NonNullable<CloneConfigEntityMeta['CloneConfiguration']>['Fields']>) =>
                CloneConfigValidator.Validate({
                    ...baseEntity,
                    Fields: [
                        { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
                        { Name: 'Name', IsPrimaryKey: false, IsNameField: true, Type: 'nvarchar' },
                        { Name: 'Email', IsPrimaryKey: false, IsUnique: true, Type: 'nvarchar' },
                    ],
                    CloneConfiguration: { Enabled: true, Naming: { Strategy: 'prompt' }, Fields: fields } as CloneConfigEntityMeta['CloneConfiguration'],
                }).filter((e) => e.PropertyPath === 'Naming.Strategy');

            expect(users({ PromptFor: ['Email'] }).map((e) => e.Message)).toEqual([expect.stringContaining("'Name'")]);
            expect(users({ PromptFor: ['Email'], Rules: { Rules: [{ TargetField: 'Name' }] } })).toEqual([]);
        });

        it('warns that PromptFor under Descendants is not prompted', () => {
            const found = withConfig({ Enabled: true, Descendants: { Child: { Fields: { PromptFor: ['Code'] } } } } as CloneConfigEntityMeta['CloneConfiguration']);
            expect(found.filter((e) => e.PropertyPath === 'Descendants[Child].Fields.PromptFor').map((e) => e.Severity)).toEqual(['Warning']);
        });

        it('reports a JsonRemap entry without a Field instead of throwing', () => {
            const found = withConfig({ Enabled: true, Fields: { JsonRemap: [{} as never], Strict: true } });
            expect(found.some((e) => e.PropertyPath === 'Fields.JsonRemap')).toBe(true);
        });

        it('accepts qualified keys and FK targets, warns for a qualified key reached further down, and refuses a bare one', () => {
            const entity: CloneConfigEntityMeta = {
                Name: 'Orders',
                Fields: [{ Name: 'ID', IsPrimaryKey: true }, { Name: 'CustomerID', IsPrimaryKey: false, RelatedEntity: 'Customers' }],
                Relationships: [{ RelatedEntity: 'Order Lines', RelatedEntityJoinField: 'OrderID' }],
                CloneConfiguration: {
                    Enabled: true,
                    Relationships: {
                        'Order Lines.OrderID': { Policy: 'Deep' },
                        Customers: { Policy: 'Reference' },
                        'Line Notes.LineID': { Policy: 'Skip' },
                        'Line Notes': { Policy: 'Skip' },
                        Nonsense: { Policy: 'Skip' },
                    },
                },
            };
            const all = [entity, { Name: 'Order Lines', Fields: [] }, { Name: 'Customers', Fields: [] }, { Name: 'Line Notes', Fields: [] }] as CloneConfigEntityMeta[];
            const found = CloneConfigValidator.Validate(entity, all);
            expect(found.map((e) => [e.PropertyPath, e.Severity])).toEqual([
                ['Relationships[Line Notes.LineID]', 'Warning'],
                // A bare key applies only to the root's own relationships, so this one matches nothing.
                ['Relationships[Line Notes]', 'Error'],
                ['Relationships[Nonsense]', 'Error'],
            ]);
        });
    });
});
