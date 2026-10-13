/**
 * Coverage for the Claude Code CLI adapter.
 *
 * This adapter exists because the SDK one cannot be containerized: the Agent SDK runs in-process in
 * Node, so no sandbox executor can place it inside a container. The CLI is a process, so it works in
 * all three deployments — local spawn, local container, cloud container.
 *
 * The interesting case is Claude's `result` line, which carries BOTH the turn's usage and its
 * outcome on a single JSON object. MapEvent is one-in-one-out, so the adapter emits usage and parks
 * the outcome for readEvents to flush immediately after. These tests pin that ordering down, because
 * getting it wrong either loses the turn result or loses the tokens it cost.
 */
import { describe, it, expect } from 'vitest';
import { ClaudeCodeCliAdapter } from '../adapters/ClaudeCodeCliAdapter';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor';
import { HarnessSessionConfig, HarnessTurnEvent } from '../types';

class FakeExecutor implements SandboxExecutor {
    public LastSpec: HarnessProcessSpec | undefined;

    public constructor(private readonly stdoutLines: string[]) {}

    public Run(spec: HarnessProcessSpec): HarnessProcess {
        this.LastSpec = spec;
        const lines = this.stdoutLines;
        return {
            Stdout: (async function* () {
                for (const line of lines) {
                    yield line;
                }
            })(),
            Stderr: (async function* () {})(),
            ExitCode: Promise.resolve(0),
            Kill: () => undefined,
        };
    }
}

function config(executor: SandboxExecutor, model?: string): HarnessSessionConfig {
    return {
        Executor: executor,
        WorkspacePath: '/workspace',
        Environment: { ANTHROPIC_API_KEY: 'granted' },
        Model: model,
    };
}

async function collect(events: AsyncIterable<HarnessTurnEvent>): Promise<HarnessTurnEvent[]> {
    const out: HarnessTurnEvent[] = [];
    for await (const e of events) {
        out.push(e);
    }
    return out;
}

const resultLine = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
        type: 'result',
        session_id: 'sess-1',
        result: '{"step":"Success"}',
        total_cost_usd: 0.19,
        usage: { input_tokens: 900, output_tokens: 120 },
        ...over,
    });

describe('ClaudeCodeCliAdapter', () => {
    it('runs through the executor in headless stream-json mode', async () => {
        const executor = new FakeExecutor([resultLine()]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        await collect(adapter.RunTurn('build the thing'));

        expect(executor.LastSpec?.Command).toBe('claude');
        expect(executor.LastSpec?.Args).toEqual(
            expect.arrayContaining(['-p', 'build the thing', '--output-format', 'stream-json']),
        );
        // Only the granted secret reaches the harness.
        expect(executor.LastSpec?.Environment).toEqual({ ANTHROPIC_API_KEY: 'granted' });
    });

    it('emits usage BEFORE the terminal event from a single result line', async () => {
        const executor = new FakeExecutor([resultLine()]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        const events = await collect(adapter.RunTurn('go'));

        expect(events).toEqual([
            { Type: 'usage', InputTokens: 900, OutputTokens: 120, CostUsd: 0.19 },
            { Type: 'turn-complete', RawText: '{"step":"Success"}' },
        ]);
    });

    it('still reports usage when the turn failed — a failed turn still spent tokens', async () => {
        const executor = new FakeExecutor([resultLine({ is_error: true, result: 'context limit hit' })]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        const events = await collect(adapter.RunTurn('go'));

        expect(events[0]).toEqual({ Type: 'usage', InputTokens: 900, OutputTokens: 120, CostUsd: 0.19 });
        expect(events[1]).toEqual({ Type: 'session-error', Error: 'context limit hit' });
    });

    it('yields exactly one terminal event per turn', async () => {
        const executor = new FakeExecutor([
            JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'thinking' }] } }),
            resultLine(),
        ]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        const events = await collect(adapter.RunTurn('go'));

        const terminal = events.filter((e) => e.Type === 'turn-complete' || e.Type === 'session-error');
        expect(terminal).toHaveLength(1);
    });

    it('surfaces assistant narration as streamed text', async () => {
        const executor = new FakeExecutor([
            JSON.stringify({
                type: 'assistant',
                message: { content: [{ type: 'text', text: 'reading files' }, { type: 'tool_use', id: 'x' }] },
            }),
            resultLine(),
        ]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        const events = await collect(adapter.RunTurn('go'));

        expect(events[0]).toEqual({ Type: 'assistant-text', Text: 'reading files' });
    });

    it('resumes by session id on later turns instead of replaying context', async () => {
        const executor = new FakeExecutor([resultLine()]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor));
        await collect(adapter.RunTurn('first'));
        expect(adapter.SessionId).toBe('sess-1');

        await collect(adapter.RunTurn('second'));
        expect(executor.LastSpec?.Args).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    });

    it('passes a model through when one is configured', async () => {
        const executor = new FakeExecutor([resultLine()]);
        const adapter = new ClaudeCodeCliAdapter();
        await adapter.StartSession(config(executor, 'claude-opus-4-5'));
        await collect(adapter.RunTurn('go'));

        expect(executor.LastSpec?.Args).toEqual(expect.arrayContaining(['--model', 'claude-opus-4-5']));
    });

    it('reports PermissionHooks false, since the CLI hook is not wired yet', async () => {
        // Capability honesty: the runtime gates the strict posture on this flag, and claiming
        // interception the adapter does not implement would silently let mutating operations
        // through unreviewed.
        expect(new ClaudeCodeCliAdapter().Capabilities.PermissionHooks).toBe(false);
        expect(new ClaudeCodeCliAdapter().Capabilities.SessionResume).toBe(true);
    });
});
