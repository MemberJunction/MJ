import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { MJArtifactVersionEntity } from '../generated/entity_subclasses.js';
import {
    DocumentBlockKind,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
} from './DocumentLiveBlockEngine.js';
import {
    SlideDeckEngine,
    SlideDeckSpec,
    SlideLayoutKind,
    SlideRegionKind,
    SlideRegionSpec,
    SlideSpec,
} from './SlideDeckEngine.js';
import { SpreadsheetCellValue, SpreadsheetEngine } from './SpreadsheetEngine.js';

/**
 * Supported target artifact formats produced by {@link ArtifactSynthesisEngine}.
 */
export type ArtifactSynthesisTargetKind = 'presentation' | 'document' | 'spreadsheet';

/**
 * Canonical `MJ: Artifact Types.Name` values corresponding to {@link ArtifactSynthesisTargetKind}.
 */
export const SYNTHESIS_TARGET_TYPE_NAME_MAP: Readonly<Record<ArtifactSynthesisTargetKind, string>> = {
    presentation: 'Presentation',
    document: 'Markdown Document',
    spreadsheet: 'Excel Spreadsheet',
};

/**
 * Raw source artifact input passed to {@link ArtifactSynthesisEngine.ExtractSourceDigest}.
 */
export interface ArtifactSynthesisSourceInput {
    ArtifactID: string;
    Name: string;
    ArtifactType: string;
    VersionNumber?: number;
    ContentMode?: MJArtifactVersionEntity['ContentMode'];
    Content?: string | null;
    Configuration?: string | null;
    Description?: string | null;
    MimeType?: string | null;
}

/**
 * Reference to an existing chart or named range inside a source Spreadsheet artifact
 * that synthesized Docs/Slides can embed as a live linked `Artifact` block.
 */
export interface ArtifactSynthesisChartRef {
    ArtifactID: string;
    ArtifactName: string;
    VersionNumber?: number;
    WorksheetName: string;
    ChartID: string;
    ChartTitle: string;
    RangeAddress: string;
}

/**
 * Compact, LLM-ready digest extracted from a single heterogeneous source artifact.
 */
export interface ArtifactSynthesisSourceDigest {
    ArtifactID: string;
    Name: string;
    ArtifactType: string;
    VersionNumber?: number;
    SummaryText: string;
    Sections: string[];
    EmbeddedCharts: ArtifactSynthesisChartRef[];
    CharCount: number;
}

export interface BuildSynthesisPromptOptions {
    Digests: ArtifactSynthesisSourceDigest[];
    TargetKind: ArtifactSynthesisTargetKind;
    Goal: string;
    Title?: string;
    LinkChartsAndRanges?: boolean;
}

export interface SynthesisPromptPair {
    SystemPrompt: string;
    UserPrompt: string;
}

export interface NormalizeSynthesizedOutputOptions {
    TargetKind: ArtifactSynthesisTargetKind;
    RawOutput: string;
    FallbackTitle?: string;
    AllowedSourceArtifactIds: ReadonlyArray<string>;
    AvailableChartRefs?: ReadonlyArray<ArtifactSynthesisChartRef>;
}

export interface NormalizedSynthesizedArtifact {
    TargetKind: ArtifactSynthesisTargetKind;
    ArtifactTypeName: string;
    Title: string;
    Description: string;
    Content: string;
    LinkedChartCount: number;
    Warnings: string[];
}

type JsonRecord = Record<string, unknown>;

const VALID_SLIDE_LAYOUTS = new Set<SlideLayoutKind>([
    'Title',
    'SectionHeader',
    'TitleAndBody',
    'TwoColumn',
    'Comparison',
    'LiveDataSlide',
    'ChartAndText',
    'Quote',
    'BigNumber',
    'FullBleedImage',
    'Blank',
]);

const VALID_REGION_KINDS = new Set<SlideRegionKind>([
    'rich-text',
    'mj-block',
    'callout',
    'table',
    'image',
    'big-number',
    'quote',
]);

/**
 * Headless engine responsible for extracting structured digests across heterogeneous MJ artifacts
 * (Markdown Documents, Spreadsheets, Presentations, Whiteboards, JSON/CSV/SQL data artifacts),
 * constructing token-bounded synthesis prompts with live chart/range link hints, and normalizing +
 * permission-filtering AI synthesis outputs into valid serialized artifact payloads.
 */
export class ArtifactSynthesisEngine extends BaseSingleton<ArtifactSynthesisEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): ArtifactSynthesisEngine {
        return super.getInstance<ArtifactSynthesisEngine>();
    }

    /**
     * Resolves any common target alias (`'presentation' | 'slides' | 'deck'`, `'document' | 'doc' | 'markdown'`,
     * `'spreadsheet' | 'sheet' | 'excel'`) into a canonical {@link ArtifactSynthesisTargetKind}.
     */
    public NormalizeTargetKind(rawKind: string | null | undefined): ArtifactSynthesisTargetKind {
        const norm = (rawKind ?? '').trim().toLowerCase();
        if (norm === 'document' || norm === 'doc' || norm === 'markdown' || norm === 'markdown document') {
            return 'document';
        }
        if (
            norm === 'spreadsheet' ||
            norm === 'sheet' ||
            norm === 'sheets' ||
            norm === 'excel' ||
            norm === 'excel spreadsheet'
        ) {
            return 'spreadsheet';
        }
        return 'presentation';
    }

    /**
     * Extracts a compact, structured digest from any supported source artifact without leaking
     * raw internal fence JSON (`mj-block`) or exceeding `maxChars`.
     */
    public ExtractSourceDigest(
        source: ArtifactSynthesisSourceInput,
        maxChars = 6000,
    ): ArtifactSynthesisSourceDigest {
        const normType = (source.ArtifactType ?? '').trim().toLowerCase();
        const raw = typeof source.Content === 'string' ? source.Content : '';
        const sections: string[] = [];
        const embeddedCharts: ArtifactSynthesisChartRef[] = [];
        const summaryParts: string[] = [];

        if (source.ContentMode === 'File' || (!raw.trim() && source.Description)) {
            summaryParts.push(
                `Binary/File Artifact (${source.MimeType || source.ArtifactType})${
                    source.Description ? `: ${source.Description}` : ''
                }`,
            );
        } else if (normType.includes('spreadsheet') || normType === 'excel') {
            this.digestSpreadsheet(source, raw, summaryParts, sections, embeddedCharts);
        } else if (normType.includes('presentation') || normType.includes('slide')) {
            this.digestPresentation(source, raw, summaryParts, sections);
        } else if (normType.includes('whiteboard')) {
            this.digestWhiteboard(raw, summaryParts, sections);
        } else if (normType.includes('markdown') || normType === 'text' || normType === 'document') {
            this.digestMarkdown(raw, summaryParts, sections);
        } else {
            this.digestGenericStructured(source, raw, summaryParts, sections);
        }

        const combined = summaryParts.join('\n').trim() || source.Description?.trim() || '(Empty artifact)';
        const bounded =
            combined.length > maxChars
                ? `${combined.slice(0, Math.max(0, maxChars - 18))}\n...[truncated]`
                : combined;

        return {
            ArtifactID: source.ArtifactID,
            Name: source.Name,
            ArtifactType: source.ArtifactType,
            VersionNumber: source.VersionNumber,
            SummaryText: bounded,
            Sections: sections.slice(0, 25),
            EmbeddedCharts: embeddedCharts,
            CharCount: bounded.length,
        };
    }

    /**
     * Constructs the system & user prompt pair for multi-artifact synthesis.
     */
    public BuildSynthesisPrompts(options: BuildSynthesisPromptOptions): SynthesisPromptPair {
        const linkCharts = options.LinkChartsAndRanges !== false;
        const chartCatalog: ArtifactSynthesisChartRef[] = [];
        for (const d of options.Digests) {
            for (const c of d.EmbeddedCharts) {
                chartCatalog.push(c);
            }
        }

        const schemaGuidance = this.buildSchemaGuidanceForTarget(
            options.TargetKind,
            linkCharts ? chartCatalog : [],
        );

        const systemPrompt = [
            'You are MemberJunction Multi-Artifact Synthesis AI.',
            'Your task is to combine facts, metrics, and insights across multiple governed source artifacts into one cohesive, executive-ready target artifact.',
            'Respond ONLY with a single valid JSON object matching the target schema below (no prose preamble or trailing explanation outside JSON).',
            'Never fabricate metrics or ArtifactIDs. Cite only verified values from the provided source digests.',
            schemaGuidance,
        ].join('\n\n');

        const sourceBlocks = options.Digests.map((d, index) => {
            const verLabel = d.VersionNumber != null ? ` v${d.VersionNumber}` : '';
            const chartLines =
                d.EmbeddedCharts.length > 0
                    ? `\nAvailable Live Charts:\n${d.EmbeddedCharts.map(
                          (c) =>
                              `  - ChartID="${c.ChartID}" Sheet="${c.WorksheetName}" Range="${c.RangeAddress}" Title="${c.ChartTitle}" (ArtifactID=${c.ArtifactID})`,
                      ).join('\n')}`
                    : '';
            return [
                `### Source ${index + 1}: "${d.Name}" (${d.ArtifactType}${verLabel}) [ArtifactID: ${d.ArtifactID}]`,
                d.SummaryText,
                chartLines,
            ]
                .filter(Boolean)
                .join('\n');
        }).join('\n\n---\n\n');

        const userPrompt = [
            `Target Format: ${SYNTHESIS_TARGET_TYPE_NAME_MAP[options.TargetKind]}`,
            options.Title ? `Requested Title: ${options.Title}` : '',
            `Synthesis Goal / Instructions:\n${options.Goal.trim() || 'Synthesize key insights, metrics, and recommendations across the source artifacts.'}`,
            linkCharts && chartCatalog.length > 0
                ? 'Preserve live data links: embed verified source Spreadsheet ChartID/Range references using the ArtifactID values provided in the digests.'
                : '',
            `Source Artifacts (${options.Digests.length}):\n\n${sourceBlocks}`,
        ]
            .filter(Boolean)
            .join('\n\n');

        return { SystemPrompt: systemPrompt, UserPrompt: userPrompt };
    }

    /**
     * Parses, normalizes, and permission-filters raw model output into a clean, ready-to-save
     * artifact payload (`SlideDeckSpec` JSON, Markdown, or `WorkbookSpec` JSON).
     */
    public NormalizeSynthesizedOutput(
        options: NormalizeSynthesizedOutputOptions,
    ): NormalizedSynthesizedArtifact {
        const warnings: string[] = [];
        const fallbackTitle = (options.FallbackTitle ?? '').trim() || 'Synthesized Artifact';
        const allowedSet = options.AllowedSourceArtifactIds;
        const stripped = this.stripJsonFence(options.RawOutput);
        const targetTypeName = SYNTHESIS_TARGET_TYPE_NAME_MAP[options.TargetKind];

        let parsedObj: Record<string, unknown> | null = null;
        if (stripped.startsWith('{') || stripped.startsWith('[')) {
            try {
                const candidate: unknown = JSON.parse(stripped);
                if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                    parsedObj = candidate as Record<string, unknown>;
                } else if (Array.isArray(candidate) && options.TargetKind === 'presentation') {
                    parsedObj = { slides: candidate };
                }
            } catch {
                parsedObj = null;
            }
        }

        if (options.TargetKind === 'presentation') {
            return this.normalizePresentationResult(
                parsedObj,
                stripped,
                fallbackTitle,
                allowedSet,
                warnings,
            );
        }

        if (options.TargetKind === 'spreadsheet') {
            return this.normalizeSpreadsheetResult(
                parsedObj,
                fallbackTitle,
                targetTypeName,
                warnings,
            );
        }

        return this.normalizeDocumentResult(
            parsedObj,
            stripped,
            fallbackTitle,
            targetTypeName,
            allowedSet,
            warnings,
        );
    }

    /**
     * Produces a deterministic, clean baseline synthesis directly from digests (used when an AI
     * provider fails structured output or in offline synthesis smoke/unit checks).
     */
    public BuildDeterministicFallbackSynthesis(
        digests: ReadonlyArray<ArtifactSynthesisSourceDigest>,
        targetKind: ArtifactSynthesisTargetKind,
        title: string,
        goal: string,
        linkChartsAndRanges = true,
    ): NormalizedSynthesizedArtifact {
        const cleanTitle = title.trim() || `Synthesized ${SYNTHESIS_TARGET_TYPE_NAME_MAP[targetKind]}`;
        const allCharts = linkChartsAndRanges ? digests.flatMap((d) => d.EmbeddedCharts) : [];

        if (targetKind === 'presentation') {
            const deck = SlideDeckEngine.Instance.CreateDefaultDeck(cleanTitle);
            const slides: SlideSpec[] = [
                {
                    SlideID: 'slide-1',
                    SlideNumber: 1,
                    Layout: 'Title',
                    Title: cleanTitle,
                    Subtitle: goal.trim() || `Synthesized from ${digests.length} Library artifacts`,
                    Regions: [
                        {
                            RegionID: 'subtitle',
                            Label: 'Overview',
                            Kind: 'rich-text',
                            MarkdownContent: `Combined insights from ${digests.map((d) => `**${d.Name}**`).join(', ')}.`,
                        },
                    ],
                    SpeakerNotes: `Executive overview covering ${digests.length} source artifacts.`,
                    Transition: 'fade',
                },
            ];

            let idx = 2;
            for (const d of digests) {
                const chart = linkChartsAndRanges ? d.EmbeddedCharts[0] : undefined;
                if (chart) {
                    const blockSpec: DocumentBlockSpec = {
                        BlockID: `synth-chart-${idx}`,
                        Kind: 'Artifact',
                        Mode: 'Live',
                        EmbedMode: 'Inline',
                        ArtifactID: chart.ArtifactID,
                        ArtifactType: 'Excel Spreadsheet',
                        SheetID: chart.WorksheetName,
                        SheetChartID: chart.ChartID,
                        SheetRange: chart.RangeAddress,
                        Title: chart.ChartTitle,
                    };
                    slides.push({
                        SlideID: `slide-${idx}`,
                        SlideNumber: idx,
                        Layout: 'ChartAndText',
                        Title: `${d.Name} — ${chart.ChartTitle}`,
                        Subtitle: `Live chart linked from ${d.ArtifactType}`,
                        Regions: [
                            {
                                RegionID: 'chart',
                                Label: 'Linked Chart',
                                Kind: 'mj-block',
                                MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec),
                                BlockSpec: blockSpec,
                            },
                            {
                                RegionID: 'narrative',
                                Label: 'Key Takeaways',
                                Kind: 'rich-text',
                                MarkdownContent: this.toBulletSummary(d.SummaryText),
                            },
                        ],
                        SpeakerNotes: `Live-linked data from ${d.Name} (${chart.WorksheetName}).`,
                        Transition: 'slide',
                    });
                } else {
                    slides.push({
                        SlideID: `slide-${idx}`,
                        SlideNumber: idx,
                        Layout: 'TitleAndBody',
                        Title: d.Name,
                        Subtitle: d.ArtifactType,
                        Regions: [
                            {
                                RegionID: 'body',
                                Label: 'Summary',
                                Kind: 'rich-text',
                                MarkdownContent: this.toBulletSummary(d.SummaryText),
                            },
                        ],
                        SpeakerNotes: `Summary of ${d.Name}.`,
                        Transition: 'slide',
                    });
                }
                idx++;
            }

            const finalDeck: SlideDeckSpec = {
                ...deck,
                Title: cleanTitle,
                Subtitle: goal.trim() || deck.Subtitle,
                Slides: slides,
                UpdatedAt: new Date().toISOString(),
            };
            return {
                TargetKind: 'presentation',
                ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.presentation,
                Title: cleanTitle,
                Description: `Synthesized from ${digests.length} artifacts`,
                Content: SlideDeckEngine.Instance.SerializeDeckSpec(finalDeck),
                LinkedChartCount: allCharts.length > 0 ? Math.min(allCharts.length, digests.filter((d) => d.EmbeddedCharts.length > 0).length) : 0,
                Warnings: [],
            };
        }

        if (targetKind === 'spreadsheet') {
            const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook(cleanTitle);
            const firstSheet = wb.Worksheets[0];
            SpreadsheetEngine.Instance.RenameWorksheet(wb, firstSheet.SheetID, 'Synthesis Index');
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'A1', { Value: 'Source Artifact' });
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'B1', { Value: 'Type' });
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'C1', { Value: 'Summary Highlights' });
            digests.forEach((d, rowOffset) => {
                const row = rowOffset + 2;
                SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, `A${row}`, { Value: d.Name });
                SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, `B${row}`, { Value: d.ArtifactType });
                SpreadsheetEngine.Instance.SetCell(
                    wb,
                    firstSheet.SheetID,
                    `C${row}`,
                    { Value: d.SummaryText.replace(/\s+/g, ' ').slice(0, 220) },
                );
            });
            SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
            return {
                TargetKind: 'spreadsheet',
                ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.spreadsheet,
                Title: cleanTitle,
                Description: `Consolidated index across ${digests.length} artifacts`,
                Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
                LinkedChartCount: 0,
                Warnings: [],
            };
        }

        const lines: string[] = [
            `# ${cleanTitle}`,
            '',
            goal.trim() ? `> ${goal.trim()}` : `> Synthesized across ${digests.length} Library artifacts.`,
            '',
        ];
        let linkedCount = 0;
        for (const d of digests) {
            lines.push(`## ${d.Name} (${d.ArtifactType})`);
            lines.push('');
            lines.push(this.toBulletSummary(d.SummaryText));
            lines.push('');
            if (linkChartsAndRanges && d.EmbeddedCharts.length > 0) {
                const chart = d.EmbeddedCharts[0];
                const spec: DocumentBlockSpec = {
                    BlockID: `synth-doc-chart-${linkedCount + 1}`,
                    Kind: 'Artifact',
                    Mode: 'Live',
                    EmbedMode: 'Inline',
                    ArtifactID: chart.ArtifactID,
                    ArtifactType: 'Excel Spreadsheet',
                    SheetID: chart.WorksheetName,
                    SheetChartID: chart.ChartID,
                    SheetRange: chart.RangeAddress,
                    Title: chart.ChartTitle,
                };
                lines.push(DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(spec));
                lines.push('');
                linkedCount++;
            }
        }
        return {
            TargetKind: 'document',
            ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.document,
            Title: cleanTitle,
            Description: `Synthesized report combining ${digests.length} artifacts`,
            Content: lines.join('\n').trim(),
            LinkedChartCount: linkedCount,
            Warnings: [],
        };
    }

    // -------------------------------------------------------------------------
    // Source Digesters
    // -------------------------------------------------------------------------

    private digestSpreadsheet(
        source: ArtifactSynthesisSourceInput,
        raw: string,
        summaryParts: string[],
        sections: string[],
        embeddedCharts: ArtifactSynthesisChartRef[],
    ): void {
        try {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(raw, source.Configuration);
            for (const sheet of wb.Worksheets.slice(0, 6)) {
                sections.push(sheet.Name);
                const cellEntries = Object.entries(sheet.Cells ?? {});
                const previewRows: string[] = [];
                const rowsMap = new Map<number, Array<{ col: number; val: string }>>();

                for (const [addr, cell] of cellEntries) {
                    const m = /^([A-Za-z]+)(\d+)$/.exec(addr);
                    if (!m) continue;
                    const rowNum = Number(m[2]);
                    if (rowNum > 15) continue;
                    const colNum = this.colLettersToNumber(m[1]);
                    const rawVal = cell.ComputedValue !== undefined ? cell.ComputedValue : cell.RawValue;
                    const strVal = rawVal != null ? String(rawVal).trim() : '';
                    if (!strVal) continue;
                    const rowArr = rowsMap.get(rowNum) ?? [];
                    rowArr.push({ col: colNum, val: strVal.slice(0, 60) });
                    rowsMap.set(rowNum, rowArr);
                }

                const sortedRows = Array.from(rowsMap.keys()).sort((a, b) => a - b);
                for (const r of sortedRows) {
                    const cells = rowsMap.get(r)!.sort((a, b) => a.col - b.col);
                    previewRows.push(`Row ${r}: ${cells.map((c) => c.val).join(' | ')}`);
                }

                summaryParts.push(
                    `Worksheet "${sheet.Name}" (${cellEntries.length} non-empty cells):` +
                        (previewRows.length > 0 ? `\n${previewRows.join('\n')}` : ' (no sample rows in A1..15)'),
                );

                for (const chart of sheet.Charts ?? []) {
                    embeddedCharts.push({
                        ArtifactID: source.ArtifactID,
                        ArtifactName: source.Name,
                        VersionNumber: source.VersionNumber,
                        WorksheetName: sheet.Name,
                        ChartID: chart.ChartID,
                        ChartTitle: chart.Title || `${sheet.Name} Chart`,
                        RangeAddress: chart.SourceRange || 'A1:B10',
                    });
                }
            }
        } catch {
            this.digestGenericStructured(source, raw, summaryParts, sections);
        }
    }

    private digestPresentation(
        source: ArtifactSynthesisSourceInput,
        raw: string,
        summaryParts: string[],
        sections: string[],
    ): void {
        try {
            const deck = SlideDeckEngine.Instance.ParseDeckSpec(raw, source.Name, source.ArtifactID);
            summaryParts.push(`Presentation "${deck.Title}" (${deck.Slides.length} slides):`);
            for (const slide of deck.Slides.slice(0, 20)) {
                sections.push(slide.Title);
                const regionSnippets = slide.Regions.map((r) => {
                    if (r.Kind === 'big-number' && (r.BigNumberValue || r.BigNumberLabel)) {
                        return `${r.BigNumberLabel ?? 'KPI'}: ${r.BigNumberValue ?? ''} ${r.BigNumberDelta ?? ''}`.trim();
                    }
                    if (r.Kind === 'mj-block') {
                        return `[Live Block: ${r.BlockSpec?.Title || r.BlockSpec?.Kind || r.Label}]`;
                    }
                    return r.MarkdownContent.replace(/\s+/g, ' ').trim().slice(0, 240);
                }).filter(Boolean);
                summaryParts.push(
                    `- Slide ${slide.SlideNumber} (${slide.Layout}): ${slide.Title}` +
                        (regionSnippets.length > 0 ? ` — ${regionSnippets.join(' / ')}` : ''),
                );
            }
        } catch {
            this.digestGenericStructured(source, raw, summaryParts, sections);
        }
    }

    private digestWhiteboard(raw: string, summaryParts: string[], sections: string[]): void {
        try {
            const parsed: unknown = JSON.parse(raw);
            const texts: string[] = [];
            if (parsed && typeof parsed === 'object') {
                const obj = parsed as Record<string, unknown>;
                const pages = Array.isArray(obj['pages']) ? obj['pages'] : [];
                for (const p of pages) {
                    if (!p || typeof p !== 'object') continue;
                    const pageObj = p as Record<string, unknown>;
                    const name = typeof pageObj['name'] === 'string' ? pageObj['name'] : 'Page';
                    sections.push(name);
                    const items = Array.isArray(pageObj['items']) ? pageObj['items'] : [];
                    for (const item of items) {
                        if (!item || typeof item !== 'object') continue;
                        const it = item as Record<string, unknown>;
                        for (const key of ['Label', 'Text', 'Sub']) {
                            if (typeof it[key] === 'string' && it[key].trim()) {
                                texts.push(it[key].trim());
                            }
                        }
                    }
                }
                const legacyElements = Array.isArray(obj['Elements'])
                    ? obj['Elements']
                    : Array.isArray(obj['elements'])
                      ? obj['elements']
                      : [];
                for (const el of legacyElements) {
                    if (!el || typeof el !== 'object') continue;
                    const rec = el as Record<string, unknown>;
                    for (const key of ['Text', 'text', 'Label', 'label']) {
                        if (typeof rec[key] === 'string' && rec[key].trim()) {
                            texts.push(rec[key].trim());
                        }
                    }
                }
            }
            summaryParts.push(
                texts.length > 0
                    ? `Whiteboard elements:\n- ${texts.slice(0, 40).join('\n- ')}`
                    : 'Whiteboard diagram (graphical ink/shapes with no text labels).',
            );
        } catch {
            summaryParts.push('Whiteboard artifact');
        }
    }

    private digestMarkdown(raw: string, summaryParts: string[], sections: string[]): void {
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(raw);
        for (const seg of segments) {
            if (seg.Type === 'mj-block' && seg.BlockSpec) {
                summaryParts.push(
                    `[Embedded Block (${seg.BlockSpec.Kind}): ${seg.BlockSpec.Title || seg.BlockSpec.EntityName || seg.BlockSpec.QueryName || seg.BlockSpec.BlockID}]`,
                );
                continue;
            }
            const lines = seg.RawText.split('\n');
            for (const line of lines) {
                const hm = /^(#{1,3})\s+(.+)$/.exec(line.trim());
                if (hm) {
                    sections.push(hm[2].trim());
                }
            }
            const cleaned = seg.RawText.trim();
            if (cleaned) {
                summaryParts.push(cleaned);
            }
        }
    }

    private digestGenericStructured(
        source: ArtifactSynthesisSourceInput,
        raw: string,
        summaryParts: string[],
        sections: string[],
    ): void {
        const trimmed = raw.trim();
        if (!trimmed) {
            if (source.Description) {
                summaryParts.push(source.Description);
            }
            return;
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    const keys =
                        parsed[0] && typeof parsed[0] === 'object'
                            ? Object.keys(parsed[0] as Record<string, unknown>).slice(0, 12)
                            : [];
                    if (keys.length > 0) sections.push(...keys);
                    summaryParts.push(
                        `Structured dataset (${parsed.length} rows, columns: ${keys.join(', ') || 'values'}). Sample rows:\n${JSON.stringify(parsed.slice(0, 8), null, 2)}`,
                    );
                    return;
                }
            } catch {
                // fall back to trimmed plain text
            }
        }
        summaryParts.push(trimmed);
    }

    // -------------------------------------------------------------------------
    // Prompt & Output Helpers
    // -------------------------------------------------------------------------

    private buildSchemaGuidanceForTarget(
        targetKind: ArtifactSynthesisTargetKind,
        charts: ReadonlyArray<ArtifactSynthesisChartRef>,
    ): string {
        if (targetKind === 'presentation') {
            const chartHint =
                charts.length > 0
                    ? `For live charts, emit a slide with Layout="ChartAndText" and include a region {"RegionID":"chart","Label":"Chart","Kind":"mj-block","BlockSpec":{"BlockID":"chart-blk-1","Kind":"Artifact","Mode":"Live","EmbedMode":"Inline","ArtifactID":"<verified source ArtifactID>","ArtifactType":"Excel Spreadsheet","SheetID":"<WorksheetName>","SheetChartID":"<ChartID>","SheetRange":"<RangeAddress>","Title":"<ChartTitle>"}}.`
                    : '';
            return [
                'Return JSON with shape:',
                '{"title": string, "description": string, "slides": [{"Title": string, "Subtitle"?: string, "Layout": "Title"|"SectionHeader"|"TitleAndBody"|"TwoColumn"|"BigNumber"|"ChartAndText"|"Comparison"|"Quote", "Regions": [{"RegionID": string, "Label": string, "Kind": "rich-text"|"big-number"|"callout"|"quote"|"mj-block", "MarkdownContent": string, "BigNumberValue"?: string, "BigNumberLabel"?: string, "BigNumberDelta"?: string, "BlockSpec"?: object}], "SpeakerNotes": string}]}',
                'Create 4 to 8 crisp, executive slides starting with a Title slide.',
                chartHint,
            ]
                .filter(Boolean)
                .join('\n');
        }

        if (targetKind === 'spreadsheet') {
            return [
                'Return JSON with shape:',
                '{"title": string, "description": string, "worksheets": [{"Name": string, "Headers": string[], "Rows": Array<Array<string|number|boolean|null>>}]}',
                'Create 1 to 4 clean worksheets (max 31 chars per Name). Use real Excel formulas (e.g. "=SUM(B2:B10)") in summary rows where numeric totals make sense.',
            ].join('\n');
        }

        const docChartHint =
            charts.length > 0
                ? 'To embed a live source chart in Markdown, place a fenced block:\n```mj-block\n{"BlockID":"chart-1","Kind":"Artifact","Mode":"Live","EmbedMode":"Inline","ArtifactID":"<verified ArtifactID>","ArtifactType":"Excel Spreadsheet","SheetID":"<WorksheetName>","SheetChartID":"<ChartID>","SheetRange":"<RangeAddress>","Title":"<ChartTitle>"}\n```'
                : '';

        return [
            'Return JSON with shape:',
            '{"title": string, "description": string, "markdown": string}',
            'Use clean Markdown headings (# Title, ## Section), concise bullet insights, and summary tables.',
            docChartHint,
        ]
            .filter(Boolean)
            .join('\n');
    }

    private normalizePresentationResult(
        parsedObj: JsonRecord | null,
        strippedRaw: string,
        fallbackTitle: string,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): NormalizedSynthesizedArtifact {
        const title = this.readStringField(parsedObj, 'title', 'Title') || fallbackTitle;
        const description =
            this.readStringField(parsedObj, 'description', 'Description') || 'AI-synthesized presentation';

        const rawSlides = this.readArrayField(parsedObj, 'slides', 'Slides');

        if (rawSlides.length === 0) {
            if (strippedRaw && !strippedRaw.startsWith('{')) {
                const converted = SlideDeckEngine.Instance.ConvertMarkdownToSlideDeck(
                    strippedRaw,
                    title,
                );
                const sanitized = this.filterUnauthorizedDeckBlocks(converted, allowedSourceArtifactIds, warnings);
                return {
                    TargetKind: 'presentation',
                    ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.presentation,
                    Title: title,
                    Description: description,
                    Content: SlideDeckEngine.Instance.SerializeDeckSpec(sanitized.Deck),
                    LinkedChartCount: sanitized.LinkedChartCount,
                    Warnings: warnings,
                };
            }
            const fallback = SlideDeckEngine.Instance.CreateDefaultDeck(title);
            warnings.push('Model output contained no slides array; initialized default deck structure.');
            return {
                TargetKind: 'presentation',
                ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.presentation,
                Title: title,
                Description: description,
                Content: SlideDeckEngine.Instance.SerializeDeckSpec(fallback),
                LinkedChartCount: 0,
                Warnings: warnings,
            };
        }

        const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck(title);
        const normalizedSlides: SlideSpec[] = [];
        let linkedCharts = 0;

        rawSlides.forEach((rawSlide, index) => {
            if (!rawSlide || typeof rawSlide !== 'object') return;
            const s = rawSlide as Record<string, unknown>;
            const rawLayout = typeof s['Layout'] === 'string' ? (s['Layout'] as SlideLayoutKind) : 'TitleAndBody';
            const layout: SlideLayoutKind = VALID_SLIDE_LAYOUTS.has(rawLayout) ? rawLayout : 'TitleAndBody';
            const slideTitle =
                (typeof s['Title'] === 'string' && s['Title'].trim()) || `Slide ${index + 1}`;
            const subtitle = typeof s['Subtitle'] === 'string' ? s['Subtitle'] : undefined;
            const speakerNotes =
                typeof s['SpeakerNotes'] === 'string' ? s['SpeakerNotes'] : '';
            const rawRegions = Array.isArray(s['Regions']) ? s['Regions'] : [];

            const regions: SlideRegionSpec[] = [];
            rawRegions.forEach((rawReg, regIdx) => {
                if (!rawReg || typeof rawReg !== 'object') return;
                const r = rawReg as Record<string, unknown>;
                const rawKind = typeof r['Kind'] === 'string' ? (r['Kind'] as SlideRegionKind) : 'rich-text';
                const kind: SlideRegionKind = VALID_REGION_KINDS.has(rawKind) ? rawKind : 'rich-text';
                let markdownContent =
                    typeof r['MarkdownContent'] === 'string' ? r['MarkdownContent'] : '';
                let blockSpec: DocumentBlockSpec | undefined;

                if (kind === 'mj-block' && r['BlockSpec'] && typeof r['BlockSpec'] === 'object') {
                    const candidateSpec = r['BlockSpec'] as DocumentBlockSpec;
                    const verified = this.sanitizeArtifactBlockSpec(
                        candidateSpec,
                        allowedSourceArtifactIds,
                        warnings,
                    );
                    if (!verified) {
                        return;
                    }
                    blockSpec = verified;
                    markdownContent = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(verified);
                    if (verified.Kind === 'Artifact') {
                        linkedCharts++;
                    }
                } else if (markdownContent) {
                    const sanitizedMd = this.stripUnauthorizedMarkdownArtifactBlocks(
                        markdownContent,
                        allowedSourceArtifactIds,
                        warnings,
                    );
                    markdownContent = sanitizedMd.Markdown;
                }

                regions.push({
                    RegionID:
                        (typeof r['RegionID'] === 'string' && r['RegionID'].trim()) ||
                        `region-${regIdx + 1}`,
                    Label:
                        (typeof r['Label'] === 'string' && r['Label'].trim()) ||
                        `Section ${regIdx + 1}`,
                    Kind: kind,
                    MarkdownContent: markdownContent,
                    BlockSpec: blockSpec,
                    BigNumberValue: typeof r['BigNumberValue'] === 'string' ? r['BigNumberValue'] : undefined,
                    BigNumberLabel: typeof r['BigNumberLabel'] === 'string' ? r['BigNumberLabel'] : undefined,
                    BigNumberDelta: typeof r['BigNumberDelta'] === 'string' ? r['BigNumberDelta'] : undefined,
                    QuoteAttribution:
                        typeof r['QuoteAttribution'] === 'string' ? r['QuoteAttribution'] : undefined,
                });
            });

            normalizedSlides.push({
                SlideID: `slide-${index + 1}`,
                SlideNumber: index + 1,
                Layout: layout,
                Title: slideTitle,
                Subtitle: subtitle,
                Regions: regions.length > 0 ? regions : SlideDeckEngine.Instance.BuildRegionsForLayout(layout),
                SpeakerNotes: speakerNotes,
                Transition: index === 0 ? 'fade' : 'slide',
            });
        });

        const finalDeck: SlideDeckSpec = {
            ...baseDeck,
            Title: title,
            Slides: normalizedSlides.length > 0 ? normalizedSlides : baseDeck.Slides,
            UpdatedAt: new Date().toISOString(),
        };

        return {
            TargetKind: 'presentation',
            ArtifactTypeName: SYNTHESIS_TARGET_TYPE_NAME_MAP.presentation,
            Title: title,
            Description: description,
            Content: SlideDeckEngine.Instance.SerializeDeckSpec(finalDeck),
            LinkedChartCount: linkedCharts,
            Warnings: warnings,
        };
    }

    private normalizeSpreadsheetResult(
        parsedObj: JsonRecord | null,
        fallbackTitle: string,
        targetTypeName: string,
        warnings: string[],
    ): NormalizedSynthesizedArtifact {
        const title = this.readStringField(parsedObj, 'title', 'Title') || fallbackTitle;
        const description =
            this.readStringField(parsedObj, 'description', 'Description') || 'AI-synthesized spreadsheet';

        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook(title);
        const rawSheets = this.readArrayField(parsedObj, 'worksheets', 'Worksheets');

        if (rawSheets.length === 0) {
            warnings.push('Model output contained no worksheets array; initialized blank workbook.');
            return {
                TargetKind: 'spreadsheet',
                ArtifactTypeName: targetTypeName,
                Title: title,
                Description: description,
                Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
                LinkedChartCount: 0,
                Warnings: warnings,
            };
        }

        rawSheets.forEach((rawSheet, idx) => {
            if (!rawSheet || typeof rawSheet !== 'object') return;
            const sh = rawSheet as Record<string, unknown>;
            const rawName = typeof sh['Name'] === 'string' ? sh['Name'].trim() : `Sheet ${idx + 1}`;
            const safeName = rawName.slice(0, 31) || `Sheet ${idx + 1}`;

            const targetSheet =
                idx === 0
                    ? wb.Worksheets[0]
                    : SpreadsheetEngine.Instance.AddWorksheet(wb, safeName);
            if (idx === 0) {
                SpreadsheetEngine.Instance.RenameWorksheet(wb, targetSheet.SheetID, safeName);
            }

            const headers = Array.isArray(sh['Headers']) ? sh['Headers'] : [];
            headers.forEach((h, cIdx) => {
                if (cIdx > 25) return;
                const addr = `${this.numberToColLetters(cIdx + 1)}1`;
                SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                    Value: h != null ? String(h) : '',
                });
            });

            const rows = Array.isArray(sh['Rows']) ? sh['Rows'] : [];
            const rowStart = headers.length > 0 ? 2 : 1;
            rows.forEach((rawRow, rIdx) => {
                if (!Array.isArray(rawRow)) return;
                rawRow.forEach((cellVal, cIdx) => {
                    if (cIdx > 25) return;
                    const addr = `${this.numberToColLetters(cIdx + 1)}${rowStart + rIdx}`;
                    if (typeof cellVal === 'string' && cellVal.trim().startsWith('=')) {
                        SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                            Formula: cellVal.trim(),
                        });
                    } else {
                        const normalizedCell = this.toSpreadsheetCellValue(cellVal);
                        SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                            Value: normalizedCell,
                        });
                    }
                });
            });
        });

        SpreadsheetEngine.Instance.EvaluateWorkbook(wb);

        return {
            TargetKind: 'spreadsheet',
            ArtifactTypeName: targetTypeName,
            Title: title,
            Description: description,
            Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
            LinkedChartCount: 0,
            Warnings: warnings,
        };
    }

    private normalizeDocumentResult(
        parsedObj: JsonRecord | null,
        strippedRaw: string,
        fallbackTitle: string,
        targetTypeName: string,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): NormalizedSynthesizedArtifact {
        const title = this.readStringField(parsedObj, 'title', 'Title') || fallbackTitle;
        const description =
            this.readStringField(parsedObj, 'description', 'Description') || 'AI-synthesized document';

        let rawMarkdown = this.readRawStringField(parsedObj, 'markdown', 'Markdown', 'content', 'Content');
        if (!rawMarkdown) {
            if (!parsedObj && strippedRaw) {
                rawMarkdown = strippedRaw;
            } else {
                rawMarkdown = `# ${title}\n\n`;
            }
        }

        const sanitized = this.stripUnauthorizedMarkdownArtifactBlocks(
            rawMarkdown,
            allowedSourceArtifactIds,
            warnings,
        );

        let finalMarkdown = sanitized.Markdown.trim();
        if (!finalMarkdown.startsWith('#')) {
            finalMarkdown = `# ${title}\n\n${finalMarkdown}`;
        }

        return {
            TargetKind: 'document',
            ArtifactTypeName: targetTypeName,
            Title: title,
            Description: description,
            Content: finalMarkdown,
            LinkedChartCount: sanitized.VerifiedArtifactBlockCount,
            Warnings: warnings,
        };
    }

    private filterUnauthorizedDeckBlocks(
        deck: SlideDeckSpec,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): { Deck: SlideDeckSpec; LinkedChartCount: number } {
        let linked = 0;
        const slides = deck.Slides.map((slide) => ({
            ...slide,
            Regions: slide.Regions.map((region) => {
                if (region.BlockSpec) {
                    const checked = this.sanitizeArtifactBlockSpec(
                        region.BlockSpec,
                        allowedSourceArtifactIds,
                        warnings,
                    );
                    if (!checked) {
                        return { ...region, Kind: 'rich-text' as SlideRegionKind, BlockSpec: undefined, MarkdownContent: '' };
                    }
                    if (checked.Kind === 'Artifact') linked++;
                    return { ...region, BlockSpec: checked };
                }
                return region;
            }),
        }));
        return { Deck: { ...deck, Slides: slides }, LinkedChartCount: linked };
    }

    private sanitizeArtifactBlockSpec(
        raw: DocumentBlockSpec,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): DocumentBlockSpec | null {
        const kind = (raw.Kind ?? 'EntityView') as DocumentBlockKind;
        // Synthesized embeds MUST run in Live mode so viewer RLS/permission checks apply at render time.
        const mode: DocumentBlockMode = kind === 'Artifact' ? 'Live' : raw.Mode === 'Frozen' ? 'Frozen' : 'Live';
        if (kind === 'Artifact') {
            const targetId = (raw.ArtifactID ?? '').trim();
            const isAllowed = targetId.length > 0 && allowedSourceArtifactIds.some((id) => UUIDsEqual(id, targetId));
            if (!isAllowed) {
                warnings.push(`Removed unverified Artifact reference "${targetId || 'unknown'}".`);
                return null;
            }
        }
        const cleaned: DocumentBlockSpec = {
            ...raw,
            BlockID: raw.BlockID || `synth-blk-${Date.now()}`,
            Kind: kind,
            Mode: mode,
        };
        if (mode === 'Live') {
            delete cleaned.FrozenSnapshot;
        }
        return cleaned;
    }

    private stripUnauthorizedMarkdownArtifactBlocks(
        markdown: string,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): { Markdown: string; VerifiedArtifactBlockCount: number } {
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
        let verifiedCount = 0;
        const rebuilt: string[] = [];
        for (const seg of segments) {
            if (seg.Type !== 'mj-block' || !seg.BlockSpec) {
                rebuilt.push(seg.RawText);
                continue;
            }
            const verified = this.sanitizeArtifactBlockSpec(
                seg.BlockSpec,
                allowedSourceArtifactIds,
                warnings,
            );
            if (!verified) {
                continue;
            }
            if (verified.Kind === 'Artifact') {
                verifiedCount++;
            }
            rebuilt.push(DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(verified));
        }
        return { Markdown: rebuilt.join('\n'), VerifiedArtifactBlockCount: verifiedCount };
    }

    private readStringField(
        obj: JsonRecord | null,
        ...args: string[]
    ): string {
        if (!obj) return '';
        for (const key of args) {
            const val = obj[key];
            if (typeof val === 'string' && val.trim().length > 0) {
                return val.trim();
            }
        }
        return '';
    }

    private readRawStringField(obj: JsonRecord | null, ...keys: string[]): string {
        if (!obj) return '';
        for (const key of keys) {
            const val = obj[key];
            if (typeof val === 'string' && val.length > 0) {
                return val;
            }
        }
        return '';
    }

    private readArrayField(obj: JsonRecord | null, ...keys: string[]): unknown[] {
        if (!obj) return [];
        for (const key of keys) {
            const val = obj[key];
            if (Array.isArray(val)) return val;
        }
        return [];
    }

    private stripJsonFence(raw: string): string {
        const trimmed = (raw ?? '').trim();
        const fenceMatch = /^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
        return fenceMatch ? fenceMatch[1].trim() : trimmed;
    }

    private toBulletSummary(summaryText: string): string {
        const lines = summaryText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('...'))
            .slice(0, 6);
        if (lines.length === 0) return '- Source highlights pending review.';
        return lines.map((l) => (l.startsWith('- ') || l.startsWith('* ') ? l : `- ${l}`)).join('\n');
    }

    private toSpreadsheetCellValue(value: unknown): SpreadsheetCellValue {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }
        return String(value);
    }

    private colLettersToNumber(letters: string): number {
        let num = 0;
        const upper = letters.toUpperCase();
        for (let i = 0; i < upper.length; i++) {
            num = num * 26 + (upper.charCodeAt(i) - 64);
        }
        return num;
    }

    private numberToColLetters(colNum: number): string {
        let n = colNum;
        let out = '';
        while (n > 0) {
            const rem = (n - 1) % 26;
            out = String.fromCharCode(65 + rem) + out;
            n = Math.floor((n - 1) / 26);
        }
        return out || 'A';
    }
}
