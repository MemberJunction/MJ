import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ArtifactAgentPresenceEvent,
    ExtractAgentTargetLocation,
    FormatAgentActionSummary,
    GetArtifactAgentPresenceHook,
    GetArtifactLiveContentReaderHook,
    GetArtifactLiveMutationHook,
    MUTATING_ARTIFACT_TOOL_NAMES,
    ResolvePresenceDomain,
    SetArtifactAgentPresenceHook,
    SetArtifactLiveContentReaderHook,
    SetArtifactLiveMutationHook,
} from '../artifact-presence-locator';
import { SpreadsheetEngine } from '@memberjunction/core-entities';

describe('artifact-presence-locator', () => {
    afterEach(() => {
        SetArtifactAgentPresenceHook(null);
        SetArtifactLiveContentReaderHook(null);
        SetArtifactLiveMutationHook(null);
        vi.restoreAllMocks();
    });

    it('registers and clears global hooks in the global object store', () => {
        const presenceHook = vi.fn< (e: ArtifactAgentPresenceEvent) => void >();
        const readerHook = vi.fn().mockResolvedValue({ Content: '{}' });
        const mutationHook = vi.fn().mockResolvedValue(undefined);

        SetArtifactAgentPresenceHook(presenceHook);
        SetArtifactLiveContentReaderHook(readerHook);
        SetArtifactLiveMutationHook(mutationHook);

        expect(GetArtifactAgentPresenceHook()).toBe(presenceHook);
        expect(GetArtifactLiveContentReaderHook()).toBe(readerHook);
        expect(GetArtifactLiveMutationHook()).toBe(mutationHook);

        SetArtifactAgentPresenceHook(null);
        SetArtifactLiveContentReaderHook(null);
        SetArtifactLiveMutationHook(null);

        expect(GetArtifactAgentPresenceHook()).toBeNull();
        expect(GetArtifactLiveContentReaderHook()).toBeNull();
        expect(GetArtifactLiveMutationHook()).toBeNull();
    });

    it('resolves canonical and alias artifact type names to presence domains', () => {
        expect(ResolvePresenceDomain('Excel Spreadsheet')).toBe('spreadsheet');
        expect(ResolvePresenceDomain('Spreadsheet')).toBe('spreadsheet');
        expect(ResolvePresenceDomain('Markdown Document')).toBe('document');
        expect(ResolvePresenceDomain('Presentation')).toBe('slides');
        expect(ResolvePresenceDomain('Whiteboard Diagram')).toBe('whiteboard');
        expect(ResolvePresenceDomain('Unknown')).toBe('generic');
    });

    it('marks mutating domain tools accurately while excluding read-only tools', () => {
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('upsert_live_table')).toBe(true);
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('write_cells')).toBe(true);
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('insert_live_block')).toBe(true);
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('add_slide')).toBe(true);
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('read_range')).toBe(false);
        expect(MUTATING_ARTIFACT_TOOL_NAMES.has('get_outline')).toBe(false);
    });

    it('extracts spreadsheet bounding range from write_cells and upsert_live_table toolData', () => {
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Financials', ['Revenue']);
        const wbJson = SpreadsheetEngine.Instance.SerializeWorkbook(wb);

        const cellsLocation = ExtractAgentTargetLocation(
            'write_cells',
            {
                sheet: 'Revenue',
                cells: [
                    { address: 'B2', value: 100 },
                    { address: 'D5', value: 250 },
                    { address: 'C3', value: 150 },
                ],
            },
            wbJson,
            'Excel Spreadsheet',
        );
        expect(cellsLocation).toEqual({
            Domain: 'spreadsheet',
            SheetID: wb.Worksheets[0].SheetID,
            SheetName: 'Revenue',
            Range: 'B2:D5',
        });

        const tableLocation = ExtractAgentTargetLocation(
            'upsert_live_table',
            { sheet: 'Revenue', anchorCell: 'A1' },
            wbJson,
            'Excel Spreadsheet',
            { boundingRange: 'a1:e24', sheetName: 'Revenue', sheetId: wb.Worksheets[0].SheetID },
        );
        expect(tableLocation).toEqual({
            Domain: 'spreadsheet',
            SheetID: wb.Worksheets[0].SheetID,
            SheetName: 'Revenue',
            Range: 'A1:E24',
        });

        expect(FormatAgentActionSummary('upsert_live_table', {}, tableLocation)).toBe(
            'Refreshing live query table (Revenue!A1:E24)',
        );
    });

    it('extracts slide number and slideId for Presentation decks', () => {
        const deck = JSON.stringify({
            Title: 'Q3 Review',
            Slides: [
                { SlideID: 'slide-intro', Title: 'Intro' },
                { SlideID: 'slide-kpis', Title: 'KPI Summary' },
            ],
        });

        const loc = ExtractAgentTargetLocation(
            'update_slide_region',
            { slideId: 'slide-kpis', elementId: 'chart-1' },
            deck,
            'Presentation',
        );
        expect(loc).toEqual({
            Domain: 'slides',
            SlideID: 'slide-kpis',
            SlideNumber: 2,
            ElementID: 'chart-1',
        });
        expect(FormatAgentActionSummary('update_slide_region', {}, loc)).toBe('Updating slide region (Slide 2)');
    });

    it('extracts heading/block target location for Markdown documents', () => {
        const md = '# Executive Summary\n\nOverview text\n\n## Regional Revenue\n\nDetails here\n';
        const loc = ExtractAgentTargetLocation(
            'insert_live_block',
            { heading: 'Regional Revenue', blockId: 'blk-42' },
            md,
            'Markdown Document',
        );
        expect(loc.Domain).toBe('document');
        expect(loc.SectionHeading).toBe('Regional Revenue');
        expect(loc.BlockID).toBe('blk-42');
        expect(FormatAgentActionSummary('insert_live_block', {}, loc)).toBe(
            'Linking live MJ block ("Regional Revenue")',
        );
    });

    it('includes clear_range and Slice B parity tools in MUTATING_ARTIFACT_TOOL_NAMES and omits phantom/deferred tools', () => {
        const expectedMutating = [
            'clear_range',
            'move_block',
            'duplicate_block',
            'duplicate_slide',
            'update_deck_metadata',
            'format_range',
            'delete_rows',
            'delete_columns',
            'delete_chart',
            'delete_live_table',
            'delete_embedded_artifact',
            'set_sheet_layout',
            'duplicate_sheet',
            'reorder_sheets',
            'propose_suggestion',
            'review_suggestion',
            'merge_cells',
            'unmerge_cells',
            'upsert_conditional_format',
            'upsert_validation_rule',
            'upsert_named_range',
        ];
        for (const name of expectedMutating) {
            expect(MUTATING_ARTIFACT_TOOL_NAMES.has(name), `expected ${name} to be mutating`).toBe(true);
        }

        const phantomTools = ['replace_section', 'insert_section', 'delete_section', 'set_cells'];
        for (const name of phantomTools) {
            expect(MUTATING_ARTIFACT_TOOL_NAMES.has(name), `expected ${name} to be absent`).toBe(false);
        }
    });
});
