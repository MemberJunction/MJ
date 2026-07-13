import { describe, it, expect } from 'vitest';
import { EnrichSchemaConstraints } from '../EnrichSchemaConstraints.js';
import type { SourceObjectInfo, SourceFieldInfo } from '../types.js';

const field = (name: string, over: Partial<SourceFieldInfo> = {}): SourceFieldInfo => ({
    Name: name, Label: name, SourceType: 'string', IsRequired: false,
    MaxLength: null, Precision: null, Scale: null, DefaultValue: null,
    IsPrimaryKey: false, IsForeignKey: false, ForeignKeyTarget: null, ...over,
});

const obj = (ExternalName: string, fields: SourceFieldInfo[], pk: string[] = ['id']): SourceObjectInfo => ({
    ExternalName, ExternalLabel: ExternalName, Fields: fields, PrimaryKeyFields: pk, Relationships: [],
});

describe('EnrichSchemaConstraints.InferForeignKeys', () => {
    it('infers <Sibling>Id → sibling object (singular/plural aware) and records the relationship', () => {
        const objects = [
            obj('companies', [field('id', { IsPrimaryKey: true }), field('name')]),
            obj('contacts', [field('id', { IsPrimaryKey: true }), field('CompanyId')]),
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(1);
        const fk = objects[1].Fields.find(f => f.Name === 'CompanyId')!;
        expect(fk.IsForeignKey).toBe(true);
        expect(fk.ForeignKeyTarget).toBe('companies');
        expect(objects[1].Relationships).toEqual([{ FieldName: 'CompanyId', TargetObject: 'companies', TargetField: 'id' }]);
    });

    it('infers a field whose name equals a sibling PK field name', () => {
        const objects = [
            obj('members', [field('ProfileID', { IsPrimaryKey: true })], ['ProfileID']),
            obj('events', [field('id', { IsPrimaryKey: true }), field('ProfileID')]),
        ];
        EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(objects[1].Fields.find(f => f.Name === 'ProfileID')!.ForeignKeyTarget).toBe('members');
    });

    it('does NOT overwrite a source-declared FK', () => {
        const objects = [
            obj('companies', [field('id', { IsPrimaryKey: true })]),
            obj('contacts', [field('CompanyId', { IsForeignKey: true, ForeignKeyTarget: 'orgs' })]),
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(0);
        expect(objects[1].Fields[0].ForeignKeyTarget).toBe('orgs'); // untouched
    });

    it('does NOT infer when the name is ambiguous across objects', () => {
        // Two objects both normalize to "company" → ambiguous → skip.
        const objects = [
            obj('company', [field('id', { IsPrimaryKey: true })]),
            obj('companies', [field('id', { IsPrimaryKey: true })]),
            obj('contacts', [field('CompanyId')]),
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(0);
        expect(objects[2].Fields[0].IsForeignKey).toBe(false);
    });

    it('does NOT infer a single (surrogate) PK column or a self-reference', () => {
        const objects = [
            obj('companies', [field('id', { IsPrimaryKey: true }), field('CompanyId')]), // self
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(0);
        expect(objects[0].Fields[1].IsForeignKey).toBe(false);
    });

    it('INFERS FKs on the composite-PK parts of a junction/association table', () => {
        // assoc_contacts_companies PK = [contact_id, company_id]; each part is an FK to a
        // parent. The DAG must then order the association AFTER both parents (so it fills in).
        const objects = [
            obj('contacts', [field('hs_object_id', { IsPrimaryKey: true })], ['hs_object_id']),
            obj('companies', [field('hs_object_id', { IsPrimaryKey: true })], ['hs_object_id']),
            obj('assoc_contacts_companies', [
                field('contact_id', { IsPrimaryKey: true }),
                field('company_id', { IsPrimaryKey: true }),
                field('association_type'),
            ], ['contact_id', 'company_id']),
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(2);
        const assoc = objects[2];
        expect(assoc.Fields.find(f => f.Name === 'contact_id')!.ForeignKeyTarget).toBe('contacts');
        expect(assoc.Fields.find(f => f.Name === 'company_id')!.ForeignKeyTarget).toBe('companies');
        expect(assoc.Relationships).toEqual([
            { FieldName: 'contact_id', TargetObject: 'contacts', TargetField: 'hs_object_id' },
            { FieldName: 'company_id', TargetObject: 'companies', TargetField: 'hs_object_id' },
        ]);
    });

    it('leaves a non-matching field alone', () => {
        const objects = [
            obj('companies', [field('id', { IsPrimaryKey: true })]),
            obj('contacts', [field('email'), field('WidgetId')]), // no Widget object
        ];
        const n = EnrichSchemaConstraints.InferForeignKeys(objects);
        expect(n).toBe(0);
    });
});

describe('EnrichSchemaConstraints.Enrich (AI-optional descriptions)', () => {
    it('is a no-op for descriptions when no describeFn is supplied (AI-less)', async () => {
        const objects = [obj('companies', [field('id', { IsPrimaryKey: true })])];
        const r = await EnrichSchemaConstraints.Enrich(objects);
        expect(r.descriptionsAdded).toBe(0);
        expect(objects[0].Description).toBeUndefined();
    });

    it('fills missing descriptions via a one-shot describeFn when provided', async () => {
        const objects = [obj('companies', [field('id', { IsPrimaryKey: true }), field('name')])];
        const r = await EnrichSchemaConstraints.Enrich(objects, {
            describeFn: async ({ kind, fieldName }) => kind === 'object' ? 'The companies table' : `Field ${fieldName}`,
        });
        expect(objects[0].Description).toBe('The companies table');
        expect(objects[0].Fields[1].Description).toBe('Field name');
        expect(r.descriptionsAdded).toBe(3);
    });

    it('swallows describeFn errors (best-effort)', async () => {
        const objects = [obj('companies', [field('id', { IsPrimaryKey: true })])];
        const r = await EnrichSchemaConstraints.Enrich(objects, { describeFn: async () => { throw new Error('no AI'); } });
        expect(r.descriptionsAdded).toBe(0);
    });
});
