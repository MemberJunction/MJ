import { describe, expect, it } from 'vitest';
import type { DashboardPanel } from './dashboard-types';
import type { DashboardPartInterface, DashboardProperty, DashboardWire } from './dashboard-properties';
import {
    ValidateDashboardBindings,
    ValidateDashboardProperties,
    ValidateDashboardWires,
    ValidatePartMappings,
} from './dashboard-config-validator';

const chapter: DashboardProperty = { Name: 'Chapter', Type: 'uuid' };
const count: DashboardProperty = { Name: 'Count', Type: 'number' };

/** A View part over Chapters, raising RecordSelected with ID and Name, declaring ChapterID and a locked Org. */
const viewInterface: DashboardPartInterface = {
    Inputs: [
        { Name: 'ChapterID', Type: 'uuid', IsRequired: false, HasOwnDefault: false, ServerSet: false },
        { Name: 'Org', Type: 'uuid', IsRequired: true, HasOwnDefault: false, ServerSet: true },
    ],
    Events: [{ Name: 'RecordSelected', Values: [{ Name: 'ID', Type: 'uuid' }, { Name: 'Name', Type: 'string' }] }],
};

function panel(id: string, config: DashboardPanel['config'] = { type: 'View', viewId: 'v' }): DashboardPanel {
    return { id, title: id, partTypeId: 'pt', config };
}

describe('ValidateDashboardProperties', () => {
    it('accepts valid properties', () => {
        expect(ValidateDashboardProperties([chapter, { Name: 'Since', Type: 'date', Default: { Token: 'Context.StartOfMonth', Offset: { Amount: -1, Unit: 'month' } } }])).toEqual([]);
    });

    it('refuses a blank or repeated name, an unknown type, and bad defaults', () => {
        const errors = ValidateDashboardProperties([
            { Name: '', Type: 'string' },
            { Name: 'Chapter', Type: 'uuid' },
            { Name: 'chapter', Type: 'uuid' },
            { Name: 'Bad', Type: 'colour' as DashboardProperty['Type'] },
            { Name: 'Who', Type: 'string', Default: { Token: 'Context.UserName', Offset: { Amount: 1, Unit: 'day' } } },
            { Name: 'Unit', Type: 'date', Default: { Token: 'Context.Today', Offset: { Amount: 1, Unit: 'fortnight' as 'day' } } },
            { Name: 'Tok', Type: 'string', Default: { Token: 'Context.Tomorrow' as 'Context.Today' } },
            { Name: 'Num', Type: 'number', Default: { Value: 'ten' } },
        ]);
        expect(errors.some(e => e.includes('Property 1: Name is required'))).toBe(true);
        expect(errors.some(e => e.includes('"chapter": another property has the same name'))).toBe(true);
        expect(errors.some(e => e.includes('"Bad": Type must be one of'))).toBe(true);
        expect(errors.some(e => e.includes('"Who"') && e.includes('cannot take an offset'))).toBe(true);
        expect(errors.some(e => e.includes('"Unit"') && e.includes('Unknown offset unit'))).toBe(true);
        expect(errors.some(e => e.includes('"Tok"') && e.includes('Unknown token'))).toBe(true);
        expect(errors.some(e => e.includes('"Num"') && e.includes('not a valid number'))).toBe(true);
    });
});

describe('ValidatePartMappings', () => {
    it('accepts a mapping to a declared input from an existing property of a matching type', () => {
        expect(ValidatePartMappings('Members', [{ Input: 'ChapterID', Property: 'Chapter' }], viewInterface, [chapter])).toEqual([]);
    });

    it('refuses a mapping to an undeclared input, from a missing property, between mismatched types, and to a server-set input', () => {
        const errors = ValidatePartMappings('Members', [
            { Input: 'Nope', Property: 'Chapter' },
            { Input: 'ChapterID', Property: 'Missing' },
        ], viewInterface, [chapter]);
        expect(errors).toEqual([
            'Part "Members": Input "Nope" is not one the part declares.',
            'Part "Members": Input "ChapterID" is mapped from "Missing", which the dashboard doesn\'t have.',
        ]);
        expect(ValidatePartMappings('Members', [{ Input: 'ChapterID', Property: 'Count' }], viewInterface, [count])[0]).toContain('can\'t take "Count"');
        expect(ValidatePartMappings('Members', [{ Input: 'Org', Property: 'Chapter' }], viewInterface, [chapter])[0]).toContain('set by the server');
    });

    it('refuses a default that does not fit the input, and an input mapped twice', () => {
        const errors = ValidatePartMappings('Members', [
            { Input: 'ChapterID', Default: { Value: 'not-a-uuid' } },
            { Input: 'ChapterID', Property: 'Chapter' },
        ], viewInterface, [chapter]);
        expect(errors.some(e => e.includes('default of input "ChapterID" is invalid'))).toBe(true);
        expect(errors.some(e => e.includes('mapped twice'))).toBe(true);
    });
});

describe('ValidateDashboardWires', () => {
    const panels = [panel('left'), panel('right')];
    const interfaces = new Map<string, DashboardPartInterface | null>([['left', viewInterface], ['right', null]]);
    const wire = (w: Partial<DashboardWire>): DashboardWire => ({ Panel: 'left', Event: 'RecordSelected', Value: 'ID', Property: 'Chapter', ...w });

    it('accepts a wire from a declared event value to a property of a matching type', () => {
        expect(ValidateDashboardWires([wire({})], panels, interfaces, [chapter])).toEqual([]);
    });

    it('refuses a wire from an undeclared event, to a missing property, with a mismatched value type, or from a missing part', () => {
        expect(ValidateDashboardWires([wire({ Event: 'RowSelected' })], panels, interfaces, [chapter])[0]).toContain('doesn\'t raise "RowSelected"');
        expect(ValidateDashboardWires([wire({ Property: 'Nope' })], panels, interfaces, [chapter])[0]).toContain('"Nope", which the dashboard doesn\'t have');
        expect(ValidateDashboardWires([wire({ Value: 'Name' })], panels, interfaces, [chapter])[0]).toContain('"Name" (string) can\'t set "Chapter" (uuid)');
        expect(ValidateDashboardWires([wire({ Value: 'Missing' })], panels, interfaces, [chapter])[0]).toContain('carries no value "Missing"');
        expect(ValidateDashboardWires([wire({ Panel: 'gone' })], panels, interfaces, [chapter])[0]).toContain('not on the dashboard');
    });

    it('does not check a wire from a part whose interface could not load', () => {
        expect(ValidateDashboardWires([wire({ Panel: 'right', Event: 'Anything' })], panels, interfaces, [chapter])).toEqual([]);
    });
});

describe('ValidateDashboardBindings', () => {
    it('combines the properties, each part\'s mappings and the wires', () => {
        const panels = [panel('left', { type: 'View', viewId: 'v', inputMappings: [{ Input: 'ChapterID', Property: 'Gone' }] })];
        const errors = ValidateDashboardBindings({
            Properties: [chapter],
            Wires: [{ Panel: 'left', Event: 'RecordSelected', Value: 'ID', Property: 'Chapter' }],
            Panels: panels,
            Interfaces: new Map([['left', viewInterface]]),
        });
        expect(errors).toEqual(['Part "left": Input "ChapterID" is mapped from "Gone", which the dashboard doesn\'t have.']);
    });

    it('finds nothing to refuse on a dashboard without properties, mappings or wires', () => {
        expect(ValidateDashboardBindings({ Properties: [], Wires: [], Panels: [panel('a')], Interfaces: new Map() })).toEqual([]);
    });
});
