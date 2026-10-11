/**
 * The shipped rubric prompt templates, rendered the way MJ's TemplateEngine renders them: Nunjucks
 * with autoescape on. These pin the contract between the engine's template data
 * (`promptData.ts`) and the templates in `/metadata/prompts/templates/rubrics`, so renaming a field on
 * either side fails here instead of at a model call.
 */
import { readdirSync, readFileSync } from 'node:fs';
import nunjucks from 'nunjucks';
import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { BuildCriteriaPromptData, BuildRubricVersionPromptData, type RubricCriterionPromptData, type RubricPromptData } from '../promptData.js';

const TEMPLATES = new URL('../../../../../metadata/prompts/templates/rubrics/', import.meta.url);
const env = new nunjucks.Environment(null, { autoescape: true });

function template(path: string): string {
    return readFileSync(new URL(path, TEMPLATES), 'utf8');
}

function render(path: string, data: object): string {
    return env.renderString(template(path), data);
}

function version(): RubricVersionSnapshot {
    const leaf = {
        id: 'a', key: 'clarity', name: "Reader's clarity", description: 'Whether a reader <new to MJ> can follow it.', guidance: 'Read the first sentence.',
        nodeType: 'Criterion' as const, scaleId: 'levels', weight: 1, isAdvisory: false, isGate: true, evidenceRequired: true, rationaleRequired: false, sequence: 0,
        anchors: [{ scaleLevelId: 'high', descriptor: 'A newcomer can act on it & move on.' }],
        evaluatorConfig: { AI: { Hints: 'Look for "next step" phrasing.' } },
    };
    return {
        id: 'version', rubricId: 'rubric', instructions: 'Judge the reply, not the question.', notApplicablePolicy: 'NotAllowed', passThreshold: 0.7,
        scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [
            leaf,
            { ...leaf, id: 'b', key: 'speed', name: 'Speed', description: null, guidance: null, scaleId: 'numeric', isGate: false, evidenceRequired: false,
                notApplicablePolicy: 'ExcludeAndRedistribute', anchors: [], evaluatorConfig: undefined, sequence: 1 },
        ],
        scales: [
            { id: 'levels', scaleType: 'Levels', higherIsBetter: true, levels: [
                { id: 'high', label: 'Meets', value: 1, normalizedValue: 1, sequence: 0 },
                { id: 'low', label: 'Miss', value: 0, normalizedValue: 0, sequence: 1 },
            ] },
            { id: 'numeric', scaleType: 'Numeric', minValue: 0, maxValue: 10, step: 1, higherIsBetter: false, levels: [] },
        ],
        bands: [],
    };
}

/** Renders each criterion through the criterion template, as the prompt service does. */
function renderedCriteria(tree: RubricVersionSnapshot): RubricCriterionPromptData[] {
    const rubric = BuildRubricVersionPromptData(tree);
    return BuildCriteriaPromptData(tree).map(criterion => ({ ...criterion, Text: render('rubric-criterion.template.md', { Rubric: rubric, Criterion: criterion }) }));
}

/** The evaluator template with a judge rendered into its slot, as AIPromptRunner composes a child prompt. */
function composed(mode: RubricPromptData['Mode'], judge = 'judges/default-judge.template.md'): string {
    const tree = version();
    const data: RubricPromptData = { Rubric: BuildRubricVersionPromptData(tree), Mode: mode, Criteria: renderedCriteria(tree), Subject: { EntityName: 'MJ: Documents', RecordID: '1' } };
    const judgePrompt = render(judge, data);
    return render('rubric-evaluator.template.md', { ...data, judgePrompt });
}

describe('Rubric Criterion template', () => {
    const [clarity, speed] = renderedCriteria(version()).map(criterion => criterion.Text ?? '');

    it('renders the name, key, gate, description, guidance, hints, quote rule, and policy without escaping authored text', () => {
        expect(clarity).toContain("### Reader's clarity (`clarity`)");
        expect(clarity).toContain('This criterion is a gate');
        expect(clarity).toContain('Whether a reader <new to MJ> can follow it.');
        expect(clarity).toContain('Guidance: Read the first sentence.');
        expect(clarity).toContain('Hints: Look for "next step" phrasing.');
        expect(clarity).toContain('Quote the subject as evidence for this criterion.');
        expect(clarity).toContain('Not applicable is not allowed: choose a level.');
        expect(clarity).not.toMatch(/&#39;|&lt;|&quot;|&amp;/);
    });

    it('lists the levels lowest to highest with their anchors', () => {
        expect(clarity).toMatch(/Levels, lowest to highest:\s*\n- \*\*Miss\*\*\n- \*\*Meets\*\*: A newcomer can act on it & move on\./);
    });

    it('renders a numeric scale as a range, and the effective not-applicable policy', () => {
        expect(speed).toContain('Score with a number from 0 to 10, in steps of 1. Lower is better.');
        expect(speed).toContain('the criterion is then left out and its weight goes to the others');
        expect(speed).not.toContain('Levels, lowest to highest');
        expect(speed).not.toContain('gate');
        expect(speed).not.toContain('Guidance:');
    });
});

describe('Rubric Evaluator template with a judge in its slot', () => {
    it('composes the judge, the rubric instructions, and every rendered criterion, and asks for decisions in SinglePass', () => {
        const prompt = composed('SinglePass');
        const judge = template('judges/default-judge.template.md').split('\n')[0];
        expect(prompt.indexOf(judge)).toBeGreaterThan(prompt.indexOf('## How to judge'));
        expect(prompt).toContain('## Rubric instructions\n\nJudge the reply, not the question.');
        expect(prompt).toContain("### Reader's clarity (`clarity`)");
        expect(prompt).toContain('### Speed (`speed`)');
        expect(prompt).toContain('{"decisions": [{"key": "<criterion key>"');
        expect(prompt).not.toContain('"chosen"');
        expect(prompt).not.toMatch(/\{\{|\{%|&#39;|&lt;/);
    });

    it('asks for one chosen level with probabilities in PerCriterion', () => {
        const prompt = composed('PerCriterion');
        expect(prompt).toContain('{"chosen": "<level label>", "probabilities"');
        expect(prompt).not.toContain('"decisions"');
    });

    it('leaves the instructions heading out when the rubric has none', () => {
        const tree = version();
        tree.instructions = null;
        const data: RubricPromptData = { Rubric: BuildRubricVersionPromptData(tree), Mode: 'SinglePass', Criteria: renderedCriteria(tree), Subject: { EntityName: '', RecordID: '' } };
        expect(render('rubric-evaluator.template.md', { ...data, judgePrompt: 'Judge.' })).not.toContain('## Rubric instructions');
    });

    it('never carries the subject: it arrives as its own message', () => {
        expect(template('rubric-evaluator.template.md')).not.toMatch(/Subject\.|content/);
    });
});

describe('Shipped judge templates', () => {
    const judges = readdirSync(new URL('judges/', TEMPLATES)).filter(name => name.endsWith('.template.md'));

    it('ships a default judge and one per agent', () => {
        expect(judges).toContain('default-judge.template.md');
        expect(judges.length).toBeGreaterThanOrEqual(16);
    });

    it.each(judges)('%s renders as plain guidance inside the evaluator', name => {
        const prompt = composed('SinglePass', `judges/${name}`);
        expect(prompt).toContain(template(`judges/${name}`).trim().split('\n')[0]);
        expect(template(`judges/${name}`)).not.toMatch(/"decisions"|Return JSON/);
        expect(prompt).not.toMatch(/\{\{|\{%/);
    });
});
