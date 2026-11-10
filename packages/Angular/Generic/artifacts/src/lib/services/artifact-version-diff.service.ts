import { Injectable, inject } from '@angular/core';
import {
  DeepDiffer,
  DiffChange,
  DiffChangeType,
  ParseJSONRecursive,
  SafeJSONParse,
} from '@memberjunction/global';
import {
  DataTable,
  MJColumnDescriptor,
  NormalizeToTables,
} from '@memberjunction/core';
import {
  ColumnIndexToLetter,
  DocumentLiveBlockEngine,
  FormatCellAddress,
  ParseCellAddress,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type SlideDeckSpec,
  type SlideRegionSpec,
  type SlideSpec,
  type SpreadsheetCellSpec,
  type WorkbookSpec,
  type WorksheetSpec,
} from '@memberjunction/core-entities';
import {
  BuildComponentCompleteCode,
  ComponentSpec,
} from '@memberjunction/interactive-component-types';
import {
  ComputeBoundedSequenceDiff,
  DocumentCollaborationService,
  type DocumentWordDiffSpan,
} from './document-collaboration.service';
import { BuildMultiTableSql } from '../snapshot-helpers';

// ─── Shared Primitive & Structural JSON Diff Types ───────────────────────────

export type DiffStatusKind = 'added' | 'removed' | 'modified' | 'unchanged';

export interface PropertyDeltaItem {
  Label: string;
  Status: 'added' | 'removed' | 'modified';
  OldValue: string;
  NewValue: string;
}

export interface StructuralJsonDiffItem {
  Path: string;
  DisplayKey: string;
  ParentPath: string;
  Depth: number;
  Status: 'added' | 'removed' | 'modified';
  OldFormatted: string;
  NewFormatted: string;
  Description: string;
  Children: StructuralJsonDiffItem[];
}

export interface StructuralJsonDiffResult {
  IsValidJson: boolean;
  AddedCount: number;
  RemovedCount: number;
  ModifiedCount: number;
  TotalChanges: number;
  FlatItems: StructuralJsonDiffItem[];
  TreeItems: StructuralJsonDiffItem[];
}

// ─── Git-Style Unified & Split Text Diff Types ───────────────────────────────

export interface GitDiffUnifiedLine {
  Kind: 'added' | 'removed' | 'unchanged';
  OldLineNumber: number | null;
  NewLineNumber: number | null;
  Text: string;
  InlineSpans?: DocumentWordDiffSpan[];
}

export interface GitDiffSplitRow {
  Kind: 'unchanged' | 'modified' | 'added' | 'removed';
  LeftLineNumber: number | null;
  LeftText: string | null;
  LeftSpans?: DocumentWordDiffSpan[];
  RightLineNumber: number | null;
  RightText: string | null;
  RightSpans?: DocumentWordDiffSpan[];
}

export interface GitDiffChunkGroup {
  GroupID: string;
  IsCollapsibleContext: boolean;
  UnifiedLines: GitDiffUnifiedLine[];
  SplitRows: GitDiffSplitRow[];
}

export interface GitTextDiffResult {
  AddedLines: number;
  RemovedLines: number;
  UnchangedLines: number;
  IsIdentical: boolean;
  UnifiedLines: GitDiffUnifiedLine[];
  SplitRows: GitDiffSplitRow[];
  Groups: GitDiffChunkGroup[];
}

// ─── 1. MJ Docs Visual Diff Types ────────────────────────────────────────────

export type DocsDiffBlockCategory =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'code'
  | 'callout'
  | 'live-block'
  | 'artifact-embed';

export interface DocsVisualDiffBlock {
  BlockKey: string;
  Category: DocsDiffBlockCategory;
  Status: DiffStatusKind;
  HeadingLevel?: number;
  TitleLabel: string;
  BaseMarkdown: string;
  TargetMarkdown: string;
  RedlineSpans: DocumentWordDiffSpan[];
  BlockSpecDeltas: PropertyDeltaItem[];
  BaseBlockSpec?: DocumentBlockSpec;
  TargetBlockSpec?: DocumentBlockSpec;
}

export interface DocsVisualDiffResult {
  AddedBlocks: number;
  RemovedBlocks: number;
  ModifiedBlocks: number;
  UnchangedBlocks: number;
  AddedWords: number;
  RemovedWords: number;
  Blocks: DocsVisualDiffBlock[];
}

// ─── 2. MJ Slides Visual Diff Types ──────────────────────────────────────────

export interface SlideRegionDiffItem {
  RegionID: string;
  Label: string;
  Kind: string;
  Status: DiffStatusKind;
  RedlineSpans: DocumentWordDiffSpan[];
  PropertyDeltas: PropertyDeltaItem[];
}

export interface SlideVisualDiffItem {
  SlideID: string;
  Status: DiffStatusKind;
  DisplayNumber: number;
  OldSlideNumber: number | null;
  NewSlideNumber: number | null;
  Reordered: boolean;
  Title: string;
  Layout: string;
  LayoutChangedFrom: string | null;
  BaseSlide: SlideSpec | null;
  TargetSlide: SlideSpec | null;
  TitleRedline: DocumentWordDiffSpan[];
  SubtitleRedline: DocumentWordDiffSpan[];
  RegionDeltas: SlideRegionDiffItem[];
  SpeakerNotesChanged: boolean;
  SpeakerNotesRedline: DocumentWordDiffSpan[];
}

export interface SlidesVisualDiffResult {
  BaseDeck: SlideDeckSpec;
  TargetDeck: SlideDeckSpec;
  AddedSlides: number;
  RemovedSlides: number;
  ModifiedSlides: number;
  UnchangedSlides: number;
  DeckDeltas: PropertyDeltaItem[];
  Slides: SlideVisualDiffItem[];
}

// ─── 3. MJ Sheets Visual Diff Types ──────────────────────────────────────────

export interface SpreadsheetCellDiffEntry {
  Address: string;
  RowNumber: number;
  ColIndex: number;
  ColLetter: string;
  Status: DiffStatusKind;
  ValueChanged: boolean;
  FormulaChanged: boolean;
  StyleChanged: boolean;
  OldDisplay: string;
  NewDisplay: string;
  OldFormula: string | null;
  NewFormula: string | null;
}

export interface SpreadsheetGridDiffRow {
  RowNumber: number;
  HasChanges: boolean;
  Cells: SpreadsheetCellDiffEntry[];
}

export interface SpreadsheetSheetDiffItem {
  SheetKey: string;
  Name: string;
  OldName: string | null;
  Status: DiffStatusKind;
  AddedCells: number;
  RemovedCells: number;
  ModifiedValueCells: number;
  ModifiedFormulaCells: number;
  TotalChangedCells: number;
  ColumnLetters: string[];
  GridRows: SpreadsheetGridDiffRow[];
  ChangedEntries: SpreadsheetCellDiffEntry[];
  StructureDeltas: PropertyDeltaItem[];
}

export interface SpreadsheetVisualDiffResult {
  WorkbookDeltas: PropertyDeltaItem[];
  AddedSheets: number;
  RemovedSheets: number;
  ModifiedSheets: number;
  TotalValueEdits: number;
  TotalFormulaEdits: number;
  Sheets: SpreadsheetSheetDiffItem[];
}

// ─── 4. ComponentSpec Visual Diff Types ──────────────────────────────────────

export interface ComponentCodeUnitDiff {
  UnitKey: string;
  ComponentName: string;
  RoleLabel: string;
  Status: DiffStatusKind;
  CodeDiff: GitTextDiffResult;
}

export interface ComponentLibraryDiffItem {
  Name: string;
  GlobalVariable: string;
  Status: DiffStatusKind;
  OldVersion: string;
  NewVersion: string;
}

export interface ComponentEntityReqDiffItem {
  EntityName: string;
  Status: DiffStatusKind;
  Summary: string;
  PropertyDeltas: PropertyDeltaItem[];
}

export interface ComponentQueryReqDiffItem {
  QueryKey: string;
  Name: string;
  CategoryPath: string;
  Status: DiffStatusKind;
  Summary: string;
  SqlDiff: GitTextDiffResult | null;
}

export interface ComponentSpecVisualDiffResult {
  IsValidSpec: boolean;
  BaseSpec: ComponentSpec | null;
  TargetSpec: ComponentSpec | null;
  ChangeRequestPrompt: string | null;
  ChangeRequestType: string | null;
  ChangeSummaryBullets: PropertyDeltaItem[];
  MetadataDeltas: PropertyDeltaItem[];
  LibraryDeltas: ComponentLibraryDiffItem[];
  EntityDeltas: ComponentEntityReqDiffItem[];
  QueryDeltas: ComponentQueryReqDiffItem[];
  CodeUnits: ComponentCodeUnitDiff[];
  FunctionalRedline: DocumentWordDiffSpan[];
  FunctionalChanged: boolean;
  TechnicalRedline: DocumentWordDiffSpan[];
  TechnicalChanged: boolean;
}

// ─── 5. Query / Data Artifact Visual Diff Types ──────────────────────────────

export interface QueryColumnSchemaDelta {
  FieldName: string;
  Status: DiffStatusKind;
  OldType: string;
  NewType: string;
  OldLabel: string;
  NewLabel: string;
}

export interface QueryTableDiffItem {
  TableName: string;
  Status: DiffStatusKind;
  OldRowCount: number | null;
  NewRowCount: number | null;
  ColumnDeltas: QueryColumnSchemaDelta[];
  SamplePreviewColumns: string[];
  BaseSampleRows: Array<Record<string, string>>;
  TargetSampleRows: Array<Record<string, string>>;
}

export interface QueryVisualDiffResult {
  HasSql: boolean;
  SqlChanged: boolean;
  IsWhitespaceOnlySqlChange: boolean;
  SqlDiff: GitTextDiffResult;
  MetadataDeltas: PropertyDeltaItem[];
  ParameterDeltas: PropertyDeltaItem[];
  Tables: QueryTableDiffItem[];
  AddedColumnsCount: number;
  RemovedColumnsCount: number;
  ModifiedColumnsCount: number;
  PlanChanged: boolean;
  PlanRedline: DocumentWordDiffSpan[];
  InterpretationChanged: boolean;
  InterpretationRedline: DocumentWordDiffSpan[];
}

// ─── Internal Helper Shapes ──────────────────────────────────────────────────

interface RawDataArtifactPayload {
  source?: 'query' | 'view';
  title?: string;
  queryId?: string;
  parameters?: Record<string, string | number | boolean>;
  entityName?: string;
  extraFilter?: string;
  columns?: Array<MJColumnDescriptor & { headerName?: string }>;
  rows?: Array<Record<string, string | number | boolean | null>>;
  tables?: DataTable[];
  plan?: string;
  interpretation?: string;
  metadata?: { sql?: string; rowCount?: number; executionTimeMs?: number };
  savedQueryId?: string;
  savedQueryName?: string;
  savedAtVersionNumber?: number;
}

interface ParsedDocChunk {
  Category: DocsDiffBlockCategory;
  TitleLabel: string;
  HeadingLevel?: number;
  RawMarkdown: string;
  BlockSpec?: DocumentBlockSpec;
  MatchId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ArtifactVersionDiffService {
  private readonly collabService = inject(DocumentCollaborationService);

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIVERSAL STRUCTURAL JSON DIFF (Powered by @memberjunction/global DeepDiffer)
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeStructuralJsonDiff(
    baseContent: string | null | undefined,
    targetContent: string | null | undefined,
  ): StructuralJsonDiffResult {
    const baseParsed = this.tryParseDeepJson(baseContent);
    const targetParsed = this.tryParseDeepJson(targetContent);

    if (!baseParsed.ok || !targetParsed.ok) {
      return {
        IsValidJson: false,
        AddedCount: 0,
        RemovedCount: 0,
        ModifiedCount: 0,
        TotalChanges: 0,
        FlatItems: [],
        TreeItems: [],
      };
    }

    const differ = new DeepDiffer({
      includeUnchanged: false,
      maxDepth: 14,
      maxStringLength: 500,
      treatNullAsUndefined: false,
    });
    const result = differ.diff(baseParsed.value, targetParsed.value);

    const actionableChanges = result.changes.filter(
      (c) =>
        c.type === DiffChangeType.Added ||
        c.type === DiffChangeType.Removed ||
        c.type === DiffChangeType.Modified,
    );

    const flatItems: StructuralJsonDiffItem[] = actionableChanges.map((chg) =>
      this.mapDeepDiffChange(chg),
    );
    const treeItems = this.buildJsonDiffHierarchy(flatItems);

    return {
      IsValidJson: true,
      AddedCount: result.summary.added,
      RemovedCount: result.summary.removed,
      ModifiedCount: result.summary.modified,
      TotalChanges: actionableChanges.length,
      FlatItems: flatItems,
      TreeItems: treeItems,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIVERSAL GIT UNIFIED & SPLIT LINE + INLINE WORD DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeGitTextDiff(
    baseContent: string | null | undefined,
    targetContent: string | null | undefined,
    autoFormatJson = true,
  ): GitTextDiffResult {
    const normalizedBase = autoFormatJson
      ? this.prettyPrintIfJson(baseContent ?? '')
      : (baseContent ?? '').replace(/\r\n/g, '\n');
    const normalizedTarget = autoFormatJson
      ? this.prettyPrintIfJson(targetContent ?? '')
      : (targetContent ?? '').replace(/\r\n/g, '\n');

    const lineDiff = this.collabService.ComputeLineDiff(normalizedBase, normalizedTarget);

    const unifiedLines: GitDiffUnifiedLine[] = [];
    const splitRows: GitDiffSplitRow[] = [];

    let idx = 0;
    const rawLines = lineDiff.Lines;

    while (idx < rawLines.length) {
      const current = rawLines[idx];
      if (current.Type === 'same') {
        unifiedLines.push({
          Kind: 'unchanged',
          OldLineNumber: current.OldLineNumber ?? null,
          NewLineNumber: current.NewLineNumber ?? null,
          Text: current.Content,
        });
        splitRows.push({
          Kind: 'unchanged',
          LeftLineNumber: current.OldLineNumber ?? null,
          LeftText: current.Content,
          RightLineNumber: current.NewLineNumber ?? null,
          RightText: current.Content,
        });
        idx++;
        continue;
      }

      // Collect contiguous removed + added block so we can pair modified lines side-by-side
      const removedBatch: typeof rawLines = [];
      const addedBatch: typeof rawLines = [];

      while (idx < rawLines.length && rawLines[idx].Type === 'removed') {
        removedBatch.push(rawLines[idx]);
        idx++;
      }
      while (idx < rawLines.length && rawLines[idx].Type === 'added') {
        addedBatch.push(rawLines[idx]);
        idx++;
      }

      const pairedCount = Math.min(removedBatch.length, addedBatch.length);

      // Compute inline word spans for paired modified lines
      const leftSpansByIdx = new Map<number, DocumentWordDiffSpan[]>();
      const rightSpansByIdx = new Map<number, DocumentWordDiffSpan[]>();

      for (let p = 0; p < pairedCount; p++) {
        const wordDiff = this.collabService.ComputeWordLevelDiff(
          removedBatch[p].Content,
          addedBatch[p].Content,
        );
        leftSpansByIdx.set(
          p,
          wordDiff.Spans.filter((s) => s.Type !== 'insert'),
        );
        rightSpansByIdx.set(
          p,
          wordDiff.Spans.filter((s) => s.Type !== 'delete'),
        );
      }

      for (let r = 0; r < removedBatch.length; r++) {
        unifiedLines.push({
          Kind: 'removed',
          OldLineNumber: removedBatch[r].OldLineNumber ?? null,
          NewLineNumber: null,
          Text: removedBatch[r].Content,
          InlineSpans: leftSpansByIdx.get(r),
        });
      }
      for (let a = 0; a < addedBatch.length; a++) {
        unifiedLines.push({
          Kind: 'added',
          OldLineNumber: null,
          NewLineNumber: addedBatch[a].NewLineNumber ?? null,
          Text: addedBatch[a].Content,
          InlineSpans: rightSpansByIdx.get(a),
        });
      }

      const maxBatch = Math.max(removedBatch.length, addedBatch.length);
      for (let s = 0; s < maxBatch; s++) {
        const rem = removedBatch[s];
        const add = addedBatch[s];
        if (rem && add) {
          splitRows.push({
            Kind: 'modified',
            LeftLineNumber: rem.OldLineNumber ?? null,
            LeftText: rem.Content,
            LeftSpans: leftSpansByIdx.get(s),
            RightLineNumber: add.NewLineNumber ?? null,
            RightText: add.Content,
            RightSpans: rightSpansByIdx.get(s),
          });
        } else if (rem) {
          splitRows.push({
            Kind: 'removed',
            LeftLineNumber: rem.OldLineNumber ?? null,
            LeftText: rem.Content,
            RightLineNumber: null,
            RightText: null,
          });
        } else if (add) {
          splitRows.push({
            Kind: 'added',
            LeftLineNumber: null,
            LeftText: null,
            RightLineNumber: add.NewLineNumber ?? null,
            RightText: add.Content,
          });
        }
      }
    }

    const groups = this.buildCollapsibleDiffGroups(unifiedLines, splitRows);

    return {
      AddedLines: lineDiff.AddedLines,
      RemovedLines: lineDiff.RemovedLines,
      UnchangedLines: lineDiff.UnchangedLines,
      IsIdentical: lineDiff.AddedLines === 0 && lineDiff.RemovedLines === 0,
      UnifiedLines: unifiedLines,
      SplitRows: splitRows,
      Groups: groups,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MJ DOCS VISUAL REDLINE & LIVE BLOCK DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeDocsVisualDiff(
    baseMd: string | null | undefined,
    targetMd: string | null | undefined,
  ): DocsVisualDiffResult {
    const baseChunks = this.parseDocIntoSemanticChunks(baseMd ?? '');
    const targetChunks = this.parseDocIntoSemanticChunks(targetMd ?? '');

    const aligned = this.alignDocChunks(baseChunks, targetChunks);

    let addedBlocks = 0;
    let removedBlocks = 0;
    let modifiedBlocks = 0;
    let unchangedBlocks = 0;
    let addedWords = 0;
    let removedWords = 0;

    for (const blk of aligned) {
      if (blk.Status === 'added') {
        addedBlocks++;
        addedWords += this.countWords(blk.TargetMarkdown);
      } else if (blk.Status === 'removed') {
        removedBlocks++;
        removedWords += this.countWords(blk.BaseMarkdown);
      } else if (blk.Status === 'modified') {
        modifiedBlocks++;
        for (const sp of blk.RedlineSpans) {
          if (sp.Type === 'insert') {
            addedWords += this.countWords(sp.Text);
          } else if (sp.Type === 'delete') {
            removedWords += this.countWords(sp.Text);
          }
        }
      } else {
        unchangedBlocks++;
      }
    }

    return {
      AddedBlocks: addedBlocks,
      RemovedBlocks: removedBlocks,
      ModifiedBlocks: modifiedBlocks,
      UnchangedBlocks: unchangedBlocks,
      AddedWords: addedWords,
      RemovedWords: removedWords,
      Blocks: aligned,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MJ SLIDES VISUAL DECK DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeSlidesVisualDiff(
    baseRaw: string | null | undefined,
    targetRaw: string | null | undefined,
  ): SlidesVisualDiffResult {
    const engine = SlideDeckEngine.Instance;
    const baseDeck = engine.ParseDeckSpec(baseRaw ?? '', 'Base Presentation');
    const targetDeck = engine.ParseDeckSpec(targetRaw ?? '', 'Target Presentation');

    const deckDeltas: PropertyDeltaItem[] = [];
    this.pushScalarDelta(deckDeltas, 'Deck Title', baseDeck.Title, targetDeck.Title);
    this.pushScalarDelta(deckDeltas, 'Subtitle', baseDeck.Subtitle ?? '', targetDeck.Subtitle ?? '');
    this.pushScalarDelta(deckDeltas, 'Aspect Ratio', baseDeck.AspectRatio, targetDeck.AspectRatio);
    this.pushScalarDelta(deckDeltas, 'Theme', baseDeck.Theme?.Name ?? '', targetDeck.Theme?.Name ?? '');
    this.pushScalarDelta(
      deckDeltas,
      'Brand Primary',
      baseDeck.Theme?.PrimaryColor ?? '',
      targetDeck.Theme?.PrimaryColor ?? '',
    );
    this.pushScalarDelta(
      deckDeltas,
      'Footer Text',
      baseDeck.Master?.FooterText ?? '',
      targetDeck.Master?.FooterText ?? '',
    );

    const baseById = new Map<string, SlideSpec>();
    for (const s of baseDeck.Slides) {
      baseById.set(s.SlideID, s);
    }
    const matchedBaseIds = new Set<string>();
    const slideItems: SlideVisualDiffItem[] = [];

    // First pass: walk target slides in presentation order
    for (const targetSlide of targetDeck.Slides) {
      let baseSlide = baseById.get(targetSlide.SlideID) ?? null;
      if (!baseSlide) {
        // Fallback match by identical non-empty title if SlideID changed across regeneration
        const candidate = baseDeck.Slides.find(
          (bs) =>
            !matchedBaseIds.has(bs.SlideID) &&
            bs.Title.trim().length > 0 &&
            bs.Title.trim().toLowerCase() === targetSlide.Title.trim().toLowerCase(),
        );
        if (candidate) {
          baseSlide = candidate;
        }
      }

      if (!baseSlide) {
        slideItems.push(this.buildAddedSlideDiff(targetSlide));
        continue;
      }

      matchedBaseIds.add(baseSlide.SlideID);
      slideItems.push(this.buildPairedSlideDiff(baseSlide, targetSlide));
    }

    // Second pass: insert removed slides near their original relative position
    for (const baseSlide of baseDeck.Slides) {
      if (!matchedBaseIds.has(baseSlide.SlideID)) {
        const removedItem = this.buildRemovedSlideDiff(baseSlide);
        const insertAt = Math.min(Math.max(0, baseSlide.SlideNumber - 1), slideItems.length);
        slideItems.splice(insertAt, 0, removedItem);
      }
    }

    let addedSlides = 0;
    let removedSlides = 0;
    let modifiedSlides = 0;
    let unchangedSlides = 0;

    for (const s of slideItems) {
      if (s.Status === 'added') addedSlides++;
      else if (s.Status === 'removed') removedSlides++;
      else if (s.Status === 'modified') modifiedSlides++;
      else unchangedSlides++;
    }

    return {
      BaseDeck: baseDeck,
      TargetDeck: targetDeck,
      AddedSlides: addedSlides,
      RemovedSlides: removedSlides,
      ModifiedSlides: modifiedSlides,
      UnchangedSlides: unchangedSlides,
      DeckDeltas: deckDeltas,
      Slides: slideItems,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MJ SHEETS CELL, FORMULA & STRUCTURE DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeSpreadsheetVisualDiff(
    baseRaw: string | null | undefined,
    targetRaw: string | null | undefined,
  ): SpreadsheetVisualDiffResult {
    const engine = SpreadsheetEngine.Instance;
    const baseWb: WorkbookSpec = engine.ParseWorkbook(baseRaw ?? '');
    const targetWb: WorkbookSpec = engine.ParseWorkbook(targetRaw ?? '');
    engine.EvaluateWorkbook(baseWb);
    engine.EvaluateWorkbook(targetWb);

    const wbDeltas: PropertyDeltaItem[] = [];
    this.pushScalarDelta(wbDeltas, 'Workbook Title', baseWb.Title, targetWb.Title);
    this.pushScalarDelta(
      wbDeltas,
      'Named Ranges',
      String(baseWb.NamedRanges?.length ?? 0),
      String(targetWb.NamedRanges?.length ?? 0),
    );

    const baseById = new Map<string, WorksheetSpec>();
    for (const sh of baseWb.Worksheets) {
      baseById.set(sh.SheetID, sh);
    }
    const matchedBaseIds = new Set<string>();
    const sheetDiffs: SpreadsheetSheetDiffItem[] = [];

    for (const targetSheet of targetWb.Worksheets) {
      let baseSheet = baseById.get(targetSheet.SheetID) ?? null;
      if (!baseSheet) {
        const byName = baseWb.Worksheets.find(
          (bs) =>
            !matchedBaseIds.has(bs.SheetID) &&
            bs.Name.trim().toLowerCase() === targetSheet.Name.trim().toLowerCase(),
        );
        if (byName) baseSheet = byName;
      }

      if (!baseSheet) {
        sheetDiffs.push(this.compareWorksheets(null, targetSheet));
      } else {
        matchedBaseIds.add(baseSheet.SheetID);
        sheetDiffs.push(this.compareWorksheets(baseSheet, targetSheet));
      }
    }

    for (const baseSheet of baseWb.Worksheets) {
      if (!matchedBaseIds.has(baseSheet.SheetID)) {
        sheetDiffs.push(this.compareWorksheets(baseSheet, null));
      }
    }

    let addedSheets = 0;
    let removedSheets = 0;
    let modifiedSheets = 0;
    let totalValueEdits = 0;
    let totalFormulaEdits = 0;

    for (const sd of sheetDiffs) {
      if (sd.Status === 'added') addedSheets++;
      else if (sd.Status === 'removed') removedSheets++;
      else if (sd.Status === 'modified') modifiedSheets++;
      totalValueEdits += sd.ModifiedValueCells + sd.AddedCells + sd.RemovedCells;
      totalFormulaEdits += sd.ModifiedFormulaCells;
    }

    return {
      WorkbookDeltas: wbDeltas,
      AddedSheets: addedSheets,
      RemovedSheets: removedSheets,
      ModifiedSheets: modifiedSheets,
      TotalValueEdits: totalValueEdits,
      TotalFormulaEdits: totalFormulaEdits,
      Sheets: sheetDiffs,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. INTERACTIVE COMPONENT SPEC (ComponentSpec) DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeComponentSpecDiff(
    baseRaw: string | null | undefined,
    targetRaw: string | null | undefined,
  ): ComponentSpecVisualDiffResult {
    const baseSpec = SafeJSONParse<ComponentSpec>(baseRaw ?? '');
    const targetSpec = SafeJSONParse<ComponentSpec>(targetRaw ?? '');

    if (!baseSpec && !targetSpec) {
      return {
        IsValidSpec: false,
        BaseSpec: null,
        TargetSpec: null,
        ChangeRequestPrompt: null,
        ChangeRequestType: null,
        ChangeSummaryBullets: [],
        MetadataDeltas: [],
        LibraryDeltas: [],
        EntityDeltas: [],
        QueryDeltas: [],
        CodeUnits: [],
        FunctionalRedline: [],
        FunctionalChanged: false,
        TechnicalRedline: [],
        TechnicalChanged: false,
      };
    }

    const metadataDeltas: PropertyDeltaItem[] = [];
    this.pushScalarDelta(metadataDeltas, 'Component Name', baseSpec?.name ?? '', targetSpec?.name ?? '');
    this.pushScalarDelta(metadataDeltas, 'Title', baseSpec?.title ?? '', targetSpec?.title ?? '');
    this.pushScalarDelta(metadataDeltas, 'Type', baseSpec?.type ?? '', targetSpec?.type ?? '');
    this.pushScalarDelta(
      metadataDeltas,
      'Component Role',
      baseSpec?.componentRole ?? 'generic',
      targetSpec?.componentRole ?? 'generic',
    );
    this.pushScalarDelta(
      metadataDeltas,
      'Bound Entity',
      baseSpec?.entityName ?? '',
      targetSpec?.entityName ?? '',
    );
    this.pushScalarDelta(
      metadataDeltas,
      'Location / Namespace',
      this.formatComponentLocation(baseSpec),
      this.formatComponentLocation(targetSpec),
    );
    this.pushScalarDelta(
      metadataDeltas,
      'Description',
      baseSpec?.description ?? '',
      targetSpec?.description ?? '',
    );

    // Extract AI Impact Assessor / Architect changeRequest summary if populated on targetSpec
    const cr = (targetSpec as ComponentSpec & {
      changeRequest?: {
        userRequest?: string;
        type?: string;
        changeSummary?: { prd?: string; data?: string; tdd?: string; code?: string };
      };
    })?.changeRequest;
    const summaryBullets: PropertyDeltaItem[] = [];
    if (cr?.changeSummary) {
      if (cr.changeSummary.prd) {
        summaryBullets.push({ Label: 'Functional (PRD)', Status: 'modified', OldValue: '', NewValue: cr.changeSummary.prd });
      }
      if (cr.changeSummary.data) {
        summaryBullets.push({ Label: 'Data Layer', Status: 'modified', OldValue: '', NewValue: cr.changeSummary.data });
      }
      if (cr.changeSummary.tdd) {
        summaryBullets.push({ Label: 'Technical (TDD)', Status: 'modified', OldValue: '', NewValue: cr.changeSummary.tdd });
      }
      if (cr.changeSummary.code) {
        summaryBullets.push({ Label: 'JSX Code', Status: 'modified', OldValue: '', NewValue: cr.changeSummary.code });
      }
    }

    const libraryDeltas = this.compareComponentLibraries(baseSpec, targetSpec);
    const entityDeltas = this.compareComponentEntities(baseSpec, targetSpec);
    const queryDeltas = this.compareComponentQueries(baseSpec, targetSpec);
    const codeUnits = this.compareComponentCodeUnits(baseSpec, targetSpec);

    const baseFunc = baseSpec?.functionalRequirements ?? '';
    const targetFunc = targetSpec?.functionalRequirements ?? '';
    const funcChanged = baseFunc.trim() !== targetFunc.trim();
    const funcRedline = funcChanged
      ? this.collabService.ComputeWordLevelDiff(baseFunc, targetFunc).Spans
      : [{ Type: 'equal' as const, Text: targetFunc }];

    const baseTech = baseSpec?.technicalDesign ?? '';
    const targetTech = targetSpec?.technicalDesign ?? '';
    const techChanged = baseTech.trim() !== targetTech.trim();
    const techRedline = techChanged
      ? this.collabService.ComputeWordLevelDiff(baseTech, targetTech).Spans
      : [{ Type: 'equal' as const, Text: targetTech }];

    return {
      IsValidSpec: true,
      BaseSpec: baseSpec,
      TargetSpec: targetSpec,
      ChangeRequestPrompt: cr?.userRequest ?? null,
      ChangeRequestType: cr?.type ?? null,
      ChangeSummaryBullets: summaryBullets,
      MetadataDeltas: metadataDeltas,
      LibraryDeltas: libraryDeltas,
      EntityDeltas: entityDeltas,
      QueryDeltas: queryDeltas,
      CodeUnits: codeUnits,
      FunctionalRedline: funcRedline,
      FunctionalChanged: funcChanged,
      TechnicalRedline: techRedline,
      TechnicalChanged: techChanged,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. QUERY / DATA ARTIFACT VISUAL DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  public ComputeQueryDataDiff(
    baseRaw: string | null | undefined,
    targetRaw: string | null | undefined,
  ): QueryVisualDiffResult {
    const baseSpec = SafeJSONParse<RawDataArtifactPayload>(baseRaw ?? '') ?? {};
    const targetSpec = SafeJSONParse<RawDataArtifactPayload>(targetRaw ?? '') ?? {};

    const baseTables = this.extractNormalizedTables(baseSpec);
    const targetTables = this.extractNormalizedTables(targetSpec);

    const baseSql = this.extractEffectiveSql(baseSpec, baseTables);
    const targetSql = this.extractEffectiveSql(targetSpec, targetTables);

    const sqlDiff = this.ComputeGitTextDiff(baseSql, targetSql, false);
    const normalizedBaseSql = baseSql.trim().replace(/\s+/g, ' ');
    const normalizedTargetSql = targetSql.trim().replace(/\s+/g, ' ');
    const sqlChanged = baseSql.trim() !== targetSql.trim();
    const isWhitespaceOnly = sqlChanged && normalizedBaseSql === normalizedTargetSql;

    const metadataDeltas: PropertyDeltaItem[] = [];
    this.pushScalarDelta(metadataDeltas, 'Title', baseSpec.title ?? '', targetSpec.title ?? '');
    this.pushScalarDelta(metadataDeltas, 'Source Mode', baseSpec.source ?? '', targetSpec.source ?? '');
    this.pushScalarDelta(metadataDeltas, 'Entity Name', baseSpec.entityName ?? '', targetSpec.entityName ?? '');
    this.pushScalarDelta(metadataDeltas, 'Extra Filter', baseSpec.extraFilter ?? '', targetSpec.extraFilter ?? '');
    this.pushScalarDelta(
      metadataDeltas,
      'Saved Query',
      baseSpec.savedQueryName ?? '',
      targetSpec.savedQueryName ?? '',
    );
    this.pushScalarDelta(
      metadataDeltas,
      'Captured Row Count',
      baseSpec.metadata?.rowCount != null ? String(baseSpec.metadata.rowCount) : '',
      targetSpec.metadata?.rowCount != null ? String(targetSpec.metadata.rowCount) : '',
    );
    this.pushScalarDelta(
      metadataDeltas,
      'Execution Time',
      baseSpec.metadata?.executionTimeMs != null ? `${baseSpec.metadata.executionTimeMs} ms` : '',
      targetSpec.metadata?.executionTimeMs != null ? `${targetSpec.metadata.executionTimeMs} ms` : '',
    );

    const parameterDeltas = this.compareRecordDictionaries(
      baseSpec.parameters ?? {},
      targetSpec.parameters ?? {},
    );

    const tableDiffs = this.compareQueryTables(baseTables, targetTables);
    let addedCols = 0;
    let removedCols = 0;
    let modifiedCols = 0;
    for (const td of tableDiffs) {
      for (const col of td.ColumnDeltas) {
        if (col.Status === 'added') addedCols++;
        else if (col.Status === 'removed') removedCols++;
        else if (col.Status === 'modified') modifiedCols++;
      }
    }

    const basePlan = baseSpec.plan ?? '';
    const targetPlan = targetSpec.plan ?? '';
    const planChanged = basePlan.trim() !== targetPlan.trim();
    const planRedline = planChanged
      ? this.collabService.ComputeWordLevelDiff(basePlan, targetPlan).Spans
      : [{ Type: 'equal' as const, Text: targetPlan }];

    const baseInterp = baseSpec.interpretation ?? '';
    const targetInterp = targetSpec.interpretation ?? '';
    const interpChanged = baseInterp.trim() !== targetInterp.trim();
    const interpRedline = interpChanged
      ? this.collabService.ComputeWordLevelDiff(baseInterp, targetInterp).Spans
      : [{ Type: 'equal' as const, Text: targetInterp }];

    return {
      HasSql: baseSql.trim().length > 0 || targetSql.trim().length > 0,
      SqlChanged: sqlChanged,
      IsWhitespaceOnlySqlChange: isWhitespaceOnly,
      SqlDiff: sqlDiff,
      MetadataDeltas: metadataDeltas,
      ParameterDeltas: parameterDeltas,
      Tables: tableDiffs,
      AddedColumnsCount: addedCols,
      RemovedColumnsCount: removedCols,
      ModifiedColumnsCount: modifiedCols,
      PlanChanged: planChanged,
      PlanRedline: planRedline,
      InterpretationChanged: interpChanged,
      InterpretationRedline: interpRedline,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE IMPLEMENTATION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private tryParseDeepJson(
    raw: string | null | undefined,
  ): { ok: boolean; value: object | string | number | boolean | null } {
    if (!raw || !raw.trim()) {
      return { ok: false, value: null };
    }
    try {
      const initial = JSON.parse(raw) as object | string | number | boolean | null;
      if (initial !== null && typeof initial === 'object') {
        const expanded = ParseJSONRecursive(initial, {
          extractInlineJson: true,
          maxDepth: 25,
          debug: false,
        }) as object;
        return { ok: true, value: expanded };
      }
      return { ok: true, value: initial };
    } catch {
      return { ok: false, value: null };
    }
  }

  private prettyPrintIfJson(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return raw.replace(/\r\n/g, '\n');
    }
    try {
      const parsed = JSON.parse(trimmed) as object;
      const expanded = ParseJSONRecursive(parsed, {
        extractInlineJson: true,
        maxDepth: 25,
        debug: false,
      });
      return JSON.stringify(expanded, null, 2);
    } catch {
      return raw.replace(/\r\n/g, '\n');
    }
  }

  private mapDeepDiffChange(chg: DiffChange): StructuralJsonDiffItem {
    const status: 'added' | 'removed' | 'modified' =
      chg.type === DiffChangeType.Added
        ? 'added'
        : chg.type === DiffChangeType.Removed
          ? 'removed'
          : 'modified';
    const parts = chg.path === 'root' ? ['root'] : chg.path.split('.');
    const displayKey = parts[parts.length - 1] || chg.path;
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('.') : '';

    return {
      Path: chg.path,
      DisplayKey: displayKey,
      ParentPath: parentPath,
      Depth: Math.max(0, parts.length - 1),
      Status: status,
      OldFormatted: this.stringifyDiffValue(chg.oldValue),
      NewFormatted: this.stringifyDiffValue(chg.newValue),
      Description: chg.description,
      Children: [],
    };
  }

  private stringifyDiffValue(val: object | string | number | boolean | null | undefined): string {
    if (val === undefined) return '—';
    if (val === null) return 'null';
    if (typeof val === 'string') return val.length > 260 ? `${val.slice(0, 260)}…` : val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    try {
      const json = JSON.stringify(val);
      return json.length > 260 ? `${json.slice(0, 260)}…` : json;
    } catch {
      return String(val);
    }
  }

  private buildJsonDiffHierarchy(flat: StructuralJsonDiffItem[]): StructuralJsonDiffItem[] {
    const clones = flat.map((item) => ({ ...item, Children: [] as StructuralJsonDiffItem[] }));
    const byPath = new Map<string, StructuralJsonDiffItem>();
    for (const c of clones) {
      byPath.set(c.Path, c);
    }

    const roots: StructuralJsonDiffItem[] = [];
    for (const c of clones) {
      if (c.ParentPath && byPath.has(c.ParentPath)) {
        byPath.get(c.ParentPath)!.Children.push(c);
      } else {
        roots.push(c);
      }
    }
    return roots;
  }

  private buildCollapsibleDiffGroups(
    unified: GitDiffUnifiedLine[],
    split: GitDiffSplitRow[],
  ): GitDiffChunkGroup[] {
    // Keep up to 3 context lines around changes; collapse unchanged runs longer than 8 lines
    const CONTEXT = 3;
    const MIN_COLLAPSE = 8;

    const groups: GitDiffChunkGroup[] = [];
    let uIdx = 0;
    let sIdx = 0;
    let groupSeq = 0;

    while (sIdx < split.length) {
      if (split[sIdx].Kind !== 'unchanged') {
        const chunkSplit: GitDiffSplitRow[] = [];
        while (sIdx < split.length && split[sIdx].Kind !== 'unchanged') {
          chunkSplit.push(split[sIdx]);
          sIdx++;
        }
        const chunkUnified: GitDiffUnifiedLine[] = [];
        while (uIdx < unified.length && unified[uIdx].Kind !== 'unchanged') {
          chunkUnified.push(unified[uIdx]);
          uIdx++;
        }
        groups.push({
          GroupID: `diff-grp-${++groupSeq}`,
          IsCollapsibleContext: false,
          UnifiedLines: chunkUnified,
          SplitRows: chunkSplit,
        });
        continue;
      }

      // Measure unchanged run length
      const runStartS = sIdx;
      const runStartU = uIdx;
      while (sIdx < split.length && split[sIdx].Kind === 'unchanged') {
        sIdx++;
      }
      while (uIdx < unified.length && unified[uIdx].Kind === 'unchanged') {
        uIdx++;
      }
      const runLen = sIdx - runStartS;

      if (runLen <= MIN_COLLAPSE) {
        groups.push({
          GroupID: `diff-grp-${++groupSeq}`,
          IsCollapsibleContext: false,
          UnifiedLines: unified.slice(runStartU, uIdx),
          SplitRows: split.slice(runStartS, sIdx),
        });
      } else {
        const hasBefore = runStartS > 0;
        const hasAfter = sIdx < split.length;
        const leadCount = hasBefore ? CONTEXT : 0;
        const trailCount = hasAfter ? CONTEXT : 0;

        if (leadCount > 0) {
          groups.push({
            GroupID: `diff-grp-${++groupSeq}`,
            IsCollapsibleContext: false,
            UnifiedLines: unified.slice(runStartU, runStartU + leadCount),
            SplitRows: split.slice(runStartS, runStartS + leadCount),
          });
        }

        groups.push({
          GroupID: `diff-grp-${++groupSeq}`,
          IsCollapsibleContext: true,
          UnifiedLines: unified.slice(runStartU + leadCount, uIdx - trailCount),
          SplitRows: split.slice(runStartS + leadCount, sIdx - trailCount),
        });

        if (trailCount > 0) {
          groups.push({
            GroupID: `diff-grp-${++groupSeq}`,
            IsCollapsibleContext: false,
            UnifiedLines: unified.slice(uIdx - trailCount, uIdx),
            SplitRows: split.slice(sIdx - trailCount, sIdx),
          });
        }
      }
    }

    return groups;
  }

  private parseDocIntoSemanticChunks(markdown: string): ParsedDocChunk[] {
    const directives = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
    const chunks: ParsedDocChunk[] = [];

    for (const seg of directives) {
      if (seg.Type === 'mj-block' && seg.BlockSpec) {
        const spec = seg.BlockSpec;
        const isArtifact = spec.Kind === 'Artifact';
        chunks.push({
          Category: isArtifact ? 'artifact-embed' : 'live-block',
          TitleLabel:
            spec.Title ||
            spec.EntityName ||
            spec.QueryName ||
            spec.ArtifactType ||
            spec.Kind,
          RawMarkdown: seg.RawText.trim(),
          BlockSpec: spec,
          MatchId: spec.BlockID || `${spec.Kind}:${spec.EntityName ?? spec.QueryName ?? spec.ArtifactID ?? ''}`,
        });
        continue;
      }

      const blocks = this.splitProseMarkdownIntoBlocks(seg.RawText);
      for (const blk of blocks) {
        chunks.push(blk);
      }
    }

    return chunks;
  }

  private splitProseMarkdownIntoBlocks(raw: string): ParsedDocChunk[] {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const out: ParsedDocChunk[] = [];
    let idx = 0;

    while (idx < lines.length) {
      const line = lines[idx];
      if (!line.trim()) {
        idx++;
        continue;
      }

      // Fenced code block
      if (/^```/.test(line.trim())) {
        const start = idx;
        const lang = line.trim().slice(3).trim();
        idx++;
        while (idx < lines.length && !/^```/.test(lines[idx].trim())) {
          idx++;
        }
        if (idx < lines.length) idx++;
        out.push({
          Category: 'code',
          TitleLabel: lang ? `Code (${lang})` : 'Code Block',
          RawMarkdown: lines.slice(start, idx).join('\n'),
        });
        continue;
      }

      // Heading
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (headingMatch) {
        out.push({
          Category: 'heading',
          HeadingLevel: headingMatch[1].length,
          TitleLabel: `H${headingMatch[1].length} · ${headingMatch[2].trim()}`,
          RawMarkdown: line.trim(),
        });
        idx++;
        continue;
      }

      // Callout / blockquote
      if (line.trim().startsWith('>')) {
        const start = idx;
        while (idx < lines.length && lines[idx].trim().startsWith('>')) {
          idx++;
        }
        out.push({
          Category: 'callout',
          TitleLabel: 'Callout / Quote',
          RawMarkdown: lines.slice(start, idx).join('\n'),
        });
        continue;
      }

      // Markdown Table
      if (line.includes('|') && idx + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[idx + 1])) {
        const start = idx;
        while (idx < lines.length && lines[idx].includes('|') && lines[idx].trim().length > 0) {
          idx++;
        }
        out.push({
          Category: 'table',
          TitleLabel: 'Table',
          RawMarkdown: lines.slice(start, idx).join('\n'),
        });
        continue;
      }

      // List (bulleted, numbered, task)
      if (/^(\s*[-*+]|\s*\d+\.)\s+/.test(line)) {
        const start = idx;
        while (
          idx < lines.length &&
          lines[idx].trim().length > 0 &&
          (/^(\s*[-*+]|\s*\d+\.)\s+/.test(lines[idx]) || /^\s{2,}\S/.test(lines[idx]))
        ) {
          idx++;
        }
        out.push({
          Category: 'list',
          TitleLabel: 'List',
          RawMarkdown: lines.slice(start, idx).join('\n'),
        });
        continue;
      }

      // Standard paragraph
      const start = idx;
      while (
        idx < lines.length &&
        lines[idx].trim().length > 0 &&
        !/^(#{1,6})\s+/.test(lines[idx].trim()) &&
        !/^```/.test(lines[idx].trim()) &&
        !lines[idx].trim().startsWith('>') &&
        !/^(\s*[-*+]|\s*\d+\.)\s+/.test(lines[idx])
      ) {
        idx++;
      }
      const text = lines.slice(start, idx).join('\n').trim();
      if (text) {
        out.push({
          Category: 'paragraph',
          TitleLabel: 'Paragraph',
          RawMarkdown: text,
        });
      }
    }

    return out;
  }

  private alignDocChunks(
    baseChunks: ParsedDocChunk[],
    targetChunks: ParsedDocChunk[],
  ): DocsVisualDiffBlock[] {
    const seqOps = ComputeBoundedSequenceDiff(
      baseChunks,
      targetChunks,
      (a, b) => this.areDocChunksExactOrSameId(a, b),
      (chunk) =>
        chunk.MatchId
          ? `id:${chunk.MatchId}`
          : `md:${chunk.Category}:${chunk.RawMarkdown.trim()}`,
    );

    const rawOps: Array<{
      kind: 'match' | 'del' | 'add';
      base?: ParsedDocChunk;
      target?: ParsedDocChunk;
    }> = seqOps.map((op) => {
      if (op.Kind === 'equal') {
        return {
          kind: 'match',
          base: baseChunks[op.OldIndex],
          target: targetChunks[op.NewIndex],
        };
      }
      if (op.Kind === 'delete') {
        return { kind: 'del', base: baseChunks[op.OldIndex] };
      }
      return { kind: 'add', target: targetChunks[op.NewIndex] };
    });

    // Coalesce adjacent del+add runs into word-diffed modified blocks when compatible
    const result: DocsVisualDiffBlock[] = [];
    let seq = 0;
    let k = 0;

    while (k < rawOps.length) {
      const op = rawOps[k];
      if (op.kind === 'match' && op.base && op.target) {
        result.push(this.createMatchedOrModifiedDocBlock(++seq, op.base, op.target));
        k++;
        continue;
      }

      const dels: ParsedDocChunk[] = [];
      const adds: ParsedDocChunk[] = [];
      while (k < rawOps.length && rawOps[k].kind === 'del') {
        dels.push(rawOps[k].base!);
        k++;
      }
      while (k < rawOps.length && rawOps[k].kind === 'add') {
        adds.push(rawOps[k].target!);
        k++;
      }

      const pairCount = Math.min(dels.length, adds.length);
      for (let p = 0; p < pairCount; p++) {
        if (this.canPairModifiedDocChunks(dels[p], adds[p])) {
          result.push(this.createMatchedOrModifiedDocBlock(++seq, dels[p], adds[p]));
        } else {
          result.push(this.createSingleDocBlock(++seq, 'removed', dels[p]));
          result.push(this.createSingleDocBlock(++seq, 'added', adds[p]));
        }
      }
      for (let r = pairCount; r < dels.length; r++) {
        result.push(this.createSingleDocBlock(++seq, 'removed', dels[r]));
      }
      for (let a = pairCount; a < adds.length; a++) {
        result.push(this.createSingleDocBlock(++seq, 'added', adds[a]));
      }
    }

    return result;
  }

  private areDocChunksExactOrSameId(a: ParsedDocChunk, b: ParsedDocChunk): boolean {
    if (a.MatchId && b.MatchId) {
      return a.MatchId === b.MatchId;
    }
    return a.Category === b.Category && a.RawMarkdown.trim() === b.RawMarkdown.trim();
  }

  private canPairModifiedDocChunks(a: ParsedDocChunk, b: ParsedDocChunk): boolean {
    if (a.Category === b.Category) {
      return true;
    }
    return false;
  }

  private createMatchedOrModifiedDocBlock(
    seq: number,
    base: ParsedDocChunk,
    target: ParsedDocChunk,
  ): DocsVisualDiffBlock {
    if (base.BlockSpec && target.BlockSpec) {
      const deltas = this.compareDocumentBlockSpecs(base.BlockSpec, target.BlockSpec);
      return {
        BlockKey: `doc-diff-${seq}`,
        Category: target.Category,
        Status: deltas.length > 0 ? 'modified' : 'unchanged',
        TitleLabel: target.TitleLabel,
        BaseMarkdown: base.RawMarkdown,
        TargetMarkdown: target.RawMarkdown,
        RedlineSpans: [],
        BlockSpecDeltas: deltas,
        BaseBlockSpec: base.BlockSpec,
        TargetBlockSpec: target.BlockSpec,
      };
    }

    const isIdentical = base.RawMarkdown.trim() === target.RawMarkdown.trim();
    const spans = isIdentical
      ? [{ Type: 'equal' as const, Text: target.RawMarkdown }]
      : this.collabService.ComputeWordLevelDiff(base.RawMarkdown, target.RawMarkdown).Spans;

    return {
      BlockKey: `doc-diff-${seq}`,
      Category: target.Category,
      Status: isIdentical ? 'unchanged' : 'modified',
      HeadingLevel: target.HeadingLevel ?? base.HeadingLevel,
      TitleLabel: target.TitleLabel,
      BaseMarkdown: base.RawMarkdown,
      TargetMarkdown: target.RawMarkdown,
      RedlineSpans: spans,
      BlockSpecDeltas: [],
    };
  }

  private createSingleDocBlock(
    seq: number,
    status: 'added' | 'removed',
    chunk: ParsedDocChunk,
  ): DocsVisualDiffBlock {
    const spanType = status === 'added' ? ('insert' as const) : ('delete' as const);
    return {
      BlockKey: `doc-diff-${seq}`,
      Category: chunk.Category,
      Status: status,
      HeadingLevel: chunk.HeadingLevel,
      TitleLabel: chunk.TitleLabel,
      BaseMarkdown: status === 'removed' ? chunk.RawMarkdown : '',
      TargetMarkdown: status === 'added' ? chunk.RawMarkdown : '',
      RedlineSpans: [{ Type: spanType, Text: chunk.RawMarkdown }],
      BlockSpecDeltas: [],
      BaseBlockSpec: status === 'removed' ? chunk.BlockSpec : undefined,
      TargetBlockSpec: status === 'added' ? chunk.BlockSpec : undefined,
    };
  }

  private compareDocumentBlockSpecs(
    base: DocumentBlockSpec,
    target: DocumentBlockSpec,
  ): PropertyDeltaItem[] {
    const deltas: PropertyDeltaItem[] = [];
    this.pushScalarDelta(deltas, 'Block Type', base.Kind, target.Kind);
    this.pushScalarDelta(deltas, 'Title', base.Title ?? '', target.Title ?? '');
    this.pushScalarDelta(deltas, 'Mode', base.Mode, target.Mode);
    this.pushScalarDelta(deltas, 'Entity', base.EntityName ?? '', target.EntityName ?? '');
    this.pushScalarDelta(deltas, 'Saved View', base.ViewName ?? base.ViewID ?? '', target.ViewName ?? target.ViewID ?? '');
    this.pushScalarDelta(deltas, 'Filter', base.ExtraFilter ?? '', target.ExtraFilter ?? '');
    this.pushScalarDelta(deltas, 'Order By', base.OrderBy ?? '', target.OrderBy ?? '');
    this.pushScalarDelta(deltas, 'Saved Query', base.QueryName ?? base.QueryID ?? '', target.QueryName ?? target.QueryID ?? '');
    this.pushScalarDelta(deltas, 'Max Rows', String(base.MaxRows ?? ''), String(target.MaxRows ?? ''));
    this.pushScalarDelta(deltas, 'Page Size', String(base.PageSize ?? ''), String(target.PageSize ?? ''));
    this.pushScalarDelta(
      deltas,
      'Default Collapsed',
      base.Collapsed ? 'Yes' : 'No',
      target.Collapsed ? 'Yes' : 'No',
    );
    this.pushScalarDelta(
      deltas,
      'Pinned Version',
      base.VersionID ?? 'Latest',
      target.VersionID ?? 'Latest',
    );
    return deltas;
  }

  private buildAddedSlideDiff(slide: SlideSpec): SlideVisualDiffItem {
    return {
      SlideID: slide.SlideID,
      Status: 'added',
      DisplayNumber: slide.SlideNumber,
      OldSlideNumber: null,
      NewSlideNumber: slide.SlideNumber,
      Reordered: false,
      Title: slide.Title || `Slide ${slide.SlideNumber}`,
      Layout: slide.Layout,
      LayoutChangedFrom: null,
      BaseSlide: null,
      TargetSlide: slide,
      TitleRedline: [{ Type: 'insert', Text: slide.Title }],
      SubtitleRedline: slide.Subtitle ? [{ Type: 'insert', Text: slide.Subtitle }] : [],
      RegionDeltas: slide.Regions.map((r) => ({
        RegionID: r.RegionID,
        Label: r.Label,
        Kind: r.Kind,
        Status: 'added',
        RedlineSpans: [{ Type: 'insert', Text: r.MarkdownContent || r.BigNumberValue || '' }],
        PropertyDeltas: [],
      })),
      SpeakerNotesChanged: Boolean(slide.SpeakerNotes?.trim()),
      SpeakerNotesRedline: slide.SpeakerNotes
        ? [{ Type: 'insert', Text: slide.SpeakerNotes }]
        : [],
    };
  }

  private buildRemovedSlideDiff(slide: SlideSpec): SlideVisualDiffItem {
    return {
      SlideID: slide.SlideID,
      Status: 'removed',
      DisplayNumber: slide.SlideNumber,
      OldSlideNumber: slide.SlideNumber,
      NewSlideNumber: null,
      Reordered: false,
      Title: slide.Title || `Slide ${slide.SlideNumber}`,
      Layout: slide.Layout,
      LayoutChangedFrom: null,
      BaseSlide: slide,
      TargetSlide: null,
      TitleRedline: [{ Type: 'delete', Text: slide.Title }],
      SubtitleRedline: slide.Subtitle ? [{ Type: 'delete', Text: slide.Subtitle }] : [],
      RegionDeltas: slide.Regions.map((r) => ({
        RegionID: r.RegionID,
        Label: r.Label,
        Kind: r.Kind,
        Status: 'removed',
        RedlineSpans: [{ Type: 'delete', Text: r.MarkdownContent || r.BigNumberValue || '' }],
        PropertyDeltas: [],
      })),
      SpeakerNotesChanged: Boolean(slide.SpeakerNotes?.trim()),
      SpeakerNotesRedline: slide.SpeakerNotes
        ? [{ Type: 'delete', Text: slide.SpeakerNotes }]
        : [],
    };
  }

  private buildPairedSlideDiff(base: SlideSpec, target: SlideSpec): SlideVisualDiffItem {
    const titleChanged = base.Title.trim() !== target.Title.trim();
    const subChanged = (base.Subtitle ?? '').trim() !== (target.Subtitle ?? '').trim();
    const layoutChanged = base.Layout !== target.Layout;
    const notesChanged = (base.SpeakerNotes ?? '').trim() !== (target.SpeakerNotes ?? '').trim();
    const reordered = base.SlideNumber !== target.SlideNumber;

    const regionDeltas = this.compareSlideRegions(base.Regions, target.Regions);
    const anyRegionChanged = regionDeltas.some((r) => r.Status !== 'unchanged');

    const isModified =
      titleChanged || subChanged || layoutChanged || notesChanged || anyRegionChanged;

    return {
      SlideID: target.SlideID,
      Status: isModified ? 'modified' : 'unchanged',
      DisplayNumber: target.SlideNumber,
      OldSlideNumber: base.SlideNumber,
      NewSlideNumber: target.SlideNumber,
      Reordered: reordered,
      Title: target.Title || base.Title || `Slide ${target.SlideNumber}`,
      Layout: target.Layout,
      LayoutChangedFrom: layoutChanged ? base.Layout : null,
      BaseSlide: base,
      TargetSlide: target,
      TitleRedline: titleChanged
        ? this.collabService.ComputeWordLevelDiff(base.Title, target.Title).Spans
        : [{ Type: 'equal', Text: target.Title }],
      SubtitleRedline: subChanged
        ? this.collabService.ComputeWordLevelDiff(base.Subtitle ?? '', target.Subtitle ?? '').Spans
        : target.Subtitle
          ? [{ Type: 'equal', Text: target.Subtitle }]
          : [],
      RegionDeltas: regionDeltas,
      SpeakerNotesChanged: notesChanged,
      SpeakerNotesRedline: notesChanged
        ? this.collabService.ComputeWordLevelDiff(base.SpeakerNotes ?? '', target.SpeakerNotes ?? '').Spans
        : target.SpeakerNotes
          ? [{ Type: 'equal', Text: target.SpeakerNotes }]
          : [],
    };
  }

  private compareSlideRegions(
    baseRegions: SlideRegionSpec[],
    targetRegions: SlideRegionSpec[],
  ): SlideRegionDiffItem[] {
    const baseById = new Map<string, SlideRegionSpec>();
    for (const r of baseRegions) baseById.set(r.RegionID, r);
    const seen = new Set<string>();
    const out: SlideRegionDiffItem[] = [];

    for (const tr of targetRegions) {
      const br = baseById.get(tr.RegionID);
      if (!br) {
        out.push({
          RegionID: tr.RegionID,
          Label: tr.Label,
          Kind: tr.Kind,
          Status: 'added',
          RedlineSpans: [{ Type: 'insert', Text: tr.MarkdownContent || tr.BigNumberValue || '' }],
          PropertyDeltas: [],
        });
        continue;
      }
      seen.add(br.RegionID);

      const propDeltas: PropertyDeltaItem[] = [];
      this.pushScalarDelta(propDeltas, 'Region Kind', br.Kind, tr.Kind);
      this.pushScalarDelta(propDeltas, 'Metric Value', br.BigNumberValue ?? '', tr.BigNumberValue ?? '');
      this.pushScalarDelta(propDeltas, 'Metric Label', br.BigNumberLabel ?? '', tr.BigNumberLabel ?? '');
      this.pushScalarDelta(propDeltas, 'Metric Delta', br.BigNumberDelta ?? '', tr.BigNumberDelta ?? '');
      this.pushScalarDelta(propDeltas, 'Quote Attribution', br.QuoteAttribution ?? '', tr.QuoteAttribution ?? '');
      if (br.BlockSpec && tr.BlockSpec) {
        propDeltas.push(...this.compareDocumentBlockSpecs(br.BlockSpec, tr.BlockSpec));
      }

      const mdChanged = (br.MarkdownContent ?? '').trim() !== (tr.MarkdownContent ?? '').trim();
      const status: DiffStatusKind =
        mdChanged || propDeltas.length > 0 ? 'modified' : 'unchanged';

      out.push({
        RegionID: tr.RegionID,
        Label: tr.Label,
        Kind: tr.Kind,
        Status: status,
        RedlineSpans: mdChanged
          ? this.collabService.ComputeWordLevelDiff(br.MarkdownContent ?? '', tr.MarkdownContent ?? '').Spans
          : [{ Type: 'equal', Text: tr.MarkdownContent ?? '' }],
        PropertyDeltas: propDeltas,
      });
    }

    for (const br of baseRegions) {
      if (!seen.has(br.RegionID)) {
        out.push({
          RegionID: br.RegionID,
          Label: br.Label,
          Kind: br.Kind,
          Status: 'removed',
          RedlineSpans: [{ Type: 'delete', Text: br.MarkdownContent || br.BigNumberValue || '' }],
          PropertyDeltas: [],
        });
      }
    }

    return out;
  }

  private compareWorksheets(
    baseSheet: WorksheetSpec | null,
    targetSheet: WorksheetSpec | null,
  ): SpreadsheetSheetDiffItem {
    const activeName = targetSheet?.Name ?? baseSheet?.Name ?? 'Sheet';
    const sheetKey = targetSheet?.SheetID ?? baseSheet?.SheetID ?? activeName;
    const oldName =
      baseSheet && targetSheet && baseSheet.Name !== targetSheet.Name ? baseSheet.Name : null;

    const structureDeltas: PropertyDeltaItem[] = [];
    if (baseSheet && targetSheet) {
      this.pushScalarDelta(structureDeltas, 'Sheet Name', baseSheet.Name, targetSheet.Name);
      this.pushScalarDelta(
        structureDeltas,
        'Frozen Rows',
        String(baseSheet.FrozenRows ?? 0),
        String(targetSheet.FrozenRows ?? 0),
      );
      this.pushScalarDelta(
        structureDeltas,
        'Frozen Columns',
        String(baseSheet.FrozenColumns ?? 0),
        String(targetSheet.FrozenColumns ?? 0),
      );
      this.pushScalarDelta(
        structureDeltas,
        'Bound Live Tables',
        String(baseSheet.LiveTables?.length ?? 0),
        String(targetSheet.LiveTables?.length ?? 0),
      );
      this.pushScalarDelta(
        structureDeltas,
        'Range Charts',
        String(baseSheet.Charts?.length ?? 0),
        String(targetSheet.Charts?.length ?? 0),
      );
    }

    const baseCells = baseSheet?.Cells ?? {};
    const targetCells = targetSheet?.Cells ?? {};
    const allAddresses = new Set<string>([
      ...Object.keys(baseCells),
      ...Object.keys(targetCells),
    ]);

    let maxRow = 1;
    let maxCol = 1;
    let addedCells = 0;
    let removedCells = 0;
    let modifiedValueCells = 0;
    let modifiedFormulaCells = 0;
    const changedEntries: SpreadsheetCellDiffEntry[] = [];
    const entryByAddress = new Map<string, SpreadsheetCellDiffEntry>();

    for (const addr of allAddresses) {
      const parsed = ParseCellAddress(addr);
      if (!parsed) continue;
      const bCell: SpreadsheetCellSpec | undefined = baseCells[addr];
      const tCell: SpreadsheetCellSpec | undefined = targetCells[addr];

      const bHas = this.isPopulatedCell(bCell);
      const tHas = this.isPopulatedCell(tCell);
      if (!bHas && !tHas) continue;

      maxRow = Math.max(maxRow, parsed.row);
      maxCol = Math.max(maxCol, parsed.col);

      const oldDisp = this.readCellDisplay(bCell);
      const newDisp = this.readCellDisplay(tCell);
      const oldForm = bCell?.Formula?.trim() || null;
      const newForm = tCell?.Formula?.trim() || null;
      const styleChanged = JSON.stringify(bCell?.Style ?? null) !== JSON.stringify(tCell?.Style ?? null);

      let status: DiffStatusKind = 'unchanged';
      let valueChanged = false;
      let formulaChanged = false;

      if (!bHas && tHas) {
        status = !baseSheet ? 'added' : 'added';
        addedCells++;
        if (newForm) modifiedFormulaCells++;
      } else if (bHas && !tHas) {
        status = 'removed';
        removedCells++;
      } else {
        valueChanged = oldDisp !== newDisp;
        formulaChanged = oldForm !== newForm;
        if (valueChanged || formulaChanged || styleChanged) {
          status = 'modified';
          if (valueChanged) modifiedValueCells++;
          if (formulaChanged) modifiedFormulaCells++;
        }
      }

      const entry: SpreadsheetCellDiffEntry = {
        Address: addr,
        RowNumber: parsed.row,
        ColIndex: parsed.col,
        ColLetter: parsed.colLetter || ColumnIndexToLetter(parsed.col),
        Status: status,
        ValueChanged: valueChanged,
        FormulaChanged: formulaChanged,
        StyleChanged: styleChanged,
        OldDisplay: oldDisp,
        NewDisplay: newDisp,
        OldFormula: oldForm,
        NewFormula: newForm,
      };
      entryByAddress.set(addr, entry);
      if (status !== 'unchanged') {
        changedEntries.push(entry);
      }
    }

    changedEntries.sort((a, b) =>
      a.RowNumber !== b.RowNumber ? a.RowNumber - b.RowNumber : a.ColIndex - b.ColIndex,
    );

    // Cap rendered visual grid dimensions cleanly for large sheets
    const boundedRows = Math.min(Math.max(maxRow, 4), 40);
    const boundedCols = Math.min(Math.max(maxCol, 4), 14);
    const colLetters: string[] = [];
    for (let c = 1; c <= boundedCols; c++) {
      colLetters.push(ColumnIndexToLetter(c));
    }

    const gridRows: SpreadsheetGridDiffRow[] = [];
    for (let r = 1; r <= boundedRows; r++) {
      const cells: SpreadsheetCellDiffEntry[] = [];
      let rowHasChanges = false;
      for (let c = 1; c <= boundedCols; c++) {
        const addr = FormatCellAddress(r, c);
        const existing = entryByAddress.get(addr);
        if (existing) {
          if (existing.Status !== 'unchanged') rowHasChanges = true;
          cells.push(existing);
        } else {
          cells.push({
            Address: addr,
            RowNumber: r,
            ColIndex: c,
            ColLetter: ColumnIndexToLetter(c),
            Status: 'unchanged',
            ValueChanged: false,
            FormulaChanged: false,
            StyleChanged: false,
            OldDisplay: '',
            NewDisplay: '',
            OldFormula: null,
            NewFormula: null,
          });
        }
      }
      gridRows.push({
        RowNumber: r,
        HasChanges: rowHasChanges,
        Cells: cells,
      });
    }

    let sheetStatus: DiffStatusKind = 'unchanged';
    if (!baseSheet && targetSheet) sheetStatus = 'added';
    else if (baseSheet && !targetSheet) sheetStatus = 'removed';
    else if (changedEntries.length > 0 || structureDeltas.length > 0) sheetStatus = 'modified';

    return {
      SheetKey: sheetKey,
      Name: activeName,
      OldName: oldName,
      Status: sheetStatus,
      AddedCells: addedCells,
      RemovedCells: removedCells,
      ModifiedValueCells: modifiedValueCells,
      ModifiedFormulaCells: modifiedFormulaCells,
      TotalChangedCells: changedEntries.length,
      ColumnLetters: colLetters,
      GridRows: gridRows,
      ChangedEntries: changedEntries,
      StructureDeltas: structureDeltas,
    };
  }

  private isPopulatedCell(cell: SpreadsheetCellSpec | undefined): boolean {
    if (!cell) return false;
    if (cell.Formula && cell.Formula.trim().length > 0) return true;
    if (cell.RawValue !== null && cell.RawValue !== undefined && String(cell.RawValue).trim() !== '') {
      return true;
    }
    if (cell.DisplayValue && cell.DisplayValue.trim().length > 0) return true;
    return false;
  }

  private readCellDisplay(cell: SpreadsheetCellSpec | undefined): string {
    if (!cell) return '';
    if (cell.DisplayValue !== undefined && cell.DisplayValue !== null && cell.DisplayValue !== '') {
      return cell.DisplayValue;
    }
    if (cell.ComputedValue !== undefined && cell.ComputedValue !== null) {
      return String(cell.ComputedValue);
    }
    if (cell.RawValue !== undefined && cell.RawValue !== null) {
      return String(cell.RawValue);
    }
    return '';
  }

  private formatComponentLocation(spec: ComponentSpec | null): string {
    if (!spec) return '';
    if (spec.location === 'registry') {
      return [spec.registry, spec.namespace, spec.version].filter(Boolean).join(' / ') || 'registry';
    }
    return spec.namespace ? `embedded (${spec.namespace})` : 'embedded';
  }

  private compareComponentLibraries(
    base: ComponentSpec | null,
    target: ComponentSpec | null,
  ): ComponentLibraryDiffItem[] {
    const bLibs = base?.libraries ?? [];
    const tLibs = target?.libraries ?? [];
    const bMap = new Map(bLibs.map((l) => [l.name, l]));
    const seen = new Set<string>();
    const out: ComponentLibraryDiffItem[] = [];

    for (const tl of tLibs) {
      const bl = bMap.get(tl.name);
      if (!bl) {
        out.push({
          Name: tl.name,
          GlobalVariable: tl.globalVariable,
          Status: 'added',
          OldVersion: '—',
          NewVersion: tl.version || 'latest',
        });
      } else {
        seen.add(bl.name);
        const changed = (bl.version ?? '') !== (tl.version ?? '') || bl.globalVariable !== tl.globalVariable;
        if (changed) {
          out.push({
            Name: tl.name,
            GlobalVariable: tl.globalVariable,
            Status: 'modified',
            OldVersion: bl.version || 'latest',
            NewVersion: tl.version || 'latest',
          });
        }
      }
    }

    for (const bl of bLibs) {
      if (!seen.has(bl.name)) {
        out.push({
          Name: bl.name,
          GlobalVariable: bl.globalVariable,
          Status: 'removed',
          OldVersion: bl.version || 'latest',
          NewVersion: '—',
        });
      }
    }

    return out;
  }

  private compareComponentEntities(
    base: ComponentSpec | null,
    target: ComponentSpec | null,
  ): ComponentEntityReqDiffItem[] {
    const bEnts = base?.dataRequirements?.entities ?? [];
    const tEnts = target?.dataRequirements?.entities ?? [];
    const bMap = new Map(bEnts.map((e) => [e.name, e]));
    const seen = new Set<string>();
    const out: ComponentEntityReqDiffItem[] = [];

    for (const te of tEnts) {
      const be = bMap.get(te.name);
      if (!be) {
        out.push({
          EntityName: te.name,
          Status: 'added',
          Summary: `Permissions: ${(te.permissionLevelNeeded ?? []).join(', ') || 'read'} · ${te.displayFields?.length ?? 0} display fields`,
          PropertyDeltas: [],
        });
      } else {
        seen.add(be.name);
        const deltas: PropertyDeltaItem[] = [];
        this.pushScalarDelta(
          deltas,
          'Permissions',
          (be.permissionLevelNeeded ?? []).join(', '),
          (te.permissionLevelNeeded ?? []).join(', '),
        );
        this.pushScalarDelta(
          deltas,
          'Display Fields',
          (be.displayFields ?? []).join(', '),
          (te.displayFields ?? []).join(', '),
        );
        this.pushScalarDelta(
          deltas,
          'Filter Fields',
          (be.filterFields ?? []).join(', '),
          (te.filterFields ?? []).join(', '),
        );
        this.pushScalarDelta(
          deltas,
          'Sort Fields',
          (be.sortFields ?? []).join(', '),
          (te.sortFields ?? []).join(', '),
        );
        if (deltas.length > 0) {
          out.push({
            EntityName: te.name,
            Status: 'modified',
            Summary: `${deltas.length} data-access change${deltas.length === 1 ? '' : 's'}`,
            PropertyDeltas: deltas,
          });
        }
      }
    }

    for (const be of bEnts) {
      if (!seen.has(be.name)) {
        out.push({
          EntityName: be.name,
          Status: 'removed',
          Summary: 'Entity requirement removed',
          PropertyDeltas: [],
        });
      }
    }

    return out;
  }

  private compareComponentQueries(
    base: ComponentSpec | null,
    target: ComponentSpec | null,
  ): ComponentQueryReqDiffItem[] {
    const bQs = base?.dataRequirements?.queries ?? [];
    const tQs = target?.dataRequirements?.queries ?? [];
    const keyOf = (q: { categoryPath?: string; name: string }) =>
      `${q.categoryPath ?? ''}/${q.name}`;
    const bMap = new Map(bQs.map((q) => [keyOf(q), q]));
    const seen = new Set<string>();
    const out: ComponentQueryReqDiffItem[] = [];

    for (const tq of tQs) {
      const k = keyOf(tq);
      const bq = bMap.get(k);
      if (!bq) {
        out.push({
          QueryKey: k,
          Name: tq.name,
          CategoryPath: tq.categoryPath ?? '',
          Status: 'added',
          Summary: `Added query (${tq.fields?.length ?? 0} fields)`,
          SqlDiff: tq.newQuerySQL ? this.ComputeGitTextDiff('', tq.newQuerySQL, false) : null,
        });
      } else {
        seen.add(k);
        const oldFields = (bq.fields ?? []).map((f) => f.name).join(', ');
        const newFields = (tq.fields ?? []).map((f) => f.name).join(', ');
        const sqlChanged = (bq.newQuerySQL ?? '').trim() !== (tq.newQuerySQL ?? '').trim();
        if (oldFields !== newFields || sqlChanged) {
          out.push({
            QueryKey: k,
            Name: tq.name,
            CategoryPath: tq.categoryPath ?? '',
            Status: 'modified',
            Summary: sqlChanged ? 'Modified inline SQL & fields' : `Fields updated (${tq.fields?.length ?? 0})`,
            SqlDiff: sqlChanged
              ? this.ComputeGitTextDiff(bq.newQuerySQL ?? '', tq.newQuerySQL ?? '', false)
              : null,
          });
        }
      }
    }

    for (const bq of bQs) {
      const k = keyOf(bq);
      if (!seen.has(k)) {
        out.push({
          QueryKey: k,
          Name: bq.name,
          CategoryPath: bq.categoryPath ?? '',
          Status: 'removed',
          Summary: 'Query requirement removed',
          SqlDiff: null,
        });
      }
    }

    return out;
  }

  private compareComponentCodeUnits(
    base: ComponentSpec | null,
    target: ComponentSpec | null,
  ): ComponentCodeUnitDiff[] {
    const units: ComponentCodeUnitDiff[] = [];

    // 1. Root component code + complete assembled code
    const baseRootCode = base?.code ?? '';
    const targetRootCode = target?.code ?? '';
    const rootDiff = this.ComputeGitTextDiff(baseRootCode, targetRootCode, false);
    units.push({
      UnitKey: 'root',
      ComponentName: target?.name || base?.name || 'RootComponent',
      RoleLabel: 'Root Component',
      Status: !base
        ? 'added'
        : !target
          ? 'removed'
          : rootDiff.IsIdentical
            ? 'unchanged'
            : 'modified',
      CodeDiff: rootDiff,
    });

    // 2. Flatten nested `dependencies` sub-components
    const baseDeps = this.collectDependencyMap(base?.dependencies ?? []);
    const targetDeps = this.collectDependencyMap(target?.dependencies ?? []);
    const seenDeps = new Set<string>();

    for (const [depName, tDep] of targetDeps.entries()) {
      const bDep = baseDeps.get(depName);
      if (!bDep) {
        units.push({
          UnitKey: `dep:${depName}`,
          ComponentName: depName,
          RoleLabel: tDep.location === 'registry' ? 'Registry Dependency' : 'Sub-Component',
          Status: 'added',
          CodeDiff: this.ComputeGitTextDiff('', tDep.code ?? '', false),
        });
      } else {
        seenDeps.add(depName);
        const depDiff = this.ComputeGitTextDiff(bDep.code ?? '', tDep.code ?? '', false);
        units.push({
          UnitKey: `dep:${depName}`,
          ComponentName: depName,
          RoleLabel: tDep.location === 'registry' ? 'Registry Dependency' : 'Sub-Component',
          Status: depDiff.IsIdentical ? 'unchanged' : 'modified',
          CodeDiff: depDiff,
        });
      }
    }

    for (const [depName, bDep] of baseDeps.entries()) {
      if (!seenDeps.has(depName)) {
        units.push({
          UnitKey: `dep:${depName}`,
          ComponentName: depName,
          RoleLabel: bDep.location === 'registry' ? 'Registry Dependency' : 'Sub-Component',
          Status: 'removed',
          CodeDiff: this.ComputeGitTextDiff(bDep.code ?? '', '', false),
        });
      }
    }

    // Also include complete assembled bundle diff when sub-components exist
    if ((base?.dependencies?.length ?? 0) > 0 || (target?.dependencies?.length ?? 0) > 0) {
      const fullBase = base ? BuildComponentCompleteCode(base) : '';
      const fullTarget = target ? BuildComponentCompleteCode(target) : '';
      const fullDiff = this.ComputeGitTextDiff(fullBase, fullTarget, false);
      units.push({
        UnitKey: 'bundle:complete',
        ComponentName: 'Complete Assembled Bundle',
        RoleLabel: 'Full Runtime Bundle',
        Status: fullDiff.IsIdentical ? 'unchanged' : 'modified',
        CodeDiff: fullDiff,
      });
    }

    return units;
  }

  private collectDependencyMap(
    deps: ComponentSpec[],
    target = new Map<string, ComponentSpec>(),
  ): Map<string, ComponentSpec> {
    for (const d of deps) {
      if (d?.name && !target.has(d.name)) {
        target.set(d.name, d);
      }
      if (d?.dependencies?.length) {
        this.collectDependencyMap(d.dependencies, target);
      }
    }
    return target;
  }

  private extractNormalizedTables(spec: RawDataArtifactPayload): DataTable[] {
    try {
      const recordShape: Record<string, object | string | number | boolean | null | undefined> = {
        ...spec,
      };
      return NormalizeToTables(recordShape, spec.title || 'Results');
    } catch {
      return [];
    }
  }

  private extractEffectiveSql(spec: RawDataArtifactPayload, tables: DataTable[]): string {
    if (tables.length > 1) {
      const multi = BuildMultiTableSql(tables);
      if (multi) return multi;
    }
    if (spec.metadata?.sql) {
      return spec.metadata.sql;
    }
    if (tables.length === 1 && tables[0].metadata?.sql) {
      return tables[0].metadata.sql;
    }
    return '';
  }

  private compareRecordDictionaries(
    baseDict: Record<string, string | number | boolean>,
    targetDict: Record<string, string | number | boolean>,
  ): PropertyDeltaItem[] {
    const keys = new Set([...Object.keys(baseDict), ...Object.keys(targetDict)]);
    const out: PropertyDeltaItem[] = [];
    for (const k of keys) {
      const hasB = Object.prototype.hasOwnProperty.call(baseDict, k);
      const hasT = Object.prototype.hasOwnProperty.call(targetDict, k);
      if (!hasB && hasT) {
        out.push({ Label: `@${k}`, Status: 'added', OldValue: '—', NewValue: String(targetDict[k]) });
      } else if (hasB && !hasT) {
        out.push({ Label: `@${k}`, Status: 'removed', OldValue: String(baseDict[k]), NewValue: '—' });
      } else if (String(baseDict[k]) !== String(targetDict[k])) {
        out.push({
          Label: `@${k}`,
          Status: 'modified',
          OldValue: String(baseDict[k]),
          NewValue: String(targetDict[k]),
        });
      }
    }
    return out;
  }

  private compareQueryTables(
    baseTables: DataTable[],
    targetTables: DataTable[],
  ): QueryTableDiffItem[] {
    const bMap = new Map(baseTables.map((t) => [t.name, t]));
    const seen = new Set<string>();
    const out: QueryTableDiffItem[] = [];

    for (const tt of targetTables) {
      const bt = bMap.get(tt.name) ?? (baseTables.length === 1 && targetTables.length === 1 ? baseTables[0] : undefined);
      if (!bt) {
        out.push(this.buildQueryTableDiff(null, tt));
      } else {
        seen.add(bt.name);
        out.push(this.buildQueryTableDiff(bt, tt));
      }
    }

    for (const bt of baseTables) {
      if (!seen.has(bt.name)) {
        out.push(this.buildQueryTableDiff(bt, null));
      }
    }

    return out;
  }

  private buildQueryTableDiff(
    bt: DataTable | null,
    tt: DataTable | null,
  ): QueryTableDiffItem {
    const bCols = bt?.columns ?? [];
    const tCols = tt?.columns ?? [];
    const bColMap = new Map(bCols.map((c) => [c.field, c]));
    const seenCols = new Set<string>();
    const colDeltas: QueryColumnSchemaDelta[] = [];

    for (const tc of tCols) {
      const bc = bColMap.get(tc.field);
      const tLabel = tc.displayName || tc.field;
      const tType = tc.sqlFullType || tc.sqlBaseType || 'string';
      if (!bc) {
        colDeltas.push({
          FieldName: tc.field,
          Status: 'added',
          OldType: '—',
          NewType: tType,
          OldLabel: '—',
          NewLabel: tLabel,
        });
      } else {
        seenCols.add(bc.field);
        const bLabel = bc.displayName || bc.field;
        const bType = bc.sqlFullType || bc.sqlBaseType || 'string';
        const changed = bType !== tType || bLabel !== tLabel;
        colDeltas.push({
          FieldName: tc.field,
          Status: changed ? 'modified' : 'unchanged',
          OldType: bType,
          NewType: tType,
          OldLabel: bLabel,
          NewLabel: tLabel,
        });
      }
    }

    for (const bc of bCols) {
      if (!seenCols.has(bc.field)) {
        colDeltas.push({
          FieldName: bc.field,
          Status: 'removed',
          OldType: bc.sqlFullType || bc.sqlBaseType || 'string',
          NewType: '—',
          OldLabel: bc.displayName || bc.field,
          NewLabel: '—',
        });
      }
    }

    const previewCols = (tCols.length > 0 ? tCols : bCols).slice(0, 6).map((c) => c.field);
    const formatRows = (rows: DataTable['rows'] | undefined) =>
      (rows ?? []).slice(0, 5).map((r) => {
        const rec: Record<string, string> = {};
        for (const col of previewCols) {
          const val = r[col];
          rec[col] = val == null ? '—' : String(val);
        }
        return rec;
      });

    const status: DiffStatusKind = !bt
      ? 'added'
      : !tt
        ? 'removed'
        : colDeltas.some((c) => c.Status !== 'unchanged') ||
            (bt.rows?.length ?? 0) !== (tt.rows?.length ?? 0)
          ? 'modified'
          : 'unchanged';

    return {
      TableName: tt?.name ?? bt?.name ?? 'Results',
      Status: status,
      OldRowCount: bt ? (bt.metadata?.rowCount ?? bt.rows?.length ?? null) : null,
      NewRowCount: tt ? (tt.metadata?.rowCount ?? tt.rows?.length ?? null) : null,
      ColumnDeltas: colDeltas,
      SamplePreviewColumns: previewCols,
      BaseSampleRows: formatRows(bt?.rows),
      TargetSampleRows: formatRows(tt?.rows),
    };
  }

  private pushScalarDelta(
    list: PropertyDeltaItem[],
    label: string,
    oldVal: string,
    newVal: string,
  ): void {
    const o = oldVal.trim();
    const n = newVal.trim();
    if (o === n) return;
    if (!o && n) {
      list.push({ Label: label, Status: 'added', OldValue: '—', NewValue: n });
    } else if (o && !n) {
      list.push({ Label: label, Status: 'removed', OldValue: o, NewValue: '—' });
    } else {
      list.push({ Label: label, Status: 'modified', OldValue: o, NewValue: n });
    }
  }

  private countWords(text: string): number {
    const matches = text.match(/[A-Za-z0-9_]+/g);
    return matches ? matches.length : 0;
  }
}
