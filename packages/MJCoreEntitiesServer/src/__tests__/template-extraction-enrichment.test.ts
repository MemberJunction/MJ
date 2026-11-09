import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class {} }));

import { CollectEnrichedDescriptions } from '../custom/template-extraction/pipeline';
import type { EnrichmentResult } from '../custom/template-extraction/types';

const EXAMPLE_OUTPUT_PATH = resolve(__dirname, '../../../../metadata/prompts/output/system/template-param-extraction.example.json');

describe('CollectEnrichedDescriptions', () => {
    it('reads descriptions in the shape the Template Parameter Extraction prompt returns', () => {
        // The prompt's own example output is the contract. A rename of the field the code reads
        // compiles fine and silently drops every AI description, so pin it to the example file.
        const example = JSON.parse(readFileSync(EXAMPLE_OUTPUT_PATH, 'utf8')) as EnrichmentResult;
        const descriptions = CollectEnrichedDescriptions(example);

        expect(descriptions.size).toBe(example.parameters.length);
        expect(descriptions.get('customername')).toBe('The name of the customer');
    });

    it('keys by lower-cased name and skips entries without a name or description', () => {
        const descriptions = CollectEnrichedDescriptions({
            parameters: [
                { name: 'OrderItems', description: 'Items in the order' },
                { name: '', description: 'no name' },
                { name: 'missingDescription', description: '' },
            ],
        });

        expect([...descriptions.entries()]).toEqual([['orderitems', 'Items in the order']]);
    });
});
