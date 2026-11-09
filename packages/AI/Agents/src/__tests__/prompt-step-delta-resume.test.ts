/**
 * Prompt steps record their message stack as a delta only when the live stack is an append-only
 * extension of what the previous Prompt step recorded. The loop also replaces messages (expiry
 * stubs, compaction), removes them (expiry), and rewrites their content in place (expansion); after
 * any of those the step records the full stack, so a resume of a stopped run rebuilds the stack the
 * run actually had instead of bringing back expired or removed messages.
 *
 * Drives the real capturePromptStepMessages (recording) and buildResumedStoppedRunTurns (resume) on
 * a real BaseAgent. Each scenario asserts that the resumed turns equal the live stack and equal what
 * a full-stack recording of the same run resumes to.
 */
import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@memberjunction/ai';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';
import { BaseAgent, StoppedRunStackStepRecord, ExecuteAgentParams } from '../base-agent';

type Msg = AgentChatMessage;

interface CapturedMessages {
    conversationMessages: ChatMessage[];
    conversationMessagesDelta?: true;
}

interface Internals {
    capturePromptStepMessages(messages: ChatMessage[] | undefined): CapturedMessages;
    buildResumedStoppedRunTurns(steps: StoppedRunStackStepRecord[], params: ExecuteAgentParams): Msg[] | null;
}
const internals = (a: BaseAgent) => a as unknown as Internals;

/** A change the loop makes to the live stack before a given turn's prompt. */
type StackMutation = (stack: Msg[]) => void;

/** What one simulated run produced. */
interface SimulatedRun {
    /** The live non-volatile stack that went into the last prompt. */
    LiveStack: Msg[];
    /** How many messages the first prompt's stack held (history plus the starting message). */
    FirstStackLength: number;
    /** Prompt steps recorded the way BaseAgent records them. */
    DeltaSteps: StoppedRunStackStepRecord[];
    /** The same prompt steps, each recording the full non-volatile stack. */
    FullSteps: StoppedRunStackStepRecord[];
}

const TURNS = 10;
const HISTORY: Msg[] = [
    { role: 'user', content: 'Earlier question about renewals' },
    { role: 'assistant', content: 'Earlier answer about renewals' },
];
const ORIGINAL: Msg = { role: 'user', content: 'Summarize this quarter’s renewals and flag at-risk accounts' };

function promptStep(turn: number, captured: CapturedMessages, isLast: boolean): StoppedRunStackStepRecord {
    return {
        StepNumber: turn * 2 - 1,
        StepType: 'Prompt',
        StepName: 'Execute Agent Prompt',
        // The last prompt was running when the user stopped the run, so no decision tail is rebuilt.
        Status: isLast ? 'Running' : 'Completed',
        Success: isLast ? null : true,
        InputData: JSON.stringify({ promptId: 'p', ...captured }),
        OutputData: null,
    };
}

function runtimeState(turn: number): Msg {
    return { role: 'user', content: `<mj-runtime-state>{"turn":${turn}}</mj-runtime-state>`, metadata: { turnAdded: turn, volatileState: true } };
}

/**
 * Runs the loop for {@link TURNS} turns. Before each prompt the mutations for that turn are applied
 * and the volatile runtime-state fragment is refreshed; after each prompt the turn's invocation and
 * results are appended.
 */
function simulateRun(mutations: Record<number, StackMutation> = {}): SimulatedRun {
    const agent = internals(new BaseAgent());
    const stack: Msg[] = [...HISTORY, ORIGINAL];
    const deltaSteps: StoppedRunStackStepRecord[] = [];
    const fullSteps: StoppedRunStackStepRecord[] = [];
    let liveStack: Msg[] = [];
    let firstStackLength = 0;
    for (let turn = 1; turn <= TURNS; turn++) {
        mutations[turn]?.(stack);
        const volatileAt = stack.findIndex(m => m.metadata?.volatileState === true);
        if (volatileAt >= 0) {
            stack.splice(volatileAt, 1);
        }
        stack.push(runtimeState(turn));

        const isLast = turn === TURNS;
        deltaSteps.push(promptStep(turn, agent.capturePromptStepMessages(stack), isLast));
        liveStack = stack.filter(m => m.metadata?.volatileState !== true);
        fullSteps.push(promptStep(turn, { conversationMessages: liveStack.map(m => ({ ...m })) }, isLast));
        if (turn === 1) {
            firstStackLength = liveStack.length;
        }

        stack.push({ role: 'assistant', content: `Calling Lookup Account for batch ${turn}`, metadata: { turnAdded: turn } });
        stack.push({ role: 'user', content: `Action results for batch ${turn}:\n${'account row; '.repeat(40)}`, metadata: { turnAdded: turn } });
    }
    return { LiveStack: liveStack, FirstStackLength: firstStackLength, DeltaSteps: deltaSteps, FullSteps: fullSteps };
}

/** The live stack's own turns as a resume returns them: after the starting message, re-dated to turn 0. */
function expectedTurns(run: SimulatedRun): Msg[] {
    return run.LiveStack.slice(run.FirstStackLength).map(m =>
        m.metadata?.turnAdded !== undefined ? { ...m, metadata: { ...m.metadata, turnAdded: 0 } } : m
    );
}

function resume(steps: StoppedRunStackStepRecord[]): Msg[] | null {
    const params = { conversationMessages: [] } as unknown as ExecuteAgentParams;
    return internals(new BaseAgent()).buildResumedStoppedRunTurns(steps, params);
}

function isDelta(step: StoppedRunStackStepRecord): boolean {
    return JSON.parse(step.InputData ?? '{}').conversationMessagesDelta === true;
}

function storedBytes(steps: StoppedRunStackStepRecord[]): number {
    return steps.reduce((sum, s) => sum + (s.InputData?.length ?? 0), 0);
}

/** Index in the live stack of the results message appended after `turn`'s prompt. */
function resultsIndex(stack: Msg[], turn: number): number {
    return stack.findIndex(m => typeof m.content === 'string' && m.content.startsWith(`Action results for batch ${turn}:`));
}

const expiryStub: StackMutation = (stack) => {
    const i = resultsIndex(stack, 1);
    stack[i] = { ...stack[i], content: '[result expired after 2 turns]', metadata: { ...stack[i].metadata, isExpired: true } };
};
const expirySplice: StackMutation = (stack) => {
    stack.splice(resultsIndex(stack, 2), 1);
};
const compaction: StackMutation = (stack) => {
    const i = resultsIndex(stack, 3);
    const original = stack[i].content as string;
    stack[i] = {
        ...stack[i],
        content: `${original.slice(0, 40)}… [compacted from ${original.length} chars]`,
        metadata: { ...stack[i].metadata, wasCompacted: true, originalContent: original, canExpand: true },
    };
};
const expansionInPlace: StackMutation = (stack) => {
    const msg = stack[resultsIndex(stack, 3)];
    msg.content = msg.metadata?.originalContent as string;
    if (msg.metadata) {
        msg.metadata.wasCompacted = false;
        msg.metadata.canExpand = false;
        delete msg.metadata.originalContent;
    }
};

const SCENARIOS: Array<{ Name: string; Mutations: Record<number, StackMutation> }> = [
    { Name: 'append-only over 10 turns', Mutations: {} },
    { Name: 'expiry stub replaces a result at turn 3', Mutations: { 3: expiryStub } },
    { Name: 'expiry removes a result at turn 4', Mutations: { 4: expirySplice } },
    { Name: 'compaction replaces a result at turn 5', Mutations: { 5: compaction } },
    { Name: 'stub, removal and compaction combined', Mutations: { 3: expiryStub, 4: expirySplice, 5: compaction } },
    { Name: 'compaction, then in-place expansion of the same message', Mutations: { 5: compaction, 7: expansionInPlace } },
];

describe('BaseAgent prompt-step delta recording — resume rebuilds the live stack', () => {
    for (const scenario of SCENARIOS) {
        it(`${scenario.Name}: the resumed turns equal the live stack and the full-stack recording`, () => {
            const run = simulateRun(scenario.Mutations);
            const resumed = resume(run.DeltaSteps);
            expect(resumed).toEqual(expectedTurns(run));
            expect(resumed).toEqual(resume(run.FullSteps));
        });
    }

    it('records deltas on append-only turns and a full stack on the turn the loop rewrites a message', () => {
        const run = simulateRun({ 3: expiryStub, 4: expirySplice, 5: compaction });
        expect(run.DeltaSteps.map(isDelta)).toEqual([false, true, false, false, false, true, true, true, true, true]);
    });

    it('stores less than a full-stack recording', () => {
        for (const scenario of SCENARIOS) {
            const run = simulateRun(scenario.Mutations);
            const delta = storedBytes(run.DeltaSteps);
            const full = storedBytes(run.FullSteps);
            expect(delta).toBeLessThan(full);
            if (process.env.MJ_REPORT_PROMPT_STORAGE) {
                console.log(`${scenario.Name}: ${delta} vs ${full} bytes (${(100 * (1 - delta / full)).toFixed(1)}% smaller)`);
            }
        }
    });

    it('resumes a run recorded entirely as full stacks (older runs) unchanged', () => {
        const run = simulateRun({ 3: expiryStub, 4: expirySplice });
        expect(resume(run.FullSteps)).toEqual(expectedTurns(run));
    });

    it('detects append-only extensions by reference and metadata flags without calling JSON.stringify per message', () => {
        const agent = internals(new BaseAgent());
        let toJsonCallCount = 0;
        const trackedMsg: Msg = {
            role: 'user',
            content: 'Tracked message with custom toJSON spy',
            metadata: { turnAdded: 1 },
        };
        Object.defineProperty(trackedMsg, 'toJSON', {
            value() {
                toJsonCallCount++;
                return { role: this.role, content: this.content };
            },
        });

        const stack: Msg[] = [trackedMsg];
        const first = agent.capturePromptStepMessages(stack);
        expect(first.conversationMessagesDelta).toBeUndefined();
        expect(toJsonCallCount).toBe(0);

        // Append a second message and capture again — still zero JSON.stringify calls inside capturePromptStepMessages
        stack.push({ role: 'assistant', content: 'Turn 2 reply', metadata: { turnAdded: 2 } });
        const second = agent.capturePromptStepMessages(stack);
        expect(second.conversationMessagesDelta).toBe(true);
        expect(second.conversationMessages).toHaveLength(1);
        expect(toJsonCallCount).toBe(0);
    });
});
