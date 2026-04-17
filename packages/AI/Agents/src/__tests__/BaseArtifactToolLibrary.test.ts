import { describe, it, expect } from 'vitest';
import {
    BaseArtifactToolLibrary,
    ArtifactToolDefinition,
    ArtifactToolResult
} from '@memberjunction/ai-core-plus';

// Concrete test implementation
class TestToolLibrary extends BaseArtifactToolLibrary {
    GetToolList(): ArtifactToolDefinition[] {
        return [
            { name: 'test_tool', description: 'A test tool', inputSchema: { type: 'object' } },
            { name: 'other_tool', description: 'Another tool', inputSchema: {} },
        ];
    }

    async InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        if (toolName === 'test_tool') {
            return { success: true, data: { echo: input, contentLength: artifactContent.length } };
        }
        return { success: false, data: null, errorMessage: `Unknown tool: ${toolName}` };
    }
}

describe('BaseArtifactToolLibrary', () => {
    it('subclass returns a list of tool definitions', () => {
        const lib = new TestToolLibrary();
        const tools = lib.GetToolList();

        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe('test_tool');
        expect(tools[0].description).toBe('A test tool');
        expect(tools[1].name).toBe('other_tool');
    });

    it('subclass invokes a known tool and returns success', async () => {
        const lib = new TestToolLibrary();
        const result = await lib.InvokeTool('test_tool', { key: 'value' }, 'hello world');

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            echo: { key: 'value' },
            contentLength: 11,
        });
    });

    it('subclass returns error for unknown tool', async () => {
        const lib = new TestToolLibrary();
        const result = await lib.InvokeTool('nonexistent', {}, '');

        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('Unknown tool: nonexistent');
    });
});
