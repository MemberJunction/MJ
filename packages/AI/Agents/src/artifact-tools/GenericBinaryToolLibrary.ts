/**
 * @fileoverview Artifact tool library for unregistered binary content.
 *
 * Bound to the Generic Binary artifact type — the minimal fallback used when
 * an agent has `AcceptUnregisteredFiles = true` and a file's MIME does not
 * match any registered Artifact Type. Exposes only `get_full` (inherited from
 * the base class, returns base64-encoded bytes) and `get_metadata` (computes
 * size + sha256 from the content). Filename and MIME are surfaced via the
 * manifest, not via tool calls.
 */
import { createHash } from 'crypto';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, type ArtifactToolDefinition, type ArtifactToolResult } from '@memberjunction/ai-core-plus';

@RegisterClass(BaseArtifactToolLibrary, 'GenericBinaryToolLibrary')
export class GenericBinaryToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_metadata',
                description: 'Returns size in bytes and the SHA-256 digest of the artifact content. Filename and MIME type are available in the artifact manifest.',
                inputSchema: { type: 'object', properties: {}, required: [] },
            },
        ];
    }

    protected async invokeSubclassTool(
        toolName: string,
        _input: Record<string, unknown>,
        artifactContent: string | Buffer,
    ): Promise<ArtifactToolResult> {
        if (toolName !== 'get_metadata') {
            return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}".` };
        }
        const buffer = typeof artifactContent === 'string' ? Buffer.from(artifactContent, 'utf-8') : artifactContent;
        const sha256 = createHash('sha256').update(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)).digest('hex');
        return {
            success: true,
            data: {
                sizeBytes: buffer.length,
                sha256,
            },
        };
    }
}
