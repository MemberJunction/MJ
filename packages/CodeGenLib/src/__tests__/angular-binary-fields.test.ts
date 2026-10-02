import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityInfo, GeneratedFormSectionType } from '@memberjunction/core';
import { AngularClientGeneratorBase, AngularFormSectionInfo } from '../Angular/angular-codegen';

/**
 * Binary DB fields (varbinary / bytea / binary / image) hold base64-encoded data — an embedding,
 * a file — that a generated form can neither display nor edit meaningfully. The Angular form
 * generator must leave them out of every section, while still emitting the other fields.
 */
class TestableAngularGenerator extends AngularClientGeneratorBase {
    public SectionHTML(entity: EntityInfo, section: AngularFormSectionInfo): string {
        return this.generateSectionHTMLForAngular(entity, section);
    }
}

const ENTITY_ID = 'E1';

function field(name: string, type: string, sequence: number, extra?: Record<string, unknown>): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: `F-${name}`,
        EntityID: ENTITY_ID,
        Name: name,
        DisplayName: name,
        Type: type,
        Length: type === 'nvarchar' ? 200 : -1,
        Sequence: sequence,
        AllowsNull: true,
        IncludeInGeneratedForm: true,
        GeneratedFormSection: 'Details',
        Status: 'Active',
        ...extra,
    });
}

function buildEntity(fields: EntityFieldInfo[]): EntityInfo {
    const entity = new EntityInfo({ ID: ENTITY_ID, Name: 'Vector Things', BaseTable: 'VectorThing', BaseView: 'vwVectorThings', SchemaName: '__mj', Status: 'Active' });
    // EntityInfo builds Fields from its init data; replace with the real EntityFieldInfo
    // instances so the getters under test (IsBinaryFieldType etc.) are production code.
    Object.defineProperty(entity, 'Fields', { value: fields, configurable: true });
    return entity;
}

function detailsSection(): AngularFormSectionInfo {
    const section = new AngularFormSectionInfo();
    section.Type = GeneratedFormSectionType.Details;
    section.Name = 'Details';
    return section;
}

describe('AngularClientGeneratorBase — binary fields are skipped in generated forms', () => {
    it('confirms the fixtures: varbinary/bytea/binary/image are binary, nvarchar is not', () => {
        expect(field('A', 'varbinary', 1).IsBinaryFieldType).toBe(true);
        expect(field('B', 'bytea', 2).IsBinaryFieldType).toBe(true);
        expect(field('C', 'binary', 3).IsBinaryFieldType).toBe(true);
        expect(field('D', 'image', 4).IsBinaryFieldType).toBe(true);
        expect(field('E', 'nvarchar', 5).IsBinaryFieldType).toBe(false);
    });

    it('omits a varbinary field from the section while keeping the other fields', () => {
        const entity = buildEntity([
            field('Label', 'nvarchar', 1),
            field('Embedding', 'varbinary', 2),
            field('Notes', 'nvarchar', 3),
        ]);
        const section = detailsSection();

        const html = new TestableAngularGenerator().SectionHTML(entity, section);

        expect(html).toContain('FieldName="Label"');
        expect(html).toContain('FieldName="Notes"');
        expect(html).not.toContain('FieldName="Embedding"');
        expect((section.Fields ?? []).map(f => f.Name)).toEqual(['Label', 'Notes']);
    });

    it('omits every binary SQL type (bytea, binary, image) as well', () => {
        const entity = buildEntity([
            field('Label', 'nvarchar', 1),
            field('PgBlob', 'bytea', 2),
            field('FixedHash', 'binary', 3),
            field('LegacyImage', 'image', 4),
        ]);
        const section = detailsSection();

        const html = new TestableAngularGenerator().SectionHTML(entity, section);

        expect((section.Fields ?? []).map(f => f.Name)).toEqual(['Label']);
        for (const name of ['PgBlob', 'FixedHash', 'LegacyImage']) {
            expect(html).not.toContain(`FieldName="${name}"`);
        }
    });

    it('emits no form fields at all for a section whose only field is binary', () => {
        const entity = buildEntity([field('Embedding', 'varbinary', 1)]);
        const section = detailsSection();

        const html = new TestableAngularGenerator().SectionHTML(entity, section);

        expect(section.Fields).toEqual([]);
        expect(html).not.toContain('<mj-form-field');
    });
});
