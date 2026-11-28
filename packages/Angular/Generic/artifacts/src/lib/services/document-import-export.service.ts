import { Injectable } from '@angular/core';
import type * as DocxModule from 'docx';
import type TurndownService from 'turndown';
import {
  ApplyDocumentDesignConfigToMarkdown,
  ComputeDocumentStats,
  DocumentLiveBlockEngine,
  ExtractDocumentDesignConfig,
  GetDocumentDesignPreset,
  ParseDocumentFrontmatter,
  ValidateFrozenBlockSnapshot,
  type DocumentBlockExecutionResult,
  type DocumentBlockSpec,
  type DocumentDesignConfig,
  type DocumentPageOrientation,
  type DocumentStats,
} from '@memberjunction/core-entities';
import { ConvertDocxToHtml, type MammothModuleShim } from '../components/previews/office-preview.logic';
import type { DocumentAnchoredThread, DocumentSuggestionItem } from './document-collaboration.service';
import { IsVisualDiagramOrChartBlock, RasterizeBlockDiagramToPng } from '../utils/diagram-png-encoder';
import { StripDocRecordLinksToPlainText } from '../utils/doc-record-link.util';
import {
  InspectDocxArchive,
  MJ_DOCX_BLOCK_MARKER_PREFIX,
  MJ_DOCX_CUSTOM_PROP_BLOCKS,
  MJ_DOCX_CUSTOM_PROP_DESIGN,
  RehydrateMjBlocksInMarkdown,
} from '../utils/docx-ooxml.util';
import { PrintHtmlInSandboxedIframe, SanitizeHtmlForSandboxedFrame } from '../utils/html-sandbox.util';
import { ComputeBoundedSequenceDiff } from '../utils/line-diff';

export type DocExportMode = 'clean' | 'markup';

export interface ExportPreflightIssue {
  Severity: 'error' | 'warning' | 'info';
  Code: string;
  Message: string;
  Line?: number;
  BlockID?: string;
}

export interface DocumentExportPreflightOptions {
  LiveBlockResults?: ReadonlyMap<string, DocumentBlockExecutionResult>;
  VerifyFrozenSnapshot?: (block: DocumentBlockSpec) => boolean;
  Suggestions?: readonly DocumentSuggestionItem[];
  AnchoredThreads?: readonly DocumentAnchoredThread[];
  Orientation?: DocumentPageOrientation;
  Strict?: boolean;
}

export interface DocumentExportPreflightReport {
  Passed: boolean;
  StrictFailed: boolean;
  ErrorCount: number;
  WarningCount: number;
  InfoCount: number;
  PendingSuggestionsCount: number;
  OpenCommentsCount: number;
  RecommendedOrientation: DocumentPageOrientation;
  Stats: DocumentStats;
  Issues: ExportPreflightIssue[];
}

export interface DocxImportFidelityWarning {
  Code: string;
  Count: number;
  Message: string;
}

export interface DocxImportFidelityReport {
  FileName: string;
  HeadingsCount: number;
  TablesCount: number;
  RestoredMjBlocksCount: number;
  ImportedTrackedChangesCount: number;
  ImportedCommentsCount: number;
  RestoredDesignPresetID: string | null;
  Warnings: DocxImportFidelityWarning[];
  SummaryText: string;
}

export interface DocxImportWithFidelityResult {
  Markdown: string;
  Report: DocxImportFidelityReport;
  ImportedSuggestions: DocumentSuggestionItem[];
  ImportedComments: DocumentAnchoredThread[];
  RestoredDesignConfig: Partial<DocumentDesignConfig> | null;
}

/** Options controlling `.docx` visual rasterization, live block rows, markup export, design presets, and strict preflight. */
export interface DocxExportOptions {
  /** Optional caller override supplying custom PNG bytes for an embedded chart or Whiteboard block. */
  RasterizeBlockToPng?: (block: DocumentBlockSpec) => Promise<Uint8Array | null>;
  /** Optional live execution results keyed by `BlockID` so Live blocks include current tabular data in DOCX exports. */
  LiveBlockResults?: ReadonlyMap<string, DocumentBlockExecutionResult>;
  /** Optional verifier callback returning whether a frozen block's snapshot signature/hash is verified. */
  VerifyFrozenSnapshot?: (block: DocumentBlockSpec) => boolean;
  /** `'clean'` (default) exports clean accepted prose; `'markup'` emits native Word Track Changes (`w:ins`/`w:del`) and margin Comments. */
  ExportMode?: DocExportMode;
  /** Pending MJ Docs suggestions exported as native Word revisions when `ExportMode === 'markup'`. */
  Suggestions?: readonly DocumentSuggestionItem[];
  /** Open anchored comment threads exported as native Word margin comments when `ExportMode === 'markup'`. */
  AnchoredThreads?: readonly DocumentAnchoredThread[];
  /** Optional design preset / page setup overrides merged over document YAML frontmatter. */
  DesignConfig?: Partial<DocumentDesignConfig>;
  /** When true (default), embeds `MJBlocks` + `MJDesignPreset` custom properties so `.docx` re-import recovers live blocks. */
  EmbedLiveBlockMetadata?: boolean;
  /** When true, aborts export with a descriptive error if preflight finds any `error`-severity issue. */
  Strict?: boolean;
}

export interface PrintablePdfExportOptions {
  DesignConfig?: Partial<DocumentDesignConfig>;
  ExportMode?: DocExportMode;
  MarkdownSource?: string;
}

// dynamic-import: docx (~250KB OOXML archive builder) is deferred until .docx export is invoked to avoid eager bundle cost (Rule 8 #3)
let docxModulePromise: Promise<typeof DocxModule> | null = null;
function loadDocxModule(): Promise<typeof DocxModule> {
  if (!docxModulePromise) {
    docxModulePromise = import('docx').catch((err) => {
      docxModulePromise = null;
      throw err;
    });
  }
  return docxModulePromise;
}

type TurndownServiceConstructor = typeof TurndownService;

// dynamic-import: turndown (HTML-to-Markdown parser) is deferred until .docx/HTML import is invoked to avoid eager bundle cost (Rule 8 #3)
let turndownServicePromise: Promise<TurndownServiceConstructor> | null = null;
function loadTurndownService(): Promise<TurndownServiceConstructor> {
  if (!turndownServicePromise) {
    turndownServicePromise = import('turndown')
      .then((mod) => (typeof mod === 'function' ? mod : mod.default))
      .catch((err) => {
        turndownServicePromise = null;
        throw err;
      });
  }
  return turndownServicePromise;
}

// dynamic-import: mammoth is a heavy Office parser deferred until DOCX import/preview is invoked (Rule 8 #3)
let mammothModulePromise: Promise<MammothModuleShim> | null = null;
function loadMammothModule(): Promise<MammothModuleShim> {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth')
      .then((mod): MammothModuleShim => {
        const candidate = mod as Partial<MammothModuleShim> & { default?: Partial<MammothModuleShim> };
        const convertFn =
          typeof candidate.convertToHtml === 'function'
            ? candidate.convertToHtml.bind(candidate)
            : typeof candidate.default?.convertToHtml === 'function'
              ? candidate.default.convertToHtml.bind(candidate.default)
              : null;
        if (!convertFn) {
          throw new Error('mammoth.convertToHtml is unavailable in the loaded module.');
        }
        return {
          convertToHtml: (input) => convertFn(input),
        };
      })
      .catch((err) => {
        mammothModulePromise = null;
        throw err;
      });
  }
  return mammothModulePromise;
}

/**
 * Sanitizes a printable HTML fragment using the shared DOMPurify sandbox sanitizer and additionally
 * removes `<link>` and `<form>` tags before printing inside a sandboxed iframe.
 */
function sanitizePrintableHtmlFragment(rawHtml: string): string {
  return SanitizeHtmlForSandboxedFrame(rawHtml ?? '', {
    AdditionalForbidTags: ['link', 'form'],
  });
}

function tokenizeWordsForDiff(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isSpace = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
    if (i === 0) {
      inSpace = isSpace;
      current = ch;
    } else if (isSpace === inSpace) {
      current += ch;
    } else {
      tokens.push(current);
      current = ch;
      inSpace = isSpace;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeForMatch(text: string): string {
  return StripDocRecordLinksToPlainText(text ?? '')
    .replace(/\*\*|__|\*|_|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMarkdownHeadingLine(line: string): boolean {
  let hashes = 0;
  while (hashes < line.length && hashes < 6 && line[hashes] === '#') {
    hashes++;
  }
  return hashes >= 1 && hashes < line.length && line[hashes] === ' ';
}

function parseOrderedListPrefix(trimmed: string): { prefix: string; body: string } | null {
  let i = 0;
  while (i < trimmed.length && trimmed[i] >= '0' && trimmed[i] <= '9') {
    i++;
  }
  if (i === 0 || i + 1 >= trimmed.length || trimmed[i] !== '.') {
    return null;
  }
  let spaceEnd = i + 1;
  while (spaceEnd < trimmed.length && (trimmed[spaceEnd] === ' ' || trimmed[spaceEnd] === '\t')) {
    spaceEnd++;
  }
  if (spaceEnd === i + 1 || spaceEnd >= trimmed.length) {
    return null;
  }
  return { prefix: trimmed.slice(0, i), body: trimmed.slice(spaceEnd) };
}

function parseBulletListLine(trimmed: string): { checkbox: string; body: string } | null {
  if (trimmed.length < 3 || (trimmed[0] !== '-' && trimmed[0] !== '*' && trimmed[0] !== '+')) {
    return null;
  }
  if (trimmed[1] !== ' ' && trimmed[1] !== '\t') {
    return null;
  }
  const rest = trimmed.slice(2).trimStart();
  if (!rest) {
    return null;
  }
  if (
    rest.length >= 4 &&
    rest[0] === '[' &&
    (rest[1] === ' ' || rest[1] === 'x' || rest[1] === 'X') &&
    rest[2] === ']' &&
    (rest[3] === ' ' || rest[3] === '\t')
  ) {
    const checkbox = rest[1].toLowerCase() === 'x' ? '☑ ' : '☐ ';
    return { checkbox, body: rest.slice(4).trimStart() };
  }
  return { checkbox: '', body: rest };
}

function isHorizontalRuleLine(trimmed: string): boolean {
  let marker = '';
  let count = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === ' ' || ch === '\t') continue;
    if (ch === '-' || ch === '*' || ch === '_') {
      if (!marker) {
        marker = ch;
      } else if (marker !== ch) {
        return false;
      }
      count++;
    } else {
      return false;
    }
  }
  return count >= 3;
}

/**
 * Service handling bidirectional document import and export for MJ Docs (§ 4.4):
 * - `.md` (Markdown with lossless `:::mj-block` directives)
 * - `.docx` (Microsoft Word with design presets, Track Changes, Margin Comments, recoverable `:::mj-block` metadata, and import fidelity reports)
 * - `.pdf` (Themed printable Letter/A4 layout with clean or redline markup CSS)
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentImportExportService {
  /**
   * Runs a non-mutating preflight check before `.docx` or PDF export to surface broken media,
   * unresolved live blocks, unverified frozen snapshots, wide portrait tables, and pending markup.
   */
  public RunExportPreflight(
    markdown: string,
    options?: DocumentExportPreflightOptions,
  ): DocumentExportPreflightReport {
    const normalized = (markdown ?? '').replace(/\r\n?/g, '\n');
    const design = ExtractDocumentDesignConfig(normalized);
    const orientation: DocumentPageOrientation = options?.Orientation ?? design.Orientation;
    const stats = ComputeDocumentStats(normalized);
    const issues: ExportPreflightIssue[] = [];

    const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(normalized);
    const seenBlockIds = new Set<string>();
    let hasWideTable = false;

    for (const seg of segments) {
      if (seg.Type !== 'mj-block') {
        continue;
      }
      const spec = seg.BlockSpec;
      if (!spec) {
        issues.push({
          Severity: 'error',
          Code: 'malformed_mj_block',
          Message: `Malformed :::mj-block directive at line ${seg.StartLine} could not be parsed.`,
          Line: seg.StartLine,
        });
        continue;
      }
      if (spec.BlockID) {
        if (seenBlockIds.has(spec.BlockID)) {
          issues.push({
            Severity: 'warning',
            Code: 'duplicate_block_id',
            Message: `Duplicate block ID "${spec.BlockID}" at line ${seg.StartLine} may affect .docx round-trip recovery.`,
            Line: seg.StartLine,
            BlockID: spec.BlockID,
          });
        }
        seenBlockIds.add(spec.BlockID);
      }

      if (spec.Mode === 'Frozen') {
        const verified = options?.VerifyFrozenSnapshot
          ? options.VerifyFrozenSnapshot(spec)
          : ValidateFrozenBlockSnapshot(spec.FrozenSnapshot).Valid &&
            Boolean(spec.FrozenSnapshot?.SnapshotContentHash?.startsWith('hmac-sha256:'));
        if (!verified) {
          issues.push({
            Severity: 'warning',
            Code: 'unverified_frozen_snapshot',
            Message: `Frozen block "${spec.Title || spec.BlockID}" has an unverified or missing snapshot signature.`,
            Line: seg.StartLine,
            BlockID: spec.BlockID,
          });
        }
      } else if (options?.LiveBlockResults) {
        const exec = options.LiveBlockResults.get(spec.BlockID);
        if (exec && !exec.Success) {
          issues.push({
            Severity: 'error',
            Code: 'failed_live_block',
            Message: `Live block "${spec.Title || spec.BlockID}" failed to load (${exec.ErrorMessage || 'execution error'}).`,
            Line: seg.StartLine,
            BlockID: spec.BlockID,
          });
        }
      }
    }

    const { Body, EndLine } = ParseDocumentFrontmatter(normalized);
    const lines = Body.split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const docLine = EndLine + i + 1;
      if (trimmed.startsWith('```') || trimmed.startsWith(':::mj-block')) {
        inFence = !inFence;
        continue;
      }
      if (inFence && trimmed === ':::') {
        inFence = false;
        continue;
      }
      if (inFence) {
        continue;
      }

      // Linear image link scan: ![alt](url)
      let searchFrom = 0;
      while (searchFrom < trimmed.length) {
        const bang = trimmed.indexOf('![', searchFrom);
        if (bang < 0) break;
        const closeBracket = trimmed.indexOf('](', bang + 2);
        if (closeBracket < 0) break;
        const closeParen = trimmed.indexOf(')', closeBracket + 2);
        if (closeParen < 0) break;
        const rawUrl = trimmed.slice(closeBracket + 2, closeParen).trim();
        const lowerUrl = rawUrl.toLowerCase();
        if (!rawUrl) {
          issues.push({
            Severity: 'error',
            Code: 'empty_image_url',
            Message: `Image at line ${docLine} has an empty URL and will be omitted on export.`,
            Line: docLine,
          });
        } else if (
          !lowerUrl.startsWith('https://') &&
          !lowerUrl.startsWith('http://') &&
          !lowerUrl.startsWith('data:image/')
        ) {
          issues.push({
            Severity: 'error',
            Code: 'untrusted_or_relative_image_url',
            Message: `Image URL "${rawUrl.slice(0, 72)}" at line ${docLine} is relative or non-http(s) and may not render in exported files.`,
            Line: docLine,
          });
        }
        searchFrom = closeParen + 1;
      }

      // Wide table check (> 6 columns in portrait)
      if (
        trimmed.startsWith('|') &&
        trimmed.includes('|', 1) &&
        i + 1 < lines.length &&
        this.isMarkdownTableSeparatorLine(lines[i + 1].trim())
      ) {
        const colCount = this.splitEscapedPipeRow(trimmed).filter((c) => c.length > 0).length;
        if (colCount > 6 && orientation === 'portrait') {
          hasWideTable = true;
          issues.push({
            Severity: 'warning',
            Code: 'wide_table_portrait',
            Message: `Table at line ${docLine} has ${colCount} columns; portrait pages may wrap tightly (landscape recommended).`,
            Line: docLine,
          });
        }
      }
    }

    const pendingSuggestions = (options?.Suggestions ?? []).filter((s) => s.Status === 'Pending');
    const openComments = (options?.AnchoredThreads ?? []).filter((t) => t.Status === 'Open');

    if (pendingSuggestions.length > 0 || openComments.length > 0) {
      issues.push({
        Severity: 'info',
        Code: 'pending_review_markup',
        Message: `${pendingSuggestions.length} pending suggestion${pendingSuggestions.length === 1 ? '' : 's'} and ${openComments.length} open comment thread${openComments.length === 1 ? '' : 's'} — choose "With Markup" to preserve redlines & comments in Word/PDF, or "Clean Final" to omit them.`,
      });
    }

    const errorCount = issues.filter((i) => i.Severity === 'error').length;
    const warningCount = issues.filter((i) => i.Severity === 'warning').length;
    const infoCount = issues.filter((i) => i.Severity === 'info').length;

    return {
      Passed: errorCount === 0,
      StrictFailed: Boolean(options?.Strict && errorCount > 0),
      ErrorCount: errorCount,
      WarningCount: warningCount,
      InfoCount: infoCount,
      PendingSuggestionsCount: pendingSuggestions.length,
      OpenCommentsCount: openComments.length,
      RecommendedOrientation: hasWideTable ? 'landscape' : orientation,
      Stats: stats,
      Issues: issues,
    };
  }

  /**
   * Imports a `.md` file or raw string while preserving all `:::mj-block` directives.
   */
  public async ImportMarkdown(source: File | string): Promise<string> {
    const raw = typeof source === 'string' ? source : await source.text();
    return raw.replace(/\r\n/g, '\n');
  }

  /**
   * Converts `.docx` binary bytes to clean Markdown using `mammoth` + `turndown`,
   * automatically rehydrating any embedded `:::mj-block` metadata.
   */
  public async ConvertDocxBytesToMarkdown(
    arrayBuffer: ArrayBuffer,
    mammothOverride?: MammothModuleShim,
  ): Promise<string> {
    const result = await this.ConvertDocxBytesToMarkdownWithReport(arrayBuffer, 'document.docx', mammothOverride);
    return result.Markdown;
  }

  /**
   * Converts `.docx` binary bytes to Markdown AND returns a rich fidelity report,
   * restored `:::mj-block` directives, restored design preset config, and ingested
   * Word tracked changes (`DocumentSuggestionItem[]`) & comments (`DocumentAnchoredThread[]`).
   */
  public async ConvertDocxBytesToMarkdownWithReport(
    arrayBuffer: ArrayBuffer,
    fileName = 'document.docx',
    mammothOverride?: MammothModuleShim,
  ): Promise<DocxImportWithFidelityResult> {
    const inspection = await InspectDocxArchive(arrayBuffer).catch(() => ({
      MJBlocks: [] as DocumentBlockSpec[],
      DesignConfig: null as Partial<DocumentDesignConfig> | null,
      TrackedChanges: [],
      Comments: [],
      FootnotesCount: 0,
      EndnotesCount: 0,
      ChartsCount: 0,
      SmartArtCount: 0,
      TextBoxesCount: 0,
      FloatingDrawingsCount: 0,
      EmbeddedMediaCount: 0,
    }));

    const mammothModule = mammothOverride ?? (await loadMammothModule());
    const html = await ConvertDocxToHtml(arrayBuffer, mammothModule);
    const baseMarkdown = await this.ConvertHtmlToMarkdown(html);

    const rehydrated = RehydrateMjBlocksInMarkdown(baseMarkdown, inspection.MJBlocks);
    let finalMarkdown = rehydrated.Markdown;

    // Strip any exported watermark banner line if design preset carried a watermark
    if (inspection.DesignConfig?.Watermark) {
      const wmMarker = `[${inspection.DesignConfig.Watermark.toUpperCase()}]`;
      const mdLines = finalMarkdown.split('\n');
      if (mdLines.length > 0) {
        const normalizedFirstLine = mdLines[0]
          .trim()
          .replace(/\\([[\]])/g, '$1')
          .replace(/\*/g, '')
          .trim();
        if (normalizedFirstLine === wmMarker) {
          finalMarkdown = mdLines.slice(1).join('\n').trimStart();
        }
      }
    }

    if (inspection.DesignConfig) {
      finalMarkdown = ApplyDocumentDesignConfigToMarkdown(finalMarkdown, inspection.DesignConfig);
    }

    // Map Word tracked revisions into MJ Docs pending suggestions
    const importedSuggestions: DocumentSuggestionItem[] = inspection.TrackedChanges.map((tc, index) => ({
      SuggestionID: `docx-import-sug-${Date.now()}-${index + 1}`,
      BlockID: `docx-para-${index + 1}`,
      Quote: tc.ParagraphOriginalText.slice(0, 120),
      AuthorName: tc.Author,
      CreatedAt: tc.Date,
      OriginalMarkdown: tc.ParagraphOriginalText,
      ProposedMarkdown: tc.ParagraphProposedText,
      Rationale: 'Imported from Word Track Changes',
      Status: 'Pending',
    }));

    // Map Word margin comments into MJ Docs anchored comment threads
    const importedComments: DocumentAnchoredThread[] = inspection.Comments.map((c, index) => ({
      ConversationID: `docx-import-comment-${Date.now()}-${index + 1}`,
      AnchorKey: 'doc-root',
      AnchorLabel: c.QuotedText ? `Word Comment: "${c.QuotedText.slice(0, 48)}"` : 'Imported Word Comment',
      QuotedText: c.QuotedText,
      Status: 'Open',
      AgentMode: 'comment',
      CreatedAt: c.Date,
      Messages: [
        {
          DetailID: `docx-import-msg-${index + 1}`,
          UserName: c.Author,
          Role: 'User',
          Message: c.BodyText,
          CreatedAt: c.Date,
          Mentions: [],
        },
      ],
    }));

    const warnings: DocxImportFidelityWarning[] = [];
    if (inspection.FootnotesCount > 0) {
      warnings.push({
        Code: 'footnotes_flattened',
        Count: inspection.FootnotesCount,
        Message: `${inspection.FootnotesCount} footnote${inspection.FootnotesCount === 1 ? '' : 's'} flattened inline`,
      });
    }
    if (inspection.EndnotesCount > 0) {
      warnings.push({
        Code: 'endnotes_flattened',
        Count: inspection.EndnotesCount,
        Message: `${inspection.EndnotesCount} endnote${inspection.EndnotesCount === 1 ? '' : 's'} flattened inline`,
      });
    }
    if (inspection.ChartsCount > 0) {
      warnings.push({
        Code: 'charts_omitted',
        Count: inspection.ChartsCount,
        Message: `${inspection.ChartsCount} native Word chart${inspection.ChartsCount === 1 ? '' : 's'} omitted`,
      });
    }
    if (inspection.SmartArtCount > 0) {
      warnings.push({
        Code: 'smartart_omitted',
        Count: inspection.SmartArtCount,
        Message: `${inspection.SmartArtCount} SmartArt diagram${inspection.SmartArtCount === 1 ? '' : 's'} omitted`,
      });
    }
    if (inspection.TextBoxesCount > 0) {
      warnings.push({
        Code: 'textboxes_flattened',
        Count: inspection.TextBoxesCount,
        Message: `${inspection.TextBoxesCount} text box${inspection.TextBoxesCount === 1 ? '' : 'es'} flattened`,
      });
    }
    if (inspection.FloatingDrawingsCount > 0) {
      warnings.push({
        Code: 'floating_layout_simplified',
        Count: inspection.FloatingDrawingsCount,
        Message: `${inspection.FloatingDrawingsCount} floating graphic${inspection.FloatingDrawingsCount === 1 ? '' : 's'} placed inline`,
      });
    }

    const mdStats = ComputeDocumentStats(finalMarkdown);
    const tableLinesCount = finalMarkdown
      .split('\n')
      .filter((l, idx, arr) => l.trim().startsWith('|') && idx + 1 < arr.length && this.isMarkdownTableSeparatorLine(arr[idx + 1].trim())).length;

    const summaryParts: string[] = [];
    summaryParts.push(`${mdStats.HeadingCount} heading${mdStats.HeadingCount === 1 ? '' : 's'}`);
    if (tableLinesCount > 0) {
      summaryParts.push(`${tableLinesCount} table${tableLinesCount === 1 ? '' : 's'}`);
    }
    if (rehydrated.RestoredCount > 0) {
      summaryParts.push(
        `${rehydrated.RestoredCount} live MJ block${rehydrated.RestoredCount === 1 ? '' : 's'} restored`,
      );
    }
    if (importedSuggestions.length > 0) {
      summaryParts.push(
        `${importedSuggestions.length} Word tracked change${importedSuggestions.length === 1 ? '' : 's'} → Suggestions`,
      );
    }
    if (importedComments.length > 0) {
      summaryParts.push(
        `${importedComments.length} Word comment${importedComments.length === 1 ? '' : 's'} imported`,
      );
    }
    if (inspection.DesignConfig?.PresetID) {
      summaryParts.push(`preset "${GetDocumentDesignPreset(inspection.DesignConfig.PresetID).Name}" restored`);
    }
    const warningClause = warnings.length > 0 ? ` · Note: ${warnings.map((w) => w.Message).join(', ')}` : '';
    const summaryText = `Imported "${fileName}": ${summaryParts.join(', ')}${warningClause}.`;

    return {
      Markdown: finalMarkdown,
      Report: {
        FileName: fileName,
        HeadingsCount: mdStats.HeadingCount,
        TablesCount: tableLinesCount,
        RestoredMjBlocksCount: rehydrated.RestoredCount,
        ImportedTrackedChangesCount: importedSuggestions.length,
        ImportedCommentsCount: importedComments.length,
        RestoredDesignPresetID: inspection.DesignConfig?.PresetID ?? null,
        Warnings: warnings,
        SummaryText: summaryText,
      },
      ImportedSuggestions: importedSuggestions,
      ImportedComments: importedComments,
      RestoredDesignConfig: inspection.DesignConfig,
    };
  }

  /**
   * Converts sanitized or raw HTML into GFM-compatible Markdown, preserving headings,
   * lists, emphasis, code blocks, blockquotes, and HTML tables.
   */
  public async ConvertHtmlToMarkdown(html: string): Promise<string> {
    const TurndownCtor = await loadTurndownService();
    const turndown = new TurndownCtor({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    turndown.addRule('htmlTable', {
      filter: 'table',
      replacement: (_content: string, node: Node): string => {
        const tableEl = node as HTMLElement;
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        if (rows.length === 0) {
          return '';
        }
        const matrix: string[][] = rows.map((tr) =>
          Array.from(tr.querySelectorAll('th, td')).map((cell) =>
            (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|'),
          ),
        );
        const colCount = Math.max(...matrix.map((r) => r.length), 1);
        const normalizeRow = (r: string[]): string => {
          const padded = [...r];
          while (padded.length < colCount) {
            padded.push('');
          }
          return `| ${padded.join(' | ')} |`;
        };
        const headerLine = normalizeRow(matrix[0]);
        const dividerLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
        const bodyLines = matrix.slice(1).map(normalizeRow);
        return `\n\n${[headerLine, dividerLine, ...bodyLines].join('\n')}\n\n`;
      },
    });

    return turndown.turndown(html).trim();
  }

  /**
   * Imports a `.docx` file selected by the user and returns its Markdown representation.
   */
  public async ImportDocxFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return this.ConvertDocxBytesToMarkdown(buffer);
  }

  /**
   * Imports a `.docx` file selected by the user with full fidelity report, restored `:::mj-block`s,
   * Word tracked changes, and Word comments.
   */
  public async ImportDocxFileWithReport(file: File): Promise<DocxImportWithFidelityResult> {
    const buffer = await file.arrayBuffer();
    return this.ConvertDocxBytesToMarkdownWithReport(buffer, file.name);
  }

  /**
   * Exports a Markdown document (including `:::mj-block` directives, design preset styling,
   * optional native Word Track Changes & Comments, and recoverable `:::mj-block` metadata) into `.docx` bytes.
   */
  public async ConvertMarkdownToDocxBytes(
    markdown: string,
    title = 'Document',
    options?: DocxExportOptions,
  ): Promise<Uint8Array> {
    const normalizedMarkdown = (markdown ?? '').replace(/\r\n?/g, '\n');
    const baseDesign = ExtractDocumentDesignConfig(normalizedMarkdown);
    const designConfig: DocumentDesignConfig = {
      ...baseDesign,
      ...(options?.DesignConfig ?? {}),
    };
    const preset = GetDocumentDesignPreset(designConfig.PresetID);
    const exportMode: DocExportMode = options?.ExportMode ?? 'clean';
    const embedMetadata = options?.EmbedLiveBlockMetadata !== false;

    if (options?.Strict) {
      const preflight = this.RunExportPreflight(normalizedMarkdown, {
        LiveBlockResults: options.LiveBlockResults,
        VerifyFrozenSnapshot: options.VerifyFrozenSnapshot,
        Suggestions: options.Suggestions,
        AnchoredThreads: options.AnchoredThreads,
        Orientation: designConfig.Orientation,
        Strict: true,
      });
      if (preflight.StrictFailed) {
        const errorSummary = preflight.Issues.filter((i) => i.Severity === 'error')
          .map((i) => i.Message)
          .join('; ');
        throw new Error(`Strict export preflight failed (${preflight.ErrorCount} error(s)): ${errorSummary}`);
      }
    }

    const docx = await loadDocxModule();
    const {
      AlignmentType,
      BorderStyle,
      CommentRangeEnd,
      CommentRangeStart,
      CommentReference,
      DeletedTextRun,
      Document: DocxDocument,
      Footer,
      Header,
      ImageRun,
      InsertedTextRun,
      Packer,
      PageNumber,
      PageOrientation,
      Paragraph,
      ShadingType,
      TextRun,
    } = docx;

    const parsedFm = ParseDocumentFrontmatter(normalizedMarkdown);
    const bodyMarkdown = parsedFm.Body;
    const lines = bodyMarkdown.split('\n');
    const parsedSegments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(bodyMarkdown);
    const blockByStartLine = new Map(
      parsedSegments.filter((s) => s.Type === 'mj-block' && s.BlockSpec).map((s) => [s.StartLine, s]),
    );
    const exportedBlocks: DocumentBlockSpec[] = [];

    // Prepare pending suggestions and open comments when exporting in 'markup' mode
    const pendingSuggestions =
      exportMode === 'markup'
        ? (options?.Suggestions ?? []).filter((s) => s.Status === 'Pending')
        : [];
    const matchedSuggestionIds = new Set<string>();
    let revisionSeq = 1;

    const openThreads =
      exportMode === 'markup'
        ? (options?.AnchoredThreads ?? []).filter((t) => t.Status === 'Open' && t.Messages.length > 0)
        : [];
    const commentDefs: Array<{
      id: number;
      author: string;
      date: Date;
      thread: DocumentAnchoredThread;
      matched: boolean;
    }> = openThreads.map((thread, idx) => {
      const firstMsg = thread.Messages[0];
      const parsedDate = new Date(firstMsg?.CreatedAt || thread.CreatedAt);
      return {
        id: idx + 1,
        author: firstMsg?.UserName || 'Reviewer',
        date: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
        thread,
        matched: false,
      };
    });

    const buildSuggestionTrackedRuns = (
      rawLine: string,
      sug: DocumentSuggestionItem,
    ): Array<DocxModule.ParagraphChild> => {
      const origNorm = normalizeForMatch(sug.OriginalMarkdown);
      const propNorm = normalizeForMatch(sug.ProposedMarkdown);
      const origTokens = tokenizeWordsForDiff(origNorm);
      const propTokens = tokenizeWordsForDiff(propNorm);
      const diffOps = ComputeBoundedSequenceDiff(
        origTokens,
        propTokens,
        (a, b) => a === b,
        (s) => s,
      );
      const runs: Array<DocxModule.ParagraphChild> = [];
      const dateStr = sug.CreatedAt || new Date().toISOString();
      const author = sug.AuthorName || 'MJ Reviewer';

      if (diffOps.length === 0) {
        return this.parseInlineTextRuns(docx, rawLine, preset.BodyFont, preset.BodyFontSizePt);
      }

      // Coalesce adjacent equal/delete/insert spans for clean Word Track Changes output
      const coalesced: Array<{ kind: 'equal' | 'delete' | 'insert'; text: string }> = [];
      for (const op of diffOps) {
        const text = op.Kind === 'insert' ? (propTokens[op.NewIndex] ?? '') : (origTokens[op.OldIndex] ?? '');
        if (!text) continue;
        const prev = coalesced[coalesced.length - 1];
        if (prev && prev.kind === op.Kind) {
          prev.text += text;
        } else {
          coalesced.push({ kind: op.Kind, text });
        }
      }

      for (const span of coalesced) {
        if (span.kind === 'equal') {
          runs.push(
            new TextRun({
              text: span.text,
              font: preset.BodyFont,
              size: Math.round(preset.BodyFontSizePt * 2),
            }),
          );
        } else if (span.kind === 'delete') {
          runs.push(
            new DeletedTextRun({
              id: revisionSeq++,
              text: span.text,
              author,
              date: dateStr,
              font: preset.BodyFont,
              size: Math.round(preset.BodyFontSizePt * 2),
            }),
          );
        } else if (span.kind === 'insert') {
          runs.push(
            new InsertedTextRun({
              id: revisionSeq++,
              text: span.text,
              author,
              date: dateStr,
              font: preset.BodyFont,
              size: Math.round(preset.BodyFontSizePt * 2),
            }),
          );
        }
      }
      return runs;
    };

    const wrapWithMatchingComments = (
      plainLine: string,
      runs: Array<DocxModule.ParagraphChild>,
    ): Array<DocxModule.ParagraphChild> => {
      if (commentDefs.length === 0) {
        return runs;
      }
      const normLine = normalizeForMatch(plainLine).toLowerCase();
      if (!normLine) {
        return runs;
      }
      const matchedIds: number[] = [];
      for (const c of commentDefs) {
        if (c.matched) continue;
        const quote = normalizeForMatch(c.thread.QuotedText).toLowerCase();
        const label = normalizeForMatch(c.thread.AnchorLabel).toLowerCase();
        if (
          (quote.length >= 4 && (normLine.includes(quote) || quote.includes(normLine))) ||
          (label.length >= 4 && normLine.includes(label))
        ) {
          c.matched = true;
          matchedIds.push(c.id);
        }
      }
      if (matchedIds.length === 0) {
        return runs;
      }
      const starts = matchedIds.map((id) => new CommentRangeStart(id));
      const ends = matchedIds.flatMap((id) => [new CommentRangeEnd(id), new CommentReference(id)]);
      return [...starts, ...runs, ...ends];
    };

    const findMatchingSuggestion = (lineText: string): DocumentSuggestionItem | null => {
      if (pendingSuggestions.length === 0) {
        return null;
      }
      const normLine = normalizeForMatch(lineText);
      if (!normLine) {
        return null;
      }
      for (const sug of pendingSuggestions) {
        if (matchedSuggestionIds.has(sug.SuggestionID)) {
          continue;
        }
        const origNorm = normalizeForMatch(sug.OriginalMarkdown);
        if (origNorm && (origNorm === normLine || origNorm.includes(normLine) || normLine.includes(origNorm))) {
          matchedSuggestionIds.add(sug.SuggestionID);
          return sug;
        }
      }
      return null;
    };

    const children: Array<DocxModule.Paragraph | DocxModule.Table> = [];

    // Optional watermark banner at top of document body when specified
    if (designConfig.Watermark) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: `[${designConfig.Watermark.toUpperCase()}]`,
              bold: true,
              color: preset.AccentHex,
              font: preset.HeadingFont,
              size: 18,
            }),
          ],
          spacing: { after: 140 },
        }),
      );
    }

    let lineIdx = 0;
    while (lineIdx < lines.length) {
      const oneBasedLine = lineIdx + 1;
      const blockSeg = blockByStartLine.get(oneBasedLine);
      if (blockSeg && blockSeg.BlockSpec) {
        const block = blockSeg.BlockSpec;
        exportedBlocks.push(block);
        const isFrozen = block.Mode === 'Frozen';
        const isFrozenVerified = isFrozen
          ? options?.VerifyFrozenSnapshot
            ? options.VerifyFrozenSnapshot(block)
            : ValidateFrozenBlockSnapshot(block.FrozenSnapshot).Valid &&
              Boolean(block.FrozenSnapshot?.SnapshotContentHash?.startsWith('hmac-sha256:'))
          : false;
        const frozenAttribution =
          isFrozenVerified && (block.FrozenSnapshot?.FrozenByUserName || block.FrozenSnapshot?.FrozenByUserID)
            ? ` by ${block.FrozenSnapshot?.FrozenByUserName || block.FrozenSnapshot?.FrozenByUserID}`
            : '';
        const modeText = isFrozen
          ? isFrozenVerified
            ? `Frozen snapshot (${block.FrozenSnapshot?.FrozenAt ?? 'recorded'}${frozenAttribution})`
            : `Frozen snapshot (${block.FrozenSnapshot?.FrozenAt ?? 'recorded'}) — Unverified Snapshot (signature missing or invalid)`
          : 'Live MJ Block';
        const markerSuffix = embedMetadata ? ` [${MJ_DOCX_BLOCK_MARKER_PREFIX}${block.BlockID}]` : '';
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[MJ ${block.Kind} Block: ${block.Title ?? block.EntityName ?? block.QueryName ?? block.ArtifactType ?? block.BlockID}] (${modeText})${markerSuffix}`,
                bold: true,
                color: preset.PrimaryHex,
                font: preset.HeadingFont,
                size: Math.round(preset.BodyFontSizePt * 2),
              }),
            ],
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: preset.CalloutBgHex,
            },
            spacing: { before: 160, after: 80 },
          }),
        );
        if (IsVisualDiagramOrChartBlock(block)) {
          let pngBytes = (await options?.RasterizeBlockToPng?.(block)) ?? null;
          if (!pngBytes || pngBytes.byteLength === 0) {
            pngBytes = RasterizeBlockDiagramToPng(block);
          }
          if (pngBytes && pngBytes.byteLength > 0 && ImageRun) {
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    type: 'png',
                    data: pngBytes,
                    transformation: { width: 520, height: 260 },
                  }),
                ],
                spacing: { before: 80, after: 120 },
              }),
            );
          }
        }
        const liveExecResult = !isFrozen ? options?.LiveBlockResults?.get(block.BlockID) : undefined;
        if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
          const colNames = block.FrozenSnapshot.Columns.map((c) => c.Name);
          children.push(this.buildDocxTable(docx, colNames, block.FrozenSnapshot.Rows, preset));
        } else if (
          liveExecResult?.Success &&
          liveExecResult.Columns.length > 0 &&
          liveExecResult.Rows.length > 0
        ) {
          const colNames = liveExecResult.Columns.map((c) => c.Name);
          children.push(this.buildDocxTable(docx, colNames, liveExecResult.Rows, preset));
        }
        lineIdx = blockSeg.EndLine;
        continue;
      }

      const line = lines[lineIdx];
      const trimmed = line.trim();

      if (trimmed.length === 0 || (trimmed.startsWith('<!--') && trimmed.endsWith('-->'))) {
        lineIdx++;
        continue;
      }

      // Horizontal rule
      if (isHorizontalRuleLine(trimmed)) {
        children.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: preset.MutedHex, space: 4 },
            },
            children: [],
            spacing: { before: 120, after: 120 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Heading
      if (isMarkdownHeadingLine(trimmed)) {
        let level = 0;
        while (level < trimmed.length && level < 6 && trimmed[level] === '#') {
          level++;
        }
        const text = StripDocRecordLinksToPlainText(trimmed.slice(level).trim());
        const matchedSug = findMatchingSuggestion(trimmed);
        const baseRuns = matchedSug
          ? buildSuggestionTrackedRuns(text, matchedSug)
          : this.parseInlineTextRuns(docx, text, preset.HeadingFont, level === 1 ? 18 : level === 2 ? 14 : 12, preset.PrimaryHex);
        const runs = wrapWithMatchingComments(text, baseRuns);
        children.push(
          new Paragraph({
            children: runs,
            heading: this.mapHeadingLevel(docx, level),
            border:
              preset.HeadingUnderline && level <= 2
                ? { bottom: { style: BorderStyle.SINGLE, size: level === 1 ? 8 : 4, color: preset.AccentHex, space: 4 } }
                : undefined,
            spacing: { before: level === 1 ? 260 : 200, after: 100 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Markdown table
      if (
        trimmed.startsWith('|') &&
        trimmed.includes('|', 1) &&
        (trimmed.endsWith('|') ||
          (lineIdx + 1 < lines.length &&
            this.isMarkdownTableSeparatorLine(lines[lineIdx + 1].trim())))
      ) {
        const tableLines: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].trim().startsWith('|')) {
          tableLines.push(lines[lineIdx].trim());
          lineIdx++;
        }
        const parsedTable = this.parseMarkdownTableLines(tableLines);
        if (parsedTable.headers.length > 0) {
          children.push(this.buildDocxTableFromCells(docx, parsedTable.headers, parsedTable.rows, preset));
        }
        continue;
      }

      // Fenced code block
      if (trimmed.startsWith('```')) {
        const codeLines: string[] = [];
        lineIdx++;
        while (lineIdx < lines.length && !lines[lineIdx].trim().startsWith('```')) {
          codeLines.push(lines[lineIdx]);
          lineIdx++;
        }
        if (lineIdx < lines.length) {
          lineIdx++;
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeLines.join('\n'),
                font: 'Courier New',
                size: 19,
              }),
            ],
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: preset.TableStripeBgHex,
            },
            spacing: { before: 120, after: 120 },
          }),
        );
        continue;
      }

      // Bullet / task list
      const bulletParsed = parseBulletListLine(trimmed);
      if (bulletParsed) {
        const plain = StripDocRecordLinksToPlainText(`${bulletParsed.checkbox}${bulletParsed.body}`);
        const matchedSug = findMatchingSuggestion(trimmed);
        const baseRuns = matchedSug
          ? buildSuggestionTrackedRuns(plain, matchedSug)
          : this.parseInlineTextRuns(docx, plain, preset.BodyFont, preset.BodyFontSizePt);
        children.push(
          new Paragraph({
            children: wrapWithMatchingComments(plain, baseRuns),
            bullet: { level: 0 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Ordered list
      const orderedParsed = parseOrderedListPrefix(trimmed);
      if (orderedParsed) {
        const plainBody = StripDocRecordLinksToPlainText(orderedParsed.body);
        const matchedSug = findMatchingSuggestion(trimmed);
        const baseRuns = matchedSug
          ? buildSuggestionTrackedRuns(plainBody, matchedSug)
          : [
              new TextRun({
                text: `${orderedParsed.prefix}. `,
                bold: true,
                font: preset.BodyFont,
                size: Math.round(preset.BodyFontSizePt * 2),
              }),
              ...this.parseInlineTextRuns(docx, plainBody, preset.BodyFont, preset.BodyFontSizePt),
            ];
        children.push(
          new Paragraph({
            children: wrapWithMatchingComments(plainBody, baseRuns),
            indent: { left: 360 },
            spacing: { after: 60 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Blockquote / callout
      if (trimmed.startsWith('>')) {
        const quoteText = StripDocRecordLinksToPlainText(trimmed.slice(1).trimStart());
        children.push(
          new Paragraph({
            children: wrapWithMatchingComments(
              quoteText,
              this.parseInlineTextRuns(docx, quoteText, preset.BodyFont, preset.BodyFontSizePt),
            ),
            indent: { left: 360 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: preset.AccentHex, space: 10 },
            },
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: preset.CalloutBgHex,
            },
            spacing: { before: 100, after: 100 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Standard paragraph
      const plainPara = StripDocRecordLinksToPlainText(trimmed);
      const matchedSug = findMatchingSuggestion(trimmed);
      const baseRuns = matchedSug
        ? buildSuggestionTrackedRuns(plainPara, matchedSug)
        : this.parseInlineTextRuns(docx, plainPara, preset.BodyFont, preset.BodyFontSizePt);
      children.push(
        new Paragraph({
          children: wrapWithMatchingComments(plainPara, baseRuns),
          spacing: { after: 120, line: Math.round(preset.LineHeight * 240) },
        }),
      );
      lineIdx++;
    }

    // Append any unmatched pending suggestions in markup mode so none are silently dropped
    const unmatchedSuggestions = pendingSuggestions.filter((s) => !matchedSuggestionIds.has(s.SuggestionID));
    if (unmatchedSuggestions.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Pending Tracked Suggestions',
              bold: true,
              color: preset.PrimaryHex,
              font: preset.HeadingFont,
              size: 26,
            }),
          ],
          spacing: { before: 240, after: 100 },
        }),
      );
      for (const sug of unmatchedSuggestions) {
        children.push(
          new Paragraph({
            children: buildSuggestionTrackedRuns(sug.OriginalMarkdown, sug),
            spacing: { after: 100 },
          }),
        );
      }
    }

    // Attach any unmatched document-level comments onto the first paragraph so Word displays them in the margin
    const unmatchedComments = commentDefs.filter((c) => !c.matched);
    if (unmatchedComments.length > 0) {
      const anchorRuns: Array<DocxModule.ParagraphChild> = [
        ...unmatchedComments.map((c) => new CommentRangeStart(c.id)),
        new TextRun({
          text: `${title} — Review Notes`,
          italics: true,
          color: preset.MutedHex,
          font: preset.BodyFont,
          size: 18,
        }),
        ...unmatchedComments.flatMap((c) => [new CommentRangeEnd(c.id), new CommentReference(c.id)]),
      ];
      children.push(
        new Paragraph({
          children: anchorRuns,
          spacing: { before: 140, after: 80 },
        }),
      );
    }

    const customProperties: Array<{ name: string; value: string }> = [];
    if (embedMetadata) {
      customProperties.push({
        name: MJ_DOCX_CUSTOM_PROP_DESIGN,
        value: JSON.stringify(designConfig),
      });
      if (exportedBlocks.length > 0) {
        customProperties.push({
          name: MJ_DOCX_CUSTOM_PROP_BLOCKS,
          value: JSON.stringify(exportedBlocks),
        });
      }
    }

    const marginTwips = Math.round((preset.MarginMm / 25.4) * 1440);
    const pageWidthTwips = designConfig.PageSize === 'a4' ? 11906 : 12240;
    const pageHeightTwips = designConfig.PageSize === 'a4' ? 16838 : 15840;
    const headerText = designConfig.RunningHeader || (preset.ShowRunningHeader ? title : '');
    const footerPrefix = designConfig.RunningFooter ? `${designConfig.RunningFooter}   ·   ` : '';

    const doc = new DocxDocument({
      title,
      customProperties: customProperties.length > 0 ? customProperties : undefined,
      comments:
        commentDefs.length > 0
          ? {
              children: commentDefs.map((c) => ({
                id: c.id,
                author: c.author,
                date: c.date,
                children: c.thread.Messages.map(
                  (msg) =>
                    new Paragraph({
                      children: [
                        new TextRun({
                          text:
                            c.thread.Messages.length > 1
                              ? `${msg.UserName}: ${msg.Message}`
                              : msg.Message,
                          font: preset.BodyFont,
                          size: 18,
                        }),
                      ],
                    }),
                ),
              })),
            }
          : undefined,
      sections: [
        {
          properties: {
            page: {
              size: {
                width: pageWidthTwips,
                height: pageHeightTwips,
                orientation:
                  designConfig.Orientation === 'landscape'
                    ? PageOrientation.LANDSCAPE
                    : PageOrientation.PORTRAIT,
              },
              margin: {
                top: marginTwips,
                right: marginTwips,
                bottom: marginTwips,
                left: marginTwips,
              },
            },
          },
          headers: headerText
            ? {
                default: new Header({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new TextRun({
                          text: headerText,
                          color: preset.MutedHex,
                          font: preset.BodyFont,
                          size: 18,
                        }),
                      ],
                    }),
                  ],
                }),
              }
            : undefined,
          footers:
            designConfig.ShowPageNumbers || designConfig.RunningFooter
              ? {
                  default: new Footer({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          ...(footerPrefix
                            ? [
                                new TextRun({
                                  text: footerPrefix,
                                  color: preset.MutedHex,
                                  font: preset.BodyFont,
                                  size: 18,
                                }),
                              ]
                            : []),
                          ...(designConfig.ShowPageNumbers
                            ? [
                                new TextRun({
                                  text: 'Page ',
                                  color: preset.MutedHex,
                                  font: preset.BodyFont,
                                  size: 18,
                                }),
                                new TextRun({
                                  children: [PageNumber.CURRENT],
                                  color: preset.MutedHex,
                                  font: preset.BodyFont,
                                  size: 18,
                                }),
                                new TextRun({
                                  text: ' of ',
                                  color: preset.MutedHex,
                                  font: preset.BodyFont,
                                  size: 18,
                                }),
                                new TextRun({
                                  children: [PageNumber.TOTAL_PAGES],
                                  color: preset.MutedHex,
                                  font: preset.BodyFont,
                                  size: 18,
                                }),
                              ]
                            : []),
                        ],
                      }),
                    ],
                  }),
                }
              : undefined,
          children: children.length > 0 ? children : [new Paragraph({ text: '' })],
        },
      ],
    });

    return new Uint8Array(await Packer.toArrayBuffer(doc));
  }

  /**
   * Triggers a browser download of the Markdown document as a `.md` file.
   */
  public DownloadMarkdownFile(markdown: string, fileName = 'document.md'): void {
    const normalizedName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    this.triggerBlobDownload(blob, normalizedName);
  }

  /**
   * Generates a `.docx` file from the Markdown document and triggers a browser download.
   */
  public async DownloadDocxFile(
    markdown: string,
    fileName = 'document.docx',
    title = 'Document',
    options?: DocxExportOptions,
  ): Promise<void> {
    const normalizedName = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
    const bytes = await this.ConvertMarkdownToDocxBytes(markdown, title, options);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    this.triggerBlobDownload(blob, normalizedName);
  }

  /**
   * Builds trusted print stylesheet CSS synchronized with the document's active design preset,
   * page size, orientation, watermark, and clean-vs-markup redline styling.
   */
  public BuildPrintablePdfCss(
    designConfig: DocumentDesignConfig,
    exportMode: DocExportMode = 'clean',
  ): string {
    const preset = GetDocumentDesignPreset(designConfig.PresetID);
    const safeOrientation: 'landscape' | 'portrait' =
      designConfig.Orientation === 'landscape' ? 'landscape' : 'portrait';
    const safePageSize = designConfig.PageSize === 'a4' ? 'A4' : 'letter';
    const headingBorder = preset.HeadingUnderline
      ? `border-bottom: 1.5px solid #${preset.AccentHex}; padding-bottom: 4px;`
      : '';

    const rules: string[] = [
      `@page { size: ${safePageSize} ${safeOrientation}; margin: ${preset.MarginMm}mm; }`,
      `body { font-family: ${preset.BodyFont}; line-height: ${preset.LineHeight}; font-size: ${preset.BodyFontSizePt}pt; color: #111827; margin: 0; }`,
      `h1, h2, h3, h4 { font-family: ${preset.HeadingFont}; color: #${preset.PrimaryHex}; margin-top: 1.35em; margin-bottom: 0.45em; font-weight: 700; page-break-after: avoid; }`,
      `h1 { font-size: 1.8em; ${headingBorder} }`,
      `h2 { font-size: 1.35em; ${headingBorder} }`,
      'table { border-collapse: collapse; width: 100%; margin: 12px 0; page-break-inside: auto; }',
      'tr { page-break-inside: avoid; }',
      `th, td { border: 1px solid rgba(15, 23, 42, 0.2); padding: 6px 10px; text-align: left; }`,
      `th { background: #${preset.TableHeaderBgHex}; color: #${preset.PrimaryHex}; font-weight: 600; }`,
      `tbody tr:nth-child(even) td { background: #${preset.TableStripeBgHex}; }`,
      `pre, code { font-family: ${preset.MonoFont}; background: #${preset.TableStripeBgHex}; border-radius: 4px; }`,
      'pre { padding: 10px 12px; overflow-x: auto; border: 1px solid rgba(15, 23, 42, 0.12); }',
      `blockquote { border-left: 3.5px solid #${preset.AccentHex}; margin: 12px 0; padding: 8px 14px; background: #${preset.CalloutBgHex}; }`,
      `.mj-print-header { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: #${preset.MutedHex}; border-bottom: 1px solid rgba(15, 23, 42, 0.14); padding-bottom: 6px; margin-bottom: 14px; }`,
      `.mj-print-watermark { display: inline-block; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #${preset.AccentHex}; border: 1px solid #${preset.AccentHex}; border-radius: 4px; padding: 1px 6px; }`,
      `.mj-print-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid rgba(15, 23, 42, 0.14); font-size: 8.5pt; color: #${preset.MutedHex}; display: flex; justify-content: space-between; }`,
      '.mj-print-block { border: 1px solid rgba(15, 23, 42, 0.16); border-radius: 6px; padding: 10px 14px; margin: 12px 0; page-break-inside: avoid; }',
    ];

    if (exportMode === 'markup') {
      rules.push(
        'ins.mj-print-ins { background: #dcfce7; color: #166534; text-decoration: underline; padding: 0 2px; border-radius: 2px; }',
        'del.mj-print-del { background: #fee2e2; color: #991b1b; text-decoration: line-through; padding: 0 2px; border-radius: 2px; }',
        `.mj-print-markup-meta { font-size: 8.5pt; color: #${preset.MutedHex}; margin: 2px 0 8px; }`,
        `.mj-print-comments-section { margin-top: 24px; padding-top: 12px; border-top: 1.5px solid #${preset.AccentHex}; }`,
        `.mj-print-comment-card { background: #${preset.CalloutBgHex}; border-left: 3px solid #${preset.AccentHex}; padding: 8px 12px; margin: 8px 0; border-radius: 4px; page-break-inside: avoid; }`,
      );
    }

    return rules.join('\n');
  }

  /**
   * Prints a sanitized HTML document inside an isolated `<iframe sandbox="allow-modals">`
   * with strict CSP metadata, preset-aligned print CSS, and escaped title (P0-19).
   */
  public ExportPrintablePdf(
    renderedHtml: string,
    title: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
    options?: PrintablePdfExportOptions,
  ): void {
    if (typeof document === 'undefined') {
      return;
    }
    const baseDesign = ExtractDocumentDesignConfig(options?.MarkdownSource ?? '');
    const defaultPageSize = options?.MarkdownSource || options?.DesignConfig?.PageSize ? baseDesign.PageSize : 'a4';
    const designConfig: DocumentDesignConfig = {
      ...baseDesign,
      PageSize: defaultPageSize,
      Orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
      ...(options?.DesignConfig ?? {}),
    };
    const exportMode: DocExportMode = options?.ExportMode ?? 'clean';
    const sanitizedBody = sanitizePrintableHtmlFragment(renderedHtml);
    const trustedPrintCss = this.BuildPrintablePdfCss(designConfig, exportMode);

    PrintHtmlInSandboxedIframe(sanitizedBody, {
      Title: title || 'Document',
      TrustedPrintCss: trustedPrintCss,
      DocumentRef: document,
    });
  }

  private mapHeadingLevel(
    docx: typeof DocxModule,
    level: number,
  ): (typeof DocxModule.HeadingLevel)[keyof typeof DocxModule.HeadingLevel] {
    const { HeadingLevel } = docx;
    switch (level) {
      case 1:
        return HeadingLevel.HEADING_1;
      case 2:
        return HeadingLevel.HEADING_2;
      case 3:
        return HeadingLevel.HEADING_3;
      case 4:
        return HeadingLevel.HEADING_4;
      case 5:
        return HeadingLevel.HEADING_5;
      default:
        return HeadingLevel.HEADING_6;
    }
  }

  private parseInlineTextRuns(
    docx: typeof DocxModule,
    text: string,
    fontFamily?: string,
    fontSizePt = 11,
    colorHex?: string,
  ): Array<DocxModule.TextRun | DocxModule.ExternalHyperlink> {
    const { TextRun, ExternalHyperlink } = docx;
    const runs: Array<DocxModule.TextRun | DocxModule.ExternalHyperlink> = [];
    const sizeHalfPt = Math.round(fontSizePt * 2);
    const baseRunOpts = {
      ...(fontFamily ? { font: fontFamily } : {}),
      size: sizeHalfPt,
      ...(colorHex ? { color: colorHex } : {}),
    };
    const tokenRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun({ text: text.slice(lastIndex, match.index), ...baseRunOpts }));
      }
      if (match[2] !== undefined) {
        runs.push(new TextRun({ text: match[2], bold: true, ...baseRunOpts }));
      } else if (match[3] !== undefined) {
        runs.push(new TextRun({ text: match[3], italics: true, ...baseRunOpts }));
      } else if (match[4] !== undefined) {
        runs.push(new TextRun({ text: match[4], strike: true, ...baseRunOpts }));
      } else if (match[5] !== undefined) {
        runs.push(new TextRun({ text: match[5], font: 'Courier New', size: Math.max(18, sizeHalfPt - 2) }));
      } else if (match[6] !== undefined && match[7] !== undefined && ExternalHyperlink) {
        runs.push(
          new ExternalHyperlink({
            link: match[7],
            children: [new TextRun({ text: match[6], style: 'Hyperlink', ...baseRunOpts })],
          }),
        );
      } else if (match[6] !== undefined) {
        runs.push(new TextRun({ text: match[6], ...baseRunOpts }));
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      runs.push(new TextRun({ text: text.slice(lastIndex), ...baseRunOpts }));
    }
    return runs.length > 0 ? runs : [new TextRun({ text, ...baseRunOpts })];
  }

  private isMarkdownTableSeparatorLine(line: string): boolean {
    const cells = this.splitEscapedPipeRow(line);
    return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  }

  private splitEscapedPipeRow(line: string): string[] {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
      trimmed = trimmed.slice(0, -1);
    }
    const cells: string[] = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
        current += '|';
        i++;
        continue;
      }
      if (ch === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }

  private parseMarkdownTableLines(lines: string[]): { headers: string[]; rows: string[][] } {
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = this.splitEscapedPipeRow(lines[0]);
    const bodyStart = lines.length > 1 && this.isMarkdownTableSeparatorLine(lines[1]) ? 2 : 1;
    const rows = lines.slice(bodyStart).map((line) => this.splitEscapedPipeRow(line));
    return { headers, rows };
  }

  private buildDocxTable(
    docx: typeof DocxModule,
    columns: string[],
    rows: NonNullable<DocumentBlockSpec['FrozenSnapshot']>['Rows'],
    preset: ReturnType<typeof GetDocumentDesignPreset>,
  ): DocxModule.Table {
    const cellMatrix = rows.map((r) => columns.map((col) => (r[col] == null ? '' : String(r[col]))));
    return this.buildDocxTableFromCells(docx, columns, cellMatrix, preset);
  }

  private buildDocxTableFromCells(
    docx: typeof DocxModule,
    headers: string[],
    rows: string[][],
    preset: ReturnType<typeof GetDocumentDesignPreset>,
  ): DocxModule.Table {
    const {
      Table: DocxTable,
      TableRow: DocxTableRow,
      TableCell: DocxTableCell,
      Paragraph,
      TextRun,
      WidthType,
      BorderStyle,
      ShadingType,
    } = docx;

    const headerRow = new DocxTableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new DocxTableCell({
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: preset.TableHeaderBgHex,
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: StripDocRecordLinksToPlainText(h),
                    bold: true,
                    color: preset.PrimaryHex,
                    font: preset.HeadingFont,
                    size: Math.round(preset.BodyFontSizePt * 2),
                  }),
                ],
              }),
            ],
          }),
      ),
    });

    const dataRows = rows.map(
      (r, rowIdx) =>
        new DocxTableRow({
          children: headers.map(
            (_, idx) =>
              new DocxTableCell({
                shading:
                  rowIdx % 2 === 1
                    ? {
                        type: ShadingType.CLEAR,
                        color: 'auto',
                        fill: preset.TableStripeBgHex,
                      }
                    : undefined,
                children: [
                  new Paragraph({
                    children: this.parseInlineTextRuns(
                      docx,
                      StripDocRecordLinksToPlainText(r[idx] ?? ''),
                      preset.BodyFont,
                      preset.BodyFontSizePt,
                    ),
                  }),
                ],
              }),
          ),
        }),
    );

    return new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: preset.MutedHex },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: preset.MutedHex },
        left: { style: BorderStyle.SINGLE, size: 1, color: preset.MutedHex },
        right: { style: BorderStyle.SINGLE, size: 1, color: preset.MutedHex },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: preset.TableHeaderBgHex },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: preset.TableHeaderBgHex },
      },
      rows: [headerRow, ...dataRows],
    });
  }

  private triggerBlobDownload(blob: Blob, fileName: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // Append inside an active modal <dialog> when one is open so browser inertness never blocks the download click
    const hostContainer = document.querySelector('dialog:modal') ?? document.body;
    hostContainer.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
