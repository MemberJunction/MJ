/**
 * Compiling a design-time Flow into an executable `TaskGraphSpec` (Track C1.1, plan §7).
 *
 * The compiler is pure, so every rule that decides whether a flow keeps its behaviour on the new
 * engine is testable here — before anything changes execution. The phase ORDER is what most of
 * these pin: exclusion → single entry → reachability → cycle rejection → emission. Each ordering
 * exists because the naive alternative silently runs work the flow never ran.
 */
import { describe, it, expect } from 'vitest';
import { CompileFlowToTaskGraph, type FlowCompilerPath, type FlowCompilerStep } from '../task-graph/flow-graph-compiler';
import { ConfigOf, NormalizeDependency } from '../task-graph/task-graph-spec';
import { ValidateTaskGraphSpec } from '../task-graph/task-graph-validator';

const step = (over: Partial<FlowCompilerStep> & Pick<FlowCompilerStep, 'ID' | 'Name'>): FlowCompilerStep => ({
    StepType: 'Sub-Agent',
    StartingStep: false,
    Status: 'Active',
    SubAgentID: 'agent-1',
    ...over,
});

const path = (over: Partial<FlowCompilerPath> & Pick<FlowCompilerPath, 'ID' | 'OriginStepID' | 'DestinationStepID'>): FlowCompilerPath => ({
    Priority: 0,
    ...over,
});

const options = {
    WorkflowName: 'W',
    ResolveAgentName: (id: string) => (id === 'missing' ? null : `Agent ${id}`),
    ResolveActionName: (id: string) => (id === 'missing' ? null : `Action ${id}`),
    ResolvePromptName: (id: string) => (id === 'missing' ? null : `Prompt ${id}`),
};

const depsOf = (spec: { tasks: Array<{ tempId: string; dependsOn: unknown[] }> }, tempId: string) =>
    (spec.tasks.find((t) => t.tempId === tempId)!.dependsOn as Array<string | object>).map(NormalizeDependency);

describe('phase 1 — exclusion', () => {
    it('excludes a non-Active step AND every path touching it', () => {
        // Emitting the node's successor with its edges dropped would leave that successor with no
        // prerequisites at all — immediately eligible, running at wave one. That is the failure this
        // ordering prevents, and it is silent.
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B', Status: 'Disabled' })],
            [path({ ID: 'p', OriginStepID: 'a', DestinationStepID: 'b' })],
            options,
        );
        expect(res.Success).toBe(true);
        expect(res.Spec!.tasks.map((t) => t.tempId)).toEqual(['a']);
        expect(res.Excluded).toContainEqual({ StepID: 'b', Reason: 'NotActive' });
    });

    it('falls through to the alternate branch when one destination is disabled', () => {
        // Matches the walker: a non-Active destination is rejected at edge selection and the next
        // priority wins. The disabled branch simply does not exist in the compiled graph.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'hi', Name: 'Hi', Status: 'Disabled' }),
                step({ ID: 'lo', Name: 'Lo' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'hi', Priority: 10 }),
                path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'lo', Priority: 1 }),
            ],
            options,
        );
        expect(res.Spec!.tasks.map((t) => t.tempId).sort()).toEqual(['a', 'lo']);
        // One surviving edge is not a fan-out, so it is not an exclusive group.
        expect(depsOf(res.Spec!, 'lo')[0].exclusiveGroup).toBeUndefined();
    });
});

describe('phase 2 — single entry', () => {
    it('takes the alphabetically-first starting step, and REFUSES the orphaned one', () => {
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'z', Name: 'Zebra', StartingStep: true }), step({ ID: 'a', Name: 'Apple', StartingStep: true })],
            [],
            options,
        );
        // Apple is the entry; Zebra is not reachable from it and is pruned rather than becoming a
        // second root that runs work the flow never ran. That much is unchanged.
        //
        // What changed is that this now FAILS to compile. It used to succeed, quietly shipping a
        // workflow missing a step its author had explicitly marked as an entry — which is how the
        // Content Pipeline demo drafted from half its research for its entire life, with nothing
        // anywhere reporting a problem. Refusing at submission, before anything runs, is strictly
        // better than running half a workflow and reporting success.
        expect(res.Success).toBe(false);
        expect(res.Errors.map((e) => e.Code)).toContain('UnreachableStartingStep');
        expect(res.Excluded).toContainEqual({ StepID: 'z', Reason: 'Unreachable' });
    });

    it('refuses a workflow with no active starting step, in workflow vocabulary', () => {
        const res = CompileFlowToTaskGraph([step({ ID: 'a', Name: 'A', StartingStep: true, Status: 'Disabled' })], [], options);
        expect(res.Success).toBe(false);
        expect(res.Errors[0].Code).toBe('NoStartingStep');
        // D18: an author reads "workflow" and "step", never graph/DAG/node/traversal.
        expect(res.Errors[0].Message).not.toMatch(/graph|DAG|node|traversal/i);
    });
});

describe('phase 3 — reachability', () => {
    it('prunes an island the walker could never reach', () => {
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'island', Name: 'Island' })],
            [],
            options,
        );
        expect(res.Spec!.tasks.map((t) => t.tempId)).toEqual(['a']);
    });
});

describe('phase 4 — cycle rejection', () => {
    it('refuses a looping workflow and names the steps, in workflow vocabulary', () => {
        // The in-run walker tolerates a back-edge; a run-once task DAG cannot. Rejected here so the
        // author reads about steps and loops rather than about cycles in a graph.
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' })],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b' }),
                path({ ID: 'p2', OriginStepID: 'b', DestinationStepID: 'a' }),
            ],
            options,
        );
        expect(res.Success).toBe(false);
        expect(res.Errors[0].Code).toBe('LoopDetected');
        expect(res.Errors[0].Message).toMatch(/ForEach|While/);
        expect(res.Errors[0].Message).not.toMatch(/\bgraph\b|\bDAG\b|\bcycle\b/i);
    });
});

describe('phase 5 — emission', () => {
    it('flips edge direction: a path points forward, a dependency points back', () => {
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' })],
            [path({ ID: 'p', OriginStepID: 'a', DestinationStepID: 'b' })],
            options,
        );
        expect(depsOf(res.Spec!, 'b')[0].tempId).toBe('a');
        expect(depsOf(res.Spec!, 'a')).toEqual([]);
    });

    it('marks a sequential fan-out as ONE exclusive group', () => {
        // The heart of it. Sequential is an exclusive choice, not a chain — a chain would run
        // branches the author's flow has never run.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'b', Name: 'B' }),
                step({ ID: 'c', Name: 'C' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Priority: 5 }),
                path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'c', Priority: 1 }),
            ],
            options,
        );
        expect(depsOf(res.Spec!, 'b')[0].exclusiveGroup).toBe('a');
        expect(depsOf(res.Spec!, 'c')[0].exclusiveGroup).toBe('a');
        expect(depsOf(res.Spec!, 'b')[0].priority).toBe(5);
    });

    it('assigns sequence in the walker’s own tiebreak order — priority desc, then path id', () => {
        // Compiled edges get fresh identity and Priority defaults to 0, so ties are the common case.
        // Without sequence the same flow could pick a different branch than the engine it replaces.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'b', Name: 'B' }),
                step({ ID: 'c', Name: 'C' }),
            ],
            [
                path({ ID: 'zzz', OriginStepID: 'a', DestinationStepID: 'b' }),
                path({ ID: 'aaa', OriginStepID: 'a', DestinationStepID: 'c' }),
            ],
            options,
        );
        expect(depsOf(res.Spec!, 'c')[0].sequence).toBe(0);   // 'aaa' sorts first
        expect(depsOf(res.Spec!, 'b')[0].sequence).toBe(1);
    });

    it('does NOT make a single successor an exclusive group', () => {
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' })],
            [path({ ID: 'p', OriginStepID: 'a', DestinationStepID: 'b' })],
            options,
        );
        expect(depsOf(res.Spec!, 'b')[0].exclusiveGroup).toBeUndefined();
    });

    it('leaves fan-outs plain in parallel mode', () => {
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'b', Name: 'B' }),
                step({ ID: 'c', Name: 'C' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b' }),
                path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'c' }),
            ],
            { ...options, TraversalMode: 'parallel' },
        );
        expect(depsOf(res.Spec!, 'b')[0].exclusiveGroup).toBeUndefined();
    });

    it('carries conditions, policy and layout across', () => {
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({
                    ID: 'b', Name: 'B',
                    TimeoutSeconds: 30, RetryCount: 2, OnErrorBehavior: 'continue',
                    PositionX: 10, PositionY: 20, Width: 200, Height: 80,
                }),
            ],
            [path({ ID: 'p', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'x > 1', PathPoints: '[[1,2]]' })],
            options,
        );
        const b = res.Spec!.tasks.find((t) => t.tempId === 'b')!;
        expect(b.policy).toEqual({ timeoutSeconds: 30, retryCount: 2, onError: 'continue' });
        expect(b.layout).toEqual({ x: 10, y: 20, width: 200, height: 80 });
        expect(depsOf(res.Spec!, 'b')[0].condition).toBe('x > 1');
        expect(depsOf(res.Spec!, 'b')[0].pathPoints).toBe('[[1,2]]');
    });

    it('maps each step type onto its kind', () => {
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'act', Name: 'Act', StepType: 'Action', ActionID: 'x' }),
                step({ ID: 'pr', Name: 'Pr', StepType: 'Prompt', PromptID: 'y' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'act', Priority: 2 }),
                path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'pr', Priority: 1 }),
            ],
            options,
        );
        const kinds = Object.fromEntries(res.Spec!.tasks.map((t) => [t.tempId, t.kind]));
        expect(kinds).toEqual({ a: 'Agent', act: 'Action', pr: 'Prompt' });
        expect(ConfigOf(res.Spec!.tasks.find((t) => t.tempId === 'act')!, 'Action')?.actionName).toBe('Action x');
    });

    it('compiles a ForEach step into the shared loop operation, unexpanded', () => {
        // collectionPath resolves against the live payload, so a loop can never be unrolled at
        // compile time — the dispatcher expands it.
        const res = CompileFlowToTaskGraph(
            [step({
                ID: 'a', Name: 'A', StartingStep: true, StepType: 'ForEach', LoopBodyType: 'Action', ActionID: 'x',
                Configuration: JSON.stringify({ collectionPath: 'items', itemVariable: 'it', executionMode: 'parallel', maxConcurrency: 4 }),
            })],
            [],
            options,
        );
        const cfg = ConfigOf(res.Spec!.tasks[0], 'ForEach')!;
        expect(cfg.collectionPath).toBe('items');
        expect(cfg.executionMode).toBe('parallel');
        expect(cfg.maxConcurrency).toBe(4);
        expect(cfg.action?.name).toBe('Action x');
    });

    it('reports an unresolvable reference instead of emitting a step nothing can run', () => {
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'a', Name: 'A', StartingStep: true, SubAgentID: 'missing' })],
            [],
            options,
        );
        expect(res.Success).toBe(false);
        expect(res.Errors[0].Code).toBe('UnresolvedReference');
    });

    it('marks every compiled flow with edge failure semantics', () => {
        // A flow's error handling IS its outgoing edges; the dispatcher's default is the opposite.
        const res = CompileFlowToTaskGraph([step({ ID: 'a', Name: 'A', StartingStep: true })], [], options);
        expect(res.Spec!.failureSemantics).toBe('edges');
    });
});

describe('the compiled graph is accepted by the engine’s own validator', () => {
    it('passes ValidateTaskGraphSpec — the same function Submit runs', () => {
        // If the compiler could emit something the engine rejects, the cutover would fail at
        // submission rather than at compile time, which is far too late to be useful.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A', StartingStep: true }),
                step({ ID: 'b', Name: 'B' }),
                step({ ID: 'c', Name: 'C' }),
                step({ ID: 'join', Name: 'Join' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Priority: 2 }),
                path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'c', Priority: 1 }),
                path({ ID: 'p3', OriginStepID: 'b', DestinationStepID: 'join' }),
                path({ ID: 'p4', OriginStepID: 'c', DestinationStepID: 'join' }),
            ],
            options,
        );
        expect(res.Success).toBe(true);
        expect(ValidateTaskGraphSpec(res.Spec!)).toEqual({ Valid: true, Errors: [] });
    });
});

describe('human steps', () => {
    it('compiles a Human step, carrying its description as the instructions', () => {
        // The description IS what the person is being asked to do — the same convention a sub-agent
        // step uses for its message. Losing it leaves someone an inbox item with a title and no
        // statement of what they are approving.
        const res = CompileFlowToTaskGraph(
            [step({
                ID: 'h', Name: 'Approve', StepType: 'Human', StartingStep: true,
                Description: 'Approve the proposed descriptions.',
            })],
            [],
            options,
        );

        expect(res.Success).toBe(true);
        const node = res.Spec!.tasks.find((t) => t.tempId === 'h')!;
        expect(node.kind).toBe('Human');
        expect((node.configuration as { instructions?: string }).instructions)
            .toBe('Approve the proposed descriptions.');
    });

    it('compiles an UNASSIGNED human step rather than rejecting it', () => {
        // "Somebody needs to look at this" is a legitimate step. Requiring an assignee at authoring
        // time would force a name onto every approval, including the ones whose right owner depends
        // on what the run produced.
        const res = CompileFlowToTaskGraph(
            [step({ ID: 'h', Name: 'Approve', StepType: 'Human', StartingStep: true })],
            [],
            options,
        );

        expect(res.Success).toBe(true);
        expect((res.Spec!.tasks[0].configuration as { assignToUserID?: string }).assignToUserID).toBeUndefined();
    });

    it('reads an explicit assignee out of the step configuration', () => {
        const res = CompileFlowToTaskGraph(
            [step({
                ID: 'h', Name: 'Approve', StepType: 'Human', StartingStep: true,
                Configuration: JSON.stringify({ assignToUserID: 'user-7' }),
            })],
            [],
            options,
        );

        expect((res.Spec!.tasks[0].configuration as { assignToUserID?: string }).assignToUserID).toBe('user-7');
    });

    it('lets a human step sit mid-graph with dependents behind it', () => {
        // The shape that matters: work AFTER a person. If the edge were dropped the downstream step
        // would have no prerequisites and run immediately — approving nothing.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'Propose', StartingStep: true }),
                step({ ID: 'h', Name: 'Approve', StepType: 'Human' }),
                step({ ID: 'w', Name: 'Write' }),
            ],
            [
                path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'h' }),
                path({ ID: 'p2', OriginStepID: 'h', DestinationStepID: 'w' }),
            ],
            options,
        );

        expect(res.Success).toBe(true);
        // Dependencies normalize to objects, so the assertion is on the id they carry.
        const deps = depsOf(res.Spec!, 'w').map((d) => (typeof d === 'string' ? d : (d as { tempId: string }).tempId));
        expect(deps).toContain('h');
    });
});

describe('a second starting step is reported, not silently dropped', () => {
    it('names the step that would never run', () => {
        // A workflow has ONE entry. A step flagged as a second one is pruned as unreachable — and
        // pruning it in silence is how a workflow ships with half its work missing while looking
        // complete on the canvas. The Content Pipeline demo lived that: its second research step
        // was dropped, the join it fed had one input instead of two, and every draft was written
        // from half the evidence with nothing anywhere saying so.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A first', StartingStep: true }),
                step({ ID: 'b', Name: 'B second', StartingStep: true }),
            ],
            [],
            options,
        );

        const unreachable = res.Errors.filter((e) => e.Code === 'UnreachableStartingStep');
        expect(unreachable).toHaveLength(1);
        expect(unreachable[0].Message).toContain('B second');
        expect(unreachable[0].Message).toContain('A first');   // says where it DOES begin
    });

    it('stays quiet when the second starting step is reachable from the entry', () => {
        // Wired into the flow, it runs — the flag is redundant but harmless, and warning here would
        // train people to ignore the message that matters.
        const res = CompileFlowToTaskGraph(
            [
                step({ ID: 'a', Name: 'A first', StartingStep: true }),
                step({ ID: 'b', Name: 'B second', StartingStep: true }),
            ],
            [path({ ID: 'p', OriginStepID: 'a', DestinationStepID: 'b' })],
            options,
        );

        expect(res.Errors.filter((e) => e.Code === 'UnreachableStartingStep')).toHaveLength(0);
        expect(res.Spec!.tasks.map((t) => t.tempId).sort()).toEqual(['a', 'b']);
    });
});
