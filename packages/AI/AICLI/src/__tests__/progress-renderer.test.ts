/**
 * Unit tests for AgentProgressRenderer: agent progress goes to stderr — never stdout — and reads
 * well both on a terminal and in captured output.
 */

import { describe, it, expect, vi } from 'vitest';

// Plain text, so assertions do not depend on colour codes
vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const handler: ProxyHandler<Record<string, unknown>> = {
        get: (_target, prop) => {
            if (prop === 'default' || prop === '__esModule') return _target;
            return identity;
        }
    };
    return { default: new Proxy({}, handler) };
});

import { AgentProgressRenderer, AgentProgressUpdate, FormatProgressLine, ProgressStream } from '../lib/progress-renderer';

/** A stream that records what was written to it. */
function recordingStream(isTTY: boolean): { Stream: ProgressStream; Chunks: string[] } {
    const chunks: string[] = [];
    const stream = {
        isTTY,
        columns: 80,
        write: (chunk: string | Uint8Array) => {
            chunks.push(String(chunk));
            return true;
        },
    } as ProgressStream;
    return { Stream: stream, Chunks: chunks };
}

const PROMPT_STEP: AgentProgressUpdate = {
    step: 'prompt_execution',
    message: 'Running prompt "Classify Lead"',
    metadata: { stepCount: 2 },
};

describe('FormatProgressLine', () => {
    it('shows the icon, step counter, step name and message', () => {
        expect(FormatProgressLine(PROMPT_STEP)).toBe('💭 [ Step 2] prompt execution: Running prompt "Classify Lead"');
    });

    it('falls back to the percentage, then to nothing', () => {
        expect(FormatProgressLine({ step: 'validation', message: 'ok', percentage: 40 })).toContain('[ 40%]');
        expect(FormatProgressLine({ step: 'validation', message: 'ok' })).toContain('[   ]');
    });
});

describe('AgentProgressRenderer', () => {
    it('writes to stderr by default, never to stdout', () => {
        const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const renderer = new AgentProgressRenderer({ Verbose: false });
            renderer.Status('Connecting to MemberJunction...');
            renderer.Update(PROMPT_STEP);
            renderer.Finish();

            expect(stdout).not.toHaveBeenCalled();
            expect(stderr).toHaveBeenCalled();
        } finally {
            stdout.mockRestore();
            stderr.mockRestore();
        }
    });

    it('prints one line per status when not on a terminal, dropping repeats', () => {
        const { Stream, Chunks } = recordingStream(false);
        const renderer = new AgentProgressRenderer({ Verbose: false, Stream });

        renderer.Status('Agent run run-1 started');
        renderer.Update(PROMPT_STEP);
        renderer.Update(PROMPT_STEP);
        renderer.Finish();

        expect(Chunks).toEqual([
            '→ Agent run run-1 started\n',
            '💭 [ Step 2] prompt execution: Running prompt "Classify Lead"\n',
        ]);
        expect(Chunks.join('')).not.toContain('\r');
    });

    it('rewrites a single line on a terminal and clears it when finished', () => {
        const { Stream, Chunks } = recordingStream(true);
        const renderer = new AgentProgressRenderer({ Verbose: false, Stream });

        renderer.Update(PROMPT_STEP);
        renderer.Update({ step: 'action_execution', message: 'Send Email', metadata: { stepCount: 3 } });
        renderer.Finish();

        const output = Chunks.join('');
        expect(output).not.toContain('\n');
        expect(output).toContain('\r');
        expect(Chunks[Chunks.length - 1]).toMatch(/^\r +\r$/);
    });

    it('cuts a long status to the terminal width', () => {
        const { Stream, Chunks } = recordingStream(true);
        const renderer = new AgentProgressRenderer({ Verbose: false, Stream });

        renderer.Update({ step: 'prompt_execution', message: 'x'.repeat(500) });

        expect(Chunks[0].length).toBeLessThan(80);
        expect(Chunks[0].endsWith('...')).toBe(true);
    });

    // A run abandoned after --timeout keeps reporting; none of it may follow the command's result.
    it('ignores everything after Stop', () => {
        const { Stream, Chunks } = recordingStream(true);
        const renderer = new AgentProgressRenderer({ Verbose: false, Stream });

        renderer.Update(PROMPT_STEP);
        renderer.Stop();
        const afterStop = Chunks.length;
        renderer.Status('Agent run run-1 started');
        renderer.Update({ step: 'action_execution', message: 'Send Email', metadata: { stepCount: 3 } });

        expect(Chunks[afterStop - 1]).toMatch(/^\r +\r$/);
        expect(Chunks.length).toBe(afterStop);
    });

    it('prints full updates with their metadata when verbose', () => {
        const { Stream, Chunks } = recordingStream(true);
        const renderer = new AgentProgressRenderer({ Verbose: true, Stream });

        renderer.Update(PROMPT_STEP);

        const output = Chunks.join('');
        expect(output).toContain('prompt execution');
        expect(output).toContain('Running prompt "Classify Lead"');
        expect(output).toContain('{"stepCount":2}');
    });
});
