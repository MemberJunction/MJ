import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';

interface LineMatch {
    lineNumber: number;
    text: string;
}

/**
 * Tool library for searching and slicing plain-text artifact content.
 * Provides regex grep and line-range extraction.
 */
@RegisterClass(BaseArtifactToolLibrary, 'TextToolLibrary')
export class TextToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'grep',
                description: 'Search for regex matches in the text. Returns matching lines with line numbers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Regex pattern to search for.' },
                        flags: { type: 'string', description: 'Optional regex flags (e.g., "i" for case-insensitive).' },
                    },
                    required: ['pattern'],
                },
            },
            {
                name: 'get_lines',
                description: 'Return lines from `start` (0-based) for `count` lines.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        start: { type: 'number', description: 'Start line number (0-based).' },
                        count: { type: 'number', description: 'Number of lines to return.' },
                    },
                    required: ['start', 'count'],
                },
            },
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

    private handleGrep(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const patternStr = String(input.pattern);
        const flags = input.flags != null ? String(input.flags) : undefined;
        const regex = new RegExp(patternStr, flags);

        const lines = content.split('\n');
        const matches: LineMatch[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                matches.push({ lineNumber: i, text: lines[i] });
            }
        }

        return { success: true, data: matches };
    }

    private handleGetLines(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const start = Number(input.start);
        const count = Number(input.count);
        const lines = content.split('\n');

        const sliced = lines.slice(start, start + count);
        const result: LineMatch[] = sliced.map((text, idx) => ({
            lineNumber: start + idx,
            text,
        }));

        return { success: true, data: result };
    }
}
