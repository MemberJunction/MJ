import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJAIPromptEntity } from '@memberjunction/core-entities';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { Query, QueryAll } from '@memberjunction/ng-test-utils';
import { AIPromptSamplingFieldsComponent, PROMPT_SAMPLING_FIELDS } from './ai-prompt-sampling-fields.component';

/**
 * DOM coverage for <mj-ai-prompt-sampling-fields>, the Sampling panel of the AI Prompt form.
 * The record is a REAL `MJAIPromptEntity` over an `EntityInfo` built from plain init data, and the
 * fields render through the real `mj-form-field`. Covers: one number box per sampling column in
 * edit mode, clearing a box stores NULL (not 0), and read mode labelling NULL as the provider's
 * default while still showing a pinned 0.
 */

const PROMPT_ENTITY = new EntityInfo({
    ID: 'prompt-entity',
    Name: 'MJ: AI Prompts',
    Status: 'Active',
    Fields: [
        { ID: 'F0', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
        ...PROMPT_SAMPLING_FIELDS.map((Name, i) => ({
            ID: `F${i + 1}`,
            Name,
            DisplayName: Name === 'TopP' ? 'Top P' : undefined,
            Type: Name === 'TopK' || Name === 'Seed' ? 'int' : 'decimal',
            AllowsNull: true,
            AllowUpdateAPI: true,
        })),
    ],
});

function makePrompt(values: Partial<Record<(typeof PROMPT_SAMPLING_FIELDS)[number], number | null>> = {}): MJAIPromptEntity {
    const prompt = new MJAIPromptEntity(PROMPT_ENTITY);
    prompt.SetMany({ ID: '11111111-2222-3333-4444-555555555555', ...values }, true, true);
    return prompt;
}

function render(record: MJAIPromptEntity, editMode: boolean): ComponentFixture<AIPromptSamplingFieldsComponent> {
    TestBed.configureTestingModule({ imports: [BaseFormsModule], declarations: [AIPromptSamplingFieldsComponent] });
    const fixture = TestBed.createComponent(AIPromptSamplingFieldsComponent);
    fixture.componentRef.setInput('Record', record);
    fixture.componentRef.setInput('EditMode', editMode);
    fixture.detectChanges(false);
    return fixture;
}

describe('AIPromptSamplingFieldsComponent', () => {
    it('renders one number box per sampling column in edit mode', () => {
        const fixture = render(makePrompt(), true);
        expect(QueryAll(fixture, 'mj-form-field')).toHaveLength(PROMPT_SAMPLING_FIELDS.length);
        expect(QueryAll(fixture, 'input[type="number"]')).toHaveLength(PROMPT_SAMPLING_FIELDS.length);
        expect(Query(fixture, '.sampling-note')?.textContent).toContain("Empty uses the provider's default; 0 is a set value.");
    });

    it('stores NULL, not 0, when a number box is cleared', () => {
        const prompt = makePrompt({ Temperature: 0.7 });
        const fixture = render(prompt, true);
        const temperature = QueryAll(fixture, 'input[type="number"]')[0] as HTMLInputElement;
        expect(temperature.value).toBe('0.7');

        temperature.value = '';
        temperature.dispatchEvent(new Event('change'));
        expect(prompt.Temperature).toBeNull();

        temperature.value = '0';
        temperature.dispatchEvent(new Event('change'));
        expect(prompt.Temperature).toBe(0);
    });

    it('labels NULL columns as the provider default in read mode and shows a pinned 0', () => {
        const fixture = render(makePrompt({ Temperature: 0, Seed: 42 }), false);
        const defaults = QueryAll(fixture, '.sampling-default');
        expect(defaults.map((d) => d.getAttribute('data-field'))).toEqual(['TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty']);
        expect(defaults[0].textContent).toContain('Top P');
        expect(defaults[0].textContent).toContain('Provider default');
        // Temperature (a pinned 0) and Seed render through mj-form-field like any set value.
        expect(QueryAll(fixture, 'mj-form-field')).toHaveLength(2);
    });
});
