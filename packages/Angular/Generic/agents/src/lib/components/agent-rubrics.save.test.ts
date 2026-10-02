import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('agent rubric link writes', () => {
    it('assigns the agent-rubric entity and checks the view and the save', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'agent-rubrics.component.ts'), 'utf8');
        expect(source).toContain('MJAIAgentRubricEntity');
        expect(source).not.toMatch(/\.Set\(/);
        expect(source).not.toMatch(/\.Get\(/);
        expect(source).toContain('links.Success');
        expect(source).toContain('row.Save()');
        expect(source).toContain('row.InnerLoad');
        expect(source).toContain('mjButton');
        expect(source).toContain('Sample rate');
        expect(source).toContain('Pass threshold');
        expect(source).toContain('Max self-check attempts');
        expect(source).toContain('Evaluator config');
        expect(source).toContain('row.SampleRate = draft.sampleRate');
        const form = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../../Explorer/core-entity-forms/src/lib/custom/AIAgents/ai-agent-form.component.html'), 'utf8');
        expect(form).toContain('[Provider]="Provider"');
        expect(form).toContain('mj-agent-rubrics');
    });
});
