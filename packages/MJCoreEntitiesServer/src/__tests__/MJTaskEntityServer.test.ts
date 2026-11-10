/**
 * `MJTaskEntityServer` keeps `Task.SecurityEnvelope` immutable after insert (the envelope holds the
 * constraints of the run that submitted a task graph, and an edit could only loosen them) and keeps
 * the runtime security fields of `Task.Configuration` dispatcher-owned (an edit could clear a step's
 * recorded taint, or change what its compensation runs with).
 *
 * The generated base is mocked to a minimal stub whose `Validate()` succeeds and whose fields report
 * dirtiness and their stored value, so the test exercises only the guards the subclass adds.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ServerOperationScopeManager, ValidationResult } from '@memberjunction/core';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    class MockMJTaskEntity {
        public SecurityEnvelope: string | null = null;
        public envelopeDirty = false;
        public Configuration: string | null = null;
        /** The `Configuration` the row held before this save. */
        public storedConfiguration: string | null = null;
        public StepType: string | null = 'Action';
        public ParentID: string | null = '00000000-0000-4000-8000-0000000000aa';
        public TypeID: string | null = null;
        public UserID: string | null = null;
        /** The task type's name, as the view joins it. */
        public Type: string | null = null;
        public Status = 'Pending';
        /** The `Status` the row held before this save. */
        public storedStatus = 'Pending';
        public ContextCurrentUser: { ID: string } | undefined = undefined;
        /** Other columns this save changes. */
        public dirtyFields = new Set<string>();
        private saved = false;
        public get IsSaved(): boolean {
            return this.saved;
        }
        public markSaved(): void {
            this.saved = true;
        }
        public GetFieldByName(name: string): { Dirty: boolean; OldValue?: unknown } | undefined {
            if (name === 'SecurityEnvelope') return { Dirty: this.envelopeDirty };
            if (name === 'Configuration') return { Dirty: this.Configuration !== this.storedConfiguration, OldValue: this.storedConfiguration };
            if (name === 'Status') return { Dirty: this.Status !== this.storedStatus, OldValue: this.storedStatus };
            const value = (this as unknown as Record<string, unknown>)[name];
            return { Dirty: this.dirtyFields.has(name), OldValue: value, Value: value };
        }
        public Validate(): ValidationResult {
            const result = new ValidationResult();
            result.Success = true;
            return result;
        }
        /** As `BaseEntity.ValidateAsync`: nothing of its own. */
        public async ValidateAsync(): Promise<ValidationResult> {
            const result = new ValidationResult();
            result.Success = true;
            return result;
        }
        /** As `BaseEntity.Save`: validates, and writes only when that passes. */
        public async Save(): Promise<boolean> {
            return this.Validate().Success;
        }
    }
    return { ...(await importOriginal<object>()), MJTaskEntity: MockMJTaskEntity };
});

import { ExecutableConfigurationChanged, MJTaskEntityServer, RuntimeSecurityChangeRefusal, SecurityEnvelopeChangeRefusal } from '../custom/MJTaskEntityServer.server';

/** The workflow task type's ID in these tests. */
const WORKFLOW_TYPE = '00000000-0000-4000-8000-0000000000ff';

/**
 * `Save` resolves workflow membership with database reads; here a row says it directly: `parentIsWorkflow` (default
 * true) for its stored parent, `nextParentIsWorkflow` (default: the same) for the parent this save gives it.
 */
type FactsHooks = { parentIsWorkflow?: boolean; nextParentIsWorkflow?: boolean };
// Per test: the shared config restores mocks before each one.
beforeEach(() => {
    vi.spyOn(MJTaskEntityServer.prototype as unknown as { resolveWorkflowFacts(): Promise<unknown> }, 'resolveWorkflowFacts')
        .mockImplementation(async function (this: FactsHooks) {
            const stored = this.parentIsWorkflow ?? true;
            return { WorkflowTypeID: WORKFLOW_TYPE, StoredParentIsWorkflow: stored, NextParentIsWorkflow: this.nextParentIsWorkflow ?? stored };
        });
});

type TestTask = MJTaskEntityServer & { envelopeDirty: boolean; storedConfiguration: string | null; markSaved(): void };

function task(opts: { saved: boolean; envelopeDirty?: boolean; stored?: object | null; next?: object | null }): TestTask {
    const t = new MJTaskEntityServer() as TestTask;
    t.SecurityEnvelope = '{"Version":1,"IsRunTainted":false}';
    t.envelopeDirty = opts.envelopeDirty ?? false;
    t.storedConfiguration = opts.stored ? JSON.stringify(opts.stored) : null;
    const next = opts.next === undefined ? opts.stored : opts.next;
    t.Configuration = next ? JSON.stringify(next) : null;
    if (opts.saved) t.markSaved();
    return t;
}

const config = (runtime: object, extra: object = {}): string => JSON.stringify({ inputMapping: '{"A":"payload.a"}', ...extra, runtime });

describe('SecurityEnvelopeChangeRefusal', () => {
    it('allows writing the envelope on a new row (the server submitting a graph)', () => {
        expect(SecurityEnvelopeChangeRefusal(false, true)).toBeNull();
    });

    it('allows saving an existing row that leaves the envelope alone', () => {
        expect(SecurityEnvelopeChangeRefusal(true, false)).toBeNull();
    });

    it('refuses changing the envelope on an existing row', () => {
        expect(SecurityEnvelopeChangeRefusal(true, true)).toContain('cannot be changed');
    });
});

describe('RuntimeSecurityChangeRefusal', () => {
    const tainted = config({ actionLogID: 'log-1', isOutputTainted: true, actionInput: { OrderID: 'ORD-42' } });

    it("refuses setting a step's recorded taint back to false", () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', isOutputTainted: false, actionInput: { OrderID: 'ORD-42' } })))
            .toContain('isOutputTainted');
    });

    it('refuses removing the recorded taint, or the whole runtime bag', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', actionInput: { OrderID: 'ORD-42' } }))).toContain('isOutputTainted');
        expect(RuntimeSecurityChangeRefusal(tainted, JSON.stringify({ inputMapping: '{}' }))).not.toBeNull();
        expect(RuntimeSecurityChangeRefusal(tainted, null)).not.toBeNull();
        expect(RuntimeSecurityChangeRefusal(tainted, '{not json')).not.toBeNull();
    });

    it('refuses changing the parameters a compensation runs with', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', isOutputTainted: true, actionInput: { OrderID: 'ORD-99' } })))
            .toContain('actionInput');
    });

    it('refuses a new row that arrives with runtime security fields already recorded', () => {
        expect(RuntimeSecurityChangeRefusal(null, config({ isOutputTainted: false }))).toContain('isOutputTainted');
    });

    it('allows an edit that leaves them as they were, and rows that have none', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, JSON.stringify({ ...JSON.parse(tainted), layout: { x: 1, y: 2 } }))).toBeNull();
        expect(RuntimeSecurityChangeRefusal(null, JSON.stringify({ inputMapping: '{}' }))).toBeNull();
    });

    it('refuses changing any other key the step recorded when it ran, such as the action log its compensation undoes', () => {
        expect(RuntimeSecurityChangeRefusal(config({ actionLogID: 'a' }), config({ actionLogID: 'b' }))).toContain('actionLogID');
    });
});

describe('MJTaskEntityServer.Validate', () => {
    it('fails validation when an existing task changes its envelope', () => {
        const result = task({ saved: true, envelopeDirty: true }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('SecurityEnvelope');
    });

    it('passes when a new task sets its envelope (a graph row, made by the task-graph service)', () => {
        const asService = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Tasks'] },
            fn,
        );
        const t = task({ saved: false, envelopeDirty: true });
        t.ContextCurrentUser = { ID: '00000000-0000-4000-8000-0000000000a1' };
        expect(asService(() => t.Validate().Success)).toBe(true);
    });

    it('passes when an existing task saves other fields', () => {
        expect(task({ saved: true, envelopeDirty: false }).Validate().Success).toBe(true);
    });

    it("refuses a save that clears a step's recorded taint, whoever makes it", () => {
        const result = task({ saved: true, stored: { runtime: { isOutputTainted: true } }, next: { runtime: { isOutputTainted: false } } }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('Configuration');
    });

    it("passes the dispatcher's own full-row saves, which carry the recorded fields unchanged", () => {
        const stored = { runtime: { isOutputTainted: true, actionInput: { OrderID: 'ORD-42' } } };
        expect(task({ saved: true, stored, next: { ...stored, layout: { x: 10, y: 20 } } }).Validate().Success).toBe(true);
    });
});

describe('MJTaskEntityServer: who completed a Human step, and the dispatcher scope', () => {
    const DISPATCHER = { ID: '00000000-0000-4000-8000-0000000000d1' };
    const REVIEWER = { ID: '00000000-0000-4000-8000-0000000000e2' };
    const OTHER = { ID: '00000000-0000-4000-8000-0000000000f3' };
    type HumanTask = TestTask & { StepType: string | null; Status: string; storedStatus: string; ContextCurrentUser: { ID: string } | undefined };

    /** A Human step assigned to REVIEWER, saved as `user`. */
    function human(user: { ID: string }, opts: { storedStatus?: string; stored?: object | null; next?: object | null } = {}): HumanTask {
        const t = task({ saved: true, stored: opts.stored ?? { human: { instructions: 'x' } }, next: opts.next }) as HumanTask;
        t.StepType = 'Human';
        (t as unknown as { UserID: string }).UserID = REVIEWER.ID;
        t.storedStatus = opts.storedStatus ?? 'Pending';
        t.Status = 'Complete';
        t.ContextCurrentUser = user;
        return t;
    }
    const completedBy = (t: TestTask): unknown => (JSON.parse(t.Configuration!) as { runtime?: { completedByUserID?: string } }).runtime?.completedByUserID;
    const asClient = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunInClientCrudBoundary(fn);
    const asDispatcher = <T>(fn: () => T, userId = DISPATCHER.ID): T => ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Tasks'], userId },
        fn,
    );

    it('records the assignee as the completer when the assignee completes the step', async () => {
        const t = human(REVIEWER);
        expect(await asClient(() => t.Save())).toBe(true);
        expect(completedBy(t)).toBe(REVIEWER.ID);
        expect(JSON.parse(t.Configuration!).human).toEqual({ instructions: 'x' });
    });

    it('records the assignee who saved, never the completer a caller wrote in', async () => {
        const forged = { human: { instructions: 'x' }, runtime: { completedByUserID: OTHER.ID } };
        const byClient = human(REVIEWER, { next: forged });
        expect(await asClient(() => byClient.Save())).toBe(true);
        expect(completedBy(byClient)).toBe(REVIEWER.ID);
    });

    it('refuses completing the step for anyone but its assignee, in their own client request', async () => {
        // Someone else, as their own client request.
        expect(await asClient(() => human(OTHER).Save())).toBe(false);
        // Server code as the assignee: an agent or action run saves as the graph's submitter, who is the assignee.
        expect(await human(REVIEWER).Save()).toBe(false);
        // Server authority entered inside a client request is server code too.
        const otherOperation = { operationKey: 'some-server-operation', source: 'ServerEngine' as const, allowedEntities: ['MJ: Tasks'] };
        expect(await asClient(() => ServerOperationScopeManager.Instance.RunWithAuthority(otherOperation, () => human(REVIEWER).Save()))).toBe(false);
        // So is server work a client request started (an agent run, a dispatcher pass).
        expect(await asClient(() => ServerOperationScopeManager.Instance.RunAsServerWork(() => human(REVIEWER).Save()))).toBe(false);
    });

    it('refuses editing the recorded completer of a step already complete, by a client or by server code', async () => {
        const stored = { runtime: { completedByUserID: OTHER.ID } };
        const edit = { runtime: { completedByUserID: REVIEWER.ID } };
        expect(await asClient(() => human(OTHER, { storedStatus: 'Complete', stored, next: edit }).Save())).toBe(false);
        expect(await human(OTHER, { storedStatus: 'Complete', stored, next: edit }).Save()).toBe(false);
        // A client save inside an outer dispatcher scope is still a client save: the boundary masks the scope.
        expect(await asDispatcher(() => asClient(() => human(DISPATCHER, { storedStatus: 'Complete', stored, next: edit }).Save()))).toBe(false);
    });

    it("refuses clearing a step's recorded taint outside the dispatcher scope, by a client or by server code", async () => {
        const stored = { runtime: { isOutputTainted: true } };
        const cleared = { runtime: { isOutputTainted: false } };
        const step = (user: { ID: string }) => {
            const t = task({ saved: true, stored, next: cleared }) as HumanTask;
            t.ContextCurrentUser = user;
            return t;
        };
        expect(await asClient(() => step(OTHER).Save())).toBe(false);
        expect(await step(OTHER).Save()).toBe(false);
        // A scope bound to another user does not cover this save.
        expect(await asDispatcher(() => step(OTHER).Save())).toBe(false);
    });

    it("lets the dispatcher's own writes through inside its scope, recording the responder it names", async () => {
        const settled = human(DISPATCHER, { next: { human: { instructions: 'x' }, runtime: { completedByUserID: REVIEWER.ID } } });
        expect(await asDispatcher(() => settled.Save())).toBe(true);
        expect(completedBy(settled)).toBe(REVIEWER.ID);

        const recorded = task({ saved: true, stored: { runtime: { isOutputTainted: true } }, next: { runtime: { isOutputTainted: false } } }) as HumanTask;
        recorded.ContextCurrentUser = DISPATCHER;
        expect(await asDispatcher(() => recorded.Save())).toBe(true);
    });
});

describe("MJTaskEntityServer: a workflow step's data is the dispatcher's", () => {
    const SUBMITTER = { ID: '00000000-0000-4000-8000-0000000000a1' };
    type Step = TestTask & { StepType: string | null; Status: string; storedStatus: string; ContextCurrentUser: { ID: string } | undefined; dirtyFields: Set<string> };
    const asClient = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunInClientCrudBoundary(fn);
    const asDispatcher = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Tasks'], userId: SUBMITTER.ID },
        fn,
    );

    /** A saved step of `stepType` changing `fields`, saved as the submitter; `completes` moves a Human step to Complete. */
    function step(stepType: string | null, fields: string[], completes = false): Step {
        const t = task({ saved: true, stored: { human: { instructions: 'x' } } }) as Step;
        t.StepType = stepType;
        // Every Human step of a real graph is assigned to its submitter.
        (t as unknown as { UserID: string | null }).UserID = stepType === 'Human' ? SUBMITTER.ID : null;
        t.storedStatus = 'Pending';
        t.Status = completes ? 'Complete' : 'Pending';
        t.ContextCurrentUser = SUBMITTER;
        fields.forEach((f) => t.dirtyFields.add(f));
        return t;
    }

    it("refuses server code rewriting a step's output, input, name or description, an agent run as the submitter included", async () => {
        for (const field of ['OutputPayload', 'InputPayload', 'Name', 'Description']) {
            expect(await step('Action', [field]).Save()).toBe(false);
            expect(await asClient(() => step('Action', [field]).Save())).toBe(false);
        }
    });

    it("refuses filling in a Human step's answer before the person completes it, and takes the person's own in their completing save", async () => {
        expect(await step('Human', ['OutputPayload']).Save()).toBe(false);
        expect(await asClient(() => step('Human', ['OutputPayload']).Save())).toBe(false);
        // Server code completing the step cannot give it an answer either.
        expect(await step('Human', ['OutputPayload'], true).Save()).toBe(false);
        expect(await asClient(() => step('Human', ['OutputPayload'], true).Save())).toBe(true);
        expect(await asClient(() => step('Human', ['InputPayload'], true).Save())).toBe(false);
    });

    it('refuses changing what a waiting step runs: its action, agent, prompt, kind or place in the graph', async () => {
        for (const field of ['ActionID', 'AgentID', 'PromptID', 'StepType', 'ParentID', 'TypeID', 'CompensatesTaskID']) {
            expect(await step('Action', [field]).Save()).toBe(false);
        }
        const remapped = step('Action', []);
        remapped.Configuration = JSON.stringify({ human: { instructions: 'x' }, inputMapping: { To: 'static:attacker@example.com' } });
        expect(await remapped.Save()).toBe(false);
    });

    it('lets anyone move a step on the canvas or give it a due date', async () => {
        const moved = step('Action', ['DueAt']);
        moved.Configuration = JSON.stringify({ human: { instructions: 'x' }, layout: { x: 10, y: 20 } });
        expect(await moved.Save()).toBe(true);
    });

    it('refuses reassigning a step, or rerunning, skipping or settling one by its status', async () => {
        expect(await step('Human', ['UserID']).Save()).toBe(false);
        expect(await asClient(() => step('Human', ['UserID']).Save())).toBe(false);
        const rerun = step('Action', []);
        rerun.storedStatus = 'Complete';
        rerun.Status = 'Pending';
        expect(await rerun.Save()).toBe(false);
        const skipped = step('Human', []);
        skipped.Status = 'Skipped';
        expect(await skipped.Save()).toBe(false);
    });

    it('refuses changing any of what a step recorded when it ran, its action log included', async () => {
        const t = task({ saved: true, stored: { runtime: { actionLogID: 'log-1', isOutputTainted: false } }, next: { runtime: { actionLogID: 'log-2', isOutputTainted: false } } }) as Step;
        t.ContextCurrentUser = SUBMITTER;
        expect(await t.Save()).toBe(false);
    });

    it("lets the dispatcher write a step's data, and leaves other tasks alone", async () => {
        expect(await asDispatcher(() => step('Action', ['OutputPayload', 'InputPayload']).Save())).toBe(true);
        const ordinary = step(null, ['OutputPayload', 'InputPayload', 'Name']);
        (ordinary as FactsHooks).parentIsWorkflow = false;
        expect(await ordinary.Save()).toBe(true);
        // An A2A store's row: `External`, with no parent.
        const a2a = step('External', ['OutputPayload', 'InputPayload']);
        (a2a as unknown as { ParentID: string | null }).ParentID = null;
        expect(await a2a.Save()).toBe(true);
    });
});

describe('ExecutableConfigurationChanged', () => {
    it('ignores layout and runtime, key order included, and reads anything else as a change', () => {
        expect(ExecutableConfigurationChanged('{"a":1,"layout":{"x":1}}', '{"layout":{"x":2},"a":1,"runtime":{"isOutputTainted":true}}')).toBe(false);
        expect(ExecutableConfigurationChanged(null, '{"layout":{"x":1}}')).toBe(false);
        expect(ExecutableConfigurationChanged('{"a":1}', '{"a":2}')).toBe(true);
        expect(ExecutableConfigurationChanged('{"a":1}', 'not json')).toBe(true);
    });
});

describe("MJTaskEntityServer: a workflow's metadata is the dispatcher's", () => {
    const SUBMITTER = { ID: '00000000-0000-4000-8000-0000000000a1' };
    type Parent = TestTask & { StepType: string | null; ParentID: string | null; Type: string | null; Status: string; storedStatus: string; ContextCurrentUser: { ID: string } | undefined; dirtyFields: Set<string> };
    const asDispatcher = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Tasks'], userId: SUBMITTER.ID },
        fn,
    );
    function parent(fields: string[], type = 'AI Workflow'): Parent {
        const t = task({ saved: true }) as Parent;
        t.StepType = null;
        t.ParentID = null;
        t.Type = type;
        (t as unknown as { TypeID: string }).TypeID = type === 'AI Workflow' ? WORKFLOW_TYPE : '00000000-0000-4000-8000-0000000000ee';
        t.ContextCurrentUser = SUBMITTER;
        fields.forEach((f) => t.dirtyFields.add(f));
        return t;
    }

    it('refuses rewriting who a workflow runs as, the data its steps read, or what it is attached to', async () => {
        for (const field of ['InputPayload', 'OutputPayload', 'AgentRunID', 'UserID', 'ConversationDetailID', 'TypeID', 'EnvironmentID']) {
            expect(await parent([field]).Save()).toBe(false);
        }
    });

    it("lets the dispatcher write them, leaves a workflow's status writable, and leaves other parentless tasks alone", async () => {
        expect(await asDispatcher(() => parent(['InputPayload']).Save())).toBe(true);
        const settled = parent([]);
        settled.Status = 'Complete';
        expect(await settled.Save()).toBe(true);
        expect(await parent(['InputPayload'], 'A2A Task').Save()).toBe(true);
    });
});

describe('MJTaskEntityServer: only the task-graph service makes a workflow or a step', () => {
    const SUBMITTER = { ID: '00000000-0000-4000-8000-0000000000a1' };
    const OTHER_TYPE = '00000000-0000-4000-8000-0000000000ee';
    type Row = TestTask & { StepType: string | null; ParentID: string | null; TypeID: string | null; Status: string; storedStatus: string;
        ContextCurrentUser: { ID: string } | undefined; dirtyFields: Set<string> } & FactsHooks;
    const asService = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Tasks'], userId: SUBMITTER.ID },
        fn,
    );
    /** A new row, made by an ordinary save as the submitter. */
    function created(fields: Partial<Row>): Row {
        const t = task({ saved: false }) as Row;
        t.StepType = null;
        t.ParentID = null;
        t.TypeID = OTHER_TYPE;
        t.ContextCurrentUser = SUBMITTER;
        Object.assign(t, fields);
        return t;
    }

    it('refuses creating a workflow, or a step under one, with or without a StepType, outside the service', async () => {
        expect(await created({ TypeID: WORKFLOW_TYPE }).Save()).toBe(false);
        expect(await created({ ParentID: 'p', StepType: 'Action' }).Save()).toBe(false);
        expect(await created({ ParentID: 'p', parentIsWorkflow: true }).Save()).toBe(false);
        // Filed under the workflow type under any parent: the dispatcher finds graphs by their steps' type.
        expect(await created({ ParentID: 'p', parentIsWorkflow: false, TypeID: WORKFLOW_TYPE }).Save()).toBe(false);
        expect(await asService(() => created({ TypeID: WORKFLOW_TYPE }).Save())).toBe(true);
        expect(await asService(() => created({ ParentID: 'p', StepType: 'Action' }).Save())).toBe(true);
    });

    it('leaves ordinary tasks and their subtasks alone', async () => {
        expect(await created({}).Save()).toBe(true);
        expect(await created({ ParentID: 'p', parentIsWorkflow: false }).Save()).toBe(true);
    });

    it('refuses turning an ordinary task into a workflow or a step by retyping or re-parenting it', async () => {
        const retyped = created({});
        retyped.markSaved();
        retyped.TypeID = WORKFLOW_TYPE;
        retyped.dirtyFields.add('TypeID');
        // The stored type is the ordinary one.
        (retyped as unknown as { GetFieldByName(n: string): unknown }).GetFieldByName = (name: string) =>
            name === 'TypeID' ? { Dirty: true, OldValue: OTHER_TYPE, Value: WORKFLOW_TYPE } : { Dirty: false, OldValue: (retyped as unknown as Record<string, unknown>)[name], Value: (retyped as unknown as Record<string, unknown>)[name] };
        expect(await retyped.Save()).toBe(false);

        const reparented = created({ ParentID: 'q', parentIsWorkflow: false, nextParentIsWorkflow: true });
        reparented.markSaved();
        expect(await reparented.Save()).toBe(false);
    });
});

describe('MJTaskEntityServer: the workflow checks need the save, or ValidateAsync', () => {
    const SUBMITTER = { ID: '00000000-0000-4000-8000-0000000000a1' };
    type Row = TestTask & { StepType: string | null; ParentID: string | null; TypeID: string | null;
        ContextCurrentUser: { ID: string } | undefined; dirtyFields: Set<string> } & FactsHooks;
    /** A saved row with a parent, renamed by an ordinary caller. */
    function renamed(fields: Partial<Row>): Row {
        const t = task({ saved: true }) as Row;
        t.StepType = null;
        t.ContextCurrentUser = SUBMITTER;
        Object.assign(t, fields);
        t.dirtyFields.add('Name');
        return t;
    }

    it('passes a bare Validate on an ordinary subtask, as REST runs it before saving', async () => {
        const subtask = renamed({ parentIsWorkflow: false, TypeID: '00000000-0000-4000-8000-0000000000ee' });
        expect(subtask.Validate().Success).toBe(true);
        expect(await subtask.Save()).toBe(true);
    });

    it("leaves a real step's rename to the save, which refuses it", async () => {
        const step = renamed({ StepType: 'Action' });
        expect(step.Validate().Success).toBe(true);
        expect(await step.Save()).toBe(false);
    });

    it('refuses it in ValidateAsync too, for a path that validates without this Save', async () => {
        const step = renamed({ StepType: 'Action' });
        const result = await step.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['Name']);
        expect((await renamed({ parentIsWorkflow: false }).ValidateAsync()).Success).toBe(true);
    });
});
