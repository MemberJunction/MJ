import { describe, it, expect } from 'vitest';
import { PDFToolLibrary } from '../artifact-tools/PDFToolLibrary';

const EXPECTED_TOOL_NAMES = ['get_page_count', 'get_text', 'search_text', 'get_metadata', 'get_full'];

describe('PDFToolLibrary', () => {
  const lib = new PDFToolLibrary();

  describe('GetToolList', () => {
    it('should return exactly 5 tool definitions', () => {
      const tools = lib.GetToolList();
      expect(tools).toHaveLength(5);
    });

    it('should include the expected tool names', () => {
      const names = lib.GetToolList().map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOL_NAMES));
    });

    it('every tool name should be a non-empty string', () => {
      for (const tool of lib.GetToolList()) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
      }
    });

    it('every tool should have an inputSchema', () => {
      for (const tool of lib.GetToolList()) {
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      }
    });
  });

  describe('InvokeTool — error handling', () => {
    it('should return error for invalid content', async () => {
      const result = await lib.InvokeTool('get_page_count', {}, 'not a pdf');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for unknown tool name', async () => {
      const result = await lib.InvokeTool('unknown_tool', {}, Buffer.alloc(0));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for empty buffer content', async () => {
      const result = await lib.InvokeTool('get_text', {}, Buffer.alloc(0));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_text', async () => {
      const result = await lib.InvokeTool('get_text', {}, 'junk');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with search_text', async () => {
      const result = await lib.InvokeTool('search_text', { query: 'test' }, 'junk');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_metadata', async () => {
      const result = await lib.InvokeTool('get_metadata', {}, 'junk');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_full', async () => {
      const result = await lib.InvokeTool('get_full', {}, 'junk');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });
});
