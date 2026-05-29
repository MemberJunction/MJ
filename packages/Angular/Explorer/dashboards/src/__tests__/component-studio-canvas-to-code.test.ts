import { describe, it, expect } from 'vitest';
import type { CuratedFormSchema } from '@memberjunction/interactive-component-types/forms';
import {
    generateCodeFromCanvas,
    toComponentIdentifier,
} from '../ComponentStudio/services/canvas-to-code';
import { buildEmptyCanvas, generateCanvasId } from '../ComponentStudio/services/form-canvas-model';
import { parseCanvasFromCode } from '../ComponentStudio/services/code-to-canvas';

function schema(): CuratedFormSchema {
    return {
        entityName: 'Customers',
        displayName: 'Customer',
        nameField: 'Name',
        fields: [
            { name: 'ID',    type: 'string',      required: false, isPrimaryKey: true,  sequence: 0 },
            { name: 'Name',  type: 'string',      required: true,  isPrimaryKey: false, sequence: 1, maxLength: 100, displayName: 'Name' },
            { name: 'Count', type: 'number',      required: false, isPrimaryKey: false, sequence: 2, displayName: 'Count' },
            { name: 'Notes', type: 'string',      required: false, isPrimaryKey: false, sequence: 3, displayName: 'Notes' },
            { name: 'AccountID', type: 'foreign-key', required: false, isPrimaryKey: false, sequence: 4, displayName: 'Account', references: { entity: 'Accounts', displayField: 'Name' } },
        ],
    };
}

describe('toComponentIdentifier', () => {
    it('strips non-alphanumeric and capitalises', () => {
        expect(toComponentIdentifier('Customer Form')).toBe('CustomerForm');
        expect(toComponentIdentifier('mj_some-thing 123')).toBe('Mjsomething123');
    });
    it('falls back to "Form" on empty input', () => {
        expect(toComponentIdentifier('')).toBe('Form');
        expect(toComponentIdentifier('***')).toBe('Form');
    });
});

describe('generateCodeFromCanvas', () => {
    it('emits a function whose identifier matches the component name', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        const code = generateCodeFromCanvas(canvas, schema(), 'Customer Form');
        expect(code).toContain('function CustomerForm(');
    });

    it('registers RequestSave / RequestCancel on the callbacks API', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        const code = generateCodeFromCanvas(canvas, schema(), 'CustomerForm');
        expect(code).toContain('callbacks?.RegisterMethod?.("RequestSave"');
        expect(code).toContain('callbacks?.RegisterMethod?.("RequestCancel"');
        expect(code).toContain('NotifyEvent?.("BeforeSave"');
    });

    it('renders a field element as an input bound to value("FieldName")', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Name', span: 1 });
        const code = generateCodeFromCanvas(canvas, schema(), 'CustomerForm');
        expect(code).toContain('value("Name")');
        expect(code).toContain('setField("Name"');
    });

    it('renders numeric inputs for number-typed fields', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Count' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        expect(code).toContain('type="number"');
    });

    it('uses textarea for long-string fields', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Notes' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        expect(code).toContain('<textarea');
    });

    it('emits a RunView FK loader for foreign-key fields', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'AccountID' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        // Verifies the linter-required RunView shape: MaxRows (not Limit),
        // Fields with ID + display field, ResultType: simple.
        expect(code).toContain('utilities.rv.RunView');
        expect(code).toContain('MaxRows: 200');
        expect(code).toContain('ResultType: "simple"');
        expect(code).toContain('"Accounts"');
    });

    it('skips field elements whose fieldName is not in the schema', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'BogusField' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        expect(code).not.toContain('"BogusField"');
    });

    it('does not render Save/Cancel buttons in the body', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Name' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        // The toolbar owns Save/Cancel — no <button>Save</button> or similar
        // should appear in generated JSX.
        expect(code).not.toMatch(/<button[^>]*>\s*Save\s*<\/button>/);
        expect(code).not.toMatch(/<button[^>]*>\s*Cancel\s*<\/button>/);
    });

    it('uses design tokens — no hardcoded hex colors in inputs', () => {
        const canvas = buildEmptyCanvas('Customers', 'Customer');
        canvas.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Name' });
        const code = generateCodeFromCanvas(canvas, schema(), 'F');
        // Spot-check: input styles reference --mj-* tokens, not raw hex.
        expect(code).toContain('var(--mj-border-default)');
        expect(code).toContain('var(--mj-bg-surface)');
    });
});

describe('parseCanvasFromCode (round-trip)', () => {
    it('reconstructs sections and field elements from generated code', () => {
        const original = buildEmptyCanvas('Customers', 'Customer');
        original.sections[0].title = 'Basics';
        original.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Name' });
        original.sections[0].elements.push({ id: generateCanvasId('field'), type: 'field', fieldName: 'Count' });

        const code = generateCodeFromCanvas(original, schema(), 'CustomerForm');
        const result = parseCanvasFromCode(code, schema());

        expect(result.canvas).not.toBeNull();
        expect(result.canvas!.sections).toHaveLength(1);
        expect(result.canvas!.sections[0].title).toBe('Basics');
        const fieldNames = result.canvas!.sections[0].elements
            .filter(e => e.type === 'field')
            .map(e => e.fieldName);
        expect(fieldNames).toEqual(['Name', 'Count']);
    });

    it('returns null canvas when there are no field references', () => {
        const code = 'function X() { return <div>Hi</div>; }';
        const result = parseCanvasFromCode(code, schema());
        expect(result.canvas).toBeNull();
        expect(result.hasUnknownConstructs).toBe(true);
    });

    it('flags advanced constructs that the canvas cannot represent', () => {
        const code = 'function X() { const x = useMemo(() => value("Name"), []); return <div>{x}</div>; }';
        const result = parseCanvasFromCode(code, schema());
        // useMemo is in the advanced-construct detector.
        expect(result.hasUnknownConstructs).toBe(true);
    });
});
