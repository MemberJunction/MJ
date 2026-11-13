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
import { SanitizeToolName } from '../native-tools/action-tool-builder';
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

    /**
     * Resolve a tool name (case-insensitive), falling back to a unique native-tool-name match
     * (e.g. `"calculate_expression"` → `"Calculate Expression"`) when the model runs with
     * native tool calling enabled and references Actions by their declared native tool name.
     */
    public Resolve(name: string): PipelineInvocable | undefined {
        const key = name.trim().toLowerCase();
        const exact = this.byName.get(key);
        if (exact) {
            return exact;
        }
        const sanitized = SanitizeToolName(name);
        if (!sanitized) {
            return undefined;
        }
        const matches = [...this.byName.values()].filter((i) => SanitizeToolName(i.toolName) === sanitized);
        return matches.length === 1 ? matches[0] : undefined;
    }

    /** All registered tool names, in registration order — for error messages / tool docs. */
    public ToolNames(): string[] {
        return [...this.byName.values()].map((i) => i.toolName);
    }
}
