/**
 * @fileoverview Run-scoped circuit breaker for agent-local tools (`BaseAgent.GetAgentTools`).
 *
 * The action circuit breaker in `BaseAgent` covers Actions only: it lives on the action dispatch
 * path. An agent tool runs on its own path, so without this a tool that keeps failing (an
 * `edit_file` whose old text never matches, say) is called again and again until the run hits its
 * iteration limit.
 *
 * It applies the same two parameter-aware rules as the action breaker:
 * - **identical arguments**: after `identicalThreshold` failures with the same arguments, that
 *   exact call is refused without running;
 * - **attempt budget**: after `failureBudget` consecutive failures with any arguments, the tool is
 *   refused for the rest of the run.
 *
 * A success clears the tool's record. There is no fatal lockout: an agent tool is the agent's own
 * code, not an external system that can be misconfigured.
 * @module @memberjunction/ai-agents
 */

interface AgentToolFailureRecord {
    LastArguments: string;
    IdenticalFailures: number;
    ConsecutiveFailures: number;
}

/** Tracks agent-tool failures for one run and decides whether a call may run. */
export class AgentToolCircuitBreaker {
    private readonly failures = new Map<string, AgentToolFailureRecord>();

    /**
     * @param identicalThreshold Failures with the same arguments before that call is refused
     * @param failureBudget Consecutive failures with any arguments before the tool is refused
     */
    constructor(private readonly identicalThreshold: number, private readonly failureBudget: number) {}

    /**
     * Whether a call may run.
     *
     * @param toolName The tool being called
     * @param argumentsKey The call's normalized arguments; equal strings mean the same call
     * @returns The message to send back instead of running the tool, or null when it may run
     */
    public Check(toolName: string, argumentsKey: string): string | null {
        const record = this.failures.get(toolName);
        if (!record) {
            return null;
        }
        if (record.LastArguments === argumentsKey && record.IdenticalFailures >= this.identicalThreshold) {
            return `Not run: '${toolName}' already failed ${record.IdenticalFailures} times with these exact arguments. ` +
                'Change the arguments, or use a different tool.';
        }
        if (record.ConsecutiveFailures >= this.failureBudget) {
            return `Not run: '${toolName}' is disabled for this run after ${record.ConsecutiveFailures} consecutive failures. ` +
                'Use a different tool, or finish with what you have.';
        }
        return null;
    }

    /** Records a failed call: an error result, a thrown error, or a payload change that was refused. */
    public RecordFailure(toolName: string, argumentsKey: string): void {
        const existing = this.failures.get(toolName);
        const identical = existing !== undefined && existing.LastArguments === argumentsKey;
        this.failures.set(toolName, {
            LastArguments: argumentsKey,
            IdenticalFailures: identical ? existing.IdenticalFailures + 1 : 1,
            ConsecutiveFailures: (existing?.ConsecutiveFailures ?? 0) + 1
        });
    }

    /** Records a successful call, which clears the tool's failure record. */
    public RecordSuccess(toolName: string): void {
        this.failures.delete(toolName);
    }

    /** Forgets every record, for a new run. */
    public Reset(): void {
        this.failures.clear();
    }
}
