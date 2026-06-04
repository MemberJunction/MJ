/**
 * @fileoverview Per-execution registry that resolves a pipeline step's tool name to a
 * {@link PipelineInvocable}. Built fresh for each pipeline run by the agent, which knows
 * the available Actions, artifact tools, and built-in transforms.
 *
 * Lookup is case-insensitive. Names share one namespace across all three substrates, so
 * a collision (e.g. an Action named the same as a transform) is a registration-time error
 * rather than a silent ambiguity at resolve time.
 *
 * @module @memberjunction/ai-agents
 */
import { PipelineInvocable } from './pipeline.types';

export class PipelineToolRegistry {
    private byName = new Map<string, PipelineInvocable>();

    /** Register an invocable. Throws if its name collides with an already-registered tool. */
    public Register(invocable: PipelineInvocable): void {
        const key = invocable.toolName.trim().toLowerCase();
        const existing = this.byName.get(key);
        if (existing) {
            throw new Error(
                `Pipeline tool name collision: "${invocable.toolName}" is registered by both the ` +
                    `${existing.providerKind} and ${invocable.providerKind} providers.`,
            );
        }
        this.byName.set(key, invocable);
    }

    /** Register many invocables (e.g. all built-in transforms). */
    public RegisterAll(invocables: readonly PipelineInvocable[]): void {
        invocables.forEach((i) => this.Register(i));
    }

    /** Resolve a tool name (case-insensitive), or undefined if unknown. */
    public Resolve(name: string): PipelineInvocable | undefined {
        return this.byName.get(name.trim().toLowerCase());
    }

    /** All registered tool names, in registration order — for error messages / tool docs. */
    public ToolNames(): string[] {
        return [...this.byName.values()].map((i) => i.toolName);
    }
}
