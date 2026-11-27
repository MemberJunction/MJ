/**
 * Shared Document Design Presets, frontmatter design configuration helpers,
 * and document statistics utilities for MJ Docs.
 *
 * Used across `@memberjunction/ai-agents` (`DocumentToolLibrary`) and
 * `@memberjunction/ng-artifacts` (`DocumentImportExportService`, `MarkdownArtifactViewerComponent`)
 * so viewer rendering, `.docx` export, PDF print, and AI agent styling stay in lockstep.
 */

export type DocumentDesignPresetID =
    | 'modern-clean'
    | 'executive-memo'
    | 'technical-spec'
    | 'client-proposal'
    | 'editorial';

export type DocumentPageSize = 'letter' | 'a4';

export type DocumentPageOrientation = 'portrait' | 'landscape';

export interface DocumentDesignPreset {
    /** Canonical preset identifier stored in Markdown frontmatter (`designPreset`). */
    ID: DocumentDesignPresetID;
    /** Human-readable preset label. */
    Name: string;
    /** Short summary of visual hierarchy and intended audience. */
    Description: string;
    /** Preset category tag for pickers and agent discovery. */
    Category: 'Business' | 'Engineering' | 'Editorial';
    /** Heading font family stack for export and print. */
    HeadingFont: string;
    /** Body font family stack for export and print. */
    BodyFont: string;
    /** Monospace font family for code snippets. */
    MonoFont: string;
    /** Primary heading / accent hex color (without `#`, 6 uppercase hex digits) for OOXML / print. */
    PrimaryHex: string;
    /** Secondary accent hex color (without `#`) for callouts and rules. */
    AccentHex: string;
    /** Muted text hex color (without `#`) for headers, footers, and metadata. */
    MutedHex: string;
    /** Table header background fill hex (without `#`). */
    TableHeaderBgHex: string;
    /** Subtle alternating table row fill hex (without `#`). */
    TableStripeBgHex: string;
    /** Callout / blockquote background fill hex (without `#`). */
    CalloutBgHex: string;
    /** Whether top-level headings include a subtle rule beneath them. */
    HeadingUnderline: boolean;
    /** Base body font size in points. */
    BodyFontSizePt: number;
    /** Base body line-height multiplier. */
    LineHeight: number;
    /** Page margin in millimeters for print and `.docx` export. */
    MarginMm: number;
    /** Default paper size. */
    DefaultPageSize: DocumentPageSize;
    /** Whether running header is enabled by default. */
    ShowRunningHeader: boolean;
    /** Whether page numbers in footer are enabled by default. */
    ShowPageNumbers: boolean;
}

export interface DocumentDesignConfig {
    PresetID: DocumentDesignPresetID;
    PageSize: DocumentPageSize;
    Orientation: DocumentPageOrientation;
    Watermark: string;
    RunningHeader: string;
    RunningFooter: string;
    ShowPageNumbers: boolean;
}

export interface ParsedDocumentFrontmatter {
    HasFrontmatter: boolean;
    Fields: Record<string, string>;
    Body: string;
    EndLine: number;
}

export interface DocumentStats {
    WordCount: number;
    CharCount: number;
    CharCountNoSpaces: number;
    ParagraphCount: number;
    HeadingCount: number;
    LiveBlockCount: number;
    EstimatedReadMinutes: number;
    EstimatedPages: number;
}

export const DOCUMENT_DESIGN_PRESETS: readonly DocumentDesignPreset[] = [
    {
        ID: 'modern-clean',
        Name: 'Modern Clean',
        Description: 'Balanced sans-serif hierarchy with crisp spacing for everyday team docs.',
        Category: 'Business',
        HeadingFont: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        BodyFont: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        MonoFont: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
        PrimaryHex: '1E293B',
        AccentHex: '2563EB',
        MutedHex: '64748B',
        TableHeaderBgHex: 'F1F5F9',
        TableStripeBgHex: 'F8FAFC',
        CalloutBgHex: 'EFF6FF',
        HeadingUnderline: false,
        BodyFontSizePt: 11,
        LineHeight: 1.6,
        MarginMm: 20,
        DefaultPageSize: 'letter',
        ShowRunningHeader: true,
        ShowPageNumbers: true,
    },
    {
        ID: 'executive-memo',
        Name: 'Executive Memo',
        Description: 'Authoritative navy headings with underlined dividers and generous margins for leadership briefs.',
        Category: 'Business',
        HeadingFont: 'Georgia, "Times New Roman", serif',
        BodyFont: 'Inter, "Segoe UI", system-ui, sans-serif',
        MonoFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        PrimaryHex: '0F2942',
        AccentHex: '1D4ED8',
        MutedHex: '475569',
        TableHeaderBgHex: 'E8EEF5',
        TableStripeBgHex: 'F8FAFC',
        CalloutBgHex: 'F0F4F8',
        HeadingUnderline: true,
        BodyFontSizePt: 11,
        LineHeight: 1.55,
        MarginMm: 24,
        DefaultPageSize: 'letter',
        ShowRunningHeader: true,
        ShowPageNumbers: true,
    },
    {
        ID: 'technical-spec',
        Name: 'Technical Spec',
        Description: 'Compact engineering typography with sharp code blocks, dense tables, and structured rules.',
        Category: 'Engineering',
        HeadingFont: 'Inter, "Segoe UI", system-ui, sans-serif',
        BodyFont: 'Inter, "Segoe UI", system-ui, sans-serif',
        MonoFont: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
        PrimaryHex: '111827',
        AccentHex: '0F766E',
        MutedHex: '6B7280',
        TableHeaderBgHex: 'ECFDF5',
        TableStripeBgHex: 'F9FAFB',
        CalloutBgHex: 'F0FDFA',
        HeadingUnderline: true,
        BodyFontSizePt: 10,
        LineHeight: 1.5,
        MarginMm: 18,
        DefaultPageSize: 'a4',
        ShowRunningHeader: true,
        ShowPageNumbers: true,
    },
    {
        ID: 'client-proposal',
        Name: 'Client Proposal',
        Description: 'Polished indigo accents, elevated summary callouts, and presentation-grade table styling.',
        Category: 'Business',
        HeadingFont: 'Inter, "Segoe UI", system-ui, sans-serif',
        BodyFont: 'Inter, "Segoe UI", system-ui, sans-serif',
        MonoFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        PrimaryHex: '312E81',
        AccentHex: '4F46E5',
        MutedHex: '64748B',
        TableHeaderBgHex: 'EEF2FF',
        TableStripeBgHex: 'F8FAFC',
        CalloutBgHex: 'EEF2FF',
        HeadingUnderline: true,
        BodyFontSizePt: 11,
        LineHeight: 1.62,
        MarginMm: 22,
        DefaultPageSize: 'letter',
        ShowRunningHeader: true,
        ShowPageNumbers: true,
    },
    {
        ID: 'editorial',
        Name: 'Editorial',
        Description: 'Classic long-form serif reading rhythm tailored for whitepapers, essays, and reports.',
        Category: 'Editorial',
        HeadingFont: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
        BodyFont: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
        MonoFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        PrimaryHex: '1C1917',
        AccentHex: '9A3412',
        MutedHex: '57534E',
        TableHeaderBgHex: 'F5F5F4',
        TableStripeBgHex: 'FAFAF9',
        CalloutBgHex: 'FFF7ED',
        HeadingUnderline: false,
        BodyFontSizePt: 11.5,
        LineHeight: 1.72,
        MarginMm: 25,
        DefaultPageSize: 'letter',
        ShowRunningHeader: true,
        ShowPageNumbers: true,
    },
];

export const DEFAULT_DOCUMENT_DESIGN_PRESET_ID: DocumentDesignPresetID = 'modern-clean';

export function IsValidDocumentDesignPresetID(value: string | null | undefined): value is DocumentDesignPresetID {
    if (!value) {
        return false;
    }
    return DOCUMENT_DESIGN_PRESETS.some((p) => p.ID === value);
}

export function GetDocumentDesignPreset(presetId?: string | null): DocumentDesignPreset {
    if (presetId) {
        const normalized = presetId.trim().toLowerCase();
        const found = DOCUMENT_DESIGN_PRESETS.find((p) => p.ID === normalized);
        if (found) {
            return found;
        }
    }
    return DOCUMENT_DESIGN_PRESETS[0];
}

/**
 * Unquotes a simple YAML scalar value (`"foo"` or `'foo'`) without throwing.
 */
function unquoteFrontmatterScalar(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (typeof parsed === 'string') {
                return parsed;
            }
        } catch {
            return trimmed.slice(1, -1);
        }
    }
    if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    return trimmed;
}

/**
 * Parses leading YAML frontmatter (`--- ... ---`) using linear line scanning (ReDoS-safe).
 */
export function ParseDocumentFrontmatter(markdown: string): ParsedDocumentFrontmatter {
    const text = (markdown ?? '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    if (lines.length < 3 || lines[0].trim() !== '---') {
        return {
            HasFrontmatter: false,
            Fields: {},
            Body: text,
            EndLine: 0,
        };
    }
    let closingIdx = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            closingIdx = i;
            break;
        }
    }
    if (closingIdx < 0) {
        return {
            HasFrontmatter: false,
            Fields: {},
            Body: text,
            EndLine: 0,
        };
    }

    const fields: Record<string, string> = {};
    for (let i = 1; i < closingIdx; i++) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx <= 0) {
            continue;
        }
        const key = line.slice(0, colonIdx).trim();
        if (!key) {
            continue;
        }
        fields[key] = unquoteFrontmatterScalar(line.slice(colonIdx + 1));
    }

    const body = lines.slice(closingIdx + 1).join('\n');
    return {
        HasFrontmatter: true,
        Fields: fields,
        Body: body,
        EndLine: closingIdx + 1,
    };
}

/**
 * Extracts normalized {@link DocumentDesignConfig} from Markdown frontmatter,
 * falling back cleanly to the selected preset's defaults.
 */
export function ExtractDocumentDesignConfig(markdown: string): DocumentDesignConfig {
    const { Fields } = ParseDocumentFrontmatter(markdown);
    const preset = GetDocumentDesignPreset(Fields['designPreset']);
    const rawPageSize = (Fields['pageSize'] ?? '').trim().toLowerCase();
    const pageSize: DocumentPageSize =
        rawPageSize === 'a4' || rawPageSize === 'letter' ? rawPageSize : preset.DefaultPageSize;
    const rawOrientation = (Fields['orientation'] ?? '').trim().toLowerCase();
    const orientation: DocumentPageOrientation =
        rawOrientation === 'landscape' ? 'landscape' : 'portrait';
    const rawShowPageNumbers = (Fields['showPageNumbers'] ?? '').trim().toLowerCase();
    const showPageNumbers =
        rawShowPageNumbers === 'false'
            ? false
            : rawShowPageNumbers === 'true'
              ? true
              : preset.ShowPageNumbers;

    return {
        PresetID: preset.ID,
        PageSize: pageSize,
        Orientation: orientation,
        Watermark: (Fields['watermark'] ?? '').trim(),
        RunningHeader: (Fields['runningHeader'] ?? '').trim(),
        RunningFooter: (Fields['runningFooter'] ?? '').trim(),
        ShowPageNumbers: showPageNumbers,
    };
}

/**
 * Merges a partial {@link DocumentDesignConfig} into a Markdown document's YAML frontmatter
 * while preserving all unrelated frontmatter keys and the document body verbatim.
 */
export function ApplyDocumentDesignConfigToMarkdown(
    markdown: string,
    patch: Partial<DocumentDesignConfig>,
): string {
    const normalized = (markdown ?? '').replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const existingEntries = new Map<string, string>();
    let body = normalized;

    if (lines.length >= 3 && lines[0].trim() === '---') {
        let closingIdx = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                closingIdx = i;
                break;
            }
        }
        if (closingIdx >= 1) {
            for (let i = 1; i < closingIdx; i++) {
                const colonIdx = lines[i].indexOf(':');
                if (colonIdx > 0) {
                    const key = lines[i].slice(0, colonIdx).trim();
                    const rawVal = lines[i].slice(colonIdx + 1).trim();
                    if (key) {
                        existingEntries.set(key, rawVal);
                    }
                }
            }
            body = lines.slice(closingIdx + 1).join('\n');
        }
    }

    const setOrDeleteString = (key: string, value: string | undefined): void => {
        if (value === undefined) {
            return;
        }
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            existingEntries.delete(key);
        } else {
            existingEntries.set(key, JSON.stringify(trimmed));
        }
    };

    if (patch.PresetID !== undefined) {
        const preset = GetDocumentDesignPreset(patch.PresetID);
        existingEntries.set('designPreset', JSON.stringify(preset.ID));
    }
    if (patch.PageSize !== undefined) {
        existingEntries.set('pageSize', JSON.stringify(patch.PageSize === 'a4' ? 'a4' : 'letter'));
    }
    if (patch.Orientation !== undefined) {
        existingEntries.set(
            'orientation',
            JSON.stringify(patch.Orientation === 'landscape' ? 'landscape' : 'portrait'),
        );
    }
    setOrDeleteString('watermark', patch.Watermark);
    setOrDeleteString('runningHeader', patch.RunningHeader);
    setOrDeleteString('runningFooter', patch.RunningFooter);
    if (patch.ShowPageNumbers !== undefined) {
        existingEntries.set('showPageNumbers', patch.ShowPageNumbers ? 'true' : 'false');
    }

    const fmLines = Array.from(existingEntries.entries()).map(([k, v]) => `${k}: ${v}`);
    if (fmLines.length === 0) {
        return body;
    }
    return `---\n${fmLines.join('\n')}\n---\n${body}`;
}

/**
 * Computes live document statistics (word count, character counts, headings, live blocks,
 * reading time, and estimated printed pages) using linear scanning.
 */
export function ComputeDocumentStats(markdown: string): DocumentStats {
    const { Body } = ParseDocumentFrontmatter(markdown ?? '');
    const lines = Body.split('\n');

    let inMjBlock = false;
    let liveBlockCount = 0;
    let headingCount = 0;
    let paragraphCount = 0;
    let inParagraph = false;
    const proseLines: string[] = [];

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!inMjBlock && trimmed.startsWith(':::mj-block')) {
            inMjBlock = true;
            liveBlockCount++;
            inParagraph = false;
            continue;
        }
        if (inMjBlock) {
            if (trimmed === ':::') {
                inMjBlock = false;
            }
            continue;
        }
        if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
            continue;
        }
        if (trimmed.length === 0) {
            inParagraph = false;
            continue;
        }
        if (isMarkdownHeadingLine(trimmed)) {
            headingCount++;
            inParagraph = false;
            proseLines.push(stripLeadingHashes(trimmed));
            continue;
        }
        if (!inParagraph) {
            paragraphCount++;
            inParagraph = true;
        }
        proseLines.push(trimmed);
    }

    const proseText = proseLines.join('\n');
    const charCount = proseText.length;
    let charCountNoSpaces = 0;
    let wordCount = 0;
    let inWord = false;

    for (let i = 0; i < proseText.length; i++) {
        const code = proseText.charCodeAt(i);
        const isSpace = code === 32 || code === 9 || code === 10 || code === 13;
        if (!isSpace) {
            charCountNoSpaces++;
            if (!inWord) {
                wordCount++;
                inWord = true;
            }
        } else {
            inWord = false;
        }
    }

    const estimatedReadMinutes = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 225));
    // Standard ~420 words per printed page plus ~0.35 page per live data/chart block
    const weightedUnits = wordCount / 420 + liveBlockCount * 0.35;
    const estimatedPages =
        wordCount === 0 && liveBlockCount === 0 ? 1 : Math.max(1, Math.ceil(weightedUnits));

    return {
        WordCount: wordCount,
        CharCount: charCount,
        CharCountNoSpaces: charCountNoSpaces,
        ParagraphCount: paragraphCount,
        HeadingCount: headingCount,
        LiveBlockCount: liveBlockCount,
        EstimatedReadMinutes: estimatedReadMinutes,
        EstimatedPages: estimatedPages,
    };
}

function isMarkdownHeadingLine(trimmed: string): boolean {
    let hashes = 0;
    while (hashes < trimmed.length && hashes < 6 && trimmed[hashes] === '#') {
        hashes++;
    }
    return hashes >= 1 && hashes < trimmed.length && trimmed[hashes] === ' ';
}

function stripLeadingHashes(trimmed: string): string {
    let i = 0;
    while (i < trimmed.length && trimmed[i] === '#') {
        i++;
    }
    return trimmed.slice(i).trim();
}
