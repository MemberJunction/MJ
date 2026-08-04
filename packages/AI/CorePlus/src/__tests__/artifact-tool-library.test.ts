import { describe, it, expect } from 'vitest';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolDefinition,
    type ArtifactToolResult,
} from '../artifact-tool-library';

// Minimal concrete subclass with no extra tools — exercises the base class
// `get_full` defaults end-to-end.
class StubToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [];
    }
    protected async invokeSubclassTool(): Promise<ArtifactToolResult> {
        return { success: false, data: null, errorMessage: 'no subclass tools' };
    }
}

// Subclass that overrides GetFull to verify the override hook works.
class OverrideToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [];
    }
    protected async invokeSubclassTool(): Promise<ArtifactToolResult> {
        return { success: false, data: null, errorMessage: 'no subclass tools' };
    }
    protected getFullToolDefinition(): ArtifactToolDefinition {
        return {
            name: 'get_full',
            description: 'Override description',
            inputSchema: { type: 'object', properties: {}, required: [] },
        };
    }
    protected async getFull(): Promise<ArtifactToolResult> {
        return { success: true, data: { content: 'OVERRIDDEN', encoding: 'utf8' } };
    }
}

describe('BaseArtifactToolLibrary', () => {
    it('GetToolList includes get_full by default', () => {
        const lib = new StubToolLibrary();
        const tools = lib.GetToolList();
        expect(tools.map(t => t.name)).toEqual(['get_full']);
    });

    it('get_full returns utf-8 passthrough for string content', async () => {
        const lib = new StubToolLibrary();
        const result = await lib.InvokeTool('get_full', {}, 'hello world');
        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            content: 'hello world',
            encoding: 'utf8',
            sizeBytes: 11,
        });
    });

    it('get_full returns base64 for Buffer content', async () => {
        const lib = new StubToolLibrary();
        const buffer = Buffer.from([0xff, 0x00, 0xab]);
        const result = await lib.InvokeTool('get_full', {}, buffer);
        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            content: buffer.toString('base64'),
            encoding: 'base64',
            sizeBytes: 3,
        });
    });

    it('measures utf-8 byte length for multi-byte string content', async () => {
        const lib = new StubToolLibrary();
        const result = await lib.InvokeTool('get_full', {}, 'café'); // é = 2 bytes in utf-8
        expect(result.success).toBe(true);
        expect((result.data as { sizeBytes: number }).sizeBytes).toBe(5);
    });

    it('delegates unknown tools to invokeSubclassTool', async () => {
        const lib = new StubToolLibrary();
        const result = await lib.InvokeTool('whatever', {}, '');
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('no subclass tools');
    });

    it('subclass GetFull override replaces the default implementation', async () => {
        const lib = new OverrideToolLibrary();
        const tools = lib.GetToolList();
        expect(tools[0].description).toBe('Override description');
        const result = await lib.InvokeTool('get_full', {}, 'should be ignored');
        expect(result.data).toEqual({ content: 'OVERRIDDEN', encoding: 'utf8' });
    });
});
