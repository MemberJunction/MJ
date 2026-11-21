import { describe, expect, it } from 'vitest';
import type { DashboardPartInterface, DashboardProperty } from './dashboard-properties';
import { PartInputsEditor } from './part-inputs-editor';

const partInterface: DashboardPartInterface = {
    Inputs: [
        { Name: 'ChapterID', Type: 'uuid', IsRequired: false, HasOwnDefault: false, ServerSet: false },
        { Name: 'Org', Type: 'uuid', IsRequired: true, HasOwnDefault: false, ServerSet: true },
        { Name: 'Ids', Type: 'unsupported', IsRequired: false, HasOwnDefault: false, ServerSet: false },
        { Name: 'Slug', Type: 'any', IsRequired: true, HasOwnDefault: false, ServerSet: false },
    ],
    Events: [],
};
const properties: DashboardProperty[] = [
    { Name: 'Chapter', Type: 'uuid' },
    { Name: 'Count', Type: 'number' },
];

describe('PartInputsEditor', () => {
    it('lists every declared input with its mapping, and keeps mappings to undeclared inputs apart', () => {
        const editor = new PartInputsEditor(partInterface, [
            { Input: 'ChapterID', Property: 'Chapter' },
            { Input: 'Renamed', Property: 'Chapter' },
        ]);
        expect(editor.Rows.map(r => [r.Input.Name, r.Property])).toEqual([['ChapterID', 'Chapter'], ['Org', null], ['Ids', null], ['Slug', null]]);
        expect(editor.Orphans).toEqual([{ Input: 'Renamed', Property: 'Chapter' }]);
    });

    it('offers only the properties whose type fits the input', () => {
        const editor = new PartInputsEditor(partInterface, []);
        expect(editor.CompatibleProperties(editor.Rows[0], properties).map(p => p.Name)).toEqual(['Chapter']);
        expect(editor.CompatibleProperties(editor.Rows[3], properties).map(p => p.Name)).toEqual(['Chapter', 'Count']);
    });

    it('never maps a server-set input or an input of an unsupported type', () => {
        const editor = new PartInputsEditor(partInterface, []);
        expect(editor.Rows.map(r => editor.CanMap(r))).toEqual([true, false, false, true]);
    });

    it('builds mappings only for inputs with a property or a default (fixed by a default, or left to its own)', () => {
        const editor = new PartInputsEditor(partInterface, []);
        editor.Rows[0].Property = 'Chapter';
        editor.Rows[3].Default = { Value: 'main' };
        expect(editor.BuildMappings()).toEqual([
            { Input: 'ChapterID', Property: 'Chapter' },
            { Input: 'Slug', Default: { Value: 'main' } },
        ]);
        expect(new PartInputsEditor(partInterface, []).BuildMappings()).toEqual([]);
    });

    it('refuses an orphan mapping until it is removed', () => {
        const editor = new PartInputsEditor(partInterface, [{ Input: 'Renamed', Property: 'Chapter' }]);
        expect(editor.Problems('Members', properties)).toEqual(['Part "Members": Input "Renamed" is not one the part declares.']);
        editor.RemoveOrphan(0);
        expect(editor.Problems('Members', properties)).toEqual([]);
    });

    it('refuses a mapping between mismatched types', () => {
        const editor = new PartInputsEditor(partInterface, [{ Input: 'ChapterID', Property: 'Count' }]);
        expect(editor.Problems('Members', properties)[0]).toContain('can\'t take "Count"');
    });

    it('gives an input that takes any value a text default', () => {
        const editor = new PartInputsEditor(partInterface, []);
        expect(editor.DefaultType(editor.Rows[3])).toBe('string');
        expect(editor.DefaultType(editor.Rows[0])).toBe('uuid');
    });
});
