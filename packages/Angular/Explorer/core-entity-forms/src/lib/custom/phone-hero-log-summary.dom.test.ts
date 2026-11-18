/**
 * 6A phone heroes on the log-style forms: the hero keeps icon, title and status; what the log is
 * about collapses into one summary line, and the meta rows and metric grids sit behind it.
 */
import { describe, it, expect } from 'vitest';
import { MJAIAgentSessionFormComponentExtended } from './AIAgentSessions/ai-agent-session-form.component';
import { MJActionExecutionLogFormComponentExtended } from './Actions/action-execution-log-form.component';
import { MJAIPromptRunFormComponentExtended } from './AIPromptRuns/ai-prompt-run-form.component';

const cdr = { markForCheck: () => undefined, detectChanges: () => undefined };
function make<T extends object>(proto: T, over: object, getters: Record<string, unknown> = {}): T {
    // HeroDetailsOpen mirrors its field initializer, which Object.create skips.
    const f = Object.assign(Object.create(proto) as T, { cdr, HeroDetailsOpen: false }, over);
    for (const [k, v] of Object.entries(getters)) Object.defineProperty(f, k, { get: () => v });
    return f;
}

describe('AI Agent Sessions hero summary', () => {
    const f = (over: object, duration = '5m 52s') =>
        make(MJAIAgentSessionFormComponentExtended.prototype, { record: { Agent: 'Co-Agent' }, TargetAgentName: null, Channels: [1, 2], DelegatedRunCount: 0, ...over }, { SessionDuration: duration });

    it('names the agent, duration and channel count', () => {
        expect(f({}).HeroSummary).toBe('Co-Agent · 5m 52s · 2 channels');
    });

    it('shows the delegation target and a delegated-run count when there are any', () => {
        expect(f({ TargetAgentName: 'Scheduler', Channels: [1], DelegatedRunCount: 3 }).HeroSummary).toBe('Co-Agent → Scheduler · 5m 52s · 1 channel · 3 delegated runs');
    });

    it('toggles the expanded hero', () => {
        const form = f({});
        form.ToggleHeroDetails();
        expect(form.HeroDetailsOpen).toBe(true);
    });
});

describe('Action Execution Logs hero summary', () => {
    it('names the action, the duration and the user', () => {
        const form = make(MJActionExecutionLogFormComponentExtended.prototype, {
            Action: { Name: 'Send Single Message' }, User: { Name: 'Matt' },
            getExecutionDuration: () => 1200, formatDuration: (ms: number) => `${ms}ms`,
        });
        expect(form.HeroSummary).toBe('Send Single Message · 1200ms · Matt');
    });

    it('leaves out an action and user that have not loaded', () => {
        const form = make(MJActionExecutionLogFormComponentExtended.prototype, {
            Action: null, User: null, getExecutionDuration: () => 5, formatDuration: () => '5ms',
        });
        expect(form.HeroSummary).toBe('5ms');
    });
});

describe('AI Prompt Runs hero summary', () => {
    const base = { formatDuration: (ms: number | null) => `${ms}ms`, model: { Name: 'GPT 5' }, Prompt: { Name: 'Form Layout' } };

    it('names the run type, prompt, model and duration', () => {
        const form = make(MJAIPromptRunFormComponentExtended.prototype, { ...base, record: { RunType: 'Single', ChildPrompt: null, ExecutionTimeMS: 2700 } });
        expect(form.HeroSummary).toBe('Single · Form Layout · GPT 5 · 2700ms');
    });

    it('prefers the child prompt the run actually executed', () => {
        const form = make(MJAIPromptRunFormComponentExtended.prototype, { ...base, model: null, record: { RunType: null, ChildPrompt: 'Agent Prompt', ExecutionTimeMS: 10 } });
        expect(form.HeroSummary).toBe('Agent Prompt · 10ms');
    });
});
