import { describe, it, expect, vi } from 'vitest';

// The record-edit service imports value/type constants from '@memberjunction/core'.
// We mock only the tiny surface the pure helpers touch: the two enums used for
// classification. (loadRecordForEdit/saveRecord exercise Metadata/BaseEntity and
// are covered by integration usage, not these pure-logic tests.)
vi.mock('@memberjunction/core', () => ({
    EntityFieldTSType: { String: 'string', Number: 'number', Date: 'Date', Boolean: 'boolean' },
    EntityFieldValueListType: { None: 'None', List: 'List', ListOrUserEntry: 'ListOrUserEntry' },
    Metadata: class {},
    CompositeKey: { FromID: (id: string) => ({ id }) },
    BaseEntity: class {},
}));

import {
    editorKindForField,
    isEditableField,
    buildDescriptor,
    formValueFromRaw,
    entityValueFromForm,
    validateRequired,
    type FieldMeta,
    type FieldEditorDescriptor,
    type FieldValue,
} from '@/data/services/record-edit';

/** Build a FieldMeta with sensible editable defaults, overridable per test. */
function meta(overrides: Partial<FieldMeta>): FieldMeta {
    return {
        name: 'Field',
        label: 'Field',
        tsType: 'string',
        readOnly: false,
        isVirtual: false,
        allowsNull: true,
        maxLength: 100,
        valueListType: 'None',
        options: [],
        status: 'Active',
        ...overrides,
    };
}

describe('isEditableField', () => {
    it('accepts an active, writable, non-virtual field', () => {
        expect(isEditableField(meta({}))).toBe(true);
    });
    it('rejects read-only, virtual, and non-active fields', () => {
        expect(isEditableField(meta({ readOnly: true }))).toBe(false);
        expect(isEditableField(meta({ isVirtual: true }))).toBe(false);
        expect(isEditableField(meta({ status: 'Deprecated' }))).toBe(false);
    });
});

describe('editorKindForField', () => {
    it('maps a value list to a dropdown', () => {
        expect(editorKindForField(meta({ valueListType: 'List', options: [{ value: 'A', label: 'A' }] }))).toBe('dropdown');
    });
    it('maps scalar TS types', () => {
        expect(editorKindForField(meta({ tsType: 'boolean' }))).toBe('boolean');
        expect(editorKindForField(meta({ tsType: 'number' }))).toBe('number');
        expect(editorKindForField(meta({ tsType: 'Date' }))).toBe('date');
        expect(editorKindForField(meta({ tsType: 'string', maxLength: 50 }))).toBe('text');
    });
    it('treats unbounded or long strings as longtext', () => {
        expect(editorKindForField(meta({ tsType: 'string', maxLength: 0 }))).toBe('longtext');
        expect(editorKindForField(meta({ tsType: 'string', maxLength: 800 }))).toBe('longtext');
    });
});

describe('buildDescriptor', () => {
    it('marks non-nullable fields required and only attaches options to dropdowns', () => {
        const d = buildDescriptor(meta({ name: 'Status', label: 'Status', allowsNull: false, valueListType: 'List', options: [{ value: 'X', label: 'X' }] }));
        expect(d).toMatchObject({ key: 'Status', label: 'Status', kind: 'dropdown', required: true });
        expect(d.options).toHaveLength(1);
    });
    it('leaves options empty for non-dropdown kinds', () => {
        expect(buildDescriptor(meta({ tsType: 'number' })).options).toEqual([]);
    });
});

describe('formValueFromRaw', () => {
    it('coerces booleans and stringifies others, collapsing null to empty', () => {
        expect(formValueFromRaw(true, 'boolean')).toBe(true);
        expect(formValueFromRaw(null, 'boolean')).toBe(false);
        expect(formValueFromRaw(null, 'text')).toBe('');
        expect(formValueFromRaw(42, 'number')).toBe('42');
    });
    it('renders dates as ISO strings', () => {
        const d = new Date('2026-07-02T00:00:00.000Z');
        expect(formValueFromRaw(d, 'date')).toBe('2026-07-02T00:00:00.000Z');
    });
});

describe('entityValueFromForm', () => {
    it('parses numbers and dates, empties to null', () => {
        expect(entityValueFromForm('7', 'number')).toBe(7);
        expect(entityValueFromForm('', 'number')).toBeNull();
        expect(entityValueFromForm('not-a-number', 'number')).toBeNull();
        expect(entityValueFromForm('2026-07-02T00:00:00.000Z', 'date')).toBeInstanceOf(Date);
        expect(entityValueFromForm(true, 'boolean')).toBe(true);
        expect(entityValueFromForm('hello', 'text')).toBe('hello');
    });
});

describe('validateRequired', () => {
    const descriptors: FieldEditorDescriptor[] = [
        { key: 'Name', label: 'Name', kind: 'text', required: true, maxLength: 100, options: [] },
        { key: 'Age', label: 'Age', kind: 'number', required: false, maxLength: 0, options: [] },
        { key: 'Active', label: 'Active', kind: 'boolean', required: true, maxLength: 0, options: [] },
    ];
    it('flags empty required non-boolean fields and bad numbers', () => {
        const values: Record<string, FieldValue> = { Name: '', Age: 'abc', Active: false };
        const errors = validateRequired(descriptors, values);
        expect(errors.map((e) => e.key).sort()).toEqual(['Age', 'Name']);
    });
    it('passes when required fields are filled', () => {
        const values: Record<string, FieldValue> = { Name: 'Ada', Age: '30', Active: true };
        expect(validateRequired(descriptors, values)).toEqual([]);
    });
});
