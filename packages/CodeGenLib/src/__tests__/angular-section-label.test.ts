import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityInfo, GeneratedFormSectionType } from '@memberjunction/core';
import { AngularClientGeneratorBase, AngularFormSectionInfo } from '../Angular/angular-codegen';

/**
 * Generated form fields show their label, except the only field of a section whose title
 * already names it (section title equals the field's display name).
 */
class TestableAngularGenerator extends AngularClientGeneratorBase {
    public SectionHTML(entity: EntityInfo, section: AngularFormSectionInfo): string {
        return this.generateSectionHTMLForAngular(entity, section);
    }
}

const ENTITY_ID = 'E1';

function categoryField(name: string, category: string, sequence: number, displayName?: string): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: `F-${name}`,
        EntityID: ENTITY_ID,
        Name: name,
        DisplayName: displayName ?? null,
        Type: 'nvarchar',
        Length: 200,
        Sequence: sequence,
        AllowsNull: true,
        IncludeInGeneratedForm: true,
        GeneratedFormSection: 'Category',
        Category: category,
        Status: 'Active',
    });
}

function buildEntity(fields: EntityFieldInfo[]): EntityInfo {
    const entity = new EntityInfo({ ID: ENTITY_ID, Name: 'Sample Things', BaseTable: 'SampleThing', BaseView: 'vwSampleThings', SchemaName: '__mj', Status: 'Active' });
    Object.defineProperty(entity, 'Fields', { value: fields, configurable: true });
    return entity;
}

function categorySection(name: string): AngularFormSectionInfo {
    const section = new AngularFormSectionInfo();
    section.Type = GeneratedFormSectionType.Category;
    section.Name = name;
    return section;
}

/** Returns the [ShowLabel] value emitted for each field, keyed by FieldName. */
function showLabels(html: string): Record<string, string> {
    const result: Record<string, string> = {};
    const blocks = html.split('<mj-form-field').slice(1);
    for (const block of blocks) {
        const label = /\[ShowLabel\]="(true|false)"/.exec(block)?.[1];
        const name = /FieldName="([^"]+)"/.exec(block)?.[1];
        if (name && label) result[name] = label;
    }
    return result;
}

describe('AngularClientGeneratorBase — field labels in generated sections', () => {
    const gen = new TestableAngularGenerator();

    it('shows the label of a one-field section whose title differs from the field', () => {
        const entity = buildEntity([categoryField('Status', 'Workflow', 1)]);
        const html = gen.SectionHTML(entity, categorySection('Workflow'));
        expect(showLabels(html)).toEqual({ Status: 'true' });
    });

    it('hides the label of a one-field section titled after the field name', () => {
        const entity = buildEntity([categoryField('Status', 'Status', 1)]);
        const html = gen.SectionHTML(entity, categorySection('Status'));
        expect(showLabels(html)).toEqual({ Status: 'false' });
    });

    it('compares against the display name, ignoring case and surrounding whitespace', () => {
        const entity = buildEntity([categoryField('SystemPrompt', 'system prompt ', 1, 'System Prompt')]);
        const html = gen.SectionHTML(entity, categorySection(' system prompt '));
        expect(showLabels(html)).toEqual({ SystemPrompt: 'false' });
    });

    it('shows the label when the section is named after the code name but the display name differs', () => {
        const entity = buildEntity([categoryField('StatusCode', 'StatusCode', 1, 'Current Status')]);
        const html = gen.SectionHTML(entity, categorySection('StatusCode'));
        expect(showLabels(html)).toEqual({ StatusCode: 'true' });
    });

    it('shows every label in a multi-field section, even one named after a field', () => {
        const entity = buildEntity([
            categoryField('Status', 'Status', 1),
            categoryField('Notes', 'Status', 2),
        ]);
        const html = gen.SectionHTML(entity, categorySection('Status'));
        expect(showLabels(html)).toEqual({ Status: 'true', Notes: 'true' });
    });
});
