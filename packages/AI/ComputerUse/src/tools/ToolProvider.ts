/**
 * Manages tool registration, definition export, and dispatch for the
 * Computer Use engine.
 *
 * Lifecycle:
 * 1. Engine calls RegisterTools() at run start with params.Tools
 * 2. Engine calls GetToolDefinitions() to include schemas in the
 *    controller LLM prompt (handler functions are never exposed)
 * 3. When the controller LLM requests a tool call, engine calls
 *    ExecuteToolCall() which dispatches to the matching handler
 * 4. Results are captured as ToolCallRecord for step history
 *
 * Failed tool calls do NOT crash the step. Errors are wrapped in the
 * ToolCallRecord and reported back to the controller so it can adapt.
 */

import { ComputerUseTool, ToolCallRecord } from '../types/tools.js';
import { ToolDefinition, ToolCallRequest } from '../types/controller.js';

export class ToolProvider {
    /** Registered tools keyed by name for O(1) dispatch */
    private tools: Map<string, ComputerUseTool> = new Map();

    /**
     * Register tools for this run.
     * Duplicate names are rejected immediately to prevent silent overwrites.
     */
    public RegisterTools(tools: ComputerUseTool[]): void {
        for (const tool of tools) {
            if (this.tools.has(tool.Name)) {
                throw new Error(
                    `Duplicate tool name: '${tool.Name}'. Each tool must have a unique name.`
                );
            }
            this.tools.set(tool.Name, tool);
        }
    }

    /**
     * Get tool definitions for inclusion in the controller LLM prompt.
     * Returns name + description + schema — no handler functions.
     */
    public GetToolDefinitions(): ToolDefinition[] {
        const definitions: ToolDefinition[] = [];

        for (const tool of this.tools.values()) {
            const def = new ToolDefinition();
            def.Name = tool.Name;
            def.Description = tool.Description;
            def.InputSchema = tool.InputSchema;
            definitions.push(def);
        }

        return definitions;
    }

    /**
     * Execute a tool call by dispatching to the matching registered handler.
     *
     * Returns a ToolCallRecord capturing the full lifecycle:
     * name, arguments, result, success/error, and duration.
     *
     * Errors are caught and wrapped — they never propagate up.
     * The engine feeds the error back to the controller LLM.
     */
    public async ExecuteToolCall(request: ToolCallRequest): Promise<ToolCallRecord> {
        const record = new ToolCallRecord();
        record.ToolName = request.ToolName;
        record.Arguments = request.Arguments;

        const startTime = performance.now();

        const tool = this.tools.get(request.ToolName);
        if (!tool) {
            record.Success = false;
            record.Error = `Unknown tool: '${request.ToolName}'. Available tools: ${this.getToolNames()}`;
            record.DurationMs = performance.now() - startTime;
            return record;
        }

        try {
            const result = await tool.Handler(request.Arguments);
            record.Success = true;
            record.Result = result;
        } catch (error) {
            record.Success = false;
            record.Error = error instanceof Error ? error.message : String(error);
        }

        record.DurationMs = performance.now() - startTime;
        return record;
    }

    /** Whether any tools are registered */
    public get HasTools(): boolean {
        return this.tools.size > 0;
    }

    /** Number of registered tools */
    public get ToolCount(): number {
        return this.tools.size;
    }

    /** Comma-separated list of registered tool names (for error messages) */
    private getToolNames(): string {
        return Array.from(this.tools.keys()).join(', ');
    }
}
