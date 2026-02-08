import { describe, it, expect } from 'vitest';
import { ResponseForms } from '../response-forms';
import type { ResponseForm, FormField, FormFieldOption, FormSection, FormButton, ConditionalRule, FormFieldType } from '../response-forms';

describe('ResponseForms', () => {
    describe('Serialize', () => {
        it('should serialize a response form to JSON string', () => {
            const form: ResponseForm = {
                title: 'Test Form',
                description: 'A test form',
                fields: [
                    { name: 'field1', type: 'text', label: 'Field 1', required: true }
                ]
            };

            const result = ResponseForms.Serialize(form);
            const parsed = JSON.parse(result);

            expect(parsed.title).toBe('Test Form');
            expect(parsed.fields).toHaveLength(1);
        });

        it('should handle form with sections', () => {
            const form: ResponseForm = {
                title: 'Sectioned Form',
                fields: [
                    { name: 'f1', type: 'text', label: 'F1' }
                ],
                sections: [
                    { title: 'Section 1', fieldNames: ['f1'] }
                ]
            };

            const result = ResponseForms.Serialize(form);
            const parsed = JSON.parse(result);

            expect(parsed.sections).toHaveLength(1);
            expect(parsed.sections[0].title).toBe('Section 1');
        });

        it('should handle form with buttons', () => {
            const form: ResponseForm = {
                title: 'Button Form',
                fields: [],
                buttons: [
                    { label: 'Submit', action: 'submit', style: 'primary' }
                ]
            };

            const result = ResponseForms.Serialize(form);
            const parsed = JSON.parse(result);

            expect(parsed.buttons).toHaveLength(1);
            expect(parsed.buttons[0].label).toBe('Submit');
        });
    });

    describe('Deserialize', () => {
        it('should deserialize a JSON string to ResponseForm', () => {
            const json = JSON.stringify({
                title: 'Deserialized Form',
                fields: [
                    { name: 'f1', type: 'text', label: 'Field 1' }
                ]
            });

            const result = ResponseForms.Deserialize(json);

            expect(result.title).toBe('Deserialized Form');
            expect(result.fields).toHaveLength(1);
        });

        it('should return null for null input', () => {
            const result = ResponseForms.Deserialize(null as unknown as string);

            expect(result).toBeNull();
        });

        it('should return null for empty string', () => {
            const result = ResponseForms.Deserialize('');

            expect(result).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            const result = ResponseForms.Deserialize('not json');

            expect(result).toBeNull();
        });
    });

    describe('Validate', () => {
        it('should validate a form with values', () => {
            const form: ResponseForm = {
                title: 'Validation Test',
                fields: [
                    { name: 'required_field', type: 'text', label: 'Required', required: true },
                    { name: 'optional_field', type: 'text', label: 'Optional' }
                ]
            };

            const values = { required_field: 'has value' };
            const errors = ResponseForms.Validate(form, values);

            expect(errors).toHaveLength(0);
        });

        it('should return errors for missing required fields', () => {
            const form: ResponseForm = {
                title: 'Test',
                fields: [
                    { name: 'required_field', type: 'text', label: 'Required', required: true }
                ]
            };

            const errors = ResponseForms.Validate(form, {});

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('required_field');
        });

        it('should return empty array for form with no required fields', () => {
            const form: ResponseForm = {
                title: 'Test',
                fields: [
                    { name: 'opt', type: 'text', label: 'Optional' }
                ]
            };

            const errors = ResponseForms.Validate(form, {});

            expect(errors).toHaveLength(0);
        });
    });

    describe('GetFieldValue / SetFieldValue', () => {
        it('should get and set field values', () => {
            const values: Record<string, unknown> = {};

            ResponseForms.SetFieldValue(values, 'name', 'John');
            expect(ResponseForms.GetFieldValue(values, 'name')).toBe('John');
        });

        it('should return undefined for non-existent field', () => {
            expect(ResponseForms.GetFieldValue({}, 'missing')).toBeUndefined();
        });
    });

    describe('GetDefaultValues', () => {
        it('should extract default values from form fields', () => {
            const form: ResponseForm = {
                title: 'Test',
                fields: [
                    { name: 'f1', type: 'text', label: 'F1', defaultValue: 'default1' },
                    { name: 'f2', type: 'number', label: 'F2', defaultValue: 42 },
                    { name: 'f3', type: 'text', label: 'F3' }
                ]
            };

            const defaults = ResponseForms.GetDefaultValues(form);

            expect(defaults.f1).toBe('default1');
            expect(defaults.f2).toBe(42);
            expect(defaults.f3).toBeUndefined();
        });
    });

    describe('FilterVisibleFields', () => {
        it('should filter fields based on conditions', () => {
            const form: ResponseForm = {
                title: 'Test',
                fields: [
                    { name: 'type', type: 'select', label: 'Type', options: [{ value: 'a', label: 'A' }] },
                    {
                        name: 'details',
                        type: 'text',
                        label: 'Details',
                        conditionalRules: [{ field: 'type', operator: 'equals', value: 'a', action: 'show' }]
                    }
                ]
            };

            const visible = ResponseForms.FilterVisibleFields(form, { type: 'a' });

            expect(visible).toHaveLength(2);
        });

        it('should hide fields when condition not met', () => {
            const form: ResponseForm = {
                title: 'Test',
                fields: [
                    { name: 'type', type: 'select', label: 'Type', options: [{ value: 'a', label: 'A' }] },
                    {
                        name: 'details',
                        type: 'text',
                        label: 'Details',
                        conditionalRules: [{ field: 'type', operator: 'equals', value: 'a', action: 'show' }]
                    }
                ]
            };

            const visible = ResponseForms.FilterVisibleFields(form, { type: 'b' });

            expect(visible).toHaveLength(1);
            expect(visible[0].name).toBe('type');
        });
    });
});
