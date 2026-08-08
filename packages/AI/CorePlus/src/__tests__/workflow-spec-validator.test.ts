/**
 * Tests for `WorkflowSpec` validation.
 *
 * Two things matter most here. First, that the graph half is **delegated** rather than re-checked —
 * a second opinion about what a valid graph is would let a workflow accept steps the engine then
 * rejects. Second, that the trigger checks catch the shapes that would persist and then silently
 * never fire, which is the failure mode a user cannot debug from the UI.
 */
import { describe, it, expect } from 'vitest';
import { ValidateWorkflowSpec, FormatWorkflowValidationErrors } from '../task-graph/workflow-spec-validator';
import {
    ENTITY_INVOCATION_TYPES,
    IsAfterInvocationType,
    IsWorkflowLive,
    NormalizeInvocationType,
    NormalizeTriggers,
    TriggerKey,
    WORKFLOW_TRIGGER_INVOCATION_TYPES,
    type WorkflowSpec,
} from '../task-graph/workflow-spec';
import type { TaskGraphSpec } from '../task-graph/task-graph-spec';

const graph = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'W',
    tasks: [{ tempId: 'a', name: 'A', description: 'a', agentName: 'Sage', dependsOn: [] }],
    ...over,
});

const spec = (over: Partial<WorkflowSpec> = {}): WorkflowSpec => ({
    name: 'Weekly digest',
    status: 'Draft',
    graph: graph(),
    triggers: [{ type: 'OnDemand' }],
    ...over,
});

const codes = (s: WorkflowSpec) => ValidateWorkflowSpec(s).Errors.map((e) => e.Code);

describe('ValidateWorkflowSpec', () => {
    it('accepts a minimal on-demand workflow', () => {
        expect(ValidateWorkflowSpec(spec()).Valid).toBe(true);
    });

    it('requires a name', () => {
        expect(codes(spec({ name: '   ' }))).toContain('MissingName');
    });

    it('requires a graph', () => {
        expect(codes(spec({ graph: undefined as unknown as TaskGraphSpec }))).toContain('MissingGraph');
    });

    it('DELEGATES graph validation rather than re-implementing it', () => {
        // A second definition of "valid graph" would let a workflow accept steps the engine rejects.
        const bad = spec({ graph: graph({ tasks: [{ tempId: 'a', name: 'A', description: 'a', agentName: 'Sage', dependsOn: ['ghost'] }] }) });
        const result = ValidateWorkflowSpec(bad);
        expect(result.Valid).toBe(false);
        const err = result.Errors.find((e) => e.Code === 'InvalidGraph')!;
        // The graph's own machine-readable code survives, so a caller can still branch on it.
        expect(err.Message).toContain('UnknownDependency');
    });
});

describe('trigger validation', () => {
    it('accepts a schedule trigger', () => {
        expect(ValidateWorkflowSpec(spec({ triggers: [{ type: 'Schedule', cron: '0 9 * * MON' }] })).Valid).toBe(true);
    });

    it('rejects a schedule with no schedule', () => {
        expect(codes(spec({ triggers: [{ type: 'Schedule', cron: '' }] }))).toContain('MissingCron');
    });

    it('accepts an entity-event trigger', () => {
        const s = spec({ triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update' }] });
        expect(ValidateWorkflowSpec(s).Valid).toBe(true);
    });

    it('rejects an entity-event trigger with no entity', () => {
        const s = spec({ triggers: [{ type: 'EntityEvent', entityName: '', invocationType: 'Update' }] });
        expect(codes(s)).toContain('MissingEntityName');
    });

    it('rejects an entity-event trigger that never says which change fires it', () => {
        const s = spec({ triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType: '' }] });
        expect(codes(s)).toContain('MissingInvocationType');
    });

    it('rejects a record scope with no entity — an ID alone is unresolvable', () => {
        // IDs are only unique within an entity, so this would watch nothing rather than fail loudly.
        const s = spec({
            triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update', scopeRecordID: 'abc' }],
        });
        expect(codes(s)).toContain('ScopeWithoutEntity');
    });

    it('accepts a fully-scoped record watch', () => {
        const s = spec({
            triggers: [{
                type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update',
                scopeEntityName: 'Invoices', scopeRecordID: 'abc',
            }],
        });
        expect(ValidateWorkflowSpec(s).Valid).toBe(true);
    });

    it('rejects a duplicate trigger — the second would reconcile to nothing', () => {
        const s = spec({
            triggers: [
                { type: 'Schedule', cron: '0 9 * * MON' },
                { type: 'Schedule', cron: '0 9 * * MON' },
            ],
        });
        expect(codes(s)).toContain('DuplicateTrigger');
    });

    it('does NOT treat the same cron in two zones as a duplicate', () => {
        // Genuinely two schedules; collapsing them would silently drop one.
        const s = spec({
            triggers: [
                { type: 'Schedule', cron: '0 9 * * MON', timezone: 'America/New_York' },
                { type: 'Schedule', cron: '0 9 * * MON', timezone: 'Europe/London' },
            ],
        });
        expect(ValidateWorkflowSpec(s).Valid).toBe(true);
    });

    it('rejects an invented trigger kind rather than persisting an unfireable one', () => {
        const s = spec({ triggers: [{ type: 'Telepathy' } as unknown as WorkflowSpec['triggers'][number]] });
        expect(codes(s)).toContain('UnknownTriggerType');
    });

    it('reports every failure at once, not just the first', () => {
        const s = spec({
            name: '',
            triggers: [{ type: 'Schedule', cron: '' }, { type: 'EntityEvent', entityName: '', invocationType: '' }],
        });
        const found = new Set(codes(s));
        expect(found.has('MissingName')).toBe(true);
        expect(found.has('MissingCron')).toBe(true);
        expect(found.has('MissingEntityName')).toBe(true);
        expect(found.has('MissingInvocationType')).toBe(true);
    });

    it('attributes a trigger failure to its index', () => {
        const s = spec({ triggers: [{ type: 'OnDemand' }, { type: 'Schedule', cron: '' }] });
        expect(ValidateWorkflowSpec(s).Errors.find((e) => e.Code === 'MissingCron')!.TriggerIndex).toBe(1);
    });
});

describe('NormalizeTriggers', () => {
    it('treats an empty trigger list as on-demand', () => {
        expect(NormalizeTriggers(spec({ triggers: [] }))).toEqual([{ type: 'OnDemand' }]);
    });

    it('leaves a populated list alone', () => {
        const triggers: WorkflowSpec['triggers'] = [{ type: 'Schedule', cron: '* * * * *' }];
        expect(NormalizeTriggers(spec({ triggers }))).toBe(triggers);
    });

    it('validates an empty trigger list as the on-demand case', () => {
        expect(ValidateWorkflowSpec(spec({ triggers: [] })).Valid).toBe(true);
    });
});

describe('TriggerKey', () => {
    it('is stable for identical triggers', () => {
        expect(TriggerKey({ type: 'Schedule', cron: '0 9 * * *' }))
            .toBe(TriggerKey({ type: 'Schedule', cron: '0 9 * * *' }));
    });

    it('separates schedules by timezone', () => {
        expect(TriggerKey({ type: 'Schedule', cron: '0 9 * * *', timezone: 'UTC' }))
            .not.toBe(TriggerKey({ type: 'Schedule', cron: '0 9 * * *', timezone: 'Europe/London' }));
    });

    it('separates entity events by filter, so two narrowings are two subscriptions', () => {
        const base = { type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update' } as const;
        expect(TriggerKey({ ...base, filter: 'Amount > 100' })).not.toBe(TriggerKey({ ...base }));
    });

    it('collapses every OnDemand to one key', () => {
        expect(TriggerKey({ type: 'OnDemand' })).toBe(TriggerKey({ type: 'OnDemand' }));
    });
});

describe('IsWorkflowLive', () => {
    it.each([
        ['Active', true],
        ['Paused', false],
        ['Draft', false],
    ] as const)('%s → %s', (status, live) => {
        expect(IsWorkflowLive(spec({ status }))).toBe(live);
    });

    it('defaults a newly authored workflow to Draft, not Active', () => {
        // A workflow that starts firing the instant it is saved gives its author no chance to look
        // at it first — and every authoring surface produces something not yet reviewed.
        expect(IsWorkflowLive(spec())).toBe(false);
    });
});

describe('FormatWorkflowValidationErrors', () => {
    it('renders one line per error with its code', () => {
        const errors = ValidateWorkflowSpec(spec({ name: '', triggers: [{ type: 'Schedule', cron: '' }] })).Errors;
        const text = FormatWorkflowValidationErrors(errors);
        expect(text).toContain('[MissingName]');
        expect(text).toContain('[MissingCron]');
        expect(text.split('\n').length).toBe(errors.length);
    });

    it('names the offending trigger', () => {
        const errors = ValidateWorkflowSpec(spec({ triggers: [{ type: 'OnDemand' }, { type: 'Schedule', cron: '' }] })).Errors;
        expect(FormatWorkflowValidationErrors(errors)).toContain('(trigger 2)');
    });
});

describe('NormalizeInvocationType', () => {
    // The contract this fixes: the spec originally accepted "Update", but the platform composes
    // and matches on `<Before|After><Create|Update|Delete>`. A trigger naming "Update" persisted
    // fine and then never fired — caught only when a round-trip integration check actually saved one.

    it.each([
        ['Create', 'AfterCreate'],
        ['Update', 'AfterUpdate'],
        ['Delete', 'AfterDelete'],
    ] as const)('resolves the shorthand %s to the AFTER form', (input, expected) => {
        // After, not Before: "when an invoice changes, do X" means once the change has happened.
        // A Before* action participates in the save and can veto it — a workflow silently landing
        // there could block a user's save, which nobody asking for a workflow has in mind.
        expect(NormalizeInvocationType(input)).toBe(expected);
    });

    it.each(ENTITY_INVOCATION_TYPES)('passes through the exact platform name %s', (name) => {
        expect(NormalizeInvocationType(name)).toBe(name);
    });

    it('is case-insensitive, because an author types what reads naturally', () => {
        expect(NormalizeInvocationType('afterupdate')).toBe('AfterUpdate');
        expect(NormalizeInvocationType('  update  ')).toBe('AfterUpdate');
    });

    it('still RESOLVES Before* — refusing it is the validator\'s job, not the normalizer\'s', () => {
        // Keeping resolution total means the validator can name what it is refusing, rather than
        // reporting the vaguer "not a change this platform fires".
        expect(NormalizeInvocationType('BeforeDelete')).toBe('BeforeDelete');
    });

    it('returns null for something unrecognized rather than guessing a neighbour', () => {
        // Guessing would be worse than failing: the workflow would fire at a moment its author
        // never asked for.
        expect(NormalizeInvocationType('Whenever')).toBeNull();
        expect(NormalizeInvocationType('')).toBeNull();
    });
});

describe('invocation-type validation', () => {
    const withInvocation = (invocationType: string) =>
        spec({ triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType }] });

    it('accepts the shorthand', () => {
        expect(ValidateWorkflowSpec(withInvocation('Update')).Valid).toBe(true);
    });

    it('accepts an exact After name', () => {
        expect(ValidateWorkflowSpec(withInvocation('AfterDelete')).Valid).toBe(true);
    });

    it.each(['Validate', 'BeforeCreate', 'BeforeUpdate', 'BeforeDelete'])(
        'REFUSES %s — that runs inside the save and would hold it open',
        (name) => {
            // Not discouraged, refused. Validate and Before* are synchronous participants in the
            // save, inside the held transaction, able to abort it. Binding an agent run there puts
            // an unbounded LLM call in the middle of a user pressing Save — and this is the
            // friendliest API in the program, so the hazard must not be one field away.
            expect(codes(withInvocation(name))).toContain('UnsupportedInvocationType');
        },
    );

    it('names the invocation types that ARE allowed, so the fix is one round-trip', () => {
        const err = ValidateWorkflowSpec(withInvocation('BeforeUpdate')).Errors
            .find((e) => e.Code === 'UnsupportedInvocationType')!;
        expect(err.Message).toContain('AfterUpdate');
    });

    it('REJECTS an unresolvable invocation type at author time', () => {
        // Rather than at save — a trigger bound to a nonexistent invocation type persists happily
        // and then never fires, which is undebuggable from the UI.
        expect(codes(withInvocation('Whenever'))).toContain('UnknownInvocationType');
    });

    it('names the legal values in the error, so the fix is one round-trip', () => {
        const err = ValidateWorkflowSpec(withInvocation('Whenever')).Errors
            .find((e) => e.Code === 'UnknownInvocationType')!;
        expect(err.Message).toContain('AfterUpdate');
    });
});

describe('filter is honored, and checked while it can still be fixed', () => {
    const withFilter = (filter: string) =>
        spec({ triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update', filter }] });

    it('ACCEPTS a predicate — the change contract it needs now exists', () => {
        // Superseded the blanket refusal: deciding "this invoice crossed 90 days" needs the
        // before/after values of the change, and EntityChangeContext now carries them to the filter.
        expect(ValidateWorkflowSpec(withFilter("DidFieldChangeToValue('Status','Approved')")).Valid).toBe(true);
    });

    it('accepts an expression over the raw before/after bags', () => {
        expect(ValidateWorkflowSpec(withFilter('NewValues.Amount > 100 && OldValues.Amount <= 100')).Valid).toBe(true);
    });

    it('REJECTS an expression that does not parse', () => {
        // Filters fail closed at runtime, so a syntax error is not a loud failure — it is a trigger
        // that silently never fires. Catching it here is the only place the author sees it.
        expect(codes(withFilter('Amount >'))).toContain('InvalidFilter');
    });

    it('rejects a statement where an expression belongs', () => {
        expect(codes(withFilter('const x = 1;'))).toContain('InvalidFilter');
    });

    it('names the shape it wanted, so the message is actionable', () => {
        const err = ValidateWorkflowSpec(withFilter('Amount >')).Errors
            .find((e) => e.Code === 'InvalidFilter')!;
        expect(err.Message).toContain('DidFieldChangeToValue');
    });

    it('ignores an empty filter — absent and blank mean the same thing', () => {
        expect(ValidateWorkflowSpec(withFilter('   ')).Valid).toBe(true);
    });

    it('still separates two triggers that differ only by filter', () => {
        // TriggerKey keeps filter in the identity so the day filters land, two narrowings are two
        // subscriptions rather than one silently-collapsed duplicate.
        const s2 = spec({
            triggers: [
                { type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update', filter: 'a' },
                { type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update', filter: 'b' },
            ],
        });
        expect(codes(s2)).not.toContain('DuplicateTrigger');
    });
});

describe('IsAfterInvocationType', () => {
    it.each(WORKFLOW_TRIGGER_INVOCATION_TYPES)('%s runs after the save has committed', (name) => {
        expect(IsAfterInvocationType(name)).toBe(true);
    });

    it.each(['Validate', 'BeforeCreate', 'BeforeUpdate', 'BeforeDelete'] as const)(
        '%s does not',
        (name) => { expect(IsAfterInvocationType(name)).toBe(false); },
    );
});
