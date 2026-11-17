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

export type SynthesisJsonValue = string | number | boolean | object | null | undefined;
type JsonRecord = Record<string, SynthesisJsonValue>;

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
    private _blockSequence = 0;

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
     * Always passes `{ SkipEvaluate: true }` so untrusted formulas are never evaluated on the main thread (`R8-3`).
     */
    public ExtractSourceDigest(
        source: ArtifactSynthesisSourceInput,
        maxChars = 6000,
    ): ArtifactSynthesisSourceDigest {
        return this.extractSourceDigestInternal(source, maxChars);
    }

    /**
     * Isolated async counterpart to {@link ExtractSourceDigest}: for spreadsheets, parses and evaluates
     * via {@link SpreadsheetEngine.ParseWorkbookIsolated} (using server `worker_threads` isolation when
     * registered) so computed formula values appear safely in the digest (`R8-3`).
     */
    public async ExtractSourceDigestIsolated(
        source: ArtifactSynthesisSourceInput,
        maxChars = 6000,
    ): Promise<ArtifactSynthesisSourceDigest> {
        const normType = (source.ArtifactType ?? '').trim().toLowerCase();
        const raw = typeof source.Content === 'string' ? source.Content : '';
        const isBinaryPlaceholder = source.ContentMode === 'File' || (!raw.trim() && Boolean(source.Description));
        let preparsedWorkbook: ReturnType<SpreadsheetEngine['ParseWorkbook']> | undefined;
        if (!isBinaryPlaceholder && (normType.includes('spreadsheet') || normType === 'excel')) {
            try {
                preparsedWorkbook = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(raw, source.Configuration);
            } catch {
                preparsedWorkbook = undefined;
            }
        }
        return this.extractSourceDigestInternal(source, maxChars, preparsedWorkbook);
    }

    private extractSourceDigestInternal(
        source: ArtifactSynthesisSourceInput,
        maxChars = 6000,
        preparsedWorkbook?: ReturnType<SpreadsheetEngine['ParseWorkbook']>,
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
            this.digestSpreadsheet(source, raw, summaryParts, sections, embeddedCharts, preparsedWorkbook);
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

        let parsedObj: JsonRecord | null = null;
        if (stripped.startsWith('{') || stripped.startsWith('[')) {
            try {
                const candidate = JSON.parse(stripped) as SynthesisJsonValue;
                if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                    parsedObj = candidate as JsonRecord;
                } else if (Array.isArray(candidate) && options.TargetKind === 'presentation') {
                    parsedObj = { slides: candidate as SynthesisJsonValue[] };
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
            const usedIds = new Set<string>();
            for (const d of digests) {
                const chart = linkChartsAndRanges ? d.EmbeddedCharts[0] : undefined;
                if (chart) {
                    const blockSpec: DocumentBlockSpec = {
                        BlockID: this.mintUniqueBlockId('chart-blk', undefined, usedIds),
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
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'A1', { Value: 'Source Artifact', Formula: null });
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'B1', { Value: 'Type', Formula: null });
            SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, 'C1', { Value: 'Summary Highlights', Formula: null });
            digests.forEach((d, rowOffset) => {
                const row = rowOffset + 2;
                SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, `A${row}`, { Value: d.Name, Formula: null });
                SpreadsheetEngine.Instance.SetCell(wb, firstSheet.SheetID, `B${row}`, { Value: d.ArtifactType, Formula: null });
                SpreadsheetEngine.Instance.SetCell(
                    wb,
                    firstSheet.SheetID,
                    `C${row}`,
                    { Value: d.SummaryText.replace(/\s+/g, ' ').slice(0, 220), Formula: null },
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
        const usedDocIds = new Set<string>();
        for (const d of digests) {
            lines.push(`## ${d.Name} (${d.ArtifactType})`);
            lines.push('');
            lines.push(this.toBulletSummary(d.SummaryText));
            lines.push('');
            if (linkChartsAndRanges && d.EmbeddedCharts.length > 0) {
                const chart = d.EmbeddedCharts[0];
                const spec: DocumentBlockSpec = {
                    BlockID: this.mintUniqueBlockId('chart-blk', undefined, usedDocIds),
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
        preparsedWorkbook?: ReturnType<SpreadsheetEngine['ParseWorkbook']>,
    ): void {
        try {
            const wb =
                preparsedWorkbook ??
                SpreadsheetEngine.Instance.ParseWorkbook(raw, source.Configuration, { SkipEvaluate: true });
            const maxSheets = 12;
            for (const sheet of wb.Worksheets.slice(0, maxSheets)) {
                sections.push(sheet.Name);
                const cellEntries = Object.entries(sheet.Cells ?? {});
                const previewRows: string[] = [];
                const rowsMap = new Map<number, Array<{ col: number; val: string }>>();
                const summaryOrFormulaRows = new Set<number>();

                for (const [addr, cell] of cellEntries) {
                    const m = /^([A-Za-z]+)(\d+)$/.exec(addr);
                    if (!m) continue;
                    const rowNum = Number(m[2]);
                    const colNum = this.colLettersToNumber(m[1]);
                    const rawVal = cell.ComputedValue !== undefined ? cell.ComputedValue : cell.RawValue;
                    const strVal = rawVal != null ? String(rawVal).trim() : '';
                    if (!strVal) continue;
                    const rowArr = rowsMap.get(rowNum) ?? [];
                    rowArr.push({ col: colNum, val: strVal.slice(0, 60) });
                    rowsMap.set(rowNum, rowArr);
                    if (
                        (typeof cell.Formula === 'string' && cell.Formula.trim().length > 0) ||
                        /\b(?:total|subtotal|grand|summary|net|balance)\b/i.test(strVal)
                    ) {
                        summaryOrFormulaRows.add(rowNum);
                    }
                }

                const sortedRows = Array.from(rowsMap.keys()).sort((a, b) => a - b);
                const headRows = sortedRows.slice(0, 12);
                const tailRows = sortedRows.slice(-8);
                const lastHeadRow = headRows.length > 0 ? headRows[headRows.length - 1] : 0;
                const selectedSet = new Set<number>(headRows);
                for (const r of sortedRows) {
                    if (summaryOrFormulaRows.has(r) && r > lastHeadRow) {
                        selectedSet.add(r);
                    }
                }
                for (const r of tailRows) {
                    selectedSet.add(r);
                }
                const selectedRows = Array.from(selectedSet).sort((a, b) => a - b);
                let prevSelectedRow = 0;
                for (const r of selectedRows) {
                    if (prevSelectedRow > 0 && r > prevSelectedRow + 1 && prevSelectedRow <= lastHeadRow) {
                        previewRows.push('... (summary & trailing rows) ...');
                    }
                    const cells = rowsMap.get(r)!.sort((a, b) => a.col - b.col);
                    previewRows.push(`Row ${r}: ${cells.map((c) => c.val).join(' | ')}`);
                    prevSelectedRow = r;
                }

                summaryParts.push(
                    `Worksheet "${sheet.Name}" (${cellEntries.length} non-empty cells):` +
                        (previewRows.length > 0 ? `\n${previewRows.join('\n')}` : ' (no sample rows)'),
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
            if (wb.Worksheets.length > maxSheets) {
                const omitted = wb.Worksheets.slice(maxSheets).map((w) => w.Name).join(', ');
                summaryParts.push(`Additional worksheets (${wb.Worksheets.length - maxSheets}): ${omitted}`);
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
            const parsed = JSON.parse(raw) as SynthesisJsonValue;
            const texts: string[] = [];
            if (parsed && typeof parsed === 'object') {
                const obj = parsed as JsonRecord;
                const pages = Array.isArray(obj['pages']) ? (obj['pages'] as SynthesisJsonValue[]) : [];
                for (const p of pages) {
                    if (!p || typeof p !== 'object') continue;
                    const pageObj = p as JsonRecord;
                    const name = typeof pageObj['name'] === 'string' ? pageObj['name'] : 'Page';
                    sections.push(name);
                    const items = Array.isArray(pageObj['items']) ? (pageObj['items'] as SynthesisJsonValue[]) : [];
                    for (const item of items) {
                        if (!item || typeof item !== 'object') continue;
                        const it = item as JsonRecord;
                        for (const key of ['Label', 'Text', 'Sub']) {
                            const val = it[key];
                            if (typeof val === 'string' && val.trim()) {
                                texts.push(val.trim());
                            }
                        }
                    }
                }
                const legacyElements = Array.isArray(obj['Elements'])
                    ? (obj['Elements'] as SynthesisJsonValue[])
                    : Array.isArray(obj['elements'])
                      ? (obj['elements'] as SynthesisJsonValue[])
                      : [];
                for (const el of legacyElements) {
                    if (!el || typeof el !== 'object') continue;
                    const rec = el as JsonRecord;
                    for (const key of ['Text', 'text', 'Label', 'label']) {
                        const val = rec[key];
                        if (typeof val === 'string' && val.trim()) {
                            texts.push(val.trim());
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
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('#')) {
                    let hashes = 0;
                    while (hashes < trimmedLine.length && hashes < 4 && trimmedLine[hashes] === '#') {
                        hashes++;
                    }
                    if (
                        hashes >= 1 &&
                        hashes <= 3 &&
                        hashes < trimmedLine.length &&
                        /\s/.test(trimmedLine[hashes])
                    ) {
                        const headingText = trimmedLine.slice(hashes + 1).trim();
                        if (headingText) {
                            sections.push(headingText);
                        }
                    }
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
                const parsed = JSON.parse(trimmed) as SynthesisJsonValue;
                if (Array.isArray(parsed)) {
                    const keys =
                        parsed[0] && typeof parsed[0] === 'object'
                            ? Object.keys(parsed[0] as JsonRecord).slice(0, 12)
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
                ? 'To embed a live source chart in Markdown, place a directive block:\n:::mj-block\n{"BlockID":"chart-1","Kind":"Artifact","Mode":"Live","EmbedMode":"Inline","ArtifactID":"<verified ArtifactID>","ArtifactType":"Excel Spreadsheet","SheetID":"<WorksheetName>","SheetChartID":"<ChartID>","SheetRange":"<RangeAddress>","Title":"<ChartTitle>"}\n:::'
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
        const usedBlockIds = new Set<string>();
        let linkedCharts = 0;

        rawSlides.forEach((rawSlide, index) => {
            if (!rawSlide || typeof rawSlide !== 'object') return;
            const s = rawSlide as JsonRecord;
            const rawLayout = typeof s['Layout'] === 'string' ? (s['Layout'] as SlideLayoutKind) : 'TitleAndBody';
            const layout: SlideLayoutKind = VALID_SLIDE_LAYOUTS.has(rawLayout) ? rawLayout : 'TitleAndBody';
            const slideTitle =
                (typeof s['Title'] === 'string' && s['Title'].trim()) || `Slide ${index + 1}`;
            const subtitle = typeof s['Subtitle'] === 'string' ? s['Subtitle'] : undefined;
            const speakerNotes =
                typeof s['SpeakerNotes'] === 'string' ? s['SpeakerNotes'] : '';
            const rawRegions = Array.isArray(s['Regions']) ? (s['Regions'] as SynthesisJsonValue[]) : [];

            const regions: SlideRegionSpec[] = [];
            rawRegions.forEach((rawReg, regIdx) => {
                if (!rawReg || typeof rawReg !== 'object') return;
                const r = rawReg as JsonRecord;
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
                        usedBlockIds,
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
                        usedBlockIds,
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
            const sh = rawSheet as JsonRecord;
            const rawName = typeof sh['Name'] === 'string' ? sh['Name'].trim() : `Sheet ${idx + 1}`;
            const safeName = rawName.slice(0, 31) || `Sheet ${idx + 1}`;

            const targetSheet =
                idx === 0
                    ? wb.Worksheets[0]
                    : SpreadsheetEngine.Instance.AddWorksheet(wb, safeName);
            if (idx === 0) {
                SpreadsheetEngine.Instance.RenameWorksheet(wb, targetSheet.SheetID, safeName);
            }

            const headers = Array.isArray(sh['Headers']) ? (sh['Headers'] as SynthesisJsonValue[]) : [];
            headers.forEach((h, cIdx) => {
                const addr = `${this.numberToColLetters(cIdx + 1)}1`;
                SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                    Value: h != null ? String(h) : '',
                    Formula: null,
                });
            });

            const rows = Array.isArray(sh['Rows']) ? (sh['Rows'] as SynthesisJsonValue[]) : [];
            const rowStart = headers.length > 0 ? 2 : 1;
            rows.forEach((rawRow, rIdx) => {
                if (!Array.isArray(rawRow)) return;
                (rawRow as SynthesisJsonValue[]).forEach((cellVal, cIdx) => {
                    const addr = `${this.numberToColLetters(cIdx + 1)}${rowStart + rIdx}`;
                    if (typeof cellVal === 'string' && this.containsDisallowedMjFormula(cellVal)) {
                        warnings.push(
                            `Blocked disallowed MJ.* live formula in synthesized cell ${safeName}!${addr}.`,
                        );
                        const strippedBody = cellVal.trim().replace(/^[=+\-@\s]+/, '');
                        SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                            Value: `[Blocked formula] ${strippedBody}`,
                            Formula: null,
                            Literal: true,
                        });
                    } else if (typeof cellVal === 'string' && cellVal.trim().startsWith('=')) {
                        SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                            Formula: cellVal.trim(),
                        });
                    } else {
                        const normalizedCell = this.toSpreadsheetCellValue(cellVal);
                        SpreadsheetEngine.Instance.SetCell(wb, targetSheet.SheetID, addr, {
                            Value: normalizedCell,
                            Formula: null,
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

    private mintUniqueBlockId(prefix: string, candidate?: string, usedBlockIds?: Set<string>): string {
        const trimmed = (candidate ?? '').trim();
        if (trimmed && (!usedBlockIds || !usedBlockIds.has(trimmed))) {
            usedBlockIds?.add(trimmed);
            return trimmed;
        }
        let generated = `${prefix}-${Date.now()}-${++this._blockSequence}`;
        while (usedBlockIds?.has(generated)) {
            generated = `${prefix}-${Date.now()}-${++this._blockSequence}`;
        }
        usedBlockIds?.add(generated);
        return generated;
    }

    private containsDisallowedMjFormula(rawCell: string): boolean {
        const trimmed = rawCell.trim();
        if (!trimmed || !/^[=+\-@]/.test(trimmed)) {
            return false;
        }
        // Strip quoted string literals (including Excel "" escapes) so unquoted MJ.* calls anywhere
        // in the formula expression (direct, +MJ.*, @MJ.*, _xll.MJ.*, or nested in IF/CONCAT) are detected.
        const unquoted = trimmed.replace(/"(?:[^"]|"")*"/g, '""');
        return /\b(?:_xll\s*\.\s*)?MJ\s*\.\s*(?:VIEW|QUERY|AI|IMPORTRANGE)\b/i.test(unquoted);
    }

    private filterUnauthorizedDeckBlocks(
        deck: SlideDeckSpec,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
    ): { Deck: SlideDeckSpec; LinkedChartCount: number } {
        let linked = 0;
        const usedBlockIds = new Set<string>();
        const slides = deck.Slides.map((slide) => ({
            ...slide,
            Regions: slide.Regions.map((region) => {
                if (region.BlockSpec) {
                    const checked = this.sanitizeArtifactBlockSpec(
                        region.BlockSpec,
                        allowedSourceArtifactIds,
                        warnings,
                        usedBlockIds,
                    );
                    if (!checked) {
                        return { ...region, Kind: 'rich-text' as SlideRegionKind, BlockSpec: undefined, MarkdownContent: '' };
                    }
                    if (checked.Kind === 'Artifact') linked++;
                    const cleanedMarkdown =
                        typeof region.MarkdownContent === 'string' &&
                        (region.MarkdownContent.includes(':::mj-block') || region.MarkdownContent.includes('FrozenSnapshot'))
                            ? DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(checked)
                            : region.MarkdownContent;
                    return {
                        ...region,
                        BlockSpec: checked,
                        MarkdownContent: cleanedMarkdown,
                    };
                }
                if (typeof region.MarkdownContent === 'string' && region.MarkdownContent.includes(':::mj-block')) {
                    const stripped = this.stripUnauthorizedMarkdownArtifactBlocks(
                        region.MarkdownContent,
                        allowedSourceArtifactIds,
                        warnings,
                        usedBlockIds,
                    );
                    return {
                        ...region,
                        MarkdownContent: stripped.Markdown,
                    };
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
        usedBlockIds?: Set<string>,
    ): DocumentBlockSpec | null {
        const kind = raw.Kind;
        if (kind !== 'Artifact') {
            warnings.push(
                `Removed disallowed synthesized block of kind "${String(kind ?? 'unspecified')}": only Kind="Artifact" embeds referencing verified source artifacts are allowed.`,
            );
            return null;
        }
        const targetId = (raw.ArtifactID ?? '').trim();
        const isAllowed = targetId.length > 0 && allowedSourceArtifactIds.some((id) => UUIDsEqual(id, targetId));
        if (!isAllowed) {
            warnings.push(`Removed unverified Artifact reference "${targetId || 'unspecified'}".`);
            return null;
        }
        const cleaned: DocumentBlockSpec = {
            ...raw,
            BlockID: this.mintUniqueBlockId('synth-blk', raw.BlockID, usedBlockIds),
            Kind: 'Artifact',
            Mode: 'Live',
        };
        delete cleaned.FrozenSnapshot;
        return cleaned;
    }

    private normalizeBacktickMjBlockFences(
        markdown: string,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
        usedBlockIds: Set<string>,
    ): string {
        const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
        const out: string[] = [];
        let i = 0;
        while (i < lines.length) {
            const openMatch = /^\s*(`{3,}|~{3,})\s*mj-block\b/i.exec(lines[i]);
            if (!openMatch) {
                out.push(lines[i]);
                i++;
                continue;
            }
            const fenceChar = openMatch[1][0];
            const fenceLen = openMatch[1].length;
            const closeRe = new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`);
            let closeIdx = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (closeRe.test(lines[j])) {
                    closeIdx = j;
                    break;
                }
            }
            if (closeIdx < 0) {
                // Unterminated backtick mj-block fence — strip from output
                warnings.push('Removed malformed backtick mj-block fence from synthesized markdown.');
                break;
            }
            const innerJson = lines.slice(i + 1, closeIdx).join('\n').trim();
            try {
                const candidate = JSON.parse(innerJson) as DocumentBlockSpec;
                const verified = this.sanitizeArtifactBlockSpec(
                    candidate,
                    allowedSourceArtifactIds,
                    warnings,
                    usedBlockIds,
                );
                if (verified) {
                    out.push(DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(verified));
                }
            } catch {
                warnings.push('Removed invalid JSON inside backtick mj-block fence from synthesized markdown.');
            }
            i = closeIdx + 1;
        }
        return out.join('\n');
    }

    private stripUnauthorizedMarkdownArtifactBlocks(
        markdown: string,
        allowedSourceArtifactIds: ReadonlyArray<string>,
        warnings: string[],
        usedBlockIds = new Set<string>(),
    ): { Markdown: string; VerifiedArtifactBlockCount: number } {
        const normalizedMarkdown = this.normalizeBacktickMjBlockFences(
            markdown,
            allowedSourceArtifactIds,
            warnings,
            usedBlockIds,
        );
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(normalizedMarkdown);
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
                usedBlockIds,
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

    private readArrayField(obj: JsonRecord | null, ...keys: string[]): SynthesisJsonValue[] {
        if (!obj) return [];
        for (const key of keys) {
            const val = obj[key];
            if (Array.isArray(val)) return val as SynthesisJsonValue[];
        }
        return [];
    }

    private stripJsonFence(raw: string): string {
        const trimmed = (raw ?? '').trim();
        if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) {
            return trimmed;
        }
        const firstNewline = trimmed.indexOf('\n');
        const lastNewline = trimmed.lastIndexOf('\n');
        if (firstNewline === -1 || lastNewline <= firstNewline) {
            return trimmed;
        }
        const header = trimmed.slice(3, firstNewline).trim().toLowerCase();
        const footer = trimmed.slice(lastNewline + 1).trim();
        if ((header === '' || header === 'json' || header === 'markdown' || header === 'md') && footer === '```') {
            return trimmed.slice(firstNewline + 1, lastNewline).trim();
        }
        return trimmed;
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

    private toSpreadsheetCellValue(value: SynthesisJsonValue): SpreadsheetCellValue {
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
