import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { ExecuteStructuredLineGrep, LineMatch } from './grepHelper';

/**
 * Tool library for searching and slicing plain-text artifact content.
 * Provides literal/regex grep and line-range extraction.
 */
@RegisterClass(BaseArtifactToolLibrary, 'TextToolLibrary')
export class TextToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'grep',
                description:
                    'Search lines in the text by case-insensitive literal substring (default false for use_regex) or by regular expression when use_regex is true. Returns a stable result object with matching lines and line numbers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'Literal text substring (default) or regex pattern (when use_regex/useRegex is true) to search for.'
                        },
                        flags: { type: 'string', description: 'Optional regex flags when use_regex is true (e.g., "i" for case-insensitive).' },
                        case_sensitive: {
                            type: 'boolean',
                            description:
                                'Case-sensitive matching. Defaults to false (case-insensitive) for literal search; when use_regex is true, defaults to regex flags (case-sensitive unless flags includes "i", and explicit case_sensitive overrides flags).'
                        },
                        caseSensitive: {
                            type: 'boolean',
                            description: 'Alias for case_sensitive (default false).'
                        },
                        use_regex: {
                            type: 'boolean',
                            description:
                                'Optional (default false): set true to evaluate pattern as a regular expression instead of a literal substring.'
                        },
                        useRegex: {
                            type: 'boolean',
                            description:
                                'Alias for use_regex (default false): set true to evaluate pattern as a regular expression instead of a literal substring.'
                        }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'get_lines',
                description: 'Return lines from `start` (0-based) for `count` lines.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        start: { type: 'number', description: 'Start line number (0-based).' },
                        count: { type: 'number', description: 'Number of lines to return.' }
                    },
                    required: ['start', 'count']
                }
            }
        ];
    }

    protected async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        switch (toolName) {
            case 'grep':
                return this.handleGrep(contentStr, input);
            case 'get_lines':
                return this.handleGetLines(contentStr, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}"` };
        }
    }

    private handleGrep(content: string, input: Parameters<BaseArtifactToolLibrary['InvokeTool']>[1]): Promise<ArtifactToolResult> {
        return ExecuteStructuredLineGrep(content, input);
    }

    private handleGetLines(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const start = Number(input.start ?? 0);
        const count = Number(input.count ?? 20);
        const lines = content.split('\n');

        const sliced = lines.slice(start, start + count);
        const result: LineMatch[] = sliced.map((text, idx) => ({
            lineNumber: start + idx,
            text
        }));

        return { success: true, data: result };
    }
}
