/**
 * Base class and contract types for artifact type-specific tool libraries.
 * Each artifact type can register a subclass that provides
 * tools for agents to explore artifacts of that type.
 *
 * Tool libraries are instantiated by the ArtifactToolManager when
 * an agent run includes input artifacts of the corresponding type.
 * Tools from parent artifact types are inherited — child types
 * can override or add additional tools.
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
    /** Return the list of tools this library provides */
    abstract GetToolList(): ArtifactToolDefinition[];

    /** Invoke a tool by name with the given input */
    abstract InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult>;
}
