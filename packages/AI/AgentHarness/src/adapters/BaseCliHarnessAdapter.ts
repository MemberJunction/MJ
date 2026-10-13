import { LogError, LogStatus } from '@memberjunction/core';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessSessionConfig, HarnessTurnEvent } from '../types.js';
import { HarnessProcess } from '../sandbox/SandboxExecutor.js';

/**
 * One line of JSON emitted by a harness CLI, before the adapter interprets it.
 *
 * Typed as an index signature rather than a concrete shape because the whole point of this class is
 * that each vendor's event vocabulary differs — {@link BaseCliHarnessAdapter.MapEvent} is where a
 * subclass turns vendor noise into the closed {@link HarnessTurnEvent} set.
 */
export type HarnessCliRawEvent = Record<string, unknown>;

/**
 * Shared driver for harnesses that expose themselves as a CLI emitting newline-delimited JSON.
 *
 * That covers most of the ecosystem — Codex, OpenCode, Gemini CLI and Pi all work this way, and only
 * Claude Code ships a real TypeScript SDK. Rather than repeat process management, line framing and
 * lifecycle in four adapters, subclasses supply just the two things that genuinely differ:
 * {@link BuildTurnArgs} (how to phrase this turn on the command line) and {@link MapEvent} (what the
 * vendor's JSON means).
 *
 * ## Process-per-turn, not process-per-session
 *
 * These CLIs are built to be invoked, do a unit of work, and exit — continuity comes from a session
 * id passed back on the next invocation, not from a long-lived process. Modelling it that way keeps
 * the adapter honest about what actually persists: if the harness cannot resume
 * (`CapabilitySettings.SessionResume` false) the subclass must replay context into the next
 * invocation itself, and report the extra tokens through a `usage` event so the run's cost guardrail
 * sees the true spend rather than a flattering one.
 *
 * ## Placement is the sandbox's job, not the adapter's
 *
 * Every process goes through `config.Executor`, never `spawn` directly. That is what lets the same
 * adapter run on a developer's laptop and inside a per-run container without knowing the difference,
 * and it is what stops a production deployment from executing an autonomous agent's shell commands
 * inside the MJAPI container while the agent's config claims `provider: 'docker'`.
 *
 * ## Failure is an event, not an exception
 *
 * A non-zero exit or unparseable stream yields a `session-error` event rather than a throw, because
 * the caller's accumulation loop needs exactly one terminal event per turn to make progress. A throw
 * from inside the async iterator would strand the run between turns with no recorded reason.
 */
export abstract class BaseCliHarnessAdapter extends BaseHarnessAdapter {
    protected config: HarnessSessionConfig | null = null;
    protected sessionId: string | undefined = undefined;
    protected activeProcess: HarnessProcess | null = null;
    private turnCount = 0;

    /** Absolute path or bare command name of the harness binary. */
    protected abstract get ExecutablePath(): string;

    /**
     * Builds the argv for one turn.
     *
     * @param input Task prompt on the first turn; formatted step results afterwards.
     * @param isFirstTurn Lets a subclass choose between "start" and "resume" argument forms.
     */
    protected abstract BuildTurnArgs(input: string, isFirstTurn: boolean): string[];

    /**
     * Interprets one line of the harness's JSON stream.
     *
     * Return `null` for lines that carry no meaning for MJ — heartbeats, progress spinners, internal
     * bookkeeping. Returning null is normal and expected; it is not an error path.
     */
    protected abstract MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null;

    /** @inheritdoc */
    public override get SessionId(): string | undefined {
        return this.sessionId;
    }

    /** @inheritdoc */
    public async StartSession(config: HarnessSessionConfig): Promise<void> {
        this.config = config;
        this.turnCount = 0;
        LogStatus(`Harness CLI session starting: ${this.ExecutablePath} (workspace: ${config.WorkspacePath})`);
    }

    /** @inheritdoc */
    public async *RunTurn(input: string): AsyncIterable<HarnessTurnEvent> {
        if (!this.config) {
            yield { Type: 'session-error', Error: 'RunTurn called before StartSession' };
            return;
        }

        const isFirstTurn = this.turnCount === 0;
        this.turnCount++;

        let proc: HarnessProcess;
        try {
            proc = this.startTurnProcess(input, isFirstTurn);
        } catch (e) {
            yield { Type: 'session-error', Error: `Failed to launch ${this.ExecutablePath}: ${this.describeError(e)}` };
            return;
        }

        this.activeProcess = proc;
        const stderrChunks: string[] = [];
        const drainStderr = (async () => {
            for await (const line of proc.Stderr) {
                stderrChunks.push(line);
            }
        })().catch(() => undefined);

        let sawTerminal = false;
        try {
            for await (const event of this.readEvents(proc)) {
                if (event.Type === 'turn-complete' || event.Type === 'session-error') {
                    sawTerminal = true;
                }
                yield event;
            }

            // Exactly one terminal event per turn is the contract the accumulation loop relies on.
            // A clean stream that never produced one means the harness exited without answering --
            // surface it rather than letting the caller wait on a turn that already ended.
            if (!sawTerminal) {
                const exit = await proc.ExitCode;
                await drainStderr;
                const detail = stderrChunks.join('\n').trim();
                yield {
                    Type: 'session-error',
                    Error:
                        `${this.ExecutablePath} exited (code ${exit}) without emitting a turn result` +
                        (detail ? `: ${detail.slice(0, 2000)}` : ''),
                };
            }
        } finally {
            this.activeProcess = null;
            proc.Kill();
        }
    }

    /** @inheritdoc */
    public async RespondToPermission(_requestId: string, _approved: boolean, _note?: string): Promise<void> {
        // CLI harnesses that lack permission hooks have nothing to answer. Deliberately a no-op
        // rather than a throw: the posture layer may call this defensively, and turning a
        // capability gap into an exception would fail runs that are behaving correctly.
    }

    /** @inheritdoc */
    public async EndSession(): Promise<void> {
        const proc = this.activeProcess;
        this.activeProcess = null;
        this.config = null;
        proc?.Kill();
    }

    /**
     * Starts one turn's process INSIDE THE SANDBOX.
     *
     * Note what this does not do: call `spawn`. Where the process physically runs is the sandbox
     * provider's decision, delivered through the executor, so this adapter behaves identically on a
     * laptop and in a per-run container.
     */
    protected startTurnProcess(input: string, isFirstTurn: boolean): HarnessProcess {
        const config = this.config!;
        return config.Executor.Run({
            Command: this.ExecutablePath,
            Args: this.BuildTurnArgs(input, isFirstTurn),
            Environment: config.Environment,
            WorkingDirectory: config.WorkspacePath,
            CancellationToken: config.CancellationToken,
        });
    }

    /** Frames stdout into lines, parses each as JSON, and maps it through the subclass. */
    protected async *readEvents(proc: HarnessProcess): AsyncIterable<HarnessTurnEvent> {
        for await (const line of proc.Stdout) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            let raw: HarnessCliRawEvent;
            try {
                raw = JSON.parse(trimmed) as HarnessCliRawEvent;
            } catch {
                // Harness CLIs interleave human-readable banners with their JSON stream. A line that
                // does not parse is noise, not a failure -- logging every one would bury the real
                // events, so this is intentionally silent.
                continue;
            }

            let mapped: HarnessTurnEvent | null;
            try {
                mapped = this.MapEvent(raw);
            } catch (e) {
                LogError(`Harness adapter failed to map event: ${this.describeError(e)}`);
                continue;
            }

            if (mapped) {
                yield mapped;
            }
        }
    }

    /** Narrows an unknown catch binding to a readable message without reaching for `any`. */
    protected describeError(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    /** Reads a string field from a raw event, or undefined when absent/not a string. */
    protected readString(raw: HarnessCliRawEvent, key: string): string | undefined {
        const value = raw[key];
        return typeof value === 'string' ? value : undefined;
    }

    /** Reads a numeric field from a raw event, or undefined when absent/not a number. */
    protected readNumber(raw: HarnessCliRawEvent, key: string): number | undefined {
        const value = raw[key];
        return typeof value === 'number' ? value : undefined;
    }

    /** Reads a nested object from a raw event, or undefined when absent/not an object. */
    protected readObject(raw: HarnessCliRawEvent, key: string): HarnessCliRawEvent | undefined {
        const value = raw[key];
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as HarnessCliRawEvent)
            : undefined;
    }
}
