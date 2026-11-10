import { createHash, randomUUID } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import {
    ArtifactEmbedMode,
    DocumentBlockKind,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    IsSafeUserRegex,
    SafeRegexTest
} from '@memberjunction/core-entities';

/**
 * Logical block parsed from a Markdown Document.
 */
export interface ParsedMarkdownLogicalBlock {
    /** Stable block identifier (from `<!-- mj-block-id: ... -->`, `BlockSpec.BlockID`, or deterministic `blk-<index>`). */
    blockId: string;
    /** True when the block carried an explicit `<!-- mj-block-id: ... -->` anchor comment in the Markdown (`D6`). */
    hasExplicitId?: boolean;
    /** Block kind (`'heading' | 'paragraph' | 'table' | 'code' | 'callout' | 'list' | 'mj-block'`). */
    kind: 'heading' | 'paragraph' | 'table' | 'code' | 'callout' | 'list' | 'mj-block';
    /** Heading level (1–6) when `kind === 'heading'`. */
    headingLevel?: number;
    /** Heading title text when `kind === 'heading'`. */
    headingText?: string;
    /** 1-based start line in the Markdown document. */
    startLine: number;
    /** 1-based end line in the Markdown document. */
    endLine: number;
    /** Raw Markdown text of this block. */
    rawMarkdown: string;
    /** Parsed embedded MJ block specification when `kind === 'mj-block'`. */
    mjBlockSpec?: DocumentBlockSpec;
}

/**
 * Heading outline entry returned by `get_outline`.
 */
export interface DocumentOutlineNode {
    blockId: string;
    level: number;
    title: string;
    startLine: number;
    endLine: number;
    wordCount: number;
    embeddedBlocks: Array<{ blockId: string; kind: DocumentBlockKind; mode: DocumentBlockMode; title?: string }>;
}

/**
 * Structured suggestion record produced by `propose_suggestion` in Suggest Mode (§ 3.6).
 */
export interface DocumentSuggestionProposal {
    suggestionId: string;
    targetBlockId: string;
    originalText: string;
    proposedText: string;
    rationale: string;
    authorName?: string;
    createdAt: string;
    status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Server-side and agent tool library for `Markdown Document` artifacts (`MJ Docs`, § 3.6 & § 4).
 *
 * Provides structured document inspection (`get_outline`, `get_section`, `get_blocks`, `search_blocks`,
 * `grep`, `get_lines`) as well as revision-checked block mutations (`insert_block_after`, `replace_block`,
 * `delete_block`, `upsert_table`, `insert_live_block`, `embed_artifact_block`, `propose_suggestion`).
 */
@RegisterClass(BaseArtifactToolLibrary, 'DocumentToolLibrary')
export class DocumentToolLibrary extends BaseArtifactToolLibrary {
    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_outline',
                description:
                    'Returns the hierarchical heading outline of the Markdown document along with line ranges, word counts, and any embedded MJ live/artifact blocks.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_section',
                description:
                    'Returns the Markdown content of a specific section identified by heading title (case-insensitive substring) or heading blockId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        heading: { type: 'string', description: 'Heading title or substring to match.' },
                        blockId: { type: 'string', description: 'Optional exact blockId of the heading.' }
                    }
                }
            },
            {
                name: 'get_blocks',
                description:
                    'Parses the document into logical blocks (headings, paragraphs, tables, code fences, callouts, lists, and :::mj-block directives) with blockId and revisionHash.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        kind: {
                            type: 'string',
                            description:
                                'Optional filter by block kind (heading, paragraph, table, code, callout, list, mj-block).'
                        }
                    }
                }
            },
            {
                name: 'search_blocks',
                description: 'Searches logical blocks in the document by text query or regex pattern.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Case-insensitive text or regex pattern to find.' },
                        useRegex: {
                            type: 'boolean',
                            description: 'Optional: set false to force literal substring matching, or true to require regex syntax.'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'grep',
                description: 'Search for regex or literal matches in the text. Returns matching lines with line numbers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Regex pattern (or literal text when useRegex is false) to search for.' },
                        flags: { type: 'string', description: 'Optional regex flags (e.g., "i" for case-insensitive).' },
                        useRegex: {
                            type: 'boolean',
                            description: 'Optional: set false to match pattern as a literal substring instead of a regular expression.'
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
            },
            {
                name: 'insert_block_after',
                description:
                    'Inserts a new Markdown block after `afterBlockId` (or at the end of the document if `afterBlockId` is omitted). Returns `updatedContent` and the new `revisionHash`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        afterBlockId: {
                            type: 'string',
                            description: 'Block ID after which to insert. Use "START" to insert at the top.'
                        },
                        markdown: { type: 'string', description: 'Markdown content of the new block.' },
                        newBlockId: { type: 'string', description: 'Optional explicit block ID to stamp on the block.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency checking.'
                        }
                    },
                    required: ['markdown']
                }
            },
            {
                name: 'replace_block',
                description:
                    'Replaces the Markdown content of the block identified by `blockId`. Supports optimistic concurrency via `expectedRevisionHash`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        blockId: { type: 'string', description: 'Target blockId to replace.' },
                        markdown: { type: 'string', description: 'Replacement Markdown content.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash of the document prior to edit.'
                        }
                    },
                    required: ['blockId', 'markdown']
                }
            },
            {
                name: 'delete_block',
                description: 'Deletes the block identified by `blockId` from the document.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        blockId: { type: 'string', description: 'Target blockId to delete.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash of the document prior to edit.'
                        }
                    },
                    required: ['blockId']
                }
            },
            {
                name: 'upsert_table',
                description:
                    'Creates or replaces a GitHub-Flavored Markdown table with `headers` and `rows` at `blockId` or after `afterBlockId`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        headers: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Column header labels.'
                        },
                        rows: {
                            type: 'array',
                            items: { type: 'array', items: { type: 'string' } },
                            description: '2D array of row cells.'
                        },
                        blockId: { type: 'string', description: 'Existing table blockId to replace.' },
                        afterBlockId: { type: 'string', description: 'BlockId after which to insert a new table.' }
                    },
                    required: ['headers', 'rows']
                }
            },
            {
                name: 'insert_live_block',
                description:
                    'Inserts a live MJ block (`EntityView`, `SavedQuery`, `DashboardPart`, or `InteractiveComponent`) serialized as a `:::mj-block` directive.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        blockId: { type: 'string', description: 'Unique ID for the block.' },
                        kind: {
                            type: 'string',
                            enum: ['EntityView', 'SavedQuery', 'DashboardPart', 'InteractiveComponent'],
                            description: 'Kind of MJ live block.'
                        },
                        title: { type: 'string', description: 'Display title for the block.' },
                        entityName: { type: 'string', description: 'Entity name when kind is EntityView.' },
                        viewId: { type: 'string', description: 'Saved UserView ID when kind is EntityView.' },
                        extraFilter: { type: 'string', description: 'Optional ExtraFilter when kind is EntityView.' },
                        fields: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Field names to display when kind is EntityView.'
                        },
                        queryId: { type: 'string', description: 'Saved Query ID when kind is SavedQuery.' },
                        queryName: { type: 'string', description: 'Saved Query Name when kind is SavedQuery.' },
                        parameters: {
                            type: 'object',
                            description: 'Query parameters when kind is SavedQuery.'
                        },
                        dashboardId: { type: 'string', description: 'Dashboard ID when kind is DashboardPart.' },
                        componentId: { type: 'string', description: 'Component ID when kind is InteractiveComponent.' },
                        afterBlockId: { type: 'string', description: 'Optional blockId after which to insert.' }
                    },
                    required: ['kind']
                }
            },
            {
                name: 'embed_artifact_block',
                description:
                    'Embeds an OLE Artifact block (`Kind = "Artifact"`, e.g. a Whiteboard, Presentation, or Spreadsheet) into the document as a `:::mj-block` directive.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        blockId: { type: 'string', description: 'Optional unique block ID.' },
                        artifactId: { type: 'string', description: 'Target MJ: Artifacts ID to embed.' },
                        artifactType: {
                            type: 'string',
                            description: 'Artifact type name (e.g., "Whiteboard", "Presentation", "Excel Spreadsheet").'
                        },
                        title: { type: 'string', description: 'Optional caption/title for the embedded artifact.' },
                        embedMode: {
                            type: 'string',
                            enum: ['Inline', 'Link'],
                            description: '"Inline" for delegated child artifacts or "Link" for standalone artifacts.'
                        },
                        versionId: {
                            type: 'string',
                            description: 'Optional pinned ArtifactVersion ID (omit to track latest version).'
                        },
                        afterBlockId: { type: 'string', description: 'Optional blockId after which to insert.' }
                    },
                    required: ['artifactId']
                }
            },
            {
                name: 'propose_suggestion',
                description:
                    'Creates a structured Suggest Mode change proposal targeting `targetBlockId` without overwriting the block directly until accepted by an editor.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        targetBlockId: { type: 'string', description: 'Block ID being suggested for change.' },
                        proposedMarkdown: { type: 'string', description: 'Proposed replacement Markdown for the block.' },
                        rationale: { type: 'string', description: 'Explanation of why this change is suggested.' },
                        authorName: { type: 'string', description: 'Optional agent or user display name.' }
                    },
                    required: ['targetBlockId', 'proposedMarkdown', 'rationale']
                }
            }
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        switch (toolName) {
            case 'get_outline':
                return this.handleGetOutline(contentStr);
            case 'get_section':
                return this.handleGetSection(contentStr, input);
            case 'get_blocks':
                return this.handleGetBlocks(contentStr, input);
            case 'search_blocks':
                return this.handleSearchBlocks(contentStr, input);
            case 'grep':
                return this.handleGrep(contentStr, input);
            case 'get_lines':
                return this.handleGetLines(contentStr, input);
            case 'insert_block_after':
                return this.handleInsertBlockAfter(contentStr, input);
            case 'replace_block':
                return this.handleReplaceBlock(contentStr, input);
            case 'delete_block':
                return this.handleDeleteBlock(contentStr, input);
            case 'upsert_table':
                return this.handleUpsertTable(contentStr, input);
            case 'insert_live_block':
                return this.handleInsertLiveBlock(contentStr, input);
            case 'embed_artifact_block':
                return this.handleEmbedArtifactBlock(contentStr, input);
            case 'propose_suggestion':
                return this.handleProposeSuggestion(contentStr, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}"` };
        }
    }

    /**
     * Computes a deterministic SHA-256 revision hash for optimistic concurrency checking.
     */
    public ComputeRevisionHash(content: string): string {
        return createHash('sha256').update(content ?? '', 'utf8').digest('hex');
    }

    /**
     * Parses a Markdown document into logical blocks (`heading`, `paragraph`, `table`, `code`,
     * `callout`, `list`, `mj-block`) with deterministic IDs.
     */
    public ParseLogicalBlocks(markdown: string): ParsedMarkdownLogicalBlock[] {
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown ?? '');
        const blocks: ParsedMarkdownLogicalBlock[] = [];
        let autoCounter = 1;

        for (const seg of segments) {
            if (seg.Type === 'mj-block' && seg.BlockSpec) {
                blocks.push({
                    blockId: seg.BlockSpec.BlockID || `blk-${autoCounter++}`,
                    kind: 'mj-block',
                    startLine: seg.StartLine,
                    endLine: seg.EndLine,
                    rawMarkdown: seg.RawText,
                    mjBlockSpec: seg.BlockSpec
                });
                continue;
            }

            // Parse prose segment into paragraphs, headings, code fences, tables, lists, callouts
            const lines = seg.RawText.split(/\r?\n/);
            let i = 0;
            let pendingBlockId: string | null = null;

            while (i < lines.length) {
                const line = lines[i];
                const trimmed = line.trim();

                if (!trimmed) {
                    i++;
                    continue;
                }

                // Check for explicit block ID comment: <!-- mj-block-id: blk-xyz -->
                const commentMatch = /^<!--\s*mj-block-id:\s*([A-Za-z0-9_-]+)\s*-->$/.exec(trimmed);
                if (commentMatch) {
                    pendingBlockId = commentMatch[1];
                    i++;
                    continue;
                }

                const blockStartOffset = i;
                const assignId = (): { blockId: string; hasExplicitId: boolean } => {
                    if (pendingBlockId) {
                        const id = pendingBlockId;
                        pendingBlockId = null;
                        return { blockId: id, hasExplicitId: true };
                    }
                    return { blockId: `blk-${autoCounter++}`, hasExplicitId: false };
                };

                // 1. Heading (# .. ######)
                const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
                if (headingMatch) {
                    const lineNum = seg.StartLine + i;
                    const assigned = assignId();
                    blocks.push({
                        blockId: assigned.blockId,
                        hasExplicitId: assigned.hasExplicitId,
                        kind: 'heading',
                        headingLevel: headingMatch[1].length,
                        headingText: headingMatch[2].trim(),
                        startLine: lineNum,
                        endLine: lineNum,
                        rawMarkdown: line
                    });
                    i++;
                    continue;
                }

                // 2. Code fence (``` or ~~~)
                if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                    const fence = trimmed.slice(0, 3);
                    const codeLines: string[] = [line];
                    i++;
                    while (i < lines.length && !lines[i].trim().startsWith(fence)) {
                        codeLines.push(lines[i]);
                        i++;
                    }
                    if (i < lines.length) {
                        codeLines.push(lines[i]);
                        i++;
                    }
                    const assigned = assignId();
                    blocks.push({
                        blockId: assigned.blockId,
                        hasExplicitId: assigned.hasExplicitId,
                        kind: 'code',
                        startLine: seg.StartLine + blockStartOffset,
                        endLine: seg.StartLine + i - 1,
                        rawMarkdown: codeLines.join('\n')
                    });
                    continue;
                }

                // 3. Table (starts with |)
                if (trimmed.startsWith('|')) {
                    const tableLines: string[] = [];
                    while (i < lines.length && lines[i].trim().startsWith('|')) {
                        tableLines.push(lines[i]);
                        i++;
                    }
                    const assigned = assignId();
                    blocks.push({
                        blockId: assigned.blockId,
                        hasExplicitId: assigned.hasExplicitId,
                        kind: 'table',
                        startLine: seg.StartLine + blockStartOffset,
                        endLine: seg.StartLine + i - 1,
                        rawMarkdown: tableLines.join('\n')
                    });
                    continue;
                }

                // 4. Callout / blockquote (starts with >)
                if (trimmed.startsWith('>')) {
                    const quoteLines: string[] = [];
                    while (i < lines.length && lines[i].trim().startsWith('>')) {
                        quoteLines.push(lines[i]);
                        i++;
                    }
                    const assigned = assignId();
                    blocks.push({
                        blockId: assigned.blockId,
                        hasExplicitId: assigned.hasExplicitId,
                        kind: 'callout',
                        startLine: seg.StartLine + blockStartOffset,
                        endLine: seg.StartLine + i - 1,
                        rawMarkdown: quoteLines.join('\n')
                    });
                    continue;
                }

                // 5. Bullet / numbered / task list
                if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
                    const listLines: string[] = [];
                    while (
                        i < lines.length &&
                        lines[i].trim().length > 0 &&
                        (/^([-*+]|\d+\.)\s+/.test(lines[i].trim()) || /^\s{2,}/.test(lines[i]))
                    ) {
                        listLines.push(lines[i]);
                        i++;
                    }
                    const assigned = assignId();
                    blocks.push({
                        blockId: assigned.blockId,
                        hasExplicitId: assigned.hasExplicitId,
                        kind: 'list',
                        startLine: seg.StartLine + blockStartOffset,
                        endLine: seg.StartLine + i - 1,
                        rawMarkdown: listLines.join('\n')
                    });
                    continue;
                }

                // 6. Standard paragraph
                const paraLines: string[] = [];
                while (
                    i < lines.length &&
                    lines[i].trim().length > 0 &&
                    !/^(#{1,6}\s+|```|~~~|\||>|([-*+]|\d+\.)\s+|<!--\s*mj-block-id:)/.test(lines[i].trim())
                ) {
                    paraLines.push(lines[i]);
                    i++;
                }
                const assigned = assignId();
                blocks.push({
                    blockId: assigned.blockId,
                    hasExplicitId: assigned.hasExplicitId,
                    kind: 'paragraph',
                    startLine: seg.StartLine + blockStartOffset,
                    endLine: seg.StartLine + i - 1,
                    rawMarkdown: paraLines.join('\n')
                });
            }
        }

        return blocks;
    }

    private handleGetOutline(content: string): ArtifactToolResult {
        const blocks = this.ParseLogicalBlocks(content);
        const headings = blocks.filter((b) => b.kind === 'heading');
        const outline: DocumentOutlineNode[] = [];

        for (let idx = 0; idx < headings.length; idx++) {
            const h = headings[idx];
            const nextH = headings.slice(idx + 1).find((candidate) => (candidate.headingLevel ?? 6) <= (h.headingLevel ?? 1));
            const sectionEndLine = nextH ? nextH.startLine - 1 : blocks[blocks.length - 1]?.endLine ?? h.endLine;

            const sectionBlocks = blocks.filter(
                (b) => b.startLine >= h.startLine && b.endLine <= sectionEndLine
            );
            const words = sectionBlocks
                .map((b) => b.rawMarkdown)
                .join(' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean).length;

            const embeddedBlocks = sectionBlocks
                .filter((b) => b.kind === 'mj-block' && b.mjBlockSpec)
                .map((b) => ({
                    blockId: b.mjBlockSpec!.BlockID,
                    kind: b.mjBlockSpec!.Kind,
                    mode: b.mjBlockSpec!.Mode,
                    title: b.mjBlockSpec!.Title
                }));

            outline.push({
                blockId: h.blockId,
                level: h.headingLevel ?? 1,
                title: h.headingText ?? '',
                startLine: h.startLine,
                endLine: sectionEndLine,
                wordCount: words,
                embeddedBlocks
            });
        }

        return {
            success: true,
            data: {
                revisionHash: this.ComputeRevisionHash(content),
                totalBlocks: blocks.length,
                outline
            }
        };
    }

    private handleGetSection(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const blocks = this.ParseLogicalBlocks(content);
        const targetBlockId = typeof input.blockId === 'string' ? input.blockId.trim() : '';
        const headingQuery = typeof input.heading === 'string' ? input.heading.trim().toLowerCase() : '';

        const headingIdx = blocks.findIndex(
            (b) =>
                b.kind === 'heading' &&
                ((targetBlockId && b.blockId === targetBlockId) ||
                    (headingQuery && (b.headingText ?? '').toLowerCase().includes(headingQuery)))
        );

        if (headingIdx < 0) {
            return {
                success: false,
                data: null,
                errorMessage: `Section heading '${targetBlockId || headingQuery}' not found.`
            };
        }

        const startHeading = blocks[headingIdx];
        const startLevel = startHeading.headingLevel ?? 1;
        const sectionBlocks: ParsedMarkdownLogicalBlock[] = [startHeading];

        for (let i = headingIdx + 1; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.kind === 'heading' && (b.headingLevel ?? 6) <= startLevel) {
                break;
            }
            sectionBlocks.push(b);
        }

        return {
            success: true,
            data: {
                headingBlockId: startHeading.blockId,
                title: startHeading.headingText,
                level: startLevel,
                markdown: sectionBlocks.map((b) => b.rawMarkdown).join('\n\n'),
                blocks: sectionBlocks
            }
        };
    }

    private handleGetBlocks(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const kindFilter = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : '';
        const allBlocks = this.ParseLogicalBlocks(content);
        const filtered = kindFilter ? allBlocks.filter((b) => b.kind.toLowerCase() === kindFilter) : allBlocks;
        return {
            success: true,
            data: {
                revisionHash: this.ComputeRevisionHash(content),
                blocks: filtered
            }
        };
    }

    private handleSearchBlocks(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const query = String(input.query ?? '').trim();
        if (!query) {
            return { success: false, data: null, errorMessage: 'search_blocks requires a non-empty query.' };
        }
        if (query.length > 256) {
            return {
                success: false,
                data: null,
                errorMessage: 'Unsafe or overly complex regular expression rejected'
            };
        }
        const blocks = this.ParseLogicalBlocks(content);
        if (input.useRegex === false) {
            const needle = query.toLowerCase();
            const matches = blocks.filter((b) => b.rawMarkdown.toLowerCase().includes(needle));
            return {
                success: true,
                data: {
                    revisionHash: this.ComputeRevisionHash(content),
                    matchCount: matches.length,
                    matches
                }
            };
        }

        let compiledRegex: RegExp | null = null;
        try {
            compiledRegex = new RegExp(query, 'i');
        } catch (err) {
            if (input.useRegex === true) {
                return {
                    success: false,
                    data: null,
                    errorMessage: `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`
                };
            }
            compiledRegex = null;
        }

        if (compiledRegex) {
            if (!IsSafeUserRegex(query)) {
                return {
                    success: false,
                    data: null,
                    errorMessage: 'Unsafe or overly complex regular expression rejected'
                };
            }
            const activeRegex = compiledRegex;
            const matches = blocks.filter((b) => SafeRegexTest(activeRegex, b.rawMarkdown));
            return {
                success: true,
                data: {
                    revisionHash: this.ComputeRevisionHash(content),
                    matchCount: matches.length,
                    matches
                }
            };
        }

        // Literal fallback for plain strings containing unescaped regex metacharacters like "C++"
        const needle = query.toLowerCase();
        const matches = blocks.filter((b) => b.rawMarkdown.toLowerCase().includes(needle));
        return {
            success: true,
            data: {
                revisionHash: this.ComputeRevisionHash(content),
                matchCount: matches.length,
                matches
            }
        };
    }

    private handleGrep(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const patternStr = String(input.pattern ?? '');
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
        const lines = content.split('\n');

        if (input.useRegex === false) {
            const caseInsensitive = Boolean(flags?.includes('i'));
            const needle = caseInsensitive ? patternStr.toLowerCase() : patternStr;
            const matches: Array<{ lineNumber: number; text: string }> = [];
            for (let i = 0; i < lines.length; i++) {
                const hay = caseInsensitive ? lines[i].toLowerCase() : lines[i];
                if (hay.includes(needle)) {
                    matches.push({ lineNumber: i, text: lines[i] });
                }
            }
            return { success: true, data: matches };
        }

        let regex: RegExp;
        try {
            regex = new RegExp(patternStr, flags);
        } catch (err) {
            if (input.useRegex === true) {
                return {
                    success: false,
                    data: null,
                    errorMessage: `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`
                };
            }
            // Literal fallback for plain strings like "C++" when useRegex was not explicitly true
            const caseInsensitive = Boolean(flags?.includes('i'));
            const needle = caseInsensitive ? patternStr.toLowerCase() : patternStr;
            const matches: Array<{ lineNumber: number; text: string }> = [];
            for (let i = 0; i < lines.length; i++) {
                const hay = caseInsensitive ? lines[i].toLowerCase() : lines[i];
                if (hay.includes(needle)) {
                    matches.push({ lineNumber: i, text: lines[i] });
                }
            }
            return { success: true, data: matches };
        }

        if (!IsSafeUserRegex(patternStr)) {
            return {
                success: false,
                data: null,
                errorMessage: 'Unsafe or overly complex regular expression rejected'
            };
        }

        const matches: Array<{ lineNumber: number; text: string }> = [];
        for (let i = 0; i < lines.length; i++) {
            if (SafeRegexTest(regex, lines[i])) {
                matches.push({ lineNumber: i, text: lines[i] });
            }
        }
        return { success: true, data: matches };
    }

    private handleGetLines(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const start = Number(input.start ?? 0);
        const count = Number(input.count ?? 20);
        const lines = content.split('\n');
        const sliced = lines.slice(start, start + count);
        return {
            success: true,
            data: sliced.map((text, idx) => ({ lineNumber: start + idx, text }))
        };
    }

    private checkRevision(content: string, expectedRevisionHash?: unknown): string | null {
        if (typeof expectedRevisionHash !== 'string' || !expectedRevisionHash.trim()) {
            return null;
        }
        const current = this.ComputeRevisionHash(content);
        if (current !== expectedRevisionHash.trim()) {
            return `Revision conflict: expected revisionHash '${expectedRevisionHash.trim()}', but current document revisionHash is '${current}'. Reload blocks and retry.`;
        }
        return null;
    }

    private serializeLogicalBlocks(blocks: ParsedMarkdownLogicalBlock[]): string {
        return blocks
            .map((b) => {
                if (
                    b.kind !== 'mj-block' &&
                    b.hasExplicitId &&
                    !/^\s*<!--\s*mj-block-id:/i.test(b.rawMarkdown)
                ) {
                    return `<!-- mj-block-id: ${b.blockId} -->\n${b.rawMarkdown}`;
                }
                return b.rawMarkdown;
            })
            .join('\n\n');
    }

    private handleInsertBlockAfter(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const conflict = this.checkRevision(content, input.expectedRevisionHash);
        if (conflict) {
            return { success: false, data: null, errorMessage: conflict };
        }

        const newMarkdown = String(input.markdown ?? '').trim();
        if (!newMarkdown) {
            return { success: false, data: null, errorMessage: 'insert_block_after requires non-empty markdown.' };
        }

        const blocks = this.ParseLogicalBlocks(content);
        const existingIds = new Set(blocks.map((b) => b.blockId));

        const isMjBlockDirective = newMarkdown.startsWith(':::mj-block');
        const leadingCommentMatch = /^<!--\s*mj-block-id:\s*([A-Za-z0-9_-]+)\s*-->\s*\r?\n([\s\S]*)$/.exec(newMarkdown);
        const explicitId =
            typeof input.newBlockId === 'string' && input.newBlockId.trim()
                ? input.newBlockId.trim()
                : leadingCommentMatch?.[1] ?? null;

        let mintedBlockId: string;
        let cleanBody = leadingCommentMatch ? leadingCommentMatch[2].trim() : newMarkdown;
        if (isMjBlockDirective) {
            const parsedSegs = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(newMarkdown);
            mintedBlockId = parsedSegs[0]?.BlockSpec?.BlockID ?? explicitId ?? `mj-${randomUUID().slice(0, 8)}`;
        } else if (explicitId && !existingIds.has(explicitId)) {
            mintedBlockId = explicitId;
        } else {
            let candidate = `blk-${randomUUID().slice(0, 8)}`;
            while (existingIds.has(candidate)) {
                candidate = `blk-${randomUUID().slice(0, 8)}`;
            }
            mintedBlockId = candidate;
        }

        const stampedMarkdown = isMjBlockDirective
            ? cleanBody
            : `<!-- mj-block-id: ${mintedBlockId} -->\n${cleanBody}`;

        const afterBlockId = typeof input.afterBlockId === 'string' ? input.afterBlockId.trim() : '';

        let updatedContent: string;
        if (!afterBlockId) {
            updatedContent = content.trim() ? `${content.trimEnd()}\n\n${stampedMarkdown}` : stampedMarkdown;
        } else if (afterBlockId.toUpperCase() === 'START') {
            updatedContent = content.trim() ? `${stampedMarkdown}\n\n${content.trimStart()}` : stampedMarkdown;
        } else {
            const idx = blocks.findIndex((b) => b.blockId === afterBlockId);
            if (idx < 0) {
                return {
                    success: false,
                    data: null,
                    errorMessage: `Target afterBlockId '${afterBlockId}' was not found.`
                };
            }
            const newBlockEntry: ParsedMarkdownLogicalBlock = {
                blockId: mintedBlockId,
                hasExplicitId: !isMjBlockDirective,
                kind: isMjBlockDirective ? 'mj-block' : 'paragraph',
                startLine: 0,
                endLine: 0,
                rawMarkdown: cleanBody
            };
            blocks.splice(idx + 1, 0, newBlockEntry);
            updatedContent = this.serializeLogicalBlocks(blocks);
        }

        return {
            success: true,
            data: {
                blockId: mintedBlockId,
                updatedContent,
                revisionHash: this.ComputeRevisionHash(updatedContent)
            }
        };
    }

    private handleReplaceBlock(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const conflict = this.checkRevision(content, input.expectedRevisionHash);
        if (conflict) {
            return { success: false, data: null, errorMessage: conflict };
        }

        const blockId = String(input.blockId ?? '').trim();
        const rawReplacement = String(input.markdown ?? '').trim();
        if (!blockId) {
            return { success: false, data: null, errorMessage: 'replace_block requires blockId.' };
        }

        const blocks = this.ParseLogicalBlocks(content);
        const idx = blocks.findIndex((b) => b.blockId === blockId);
        if (idx < 0) {
            return { success: false, data: null, errorMessage: `Block '${blockId}' was not found.` };
        }

        const leadingComment = /^<!--\s*mj-block-id:\s*([A-Za-z0-9_-]+)\s*-->\s*\r?\n([\s\S]*)$/.exec(rawReplacement);
        const cleanedReplacement = leadingComment ? leadingComment[2].trim() : rawReplacement;
        const preserveExplicitId = Boolean(blocks[idx].hasExplicitId || leadingComment);

        blocks[idx] = {
            ...blocks[idx],
            hasExplicitId: preserveExplicitId,
            rawMarkdown: cleanedReplacement
        };
        const updatedContent = this.serializeLogicalBlocks(blocks);
        return {
            success: true,
            data: {
                blockId,
                updatedContent,
                revisionHash: this.ComputeRevisionHash(updatedContent)
            }
        };
    }

    private handleDeleteBlock(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const conflict = this.checkRevision(content, input.expectedRevisionHash);
        if (conflict) {
            return { success: false, data: null, errorMessage: conflict };
        }

        const blockId = String(input.blockId ?? '').trim();
        const blocks = this.ParseLogicalBlocks(content);
        const idx = blocks.findIndex((b) => b.blockId === blockId);
        if (idx < 0) {
            return { success: false, data: null, errorMessage: `Block '${blockId}' was not found.` };
        }

        blocks.splice(idx, 1);
        const updatedContent = this.serializeLogicalBlocks(blocks);
        return {
            success: true,
            data: {
                deletedBlockId: blockId,
                updatedContent,
                revisionHash: this.ComputeRevisionHash(updatedContent)
            }
        };
    }

    private handleUpsertTable(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const headers = Array.isArray(input.headers) ? input.headers.map((h) => String(h ?? '')) : [];
        const rows = Array.isArray(input.rows)
            ? input.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
            : [];

        if (headers.length === 0) {
            return { success: false, data: null, errorMessage: 'upsert_table requires at least one column header.' };
        }

        const escapeTableCell = (cellText: string): string =>
            cellText
                .replace(/\\/g, '\\\\')
                .replace(/\|/g, '\\|')
                .replace(/\r?\n/g, ' ');

        const escapedHeaders = headers.map((h) => escapeTableCell(h));
        const headerLine = `| ${escapedHeaders.join(' | ')} |`;
        const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
        const rowLines = rows.map((row) => {
            const padded = headers.map((_, colIdx) => escapeTableCell(row[colIdx] ?? ''));
            return `| ${padded.join(' | ')} |`;
        });
        const tableMarkdown = [headerLine, dividerLine, ...rowLines].join('\n');

        if (typeof input.blockId === 'string' && input.blockId.trim()) {
            return this.handleReplaceBlock(content, {
                blockId: input.blockId,
                markdown: tableMarkdown,
                expectedRevisionHash: input.expectedRevisionHash
            });
        }
        return this.handleInsertBlockAfter(content, {
            afterBlockId: input.afterBlockId,
            markdown: tableMarkdown,
            expectedRevisionHash: input.expectedRevisionHash
        });
    }

    private handleInsertLiveBlock(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const kind = String(input.kind ?? '') as DocumentBlockKind;
        const blockId =
            typeof input.blockId === 'string' && input.blockId.trim()
                ? input.blockId.trim()
                : `mj-block-${Date.now()}`;

        const spec: DocumentBlockSpec = {
            BlockID: blockId,
            Kind: kind,
            Mode: 'Live',
            Title: typeof input.title === 'string' ? input.title : undefined,
            EntityName: typeof input.entityName === 'string' ? input.entityName : undefined,
            ViewID: typeof input.viewId === 'string' ? input.viewId : undefined,
            ExtraFilter: typeof input.extraFilter === 'string' ? input.extraFilter : undefined,
            Fields: Array.isArray(input.fields) ? input.fields.map(String) : undefined,
            QueryID: typeof input.queryId === 'string' ? input.queryId : undefined,
            QueryName: typeof input.queryName === 'string' ? input.queryName : undefined,
            Parameters:
                input.parameters && typeof input.parameters === 'object'
                    ? (input.parameters as Record<string, unknown>)
                    : undefined,
            DashboardID: typeof input.dashboardId === 'string' ? input.dashboardId : undefined,
            ComponentID: typeof input.componentId === 'string' ? input.componentId : undefined
        };

        const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(spec);
        return this.handleInsertBlockAfter(content, {
            afterBlockId: input.afterBlockId,
            markdown: directive,
            expectedRevisionHash: input.expectedRevisionHash
        });
    }

    private handleEmbedArtifactBlock(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const artifactId = String(input.artifactId ?? '').trim();
        if (!artifactId) {
            return { success: false, data: null, errorMessage: 'embed_artifact_block requires artifactId.' };
        }
        const blockId =
            typeof input.blockId === 'string' && input.blockId.trim()
                ? input.blockId.trim()
                : `mj-artifact-${Date.now()}`;
        const embedMode: ArtifactEmbedMode = input.embedMode === 'Link' ? 'Link' : 'Inline';

        const spec: DocumentBlockSpec = {
            BlockID: blockId,
            Kind: 'Artifact',
            Mode: 'Live',
            Title: typeof input.title === 'string' ? input.title : undefined,
            ArtifactID: artifactId,
            ArtifactType: typeof input.artifactType === 'string' ? input.artifactType : 'Whiteboard',
            EmbedMode: embedMode,
            VersionID: typeof input.versionId === 'string' && input.versionId.trim() ? input.versionId.trim() : null
        };

        const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(spec);
        return this.handleInsertBlockAfter(content, {
            afterBlockId: input.afterBlockId,
            markdown: directive,
            expectedRevisionHash: input.expectedRevisionHash
        });
    }

    private handleProposeSuggestion(content: string, input: Record<string, unknown>): ArtifactToolResult {
        const targetBlockId = String(input.targetBlockId ?? '').trim();
        const proposedMarkdown = String(input.proposedMarkdown ?? input.proposedText ?? '').trim();
        const rationale = String(input.rationale ?? '').trim();

        const blocks = this.ParseLogicalBlocks(content);
        const targetBlock = blocks.find((b) => b.blockId === targetBlockId);
        if (!targetBlock) {
            return {
                success: false,
                data: null,
                errorMessage: `Target block '${targetBlockId}' not found for suggestion.`
            };
        }

        const suggestion: DocumentSuggestionProposal = {
            suggestionId: `sug-${Date.now()}`,
            targetBlockId,
            originalText: targetBlock.rawMarkdown,
            proposedText: proposedMarkdown,
            rationale,
            authorName: typeof input.authorName === 'string' ? input.authorName : 'AI Agent',
            createdAt: new Date().toISOString(),
            status: 'pending'
        };

        return {
            success: true,
            data: {
                suggestion,
                revisionHash: this.ComputeRevisionHash(content)
            }
        };
    }
}
