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
import { NormalizeTriggers, TriggerKey, IsWorkflowLive, type WorkflowSpec } from '../task-graph/workflow-spec';
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
