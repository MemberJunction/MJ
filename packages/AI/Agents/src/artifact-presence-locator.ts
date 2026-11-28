import { GetGlobalObjectStore } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { ArtifactJsonValue, ArtifactToolArgs } from '@memberjunction/ai-core-plus';
import {
    FormatCellAddress,
    ParseCellAddress,
    ParseRangeAddress,
    SpreadsheetEngine,
    type SlideDeckSpec,
    type WorkbookSpec,
} from '@memberjunction/core-entities';

/** Global store key shared with `ArtifactCollaborationServer` for live Yjs mutation reconciliation. */
export const ARTIFACT_LIVE_MUTATION_HOOK_KEY = '___MJ_ARTIFACT_LIVE_MUTATION_HOOK___';

/** MJGlobal component event code broadcast after an agent mutates a collaborative artifact. */
export const ARTIFACT_LIVE_MUTATION_EVENT_CODE = 'ArtifactCollaboration.LiveContentMutation';

/** Canonical set of mutating tool names across governed artifact tool libraries. */
export const MUTATING_ARTIFACT_TOOL_NAMES: ReadonlySet<string> = new Set([
    // DocumentToolLibrary
    'insert_block_after',
    'replace_block',
    'delete_block',
    'move_block',
    'duplicate_block',
    'upsert_table',
    'mutate_markdown_table',
    'upsert_frontmatter',
    'set_design_preset',
    'batch',
    'insert_live_block',
    'embed_artifact_block',
    // SpreadsheetToolLibrary
    'write_cells',
    'clear_range',
    'format_range',
    'insert_rows',
    'delete_rows',
    'insert_columns',
    'delete_columns',
    'add_sheet',
    'rename_sheet',
    'delete_sheet',
    'duplicate_sheet',
    'reorder_sheets',
    'set_sheet_layout',
    'upsert_live_table',
    'refresh_live_tables',
    'delete_live_table',
    'upsert_chart',
    'delete_chart',
    'embed_artifact',
    'delete_embedded_artifact',
    'sort_and_filter',
    'merge_cells',
    'unmerge_cells',
    'upsert_conditional_format',
    'delete_conditional_format',
    'upsert_validation_rule',
    'delete_validation_rule',
    'upsert_named_range',
    'delete_named_range',
    // SlideDeckToolLibrary
    'add_slide',
    'update_slide',
    'delete_slide',
    'duplicate_slide',
    'reorder_slides',
    'upsert_slide_element',
    'update_slide_region',
    'delete_slide_element',
    'duplicate_region',
    'align_distribute_regions',
    'update_speaker_notes',
    'upsert_speaker_notes',
    'batch_mutate_slides',
    'apply_theme',
    'update_deck_metadata',
    'generate_deck_from_markdown',
    // Cross-domain locking & NW-3 suggestions
    'set_lock',
    'release_lock',
    'propose_suggestion',
    'review_suggestion',
    // WhiteboardToolLibrary
    'upsert_nodes',
    'UpsertNodes',
    'connect_nodes',
    'ConnectNodes',
    'add_sticky_notes',
    'AddStickyNotes',
    'delete_elements',
    'DeleteElements',
    'auto_layout',
    'AutoLayout',
]);

/** Payload emitted whenever an agent artifact mutation tool updates an artifact's content. */
export interface ArtifactLiveMutationEvent {
    artifactId: string;
    alphaId: string;
    versionId?: string;
    versionNumber?: number;
    previousContent?: string;
    updatedContent: string;
    xlsxBase64?: string;
    configurationPatch?: ArtifactToolArgs;
    tool: string;
    contextUser?: UserInfo;
    agentRunId?: string;
    agentName?: string;
    deferCommit?: boolean;
}

/** Optional reconciliation outcome returned by {@link ArtifactLiveMutationHook}. */
export interface ArtifactLiveMutationHookResult {
    applied?: boolean;
    mergedContent?: string;
    hadConflict?: boolean;
    rejectedHunksCount?: number;
    rejectedAgentHunks?: Array<{
        BaseLines: string[];
        LiveLines: string[];
        RejectedAgentLines: string[];
    }>;
    commit?: (persisted?: { versionId?: string; versionNumber?: number }) => Promise<ArtifactLiveMutationHookResult | void>;
    rollback?: (rolledBackVersionId?: string) => Promise<void> | void;
}

/** Callback registered by collaboration hosts to reconcile agent mutations with live Yjs rooms. */
export type ArtifactLiveMutationHook = (
    event: ArtifactLiveMutationEvent,
) => void | ArtifactLiveMutationHookResult | Promise<void | ArtifactLiveMutationHookResult>;

/** Registers (or clears when `null`) the process-wide {@link ArtifactLiveMutationHook}. */
export function SetArtifactLiveMutationHook(hook: ArtifactLiveMutationHook | null): void {
    const store = GetGlobalObjectStore();
    if (!store) return;
    if (hook) {
        store[ARTIFACT_LIVE_MUTATION_HOOK_KEY] = hook;
    } else {
        delete store[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
    }
}

/** Retrieves the currently registered process-wide {@link ArtifactLiveMutationHook}, if any. */
export function GetArtifactLiveMutationHook(): ArtifactLiveMutationHook | null {
    const store = GetGlobalObjectStore();
    const candidate = store?.[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
    return typeof candidate === 'function' ? (candidate as ArtifactLiveMutationHook) : null;
}

/** Global store key shared with `ArtifactCollaborationServer` for server-owned Yjs agent presence awareness. */
export const ARTIFACT_AGENT_PRESENCE_HOOK_KEY = '___MJ_ARTIFACT_AGENT_PRESENCE_HOOK___';

/** Global store key shared with `ArtifactCollaborationServer` for reading uncompacted live Yjs room content. */
export const ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY = '___MJ_ARTIFACT_LIVE_CONTENT_READER_HOOK___';

/** Lifecycle phases for server-emitted agent awareness in collaborative artifact rooms. */
export type ArtifactAgentPresencePhase = 'enter' | 'working' | 'settled' | 'exit';

/**
 * Structural coordinate identifying where inside an artifact an agent is reading or editing.
 * Deliberately domain-semantic (cell range, slide, section/block) rather than screen pixel `(x, y)`
 * so remote viewers on any screen size see a clean structural indicator rather than a mouse cursor.
 */
export interface ArtifactAgentTargetLocation {
    /** Viewer domain for deterministic coordinate mapping. */
    Domain: 'spreadsheet' | 'document' | 'slides' | 'whiteboard' | 'generic';
    /** Spreadsheet target worksheet ID. */
    SheetID?: string;
    /** Spreadsheet target worksheet display name. */
    SheetName?: string;
    /** Normalized A1 cell or rectangular range (e.g., `"A1:F48"`). */
    Range?: string;
    /** Slide Deck target slide ID. */
    SlideID?: string;
    /** 1-based slide index inside the deck. */
    SlideNumber?: number;
    /** Optional slide element/region ID. */
    ElementID?: string;
    /** Markdown Document section heading text. */
    SectionHeading?: string;
    /** Markdown Document block identifier or live block ID. */
    BlockID?: string;
    /** 1-based start line inside the Markdown document. */
    StartLine?: number;
    /** 1-based end line inside the Markdown document. */
    EndLine?: number;
}

/**
 * Strongly-typed event emitted when an AI agent enters, works on, settles, or exits a collaborative artifact.
 */
export interface ArtifactAgentPresenceEvent {
    ArtifactID: string;
    Phase: ArtifactAgentPresencePhase;
    /** Unique key per concurrent agent run (`agentRunId` when present, else `action:<id>`). */
    AgentPresenceKey: string;
    AgentRunID?: string;
    AgentName: string;
    /** Authenticated human principal on whose behalf the agent is acting (`contextUser`). */
    ActingForUserID: string;
    ActingForUserName: string;
    ActingForUserEmail?: string;
    /** Active tool name (e.g., `'upsert_live_table'`, `'replace_block'`, `'update_slide'`). */
    ToolName?: string;
    /** Concise human-friendly verb phrase shown in the collaboration bar and region indicator. */
    ActionSummary?: string;
    /** Resolved structural location inside the artifact. */
    Location?: ArtifactAgentTargetLocation;
    TimestampMs: number;
}

export type ArtifactAgentPresenceHook = (event: ArtifactAgentPresenceEvent) => Promise<void> | void;

/** Snapshot returned by the live Yjs room content reader when an active collaboration room is loaded. */
export interface ArtifactLiveRoomSnapshot {
    Content: string;
    VersionNumber?: number;
    VersionID?: string | null;
    Configuration?: string;
    Suggestions?: ArtifactJsonValue[];
}

export type ArtifactLiveContentReaderHook = (
    artifactId: string,
    contextUser?: UserInfo
) => Promise<ArtifactLiveRoomSnapshot | null> | ArtifactLiveRoomSnapshot | null;

/** Registers (or clears when `null`) the process-wide agent presence hook in the global object store. */
export function SetArtifactAgentPresenceHook(hook: ArtifactAgentPresenceHook | null): void {
    const store = GetGlobalObjectStore();
    if (!store) return;
    if (hook) {
        store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY] = hook;
    } else {
        delete store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY];
    }
}

/** Retrieves the currently registered agent presence hook, if any. */
export function GetArtifactAgentPresenceHook(): ArtifactAgentPresenceHook | null {
    const store = GetGlobalObjectStore();
    const candidate = store?.[ARTIFACT_AGENT_PRESENCE_HOOK_KEY];
    return typeof candidate === 'function' ? (candidate as ArtifactAgentPresenceHook) : null;
}

/** Registers (or clears when `null`) the process-wide live Yjs room content reader hook. */
export function SetArtifactLiveContentReaderHook(hook: ArtifactLiveContentReaderHook | null): void {
    const store = GetGlobalObjectStore();
    if (!store) return;
    if (hook) {
        store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY] = hook;
    } else {
        delete store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY];
    }
}

/** Retrieves the currently registered live Yjs room content reader hook, if any. */
export function GetArtifactLiveContentReaderHook(): ArtifactLiveContentReaderHook | null {
    const store = GetGlobalObjectStore();
    const candidate = store?.[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY];
    return typeof candidate === 'function' ? (candidate as ArtifactLiveContentReaderHook) : null;
}

/** Canonicalizes high-level domain aliases onto the viewer domain enum. */
export function ResolvePresenceDomain(artifactTypeName: string | undefined): ArtifactAgentTargetLocation['Domain'] {
    const normalized = (artifactTypeName ?? '').trim().toLowerCase();
    if (normalized === 'excel spreadsheet' || normalized === 'spreadsheet' || normalized === 'sheets') {
        return 'spreadsheet';
    }
    if (normalized === 'markdown document' || normalized === 'document' || normalized === 'docs' || normalized === 'markdown') {
        return 'document';
    }
    if (normalized === 'presentation' || normalized === 'slides' || normalized === 'slide deck') {
        return 'slides';
    }
    if (normalized === 'whiteboard' || normalized === 'whiteboard diagram') {
        return 'whiteboard';
    }
    return 'generic';
}

/**
 * Extracts a deterministic structural target location from an artifact tool call's inputs,
 * current artifact content, and optional post-tool data (e.g., materialized table bounds).
 */
export function ExtractAgentTargetLocation(
    toolName: string,
    input: ArtifactToolArgs,
    content: string | Buffer | undefined,
    artifactTypeName: string | undefined,
    toolData?: ArtifactToolArgs | null
): ArtifactAgentTargetLocation {
    const domain = ResolvePresenceDomain(artifactTypeName);
    const contentStr = Buffer.isBuffer(content) ? '' : (content ?? '');

    switch (domain) {
        case 'spreadsheet':
            return extractSpreadsheetLocation(toolName, input, contentStr, toolData);
        case 'slides':
            return extractSlideDeckLocation(input, contentStr, toolData);
        case 'document':
            return extractDocumentLocation(toolName, input, contentStr, toolData);
        case 'whiteboard':
            return { Domain: 'whiteboard' };
        default:
            return { Domain: 'generic' };
    }
}

/** Produces a concise human-readable action phrase for the collaboration header & region badge. */
export function FormatAgentActionSummary(
    toolName: string,
    input: ArtifactToolArgs,
    location?: ArtifactAgentTargetLocation
): string {
    const tool = toolName.trim();
    const targetSuffix = formatLocationSuffix(location);

    const verbMap: Record<string, string> = {
        create_artifact: 'Created artifact',
        open_artifact: 'Inspecting artifact',
        write_cells: 'Writing cells',
        clear_range: 'Clearing range',
        format_range: 'Formatting range',
        read_range: 'Reading range',
        insert_rows: 'Inserting rows',
        delete_rows: 'Deleting rows',
        insert_columns: 'Inserting columns',
        delete_columns: 'Deleting columns',
        add_sheet: 'Adding worksheet',
        rename_sheet: 'Renaming worksheet',
        delete_sheet: 'Removing worksheet',
        duplicate_sheet: 'Duplicating worksheet',
        reorder_sheets: 'Reordering worksheets',
        set_sheet_layout: 'Updating worksheet layout',
        upsert_live_table: 'Refreshing live query table',
        refresh_live_tables: 'Refreshing live tables',
        delete_live_table: 'Removing live table',
        upsert_chart: 'Building chart',
        delete_chart: 'Removing chart',
        embed_artifact: 'Embedding artifact',
        delete_embedded_artifact: 'Removing embedded artifact',
        sort_and_filter: 'Sorting & filtering',
        insert_block_after: 'Adding section content',
        replace_block: 'Updating block',
        delete_block: 'Removing block',
        move_block: 'Moving block',
        duplicate_block: 'Duplicating block',
        upsert_table: 'Updating table',
        insert_live_block: 'Linking live MJ block',
        embed_artifact_block: 'Embedding visual block',
        add_slide: 'Adding slide',
        update_slide: 'Updating slide',
        delete_slide: 'Removing slide',
        duplicate_slide: 'Duplicating slide',
        reorder_slides: 'Reordering slides',
        upsert_slide_element: 'Updating slide layout',
        update_slide_region: 'Updating slide region',
        delete_slide_element: 'Removing slide element',
        update_speaker_notes: 'Updating speaker notes',
        apply_theme: 'Applying deck theme',
        update_deck_metadata: 'Updating deck metadata',
        generate_deck_from_markdown: 'Building presentation',
    };

    const baseVerb = verbMap[tool] ?? tool.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (tool === 'add_sheet' && typeof input.name === 'string' && input.name.trim()) {
        return `${baseVerb} "${input.name.trim()}"`;
    }
    return targetSuffix ? `${baseVerb} (${targetSuffix})` : baseVerb;
}

function formatLocationSuffix(loc?: ArtifactAgentTargetLocation): string {
    if (!loc) return '';
    if (loc.Domain === 'spreadsheet') {
        const sheetPart = loc.SheetName || loc.SheetID;
        if (sheetPart && loc.Range) return `${sheetPart}!${loc.Range}`;
        if (loc.Range) return loc.Range;
        if (sheetPart) return sheetPart;
    }
    if (loc.Domain === 'slides') {
        if (typeof loc.SlideNumber === 'number' && loc.SlideNumber > 0) {
            return `Slide ${loc.SlideNumber}`;
        }
        if (loc.SlideID) return loc.SlideID;
    }
    if (loc.Domain === 'document') {
        if (loc.SectionHeading) return `"${loc.SectionHeading}"`;
        if (loc.BlockID) return loc.BlockID;
        if (typeof loc.StartLine === 'number') return `Line ${loc.StartLine}`;
    }
    return '';
}

function extractSpreadsheetLocation(
    toolName: string,
    input: ArtifactToolArgs,
    contentStr: string,
    toolData?: ArtifactToolArgs | null
): ArtifactAgentTargetLocation {
    let workbook: WorkbookSpec | null = null;
    if (contentStr.trim().startsWith('{')) {
        try {
            workbook = SpreadsheetEngine.Instance.ParseWorkbook(contentStr, undefined, { SkipEvaluate: true });
        } catch {
            workbook = null;
        }
    }

    const requestedSheetId =
        typeof toolData?.sheetId === 'string'
            ? toolData.sheetId
            : typeof input.sheet === 'string'
              ? input.sheet.trim()
              : undefined;
    const requestedSheetName =
        typeof toolData?.sheetName === 'string'
            ? toolData.sheetName
            : typeof input.name === 'string' && toolName === 'add_sheet'
              ? input.name.trim()
              : undefined;

    let resolvedSheetId = requestedSheetId;
    let resolvedSheetName = requestedSheetName;
    if (workbook) {
        const ws =
            (requestedSheetId ? SpreadsheetEngine.Instance.GetWorksheet(workbook, requestedSheetId) : undefined) ??
            (requestedSheetName ? SpreadsheetEngine.Instance.GetWorksheet(workbook, requestedSheetName) : undefined) ??
            SpreadsheetEngine.Instance.GetWorksheet(workbook, workbook.ActiveSheetID) ??
            workbook.Worksheets[0];
        if (ws) {
            resolvedSheetId = ws.SheetID;
            resolvedSheetName = ws.Name;
        }
    }

    // Priority 1: Materialized table bounds returned by upsert_live_table / refresh_live_tables
    if (typeof toolData?.boundingRange === 'string' && toolData.boundingRange.trim()) {
        return {
            Domain: 'spreadsheet',
            SheetID: resolvedSheetId,
            SheetName: resolvedSheetName,
            Range: toolData.boundingRange.trim().toUpperCase(),
        };
    }

    // Priority 2: Cells array from write_cells / set_cells -> compute tight A1 bounding box
    if (Array.isArray(input.cells) && input.cells.length > 0) {
        let minRow = Number.POSITIVE_INFINITY;
        let minCol = Number.POSITIVE_INFINITY;
        let maxRow = 0;
        let maxCol = 0;
        for (const item of input.cells) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const addr = typeof item.address === 'string'
                ? item.address.trim()
                : '';
            const pos = addr ? ParseCellAddress(addr) : null;
            if (!pos) continue;
            if (pos.row < minRow) minRow = pos.row;
            if (pos.col < minCol) minCol = pos.col;
            if (pos.row > maxRow) maxRow = pos.row;
            if (pos.col > maxCol) maxCol = pos.col;
        }
        if (maxRow > 0 && maxCol > 0) {
            const start = FormatCellAddress(minRow, minCol);
            const end = FormatCellAddress(maxRow, maxCol);
            return {
                Domain: 'spreadsheet',
                SheetID: resolvedSheetId,
                SheetName: resolvedSheetName,
                Range: start === end ? start : `${start}:${end}`,
            };
        }
    }

    // Priority 3: Explicit range / sourceRange / anchorCell
    const rangeCandidates = [input.range, input.sourceRange, input.anchorCell, input.positionCell];
    for (const candidate of rangeCandidates) {
        if (typeof candidate !== 'string' || !candidate.trim()) continue;
        const normalized = candidate.trim().toUpperCase();
        if (ParseRangeAddress(normalized) || ParseCellAddress(normalized)) {
            return {
                Domain: 'spreadsheet',
                SheetID: resolvedSheetId,
                SheetName: resolvedSheetName,
                Range: normalized,
            };
        }
    }

    if (typeof input.atRowNumber === 'number' && input.atRowNumber > 0) {
        const rowNum = Math.trunc(input.atRowNumber);
        return {
            Domain: 'spreadsheet',
            SheetID: resolvedSheetId,
            SheetName: resolvedSheetName,
            Range: `A${rowNum}`,
        };
    }

    if (typeof input.atColumnNumber === 'number' && input.atColumnNumber > 0) {
        const addr = FormatCellAddress(1, Math.trunc(input.atColumnNumber));
        return {
            Domain: 'spreadsheet',
            SheetID: resolvedSheetId,
            SheetName: resolvedSheetName,
            Range: addr,
        };
    }

    return {
        Domain: 'spreadsheet',
        SheetID: resolvedSheetId,
        SheetName: resolvedSheetName,
        Range: resolvedSheetId ? 'A1' : undefined,
    };
}

function extractSlideDeckLocation(
    input: ArtifactToolArgs,
    contentStr: string,
    toolData?: ArtifactToolArgs | null
): ArtifactAgentTargetLocation {
    let deck: SlideDeckSpec | null = null;
    if (contentStr.trim().startsWith('{')) {
        try {
            deck = JSON.parse(contentStr) as SlideDeckSpec;
        } catch {
            deck = null;
        }
    }

    const slideIdCandidate =
        typeof toolData?.slideId === 'string'
            ? toolData.slideId
            : typeof input.slideId === 'string'
              ? input.slideId.trim()
              : undefined;
    const rawIndex =
        typeof toolData?.slideIndex === 'number'
            ? toolData.slideIndex
            : typeof input.slideIndex === 'number'
              ? input.slideIndex
              : typeof input.slideNumber === 'number'
                ? input.slideNumber - 1
                : undefined;

    let resolvedSlideId = slideIdCandidate;
    let resolvedSlideNumber = typeof rawIndex === 'number' && rawIndex >= 0 ? rawIndex + 1 : undefined;

    if (deck && Array.isArray(deck.Slides) && deck.Slides.length > 0) {
        if (resolvedSlideId) {
            const idx = deck.Slides.findIndex((s) => s.SlideID === resolvedSlideId);
            if (idx >= 0) {
                resolvedSlideNumber = idx + 1;
            }
        } else if (typeof rawIndex === 'number' && rawIndex >= 0 && rawIndex < deck.Slides.length) {
            resolvedSlideId = deck.Slides[rawIndex]?.SlideID;
        } else {
            resolvedSlideId = deck.Slides[0]?.SlideID;
            resolvedSlideNumber = 1;
        }
    }

    const elementId = typeof input.elementId === 'string' ? input.elementId.trim() : undefined;
    return {
        Domain: 'slides',
        SlideID: resolvedSlideId,
        SlideNumber: resolvedSlideNumber,
        ElementID: elementId || undefined,
    };
}

function extractDocumentLocation(
    _toolName: string,
    input: ArtifactToolArgs,
    contentStr: string,
    toolData?: ArtifactToolArgs | null
): ArtifactAgentTargetLocation {
    const blockId =
        typeof toolData?.blockId === 'string'
            ? toolData.blockId
            : typeof input.blockId === 'string'
              ? input.blockId.trim()
              : typeof input.targetBlockId === 'string'
                ? input.targetBlockId.trim()
                : typeof input.afterBlockId === 'string'
                  ? input.afterBlockId.trim()
                  : undefined;

    const sectionHeading =
        typeof input.heading === 'string'
            ? input.heading.trim()
            : typeof input.sectionHeading === 'string'
              ? input.sectionHeading.trim()
              : typeof input.title === 'string'
                ? input.title.trim()
                : undefined;

    let startLine = typeof input.startLine === 'number' ? input.startLine : undefined;
    let endLine = typeof input.endLine === 'number' ? input.endLine : undefined;

    if (!startLine && contentStr && (blockId || sectionHeading)) {
        const lines = contentStr.split(/\r?\n/);
        if (blockId) {
            const markerIdx = lines.findIndex(
                (l) => l.includes(`mj-block-id: ${blockId}`) || l.includes(`"BlockID":"${blockId}"`) || l.includes(`BlockID: ${blockId}`)
            );
            if (markerIdx >= 0) {
                startLine = markerIdx + 1;
                endLine = markerIdx + 1;
            }
        }
        if (!startLine && sectionHeading) {
            const needle = sectionHeading.toLowerCase();
            const headingIdx = lines.findIndex((l) => /^#{1,6}\s+/.test(l) && l.toLowerCase().includes(needle));
            if (headingIdx >= 0) {
                startLine = headingIdx + 1;
                endLine = headingIdx + 1;
            }
        }
    }

    return {
        Domain: 'document',
        SectionHeading: sectionHeading || undefined,
        BlockID: blockId || undefined,
        StartLine: startLine,
        EndLine: endLine,
    };
}
