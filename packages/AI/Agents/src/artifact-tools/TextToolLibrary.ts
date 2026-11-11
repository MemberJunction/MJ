import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import { CompileSafeUserRegex, IsSafeUserRegex } from '@memberjunction/core-entities';
import { EnsureNodeVmSafeRegexExecutorRegistered, ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

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
        EnsureNodeVmSafeRegexExecutorRegistered();
        const patternStr = input.pattern != null ? String(input.pattern) : '';
        if (!patternStr) {
            return { success: false, data: null, errorMessage: 'grep requires a non-empty pattern.' };
        }
        if (patternStr.length > 256) {
            return {
                success: false,
                data: null,
                errorMessage: 'Unsafe or overly complex regular expression rejected'
            };
        }

        const flags = input.flags != null ? String(input.flags) : undefined;
        const cleanFlags = flags ? flags.replace(/[gy]/g, () => '') : '';
        const effectiveFlags = cleanFlags.length > 0 ? cleanFlags : undefined;

        try {
            new RegExp(patternStr, effectiveFlags);
        } catch (err) {
            return {
                success: false,
                data: null,
                errorMessage: `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`
            };
        }

        const safeRegex = CompileSafeUserRegex(patternStr, effectiveFlags);
        if (!safeRegex || !IsSafeUserRegex(patternStr, effectiveFlags)) {
            return {
                success: false,
                data: null,
                errorMessage: 'Unsafe or overly complex regular expression rejected'
            };
        }

        const lines = content.split('\n');
        const recRes = ExecuteSafeRegexBatchWithRecovery(
            safeRegex,
            lines,
            performance.now() + 500,
            40,
            65_536
        );

        const matches: LineMatch[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (recRes.Matches[i]) {
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
