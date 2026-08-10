/**
 * Coverage for the CLI adapter driving harness processes through the sandbox executor.
 *
 * The refactor these tests lock in: adapters used to call `spawn()` directly, which meant a harness
 * always ran on the MJAPI host regardless of what the agent's sandbox config said. In production
 * that is an autonomous agent executing shell commands inside the API container, with that
 * container's network reach and cloud credentials — while the config claims `provider: 'docker'`.
 *
 * Routing every process through {@link SandboxExecutor} is what makes the sandbox choice real. It
 * also makes adapters testable without a harness binary, a container, or a network, which is what
 * these tests exercise: a fake executor replays canned JSONL and asserts the adapter's behaviour.
 */
import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../adapters/CodexAdapter';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor';
import { HarnessSessionConfig, HarnessTurnEvent } from '../types';

/** Replays a fixed set of stdout lines, recording how it was invoked. */
class FakeExecutor implements SandboxExecutor {
    public LastSpec: HarnessProcessSpec | undefined;
    public RunCount = 0;

    public constructor(
        private readonly stdoutLines: string[],
        private readonly exitCode: number | null = 0,
    ) {}

    public Run(spec: HarnessProcessSpec): HarnessProcess {
        this.LastSpec = spec;
        this.RunCount++;
        const lines = this.stdoutLines;
        return {
            Stdout: (async function* () {
                for (const line of lines) {
                    yield line;
                }
            })(),
            Stderr: (async function* () {
                // Nothing on stderr for these cases.
            })(),
            ExitCode: Promise.resolve(this.exitCode),
            Kill: () => undefined,
        };
    }
}

function sessionConfig(executor: SandboxExecutor, overrides?: Partial<HarnessSessionConfig>): HarnessSessionConfig {
    return {
        Executor: executor,
        WorkspacePath: '/workspace',
        Environment: { ANTHROPIC_API_KEY: 'granted-key' },
        ...overrides,
    };
}

async function collect(events: AsyncIterable<HarnessTurnEvent>): Promise<HarnessTurnEvent[]> {
    const out: HarnessTurnEvent[] = [];
    for await (const e of events) {
        out.push(e);
    }
    return out;
}

describe('BaseCliHarnessAdapter — execution goes through the sandbox executor', () => {
    it('runs the harness through the executor rather than spawning, with the granted environment only', async () => {
        const executor = new FakeExecutor([JSON.stringify({ type: 'task_complete', last_agent_message: '{"step":"Success"}' })]);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        await collect(adapter.RunTurn('do the thing'));

        expect(executor.RunCount).toBe(1);
        expect(executor.LastSpec?.Command).toBe('codex');
        expect(executor.LastSpec?.WorkingDirectory).toBe('/workspace');
        // Exactly the granted secret — not the MJAPI process environment.
        expect(executor.LastSpec?.Environment).toEqual({ ANTHROPIC_API_KEY: 'granted-key' });
        // argv is passed pre-split, so nothing needs shell quoting or escaping.
        expect(executor.LastSpec?.Args).toContain('do the thing');
    });

    it('surfaces the turn-end envelope as a turn-complete event', async () => {
        const envelope = '{"step":"Success","payload":{"ok":true}}';
        const executor = new FakeExecutor([JSON.stringify({ type: 'task_complete', last_agent_message: envelope })]);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        const events = await collect(adapter.RunTurn('go'));

        const terminal = events.filter((e) => e.Type === 'turn-complete' || e.Type === 'session-error');
        expect(terminal).toHaveLength(1);
        expect(terminal[0]).toEqual({ Type: 'turn-complete', RawText: envelope });
    });

    it('emits usage so the run can be accounted for and cost guardrails have something to compare', async () => {
        const executor = new FakeExecutor([
            JSON.stringify({ type: 'token_count', usage: { input_tokens: 1200, output_tokens: 340, cost_usd: 0.42 } }),
            JSON.stringify({ type: 'task_complete', last_agent_message: '{"step":"Success"}' }),
        ]);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        const events = await collect(adapter.RunTurn('go'));

        expect(events).toContainEqual({ Type: 'usage', InputTokens: 1200, OutputTokens: 340, CostUsd: 0.42 });
    });

    it('captures the session id so the next turn can resume instead of replaying context', async () => {
        const executor = new FakeExecutor([
            JSON.stringify({ type: 'assistant_message', message: 'working', session_id: 'sess-abc' }),
            JSON.stringify({ type: 'task_complete', last_agent_message: '{"step":"Success"}' }),
        ]);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        await collect(adapter.RunTurn('first'));

        expect(adapter.SessionId).toBe('sess-abc');

        await collect(adapter.RunTurn('second'));
        expect(executor.LastSpec?.Args).toContain('--resume');
        expect(executor.LastSpec?.Args).toContain('sess-abc');
    });

    it('yields exactly one terminal event when the harness exits without answering', async () => {
        // The accumulation loop depends on one terminal event per turn. A harness that dies quietly
        // must still produce one, or the run waits forever on a turn that already ended.
        const executor = new FakeExecutor([JSON.stringify({ type: 'assistant_message', message: 'thinking' })], 1);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        const events = await collect(adapter.RunTurn('go'));

        const terminal = events.filter((e) => e.Type === 'turn-complete' || e.Type === 'session-error');
        expect(terminal).toHaveLength(1);
        expect(terminal[0].Type).toBe('session-error');
    });

    it('ignores non-JSON banner lines rather than failing the turn', async () => {
        const executor = new FakeExecutor([
            'Codex v1.2.3 — starting up',
            '',
            JSON.stringify({ type: 'task_complete', last_agent_message: '{"step":"Success"}' }),
        ]);
        const adapter = new CodexAdapter();
        await adapter.StartSession(sessionConfig(executor));
        const events = await collect(adapter.RunTurn('go'));

        expect(events.filter((e) => e.Type === 'session-error')).toHaveLength(0);
        expect(events.filter((e) => e.Type === 'turn-complete')).toHaveLength(1);
    });

    it('refuses to run a turn before a session is started', async () => {
        const adapter = new CodexAdapter();
        const events = await collect(adapter.RunTurn('go'));
        expect(events).toEqual([{ Type: 'session-error', Error: 'RunTurn called before StartSession' }]);
    });
});
