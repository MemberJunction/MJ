import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolResult } from './artifact-tools/BaseArtifactToolLibrary';
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';

/**
 * An input artifact provided to an agent run.
 */
export interface InputArtifact {
    name: string;
    typeName: string;
    content: string | Buffer;
    /** Optional: class name from ArtifactType.ToolLibraryClass metadata.
     *  When set, used for plugin-based resolution via ClassFactory. */
    toolLibraryClass?: string;
}

/**
 * A single artifact tool invocation requested by the LLM.
 */
export interface ArtifactToolCall {
    /** Alpha-sequence artifact ID assigned at run start (A, B, ... Z, AA, AB, etc.) */
    artifactId: string;
    /** Tool name from the documented tool list */
    tool: string;
    /** Tool-specific input parameters */
    input: Record<string, unknown>;
}

interface ArtifactEntry {
    alphaId: string;
    name: string;
    typeName: string;
    content: string | Buffer;
    library: BaseArtifactToolLibrary;
}

interface StoredToolResult {
    artifactId: string;
    tool: string;
    input: Record<string, unknown>;
    result: ArtifactToolResult;
}

export interface ArtifactToolSnapshot {
    artifacts: Array<{ alphaId: string; name: string; typeName: string }>;
    resultCount: number;
}

/**
 * Manages artifact tools for a single agent run.
 *
 * Follows the ScratchpadManager pattern:
 * - Instantiated once per run
 * - Holds references to input artifacts with alpha IDs
 * - Generates manifest + tool documentation for prompt injection
 * - Executes tool calls and stores results for next turn
 * - Serializable for persistence
 */
export class ArtifactToolManager {
    private artifacts: Map<string, ArtifactEntry> = new Map();
    private toolResults: StoredToolResult[] = [];
    private nextAlphaIndex = 0;

    // ─── LIFECYCLE ───

    /** Initialize with input artifacts, assigning alpha IDs */
    Initialize(inputArtifacts: InputArtifact[]): void {
        this.Clear();
        for (const artifact of inputArtifacts) {
            const alphaId = this.NextAlphaId();
            this.artifacts.set(alphaId, {
                alphaId,
                name: artifact.name,
                typeName: artifact.typeName,
                content: artifact.content,
                library: this.ResolveLibrary(artifact.typeName, artifact.toolLibraryClass),
            });
        }
    }

    /** Register a mid-run artifact and return its alpha ID */
    RegisterArtifact(artifact: InputArtifact): string {
        const alphaId = this.NextAlphaId();
        this.artifacts.set(alphaId, {
            alphaId,
            name: artifact.name,
            typeName: artifact.typeName,
            content: artifact.content,
            library: this.ResolveLibrary(artifact.typeName, artifact.toolLibraryClass),
        });
        return alphaId;
    }

    /** Reset all state */
    Clear(): void {
        this.artifacts.clear();
        this.toolResults = [];
        this.nextAlphaIndex = 0;
    }

    /** Whether any artifacts are available */
    HasArtifacts(): boolean {
        return this.artifacts.size > 0;
    }

    // ─── PROMPT INJECTION ───

    /** Markdown manifest: artifact IDs, names, types */
    ToManifestString(): string {
        if (this.artifacts.size === 0) return '';

        const lines: string[] = ['## Available Artifacts\n'];
        for (const entry of this.artifacts.values()) {
            lines.push(`**${entry.alphaId}** — ${entry.typeName}: "${entry.name}"`);
        }
        lines.push('');
        lines.push('Use the artifact tools below to explore content.');
        lines.push('IMPORTANT: Always use the single-letter artifact ID (A, B, C, etc.) as the `artifactId` value — NOT the artifact name.');
        return lines.join('\n');
    }

    /** Markdown tool documentation grouped by artifact type */
    GetToolDocumentation(): string {
        if (this.artifacts.size === 0) return '';

        // Collect unique type → library pairs
        const typeLibraries = new Map<string, BaseArtifactToolLibrary>();
        for (const entry of this.artifacts.values()) {
            if (!typeLibraries.has(entry.typeName)) {
                typeLibraries.set(entry.typeName, entry.library);
            }
        }

        const sections: string[] = [];
        for (const [typeName, library] of typeLibraries) {
            const tools = library.GetToolList();
            if (tools.length === 0) continue;

            sections.push(`## ${typeName} Artifact Tools`);
            for (const tool of tools) {
                const params = Object.keys(tool.inputSchema.properties as Record<string, unknown> || {}).join(', ');
                sections.push(`- **${tool.name}**(artifactId${params ? ', ' + params : ''}) — ${tool.description}`);
            }
            sections.push('');
        }

        return sections.join('\n');
    }

    /** Markdown results from previous turns */
    GetPendingResults(): string {
        if (this.toolResults.length === 0) return '';

        const lines: string[] = ['## Artifact Tool Results\n'];
        for (const stored of this.toolResults) {
            lines.push(`### ${stored.artifactId}.${stored.tool}`);
            if (stored.result.success) {
                const data = typeof stored.result.data === 'string'
                    ? stored.result.data
                    : JSON.stringify(stored.result.data, null, 2);
                lines.push('```json');
                lines.push(data);
                lines.push('```');
            } else {
                lines.push(`**Error:** ${stored.result.errorMessage}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /** One-line summary for compact contexts */
    GetSummary(): string {
        if (this.artifacts.size === 0) return '';
        const count = this.artifacts.size;
        return `${count} artifact${count !== 1 ? 's' : ''} available (${Array.from(this.artifacts.values()).map(a => a.alphaId).join(', ')})`;
    }

    // ─── TOOL EXECUTION ───

    /** Execute tool calls from LLM response */
    async ExecuteToolCalls(calls: ArtifactToolCall[]): Promise<void> {
        const promises = calls.map(async (call) => {
            // Try exact alpha ID first, then fallback to name match
            let entry = this.artifacts.get(call.artifactId);
            if (!entry) {
                // LLMs sometimes use the artifact name instead of the alpha ID
                for (const e of this.artifacts.values()) {
                    if (e.name.toLowerCase() === call.artifactId.toLowerCase() ||
                        e.name.toLowerCase().replace(/\s+/g, '_') === call.artifactId.toLowerCase()) {
                        entry = e;
                        break;
                    }
                }
            }
            if (!entry && this.artifacts.size === 1) {
                // If there's only one artifact, use it regardless of what ID was passed
                entry = this.artifacts.values().next().value;
            }
            if (!entry) {
                this.toolResults.push({
                    artifactId: call.artifactId,
                    tool: call.tool,
                    input: call.input,
                    result: {
                        success: false,
                        data: null,
                        errorMessage: `Unknown artifact ID: ${call.artifactId}. Use the alpha ID (A, B, C, etc.) from the manifest.`,
                    },
                });
                return;
            }

            const result = await entry.library.InvokeTool(call.tool, call.input, entry.content);
            this.toolResults.push({
                artifactId: call.artifactId,
                tool: call.tool,
                input: call.input,
                result,
            });
        });

        await Promise.all(promises);
    }

    // ─── SERIALIZATION ───

    /** Snapshot for persistence */
    ToJSON(): ArtifactToolSnapshot {
        return {
            artifacts: Array.from(this.artifacts.values()).map(a => ({
                alphaId: a.alphaId,
                name: a.name,
                typeName: a.typeName,
            })),
            resultCount: this.toolResults.length,
        };
    }

    // ─── PRIVATE ───

    /** Generate next alpha-sequence ID: A, B, ... Z, AA, AB, ... */
    private NextAlphaId(): string {
        const index = this.nextAlphaIndex++;
        if (index < 26) {
            return String.fromCharCode(65 + index); // A-Z
        }
        // AA, AB, AC, ...
        const first = Math.floor((index - 26) / 26);
        const second = (index - 26) % 26;
        return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
    }

    /** Resolve a tool library for an artifact type.
     *  Priority: toolLibraryClass from metadata → ClassFactory → name-based fallback */
    private ResolveLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
        // Try metadata-driven resolution via ClassFactory
        if (toolLibraryClass) {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
                BaseArtifactToolLibrary, toolLibraryClass
            );
            if (instance) return instance;
        }

        // Fallback: name-based resolution for types without ToolLibraryClass metadata
        const lower = typeName.toLowerCase();
        if (lower.includes('data') || lower.includes('snapshot')) {
            return new DataSnapshotToolLibrary();
        }
        if (lower.includes('json')) {
            return new JSONToolLibrary();
        }
        return new TextToolLibrary();
    }
}
