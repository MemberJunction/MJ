import { describe, it, expect } from 'vitest';
import { DocxToolLibrary } from '../artifact-tools/DocxToolLibrary';
import type { ArtifactToolResult } from '@memberjunction/ai-core-plus';

describe('DocxToolLibrary', () => {
  const lib = new DocxToolLibrary();

  describe('GetToolList', () => {
    it('should return 5 subclass tools plus inherited get_full (6 total)', () => {
      const tools = lib.GetToolList();
      expect(tools).toHaveLength(6);
      expect(tools[0].name).toBe('get_full');
    });

    it('should include the expected tool names', () => {
      const names = lib.GetToolList().map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['get_text', 'get_html', 'search_text', 'get_lines', 'get_sections']));
    });

    it('should have a string name and inputSchema on every tool', () => {
      for (const tool of lib.GetToolList()) {
        expect(typeof tool.name).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      }
    });
  });

  describe('error handling', () => {
    it('should return error for invalid content on get_text', async () => {
      const result = await lib.InvokeTool('get_text', {}, 'not a docx');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content on get_html', async () => {
      const result = await lib.InvokeTool('get_html', {}, 'not a docx');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content on search_text', async () => {
      const result = await lib.InvokeTool('search_text', { pattern: 'test' }, 'not a docx');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content on get_lines', async () => {
      const result = await lib.InvokeTool('get_lines', { start: 0, count: 5 }, 'not a docx');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content on get_sections', async () => {
      const result = await lib.InvokeTool('get_sections', {}, 'not a docx');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with unknown tool name', async () => {
      const result = await lib.InvokeTool('unknown_tool', {}, Buffer.alloc(0));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });
});
