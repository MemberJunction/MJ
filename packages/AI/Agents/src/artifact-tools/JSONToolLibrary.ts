import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';

interface SearchMatch {
    path: string;
    value: unknown;
}

/**
 * Tool library for navigating and querying JSON artifact content.
 * Provides path navigation, key listing, recursive search, and array iteration.
 */
@RegisterClass(BaseArtifactToolLibrary, 'JSONToolLibrary')
export class JSONToolLibrary extends BaseArtifactToolLibrary {
    GetToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'json_path',
                description: 'Navigate to a value at a dot-separated path (e.g., "tables.0.name"). Use numeric indices for arrays.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Dot-separated path to navigate to. Empty string returns root.' },
                    },
                    required: ['path'],
                },
            },
            {
                name: 'json_keys',
                description: 'Return keys at the given path (or root). For arrays, returns numeric indices.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Dot-separated path. Omit or empty for root.' },
                    },
                },
            },
            {
                name: 'json_search',
                description: 'Recursively search for keys matching `key` whose string values match `pattern` regex.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Key name to search for.' },
                        pattern: { type: 'string', description: 'Regex pattern to match against string values.' },
                    },
                    required: ['key', 'pattern'],
                },
            },
            {
                name: 'json_iterate',
                description: 'Slice an array at the given path. Returns the slice.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        arrayPath: { type: 'string', description: 'Dot-separated path to the array.' },
                        start: { type: 'number', description: 'Start index (0-based).' },
                        count: { type: 'number', description: 'Number of elements to return.' },
                    },
                    required: ['arrayPath', 'start', 'count'],
                },
            },
        ];
    }

    async InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        let parsed: unknown;
        try {
            parsed = JSON.parse(contentStr);
        } catch {
            return { success: false, data: null, errorMessage: 'Invalid JSON: failed to parse artifact content.' };
        }

        switch (toolName) {
            case 'json_path':
                return this.handleJsonPath(parsed, input);
            case 'json_keys':
                return this.handleJsonKeys(parsed, input);
            case 'json_search':
                return this.handleJsonSearch(parsed, input);
            case 'json_iterate':
                return this.handleJsonIterate(parsed, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}"` };
        }
    }

    private handleJsonPath(parsed: unknown, input: Record<string, unknown>): ArtifactToolResult {
        const path = String(input.path ?? '');
        if (path === '') {
            return { success: true, data: parsed };
        }

        const result = this.navigatePath(parsed, path);
        if (!result.found) {
            return { success: false, data: null, errorMessage: `Path "${path}" not found in JSON.` };
        }
        return { success: true, data: result.value };
    }

    private handleJsonKeys(parsed: unknown, input: Record<string, unknown>): ArtifactToolResult {
        const path = String(input.path ?? '');
        const target = path === '' ? parsed : this.navigatePath(parsed, path).value;

        if (target == null || typeof target !== 'object') {
            return { success: false, data: null, errorMessage: `Value at path is not an object or array.` };
        }

        if (Array.isArray(target)) {
            return { success: true, data: target.map((_, i) => i) };
        }
        return { success: true, data: Object.keys(target as Record<string, unknown>) };
    }

    private handleJsonSearch(parsed: unknown, input: Record<string, unknown>): ArtifactToolResult {
        const key = String(input.key);
        const pattern = new RegExp(String(input.pattern));
        const matches: SearchMatch[] = [];

        this.searchRecursive(parsed, key, pattern, '', matches);
        return { success: true, data: matches };
    }

    private handleJsonIterate(parsed: unknown, input: Record<string, unknown>): ArtifactToolResult {
        const arrayPath = String(input.arrayPath);
        const start = Number(input.start);
        const count = Number(input.count);

        const nav = this.navigatePath(parsed, arrayPath);
        if (!nav.found || !Array.isArray(nav.value)) {
            return { success: false, data: null, errorMessage: `Path "${arrayPath}" is not an array.` };
        }
        return { success: true, data: nav.value.slice(start, start + count) };
    }

    /** Navigate a dot-separated path through a parsed JSON value. */
    private navigatePath(obj: unknown, path: string): { found: boolean; value: unknown } {
        const segments = path.split('.');
        let current: unknown = obj;

        for (const segment of segments) {
            if (current == null || typeof current !== 'object') {
                return { found: false, value: undefined };
            }

            if (Array.isArray(current)) {
                const idx = Number(segment);
                if (isNaN(idx) || idx < 0 || idx >= current.length) {
                    return { found: false, value: undefined };
                }
                current = current[idx];
            } else {
                const record = current as Record<string, unknown>;
                if (!(segment in record)) {
                    return { found: false, value: undefined };
                }
                current = record[segment];
            }
        }

        return { found: true, value: current };
    }

    /** Recursively search for keys matching `targetKey` with string values matching `pattern`. */
    private searchRecursive(
        obj: unknown,
        targetKey: string,
        pattern: RegExp,
        currentPath: string,
        matches: SearchMatch[]
    ): void {
        if (obj == null || typeof obj !== 'object') {
            return;
        }

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const childPath = currentPath ? `${currentPath}.${i}` : String(i);
                this.searchRecursive(obj[i], targetKey, pattern, childPath, matches);
            }
        } else {
            const record = obj as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                const childPath = currentPath ? `${currentPath}.${key}` : key;
                const value = record[key];

                if (key === targetKey && typeof value === 'string' && pattern.test(value)) {
                    matches.push({ path: childPath, value });
                }

                this.searchRecursive(value, targetKey, pattern, childPath, matches);
            }
        }
    }
}
