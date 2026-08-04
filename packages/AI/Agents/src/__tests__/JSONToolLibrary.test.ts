import { describe, it, expect } from 'vitest';
import { JSONToolLibrary } from '../artifact-tools/JSONToolLibrary';

const sampleJSON = JSON.stringify({
    tables: [
        { name: 'Users', rowCount: 100 },
        { name: 'Orders', rowCount: 5000 },
    ],
    config: {
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true },
    },
    tags: ['alpha', 'beta', 'gamma'],
});

describe('JSONToolLibrary', () => {
    const lib = new JSONToolLibrary();

    // Slice 1: GetToolList returns 4 tools
    describe('GetToolList', () => {
        it('should return 4 subclass tools plus inherited get_full (5 total)', () => {
            const tools = lib.GetToolList();
            expect(tools).toHaveLength(5);
            const names = tools.map(t => t.name);
            expect(names).toContain('get_full');
            expect(names).toContain('json_path');
            expect(names).toContain('json_keys');
            expect(names).toContain('json_search');
            expect(names).toContain('json_iterate');
        });
    });

    // Slice 2: json_path navigates to a nested value
    describe('json_path', () => {
        it('should navigate to a nested value', async () => {
            const result = await lib.InvokeTool('json_path', { path: 'config.database.host' }, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toBe('localhost');
        });

        it('should navigate into arrays using numeric index', async () => {
            const result = await lib.InvokeTool('json_path', { path: 'tables.0.name' }, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toBe('Users');
        });

        // Slice 3: json_path returns root when path is empty
        it('should return root when path is empty string', async () => {
            const result = await lib.InvokeTool('json_path', { path: '' }, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(JSON.parse(sampleJSON));
        });
    });

    // Slice 4: json_keys returns keys at root
    describe('json_keys', () => {
        it('should return keys at root when no path given', async () => {
            const result = await lib.InvokeTool('json_keys', {}, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(['tables', 'config', 'tags']);
        });

        // Slice 5: json_keys returns keys at nested path
        it('should return keys at a nested path', async () => {
            const result = await lib.InvokeTool('json_keys', { path: 'config.database' }, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(['host', 'port']);
        });

        it('should return numeric indices for arrays', async () => {
            const result = await lib.InvokeTool('json_keys', { path: 'tables' }, sampleJSON);
            expect(result.success).toBe(true);
            expect(result.data).toEqual([0, 1]);
        });
    });

    // Slice 6: json_search finds matching key/value pairs recursively
    describe('json_search', () => {
        it('should find matching key/value pairs recursively', async () => {
            const result = await lib.InvokeTool(
                'json_search',
                { key: 'name', pattern: '^U' },
                sampleJSON
            );
            expect(result.success).toBe(true);
            const matches = result.data as { path: string; value: unknown }[];
            expect(matches).toHaveLength(1);
            expect(matches[0].path).toBe('tables.0.name');
            expect(matches[0].value).toBe('Users');
        });

        it('should return multiple matches', async () => {
            const result = await lib.InvokeTool(
                'json_search',
                { key: 'name', pattern: '.*' },
                sampleJSON
            );
            expect(result.success).toBe(true);
            const matches = result.data as { path: string; value: unknown }[];
            expect(matches).toHaveLength(2);
        });
    });

    // Slice 7: json_iterate returns slice of an array
    describe('json_iterate', () => {
        it('should return a slice of an array', async () => {
            const result = await lib.InvokeTool(
                'json_iterate',
                { arrayPath: 'tags', start: 1, count: 2 },
                sampleJSON
            );
            expect(result.success).toBe(true);
            expect(result.data).toEqual(['beta', 'gamma']);
        });

        it('should return from start=0 with count', async () => {
            const result = await lib.InvokeTool(
                'json_iterate',
                { arrayPath: 'tables', start: 0, count: 1 },
                sampleJSON
            );
            expect(result.success).toBe(true);
            const items = result.data as Record<string, unknown>[];
            expect(items).toHaveLength(1);
            expect(items[0]).toEqual({ name: 'Users', rowCount: 100 });
        });
    });

    // Slice 8: Error - invalid JSON returns error
    describe('error handling', () => {
        it('should return error for invalid JSON', async () => {
            const result = await lib.InvokeTool('json_path', { path: 'foo' }, 'not valid json{{{');
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });

        // Slice 9: Error - path not found returns error
        it('should return error when path is not found', async () => {
            const result = await lib.InvokeTool('json_path', { path: 'nonexistent.deep.path' }, sampleJSON);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('not found');
        });

        it('should return error for unknown tool name', async () => {
            const result = await lib.InvokeTool('unknown_tool', {}, sampleJSON);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('Unknown tool');
        });
    });
});
