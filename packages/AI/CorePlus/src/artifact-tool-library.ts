/**
 * Base class and contract types for artifact type-specific tool libraries.
 * Each artifact type can register a subclass that provides
 * tools for agents to explore artifacts of that type.
 *
 * Tool libraries are instantiated by the ArtifactToolManager when
 * an agent run includes input artifacts of the corresponding type.
 *
 * `get_full` is provided as a default tool by this base class — it returns
 * the raw artifact content (utf-8 string passthrough, or base64 for Buffer).
 * Subclasses inherit it for free; they can override `GetFull()` (and optionally
 * `GetFullToolDefinition()`) when "the full content" needs domain-specific
 * transformation (e.g. PDF extracts text instead of returning binary bytes).
 *
 * These types live in ai-core-plus so they can be referenced from
 * both server and client code paths (e.g. future in-browser inference).
 */

export interface ArtifactToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ArtifactToolResult {
    success: boolean;
    data: unknown;
    errorMessage?: string;
}

export abstract class BaseArtifactToolLibrary {
    /**
     * Returns the full tool list for this library — the base `get_full` plus
     * whatever subclass-specific tools the subclass declares. Final: subclasses
     * should override `GetSubclassToolList()` rather than this method.
     */
    public GetToolList(): ArtifactToolDefinition[] {
        return [this.GetFullToolDefinition(), ...this.GetSubclassToolList()];
    }

    /**
     * Dispatches a tool invocation. Handles `get_full` directly; delegates
     * everything else to the subclass. Final: subclasses should override
     * `InvokeSubclassTool()` rather than this method.
     */
    public async InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        if (toolName === 'get_full') {
            return this.GetFull(artifactContent);
        }
        return this.InvokeSubclassTool(toolName, input, artifactContent);
    }

    /**
     * Subclass-specific tools (everything other than `get_full`).
     *
     * Default returns an empty list so external consumers (e.g. Skip-Brain)
     * whose subclasses still override the public `GetToolList()` directly
     * continue to compile without changes — their override of `GetToolList()`
     * replaces this whole chain. New subclasses should prefer overriding
     * this method so they pick up the base-class `get_full` for free.
     */
    protected GetSubclassToolList(): ArtifactToolDefinition[] {
        return [];
    }

    /**
     * Subclass tool dispatcher — invoked for every tool except `get_full`.
     *
     * Default returns an "unknown tool" error. Same backwards-compat note as
     * `GetSubclassToolList()`: external subclasses that override the public
     * `InvokeTool()` directly continue to work unchanged.
     */
    protected async InvokeSubclassTool(
        toolName: string,
        _input: Record<string, unknown>,
        _artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        return {
            success: false,
            data: null,
            errorMessage: `Tool "${toolName}" is not defined by this artifact tool library.`,
        };
    }

    /**
     * Returns the `get_full` tool definition. Override only to change the
     * description (e.g. PDF documents that the tool returns extracted text).
     */
    protected GetFullToolDefinition(): ArtifactToolDefinition {
        return {
            name: 'get_full',
            description:
                'Returns the full artifact content. Text is returned utf-8 verbatim; binary content is base64-encoded. Use this when partial-access tools (search, slice, etc.) are not sufficient.',
            inputSchema: { type: 'object', properties: {}, required: [] },
        };
    }

    /**
     * Default `get_full` implementation. Override to transform raw bytes into a
     * domain-meaningful representation (e.g. extracted text from a PDF).
     */
    protected async GetFull(artifactContent: string | Buffer): Promise<ArtifactToolResult> {
        if (typeof artifactContent === 'string') {
            return {
                success: true,
                data: {
                    content: artifactContent,
                    encoding: 'utf8',
                    sizeBytes: Buffer.byteLength(artifactContent, 'utf8'),
                },
            };
        }
        return {
            success: true,
            data: {
                content: artifactContent.toString('base64'),
                encoding: 'base64',
                sizeBytes: artifactContent.length,
            },
        };
    }
}
