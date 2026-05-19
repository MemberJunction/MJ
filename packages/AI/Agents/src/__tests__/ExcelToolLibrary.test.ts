import { describe, it, expect } from 'vitest';
import { ExcelToolLibrary } from '../artifact-tools/ExcelToolLibrary';

const EXPECTED_TOOL_NAMES = ['get_sheets', 'get_sheet_data', 'search_cells', 'aggregate_column', 'get_formulas'] as const;

const INVALID_CONTENT = 'this is not a valid excel file';

describe('ExcelToolLibrary', () => {
  const lib = new ExcelToolLibrary();

  describe('GetToolList', () => {
    it('should return exactly 5 tool definitions', () => {
      const tools = lib.GetToolList();
      expect(tools).toHaveLength(5);
    });

    it('should include the expected tool names', () => {
      const names = lib.GetToolList().map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining([...EXPECTED_TOOL_NAMES]));
    });

    it('should have non-empty description and inputSchema on every tool', () => {
      for (const tool of lib.GetToolList()) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it('should have unique tool names', () => {
      const names = lib.GetToolList().map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool name', async () => {
      const result = await lib.InvokeTool('unknown_tool', {}, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_sheets', async () => {
      const result = await lib.InvokeTool('get_sheets', {}, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_sheet_data', async () => {
      const result = await lib.InvokeTool('get_sheet_data', { sheetName: 'Sheet1' }, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with search_cells', async () => {
      const result = await lib.InvokeTool('search_cells', { query: 'test' }, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with aggregate_column', async () => {
      const result = await lib.InvokeTool('aggregate_column', { sheetName: 'Sheet1', column: 'A', operation: 'sum' }, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for invalid content with get_formulas', async () => {
      const result = await lib.InvokeTool('get_formulas', { sheetName: 'Sheet1' }, INVALID_CONTENT);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for empty string content', async () => {
      const result = await lib.InvokeTool('get_sheets', {}, '');
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return error for Buffer with invalid content', async () => {
      const result = await lib.InvokeTool('get_sheets', {}, Buffer.from('not an excel file'));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });
});
