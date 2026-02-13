/**
 * Tool-related types for the Computer Use engine.
 *
 * Tools allow the controller LLM to invoke external functionality
 * beyond browser actions (e.g., MJ Actions, API calls, data lookups).
 *
 * ComputerUseTool uses generics to preserve type safety on handlers
 * without requiring `any` types anywhere.
 */

// ─── JSON Schema Types ─────────────────────────────────────
/**
 * Subset of JSON Schema used for tool input/output definitions.
 * Supports the types needed for LLM function calling schemas.
 */
export class JsonSchemaProperty {
    public Type: JsonSchemaType = 'string';
    public Description?: string;
    public Enum?: (string | number | boolean)[];
    public Items?: JsonSchemaProperty;
    public Properties?: Record<string, JsonSchemaProperty>;
    public Required?: string[];
    public Default?: string | number | boolean | null;

    /**
     * Serialize to standard JSON Schema format with lowercase keys.
     * Called automatically by JSON.stringify() and Nunjucks dump filter.
     */
    public toJSON(): Record<string, unknown> {
        const result: Record<string, unknown> = { type: this.Type };
        if (this.Description) result.description = this.Description;
        if (this.Enum) result.enum = this.Enum;
        if (this.Items) result.items = this.Items;
        if (this.Properties) {
            result.properties = this.Properties;
        }
        if (this.Required) result.required = this.Required;
        if (this.Default !== undefined) result.default = this.Default;
        return result;
    }
}

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export class JsonSchema {
    public Type: 'object' = 'object';
    public Properties: Record<string, JsonSchemaProperty> = {};
    public Required?: string[];
    public Description?: string;

    /**
     * Serialize to standard JSON Schema format with lowercase keys.
     * Called automatically by JSON.stringify() and Nunjucks dump filter.
     */
    public toJSON(): Record<string, unknown> {
        const result: Record<string, unknown> = {
            type: this.Type,
            properties: this.Properties,
        };
        if (this.Required && this.Required.length > 0) result.required = this.Required;
        if (this.Description) result.description = this.Description;
        return result;
    }
}

// ─── Tool Definition ───────────────────────────────────────
/**
 * A tool that the controller LLM can invoke during execution.
 *
 * Generics preserve type safety:
 * - TInput: the shape of arguments the handler expects
 * - TOutput: the shape of the result the handler returns
 *
 * Default generics use `Record<string, unknown>` and `unknown`
 * (the widest safe types in TypeScript — NOT `any`).
 */
export class ComputerUseTool<
    TInput = Record<string, unknown>,
    TOutput = unknown
> {
    /** Unique tool name (must be valid for LLM function calling: alphanumeric + underscores) */
    public Name: string;
    /** Human-readable description for the LLM to understand when to use this tool */
    public Description: string;
    /** JSON Schema defining the expected input arguments */
    public InputSchema: JsonSchema;
    /** Optional JSON Schema for the output (informational, not enforced) */
    public OutputSchema?: JsonSchema;
    /** The function that executes this tool */
    public Handler: (args: TInput) => Promise<TOutput>;

    constructor(init: {
        Name: string;
        Description: string;
        InputSchema: JsonSchema;
        OutputSchema?: JsonSchema;
        Handler: (args: TInput) => Promise<TOutput>;
    }) {
        this.Name = init.Name;
        this.Description = init.Description;
        this.InputSchema = init.InputSchema;
        this.OutputSchema = init.OutputSchema;
        this.Handler = init.Handler;
    }
}

// ─── Tool Call Record ──────────────────────────────────────
/**
 * Record of a tool call that was executed during a step.
 * Captures the full lifecycle: what was called, with what args, and what happened.
 */
export class ToolCallRecord {
    /** Name of the tool that was called */
    public ToolName: string = '';
    /** Arguments passed to the tool handler */
    public Arguments: Record<string, unknown> = {};
    /** Result returned by the tool handler */
    public Result?: unknown;
    /** Whether the tool call succeeded */
    public Success: boolean = false;
    /** Error message if the tool call failed */
    public Error?: string;
    /** Execution duration in milliseconds */
    public DurationMs: number = 0;
}
