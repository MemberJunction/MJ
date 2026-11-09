import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { CloneValuesComponent } from './clone-values.component';
import type { ClonePromptFieldItem, CloneRetargetFieldItem } from './record-clone-types';

describe('CloneValuesComponent (DOM)', () => {
    it('renders root name input with naming hint', () => {
        const fixture = renderComponentFixture(CloneValuesComponent, {
            inputs: {
                EntityName: 'Sales Pipeline',
                RootName: 'Sales Pipeline (2)',
                NamingStrategyReason: 'Generated via increment strategy',
            },
        });

        const label = text(fixture, '.control-label');
        expect(label).toContain('Name for Cloned Sales Pipeline');

        const input = query(fixture, '#root-name-input') as HTMLInputElement;
        expect(input.value).toBe('Sales Pipeline (2)');

        const hint = text(fixture, '.naming-hint');
        expect(hint).toContain('Generated via increment strategy');
    });

    it('renders prompted fields according to type', () => {
        const fields: ClonePromptFieldItem[] = [
            { FieldName: 'Code', DisplayName: 'Project Code', Type: 'string', IsRequired: true },
            { FieldName: 'Budget', DisplayName: 'Budget Amount', Type: 'number', IsRequired: false },
            { FieldName: 'IsConfidential', DisplayName: 'Confidential', Type: 'boolean', IsRequired: false },
        ];

        const fixture = renderComponentFixture(CloneValuesComponent, {
            inputs: {
                EntityName: 'Project',
                RootName: 'Project Clone',
                PromptedFields: fields,
                PromptedValues: { Code: 'PRJ-101', Budget: 5000, IsConfidential: true },
            },
        });

        expect(query(fixture, '#field-Code')).not.toBeNull();
        expect(query(fixture, '#field-Budget')).not.toBeNull();
        expect(query(fixture, '#field-IsConfidential')).not.toBeNull();

        const requiredAsterisks = queryAll(fixture, '.field-item .required-asterisk');
        expect(requiredAsterisks.length).toBe(1); // Only Code is required
    });

    it('emits ValidityChange based on root name and required fields', () => {
        const fields: ClonePromptFieldItem[] = [
            { FieldName: 'RequiredCode', DisplayName: 'Code', Type: 'string', IsRequired: true },
        ];

        const fixture = renderComponentFixture(CloneValuesComponent, {
            inputs: {
                EntityName: 'Project',
                RootName: '', // Invalid empty root name
                PromptedFields: fields,
                PromptedValues: {},
            },
        });

        let isValid = true;
        fixture.componentInstance.ValidityChange.subscribe((valid) => {
            isValid = valid;
        });

        fixture.componentInstance.CheckValidity();
        expect(isValid).toBe(false);

        // Fill root name only (required field still missing)
        fixture.componentInstance.OnRootNameChange('My Clone');
        expect(isValid).toBe(false);

        // Fill required field
        fixture.componentInstance.OnFieldChange('RequiredCode', 'CODE-123');
        expect(isValid).toBe(true);
    });

    it('renders retarget fields and captures new target value', () => {
        const retargets: CloneRetargetFieldItem[] = [
            {
                FieldName: 'AccountID',
                DisplayName: 'Parent Account',
                RelatedEntity: 'Accounts',
                CurrentValue: 'acc-1',
                NewValue: null,
                CurrentDisplayName: 'Acme Corp',
            },
        ];

        const fixture = renderComponentFixture(CloneValuesComponent, {
            inputs: {
                EntityName: 'Contacts',
                RootName: 'John Doe',
                RetargetFields: retargets,
            },
        });

        const retargetLabel = text(fixture, '.retarget-item .control-label');
        expect(retargetLabel).toContain('Parent Account (Accounts)');

        const currentHint = text(fixture, '.retarget-item .control-hint');
        expect(currentHint).toContain('Current: Acme Corp');

        let emittedRetargets: CloneRetargetFieldItem[] | null = null;
        fixture.componentInstance.RetargetFieldsChange.subscribe((items) => {
            emittedRetargets = items;
        });

        fixture.componentInstance.OnRetargetFieldChange(retargets[0], 'acc-999');
        expect(emittedRetargets).not.toBeNull();
        expect(emittedRetargets![0].NewValue).toBe('acc-999');
    });

    it('mirrors a typed email into the name box without reporting a name edit', () => {
        const fixture = renderComponentFixture(CloneValuesComponent, { inputs: { RootName: 'Copy of Ada', PromptedFields: [] } });
        const emitted: string[] = [];
        fixture.componentInstance.RootNameChange.subscribe((n) => emitted.push(n));

        fixture.componentInstance.OnFieldChange('Email', 'bob@example.com');
        expect(fixture.componentInstance.RootName).toBe('bob@example.com');
        expect(emitted).toEqual([]);

        const input = document.createElement('input');
        input.value = 'Bob';
        fixture.componentInstance.OnRootNameInput({ target: input } as unknown as Event);
        expect(emitted).toEqual(['Bob']);
    });
});
