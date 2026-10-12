/**
 * Writing and rewriting `decisions` conditions for an editor.
 *
 * Every test here holds the writers to one property: what they write is what the scanner reads
 * back. An editor that writes `decisions.triage.my question.value` or `=== 'don't know'` has written a
 * condition the runtime reads as something else, or cannot read at all, and nothing says so.
 */
import { describe, it, expect } from 'vitest';
import {
    DecisionChoiceTestOf,
    DecisionConditionLiteral,
    DecisionReferenceText,
    DecisionReferencesIn,
    RewriteDecisionChoiceValues,
    RewriteDecisionQuestionReferences,
} from '../task-graph/decision-conditions';
import { FlowDecisionKeyProblem } from '../task-graph/flow-decision-step';
import { CompileFlowToTaskGraph, type FlowCompilerPath, type FlowCompilerStep } from '../task-graph/flow-graph-compiler';
import { ValidateTaskGraphSpec } from '../task-graph/task-graph-validator';

describe('DecisionConditionLiteral', () => {
    it('quotes a plain value with single quotes', () => {
        expect(DecisionConditionLiteral('billing')).toBe("'billing'");
    });

    it('quotes a value holding an apostrophe with double quotes, which the Choice test reads back verbatim', () => {
        const literal = DecisionConditionLiteral("don't know");
        expect(literal).toBe('"don\'t know"');
        expect(DecisionChoiceTestOf(`decisions.triage.intent.value === ${literal}`)?.Values).toEqual(["don't know"]);
    });

    it('quotes a value holding a double quote with single quotes', () => {
        expect(DecisionConditionLiteral('say "hi"')).toBe('\'say "hi"\'');
    });

    it.each(['both \' and "', 'back\\slash', 'line\nbreak'])('has no literal for %p, since an escape would be read back with its backslash', (value) => {
        expect(DecisionConditionLiteral(value)).toBeNull();
    });
});

describe('DecisionReferenceText', () => {
    it('writes identifiers with dots', () => {
        expect(DecisionReferenceText('triage', 'intent', 'value')).toBe('decisions.triage.intent.value');
    });

    it('writes a question key that cannot follow a dot in brackets, which the scanner reads as that question', () => {
        const text = DecisionReferenceText('triage', 'my question', 'value');
        expect(text).toBe("decisions.triage['my question'].value");
        expect(DecisionReferencesIn(`${text} === 'a'`).References).toEqual([{ NodeId: 'triage', QuestionKey: 'my question', Field: 'value' }]);
    });

    it('has no reference for an empty name, or one no literal can carry', () => {
        expect(DecisionReferenceText('triage', '', 'value')).toBeNull();
        expect(DecisionReferenceText('', 'intent', 'value')).toBeNull();
        expect(DecisionReferenceText('triage', 'both \' and "', 'value')).toBeNull();
    });
});

describe('RewriteDecisionQuestionReferences', () => {
    const toCategory = (key: string): string | undefined => (key === 'intent' ? 'category' : undefined);

    it('renames the question in every reference to the step, in each form', () => {
        const condition = "decisions.triage.intent.value === 'a' || decisions?.triage?.intent?.value === 'b' || decisions['triage']['intent'].value === 'c'";
        expect(RewriteDecisionQuestionReferences(condition, 'triage', toCategory)).toBe(
            "decisions.triage.category.value === 'a' || decisions?.triage?.category?.value === 'b' || decisions['triage']['category'].value === 'c'",
        );
    });

    it('leaves another step\'s question of the same name, other questions and string literals alone', () => {
        const condition = "decisions.route.intent.value === 'a' && decisions.triage.urgent.probability > 0.5 && payload.x === 'decisions.triage.intent'";
        expect(RewriteDecisionQuestionReferences(condition, 'triage', toCategory)).toBe(condition);
    });

    it('yields references the scanner reads back to the new question', () => {
        const rewritten = RewriteDecisionQuestionReferences("decisions.triage.intent.value === 'a'", 'triage', toCategory);
        expect(DecisionReferencesIn(rewritten).References).toEqual([{ NodeId: 'triage', QuestionKey: 'category', Field: 'value' }]);
    });
});

describe('RewriteDecisionChoiceValues', () => {
    const billingToInvoices = (value: string): string | undefined => (value === 'billing' ? 'invoices' : undefined);

    it('renames the literal on either side of an equality or inequality', () => {
        expect(RewriteDecisionChoiceValues("decisions.triage.intent.value === 'billing'", 'triage', 'intent', billingToInvoices))
            .toBe("decisions.triage.intent.value === 'invoices'");
        expect(RewriteDecisionChoiceValues("'billing' == decisions.triage.intent.value", 'triage', 'intent', billingToInvoices))
            .toBe("'invoices' == decisions.triage.intent.value");
        expect(RewriteDecisionChoiceValues("decisions.triage.intent.value !== 'billing'", 'triage', 'intent', billingToInvoices))
            .toBe("decisions.triage.intent.value !== 'invoices'");
    });

    it('renames every comparison in a disjunction, and only the renamed value', () => {
        const rewritten = RewriteDecisionChoiceValues(
            "decisions.triage.intent.value === 'billing' || decisions.triage.intent.value === 'refund'",
            'triage',
            'intent',
            billingToInvoices,
        );
        expect(DecisionChoiceTestOf(rewritten)?.Values).toEqual(['invoices', 'refund']);
    });

    it('writes a renamed value that holds an apostrophe with double quotes', () => {
        const rewritten = RewriteDecisionChoiceValues("decisions.triage.intent.value === 'unsure'", 'triage', 'intent', () => "don't know");
        expect(rewritten).toBe('decisions.triage.intent.value === "don\'t know"');
        expect(DecisionChoiceTestOf(rewritten)?.Values).toEqual(["don't know"]);
    });

    it('leaves another question, another step, another field and a non-comparison alone', () => {
        const conditions = [
            "decisions.triage.other.value === 'billing'",
            "decisions.route.intent.value === 'billing'",
            "decisions.triage.intent.confidence === 'billing'",
            "decisions.triage.intent.value > 'billing'",
            "payload.note === 'billing'",
        ];
        for (const condition of conditions) {
            expect(RewriteDecisionChoiceValues(condition, 'triage', 'intent', billingToInvoices)).toBe(condition);
        }
    });

    it('leaves a literal as written when the new value has no literal that reads back', () => {
        const condition = "decisions.triage.intent.value === 'billing'";
        expect(RewriteDecisionChoiceValues(condition, 'triage', 'intent', () => 'both \' and "')).toBe(condition);
    });
});

describe('FlowDecisionKeyProblem', () => {
    it('accepts a key a condition can name, and says what is wrong with one it cannot', () => {
        expect(FlowDecisionKeyProblem('triage_2')).toBeNull();
        expect(FlowDecisionKeyProblem('')).toMatch(/it has no key/);
        expect(FlowDecisionKeyProblem('triage ')).toMatch(/its key "triage " cannot be named in a path condition/);
        expect(FlowDecisionKeyProblem('my key')).toMatch(/cannot be named in a path condition/);
    });
});

describe('a condition written with these helpers runs through the compiler and validator', () => {
    const TRIAGE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
    const questions = {
        intent: {
            kind: 'Choice' as const,
            instructions: 'Which team should handle this ticket?',
            options: [
                { value: "don't know", description: 'The ticket does not say.' },
                { value: 'billing', description: 'A question about an invoice.' },
            ],
        },
    };
    const steps: FlowCompilerStep[] = [
        {
            ID: TRIAGE_ID,
            Name: 'Triage',
            StepType: 'Decision',
            StartingStep: true,
            Status: 'Active',
            Configuration: JSON.stringify({ key: 'triage', questions }),
        },
        { ID: 'unsure', Name: 'Ask', StepType: 'Sub-Agent', StartingStep: false, Status: 'Active', SubAgentID: 'a1' },
        { ID: 'billing', Name: 'Bill', StepType: 'Sub-Agent', StartingStep: false, Status: 'Active', SubAgentID: 'a2' },
    ];
    const routeTo = (to: string, value: string): FlowCompilerPath => ({
        ID: `p-${to}`,
        OriginStepID: TRIAGE_ID,
        DestinationStepID: to,
        Condition: `${DecisionReferenceText('triage', 'intent', 'value')} === ${DecisionConditionLiteral(value)}`,
        Priority: 0,
    });

    it('covers a fork whose option holds an apostrophe, so the fork check finds every option', () => {
        const compiled = CompileFlowToTaskGraph(steps, [routeTo('unsure', "don't know"), routeTo('billing', 'billing')], {
            WorkflowName: 'Triage',
            ResolveAgentName: (id) => id,
            ResolveActionName: (id) => id,
            ResolvePromptName: (id) => id,
        });
        expect(compiled.Errors).toEqual([]);
        expect(ValidateTaskGraphSpec(compiled.Spec!).Errors).toEqual([]);
    });
});
