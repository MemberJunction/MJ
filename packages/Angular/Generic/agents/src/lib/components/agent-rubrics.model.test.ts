import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DisableLink, LinkDraft, MakeDefaultLink } from './agent-rubrics.model';

describe('agent rubric links', () => {
    it('does not keep camelCase aliases of the link helpers', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'agent-rubrics.model.ts'), 'utf8');
        expect(source).not.toContain('export function sortAgentRubrics');
        expect(source).not.toContain('export function makeDefaultLink');
        expect(source).not.toContain('export function disableLink');
        const component = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'agent-rubrics.component.ts'), 'utf8');
        expect(component).toContain('EscapeSQLString');
        expect(component).not.toContain(".replace(/'/g");
    });

    it('leaves only the newly saved Evaluation link as the default', () => {
        const next = MakeDefaultLink([
            { ID: 'first', Purpose: 'Evaluation', Status: 'Active', IsDefault: true },
            { ID: 'second', Purpose: 'Evaluation', Status: 'Active', IsDefault: false },
            { ID: 'check', Purpose: 'SelfCheck', Status: 'Active', IsDefault: true },
        ], 'second');
        expect(next.find(row => row.ID === 'first')?.IsDefault).toBe(false);
        expect(next.find(row => row.ID === 'second')?.IsDefault).toBe(true);
        expect(next.find(row => row.ID === 'check')?.IsDefault).toBe(true);
    });

    it('requires a sample rate before a production sampling link can be saved', () => {
        expect(LinkDraft({ purpose: 'ProductionSampling', sampleRate: null })).toEqual({ error: 'Production sampling needs a sample rate.' });
        const saved = LinkDraft({
            purpose: 'ProductionSampling',
            sampleRate: 0.25,
            passThreshold: 0.8,
            maxSelfCheckAttempts: 2,
            evaluatorConfig: ' {"EvaluatorType":"AIPrompt"} ',
            isDefault: true,
        });
        expect(saved).toEqual({
            purpose: 'ProductionSampling',
            sampleRate: 0.25,
            passThreshold: 0.8,
            maxSelfCheckAttempts: 2,
            evaluatorConfig: '{"EvaluatorType":"AIPrompt"}',
            isDefault: true,
        });
        expect(LinkDraft({ purpose: 'Evaluation', sampleRate: null, isDefault: false })).toMatchObject({ purpose: 'Evaluation', sampleRate: null });
    });

    it('turns a link off without deleting it, and it is no longer the default', () => {
        expect(DisableLink({ ID: 'first', Purpose: 'Evaluation', Status: 'Active', IsDefault: true })).toEqual({
            ID: 'first',
            Purpose: 'Evaluation',
            Status: 'Disabled',
            IsDefault: false,
        });
    });
});
