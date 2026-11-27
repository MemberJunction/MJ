import { Component, Input } from '@angular/core';
import { MJAIPromptEntity } from '@memberjunction/core-entities';

/** The sampling columns of `MJ: AI Prompts`, in display order. */
export type PromptSamplingFieldName = 'Temperature' | 'TopP' | 'TopK' | 'MinP' | 'Seed' | 'FrequencyPenalty' | 'PresencePenalty';

export const PROMPT_SAMPLING_FIELDS: readonly PromptSamplingFieldName[] = [
    'Temperature',
    'TopP',
    'TopK',
    'MinP',
    'Seed',
    'FrequencyPenalty',
    'PresencePenalty',
];

/**
 * The sampling parameters of an AI prompt (temperature, top-p, seed and the rest).
 *
 * NULL and 0 mean different things here: NULL leaves the value to the provider, 0 sends 0. In
 * edit mode an emptied number box saves NULL. In read mode a NULL field shows "Provider default"
 * instead of being hidden, so a reader can tell whether a prompt pins a value.
 */
@Component({
    standalone: false,
    selector: 'mj-ai-prompt-sampling-fields',
    templateUrl: './ai-prompt-sampling-fields.component.html',
    styleUrls: ['./ai-prompt-sampling-fields.component.css'],
})
export class AIPromptSamplingFieldsComponent {
    @Input() Record!: MJAIPromptEntity;
    @Input() EditMode = false;

    readonly Fields = PROMPT_SAMPLING_FIELDS;

    /** True when the field has no value, so the provider's default applies. */
    IsProviderDefault(field: PromptSamplingFieldName): boolean {
        const value = this.Record[field];
        return value === null || value === undefined;
    }

    /** The field's display name from entity metadata. */
    Label(field: PromptSamplingFieldName): string {
        return this.Record.EntityInfo?.Fields.find((f) => f.Name === field)?.DisplayNameOrName ?? field;
    }
}
