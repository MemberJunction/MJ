/**
 * Entity Document text that the record processors hand to a model is plain text, not HTML. Rendered with the
 * template engine's default HTML escaping, a value such as `Affineur & Owner` would reach the model as
 * `Affineur &amp; Owner`, and the raw prompt render cannot undo an escape made before it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TemplateEngineServer } from '@memberjunction/templates';
import { FieldRulesProcessor } from '../processors/FieldRulesProcessor';

/** Exposes the protected Entity Document render. */
class FieldRulesProcessorProbe extends FieldRulesProcessor {
    public Render(templateText: string, record: Record<string, unknown>): Promise<string> {
        return this.RenderEntityDocument(templateText, record);
    }
}

describe('record processors render model-bound Entity Documents without HTML escaping', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('FieldRulesProcessor renders an entityDocument source raw', async () => {
        const processor = new FieldRulesProcessorProbe({ RuleSet: { Rules: [] } });

        const text = await processor.Render('Job Title: {{ CurrentJobTitle }}', { CurrentJobTitle: 'Affineur & Owner' });

        expect(text).toBe('Job Title: Affineur & Owner');
    });

    it('FieldRulesProcessor still reports a failed render', async () => {
        vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplateSimple').mockResolvedValue({ Success: false, Output: '', Message: 'bad template' });
        const processor = new FieldRulesProcessorProbe({ RuleSet: { Rules: [] } });

        await expect(processor.Render('{{ x }}', {})).rejects.toThrow('bad template');
    });
});
