/**
 * `resolveToolChoiceForTurn` — withholding tools on the turn the run will not survive (plan §8.3).
 *
 * The off-by-one is the whole point and is invisible by inspection: the loop increments
 * `TotalPromptIterations` immediately BEFORE composing the prompt, so inside the gate the counter
 * already includes the turn about to go out. `iterations >= limit` therefore means "this turn is
 * the last one", not "the last one has been used". Getting it backwards forces `'none'` one turn
 * early — which reads as native tool calling quietly not working — or one turn late, which is the
 * bug the gate exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ChatToolChoice } from '@memberjunction/ai';
import type { AIPromptParams, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/** Reaches the protected gate without running a loop, and fakes the run counter it reads. */
class Probe extends BaseAgent {
    constructor(iterations: number | null) {
        super();
        (this as unknown as { _agentRun: unknown })._agentRun =
            iterations === null ? null : { TotalPromptIterations: iterations };
    }
    public Choice(params: ExecuteAgentParams): ChatToolChoice {
        return this.resolveToolChoiceForTurn(params);
    }
}

const params = (maxPerRun?: number, absolute?: number): ExecuteAgentParams =>
    ({ agent: { MaxIterationsPerRun: maxPerRun ?? null }, absoluteMaxIterations: absolute } as unknown as ExecuteAgentParams);

describe('resolveToolChoiceForTurn', () => {
    it("offers tools on an ordinary turn", () => {
        expect(new Probe(3).Choice(params(10))).toBe('auto');
    });

    it("withholds them on the agent's last permitted iteration", () => {
        // 10th of 10: the limit check fires the moment this turn returns, so a tool call here
        // would be executed and its result never read.
        expect(new Probe(10).Choice(params(10))).toBe('none');
    });

    it('withholds them past the limit too, not only exactly on it', () => {
        expect(new Probe(11).Choice(params(10))).toBe('none');
    });

    it('still offers them on the turn before the last', () => {
        expect(new Probe(9).Choice(params(10))).toBe('auto');
    });

    it('honours the per-run absolute override', () => {
        expect(new Probe(4).Choice(params(undefined, 5))).toBe('auto');
        expect(new Probe(5).Choice(params(undefined, 5))).toBe('none');
    });

    it('falls back to the shared absolute cap when no limit is configured', () => {
        expect(new Probe(4999).Choice(params())).toBe('auto');
        expect(new Probe(5000).Choice(params())).toBe('none');
    });

    it('takes whichever limit binds first', () => {
        // A generous absolute cap must not rescue a turn the per-agent limit has already ended.
        expect(new Probe(3).Choice(params(3, 5000))).toBe('none');
    });

    it('offers tools when no run is in flight', () => {
        // The eval harness composes parameters through BaseAgent without executing a loop; a turn
        // that is never iterated has no budget to be at the end of.
        expect(new Probe(null).Choice(params(10))).toBe('auto');
        expect(new Probe(0).Choice(params(10))).toBe('auto');
    });

    it('ignores a non-positive configured limit rather than forcing none forever', () => {
        expect(new Probe(1).Choice(params(0))).toBe('auto');
    });
});

/**
 * Tools may be declared only to an agent type that can read the call back. A catalog-wide
 * `DefaultToNativeToolCalling` reaches every agent type; without this gate a Flow agent with Actions
 * would be offered tools, answer with a call, and fail to parse its own empty reply.
 */
describe('SupportsNativeToolCalls — the per-type gate on declaring Actions as tools', () => {
    it('is on for Loop and off for every other shipped type', async () => {
        const { LoopAgentType } = await import('../agent-types/loop-agent-type');
        const { FlowAgentType } = await import('../agent-types/flow-agent-type');
        const { RealtimeAgentType } = await import('../agent-types/realtime-agent-type');
        expect(new LoopAgentType().SupportsNativeToolCalls).toBe(true);
        expect(new FlowAgentType().SupportsNativeToolCalls).toBe(false);
        expect(new RealtimeAgentType().SupportsNativeToolCalls).toBe(false);
    });
});

describe('applyNativeTools — refuses a type that cannot read the call back', () => {
    it('declares nothing for a Flow-type agent, before ever consulting the action catalog', async () => {
        const { FlowAgentType } = await import('../agent-types/flow-agent-type');
        class Refusal extends BaseAgent {
            constructor() {
                super();
                (this as unknown as { _agentTypeInstance: unknown })._agentTypeInstance = new FlowAgentType();
            }
            public Apply(promptParams: AIPromptParams, params: ExecuteAgentParams): void {
                this.applyNativeTools(promptParams, params);
            }
        }
        const promptParams = {} as AIPromptParams;
        // No engine is configured in this test: reaching the action catalog would throw. Returning
        // cleanly with no tools proves the type gate runs first.
        new Refusal().Apply(promptParams, { agent: { ID: 'x', Name: 'Flow Probe' } } as unknown as ExecuteAgentParams);
        expect(promptParams.tools).toBeUndefined();
        expect(promptParams.toolChoice).toBeUndefined();
    });
});
