/**
 * 6A phone heroes on the definition forms: the hero keeps icon, name, status and the primary
 * action; everything else collapses into one summary line that expands in place. These specs pin
 * each form's summary text and the shared toggle.
 */
import { describe, it, expect } from 'vitest';
import { MJActionFormComponentExtended } from './Actions/action-form.component';
import { MJAIPromptFormComponentExtended } from './AIPrompts/ai-prompt-form.component';
import { MJTemplateFormComponentExtended } from './Templates/templates-form.component';
import { MJQueryFormComponentExtended } from './Queries/query-form.component';

const cdr = { markForCheck: () => undefined, detectChanges: () => undefined };
function make<T extends object>(proto: T, over: object): T {
    // HeroDetailsOpen mirrors its field initializer, which Object.create skips.
    return Object.assign(Object.create(proto) as T, { cdr, HeroDetailsOpen: false }, over);
}

describe('Actions hero summary', () => {
    const f = (over: object) => make(MJActionFormComponentExtended.prototype, {
        category: { Name: 'Communication' }, ActionParams: [1, 2, 3], record: { Type: 'Generated', CodeApprovalStatus: 'Approved' }, ...over,
    });

    it('names category, type, param count and the code approval', () => {
        const form = f({});
        Object.defineProperty(form, 'HasCodeApproval', { get: () => true });
        expect(form.HeroSummary).toBe('Communication · Generated · 3 params · Code approved');
    });

    it('leaves out a missing category and an action without code approval', () => {
        const form = f({ category: null, ActionParams: [1] });
        Object.defineProperty(form, 'HasCodeApproval', { get: () => false });
        expect(form.HeroSummary).toBe('Generated · 1 param');
    });

    it('toggles the expanded hero', () => {
        const form = f({});
        expect(form.HeroDetailsOpen).toBe(false);
        form.ToggleHeroDetails();
        expect(form.HeroDetailsOpen).toBe(true);
        form.ToggleHeroDetails();
        expect(form.HeroDetailsOpen).toBe(false);
    });
});

describe('AI Prompts hero summary', () => {
    it('names type, parallelization, output, caching and effort when set', () => {
        const form = make(MJAIPromptFormComponentExtended.prototype, {
            record: { TypeID: 't1', EnableCaching: true, EffortLevel: 60 },
            getPromptTypeDisplayName: () => 'Chat',
            getParallelizationModeDisplay: () => 'None',
            getOutputTypeDisplay: () => 'object',
        });
        expect(form.HeroSummary).toBe('Chat · Parallel: None · Output: object · Caching on · Effort 60');
    });

    it('leaves out an unset type, caching and effort', () => {
        const form = make(MJAIPromptFormComponentExtended.prototype, {
            record: { TypeID: null, EnableCaching: false, EffortLevel: null },
            getPromptTypeDisplayName: () => 'unused',
            getParallelizationModeDisplay: () => 'None',
            getOutputTypeDisplay: () => 'string',
        });
        expect(form.HeroSummary).toBe('Parallel: None · Output: string');
    });
});

describe('Templates hero summary', () => {
    it('names the category and the content count', () => {
        const form = make(MJTemplateFormComponentExtended.prototype, { record: { Category: 'Email' }, TemplateContents: [1, 2] });
        expect(form.HeroSummary).toBe('Email · 2 contents');
    });

    it('leaves out a missing category', () => {
        const form = make(MJTemplateFormComponentExtended.prototype, { record: { Category: null }, TemplateContents: [1] });
        expect(form.HeroSummary).toBe('1 content');
    });
});

describe('Queries hero summary', () => {
    it('names the category path and, for a saved query, the metadata state', () => {
        const form = make(MJQueryFormComponentExtended.prototype, { record: { IsSaved: true }, CategoryPathDisplay: 'Reports / Sales' });
        Object.defineProperty(form, 'ExtractionStatusLabel', { get: () => 'Current' });
        expect(form.HeroSummary).toBe('Reports / Sales · Metadata: Current');
    });

    it('says Uncategorized and skips metadata for an unsaved query', () => {
        const form = make(MJQueryFormComponentExtended.prototype, { record: { IsSaved: false }, CategoryPathDisplay: '' });
        Object.defineProperty(form, 'ExtractionStatusLabel', { get: () => 'unused' });
        expect(form.HeroSummary).toBe('Uncategorized');
    });
});
