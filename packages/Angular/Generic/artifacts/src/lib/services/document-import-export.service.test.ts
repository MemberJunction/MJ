import { describe, it, expect } from 'vitest';
import type { DocumentBlockSpec } from '@memberjunction/core-entities';
import { DocumentImportExportService } from './document-import-export.service';
import type { DocumentAnchoredThread, DocumentSuggestionItem } from './document-collaboration.service';
import { InspectDocxArchive } from '../utils/docx-ooxml.util';

describe('DocumentImportExportService — DOCX interop, Track Changes, Comments, Round-Trip & Preflight', () => {
  const service = new DocumentImportExportService();

  const LIVE_BLOCK: DocumentBlockSpec = {
    BlockID: 'blk-arr-live',
    Kind: 'EntityView',
    Title: 'Enterprise Accounts',
    EntityName: 'Accounts',
    Mode: 'Live',
    DisplayMode: 'grid',
    MaxRows: 25,
  };

  const DOC_MARKDOWN = [
    '---',
    'designPreset: "executive-memo"',
    'pageSize: "a4"',
    'orientation: "portrait"',
    'watermark: "DRAFT"',
    'runningHeader: "Board Briefing"',
    '---',
    '# Q4 Executive Summary',
    '',
    'Quarterly revenue grew 28% year over year across enterprise accounts.',
    '',
    ':::mj-block',
    JSON.stringify(LIVE_BLOCK, null, 2),
    ':::',
    '',
    '| Region | ARR | YoY |',
    '| --- | --- | --- |',
    '| North America | $12.4M | +31% |',
  ].join('\n');

  it('exports .docx with markup (Word Track Changes + Margin Comments) and embeds MJBlocks + DesignPreset metadata', async () => {
    const suggestions: DocumentSuggestionItem[] = [
      {
        SuggestionID: 'sug-1',
        BlockID: 'p-1',
        AuthorName: 'Research Agent',
        CreatedAt: '2026-11-27T12:00:00.000Z',
        OriginalMarkdown: 'Quarterly revenue grew 28% year over year across enterprise accounts.',
        ProposedMarkdown: 'Quarterly revenue grew 32% year over year across enterprise accounts.',
        Rationale: 'Updated with final Q4 bookings',
        Status: 'Pending',
      },
    ];
    const threads: DocumentAnchoredThread[] = [
      {
        ConversationID: 'thread-1',
        AnchorKey: 'p-1',
        AnchorLabel: 'Executive Summary',
        QuotedText: 'Q4 Executive Summary',
        Status: 'Open',
        AgentMode: 'comment',
        CreatedAt: '2026-11-27T12:05:00.000Z',
        Messages: [
          {
            DetailID: 'm-1',
            UserName: 'Amith',
            Role: 'User',
            Message: 'Confirm EMEA numbers before board send.',
            CreatedAt: '2026-11-27T12:05:00.000Z',
            Mentions: [],
          },
        ],
      },
    ];

    const bytes = await service.ConvertMarkdownToDocxBytes(DOC_MARKDOWN, 'Q4 Board Memo', {
      ExportMode: 'markup',
      Suggestions: suggestions,
      AnchoredThreads: threads,
      EmbedLiveBlockMetadata: true,
    });

    expect(bytes.byteLength).toBeGreaterThan(2000);

    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const inspected = await InspectDocxArchive(arrayBuffer);

    expect(inspected.MJBlocks).toHaveLength(1);
    expect(inspected.MJBlocks[0].BlockID).toBe('blk-arr-live');
    expect(inspected.MJBlocks[0].EntityName).toBe('Accounts');
    expect(inspected.DesignConfig?.PresetID).toBe('executive-memo');
    expect(inspected.DesignConfig?.Watermark).toBe('DRAFT');
    expect(inspected.DesignConfig?.PageSize).toBe('a4');

    expect(inspected.TrackedChanges).toHaveLength(1);
    expect(inspected.TrackedChanges[0].Author).toBe('Research Agent');
    expect(inspected.TrackedChanges[0].DeletedText).toContain('28%');
    expect(inspected.TrackedChanges[0].InsertedText).toContain('32%');

    expect(inspected.Comments).toHaveLength(1);
    expect(inspected.Comments[0].Author).toBe('Amith');
    expect(inspected.Comments[0].BodyText).toContain('Confirm EMEA numbers');
  });

  it('exports clean .docx without Track Changes or Comments when ExportMode is clean', async () => {
    const suggestions: DocumentSuggestionItem[] = [
      {
        SuggestionID: 'sug-1',
        BlockID: 'p-1',
        AuthorName: 'Research Agent',
        CreatedAt: '2026-11-27T12:00:00.000Z',
        OriginalMarkdown: 'Quarterly revenue grew 28% year over year across enterprise accounts.',
        ProposedMarkdown: 'Quarterly revenue grew 32% year over year across enterprise accounts.',
        Rationale: 'Updated',
        Status: 'Pending',
      },
    ];
    const bytes = await service.ConvertMarkdownToDocxBytes(DOC_MARKDOWN, 'Clean Memo', {
      ExportMode: 'clean',
      Suggestions: suggestions,
    });
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const inspected = await InspectDocxArchive(arrayBuffer);
    expect(inspected.TrackedChanges).toHaveLength(0);
    expect(inspected.Comments).toHaveLength(0);
  });

  it('round-trips exported .docx back into MJ Docs restoring :::mj-block, design preset, tracked changes, and comments', async () => {
    const suggestions: DocumentSuggestionItem[] = [
      {
        SuggestionID: 'sug-1',
        BlockID: 'p-1',
        AuthorName: 'Copyedit Agent',
        CreatedAt: '2026-11-27T12:00:00.000Z',
        OriginalMarkdown: 'Quarterly revenue grew 28% year over year across enterprise accounts.',
        ProposedMarkdown: 'Quarterly revenue expanded 32% year over year across enterprise accounts.',
        Rationale: 'Polish wording',
        Status: 'Pending',
      },
    ];
    const threads: DocumentAnchoredThread[] = [
      {
        ConversationID: 'thread-1',
        AnchorKey: 'p-1',
        AnchorLabel: 'Q4 Executive Summary',
        QuotedText: 'Q4 Executive Summary',
        Status: 'Open',
        AgentMode: 'comment',
        CreatedAt: '2026-11-27T12:05:00.000Z',
        Messages: [
          {
            DetailID: 'm-1',
            UserName: 'Reviewer',
            Role: 'User',
            Message: 'Looks sharp.',
            CreatedAt: '2026-11-27T12:05:00.000Z',
            Mentions: [],
          },
        ],
      },
    ];

    const bytes = await service.ConvertMarkdownToDocxBytes(DOC_MARKDOWN, 'Roundtrip Test', {
      ExportMode: 'markup',
      Suggestions: suggestions,
      AnchoredThreads: threads,
      EmbedLiveBlockMetadata: true,
    });
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    // Simulate mammoth converting exported Word prose (including human edits made in Word)
    const mammothShim = {
      convertToHtml: async () => ({
        value: [
          '<p><strong>[DRAFT]</strong></p>',
          '<h1>Q4 Executive Summary (Edited in Word)</h1>',
          '<p>Quarterly revenue grew 28% year over year across enterprise accounts.</p>',
          '<p><strong>[MJ EntityView Block: Enterprise Accounts] (Live MJ Block) [MJ-BLOCK-REF:blk-arr-live]</strong></p>',
          '<table><tr><th>Region</th><th>ARR</th><th>YoY</th></tr><tr><td>North America</td><td>$12.4M</td><td>+31%</td></tr></table>',
        ].join(''),
      }),
    };

    const imported = await service.ConvertDocxBytesToMarkdownWithReport(
      arrayBuffer,
      'q4-reviewed.docx',
      mammothShim,
    );

    expect(imported.Markdown).toContain('Q4 Executive Summary (Edited in Word)');
    expect(imported.Markdown).toContain(':::mj-block');
    expect(imported.Markdown).toContain('"BlockID": "blk-arr-live"');
    expect(imported.Markdown).toContain('designPreset: "executive-memo"');
    expect(imported.Report.RestoredMjBlocksCount).toBe(1);
    expect(imported.Report.ImportedTrackedChangesCount).toBe(1);
    expect(imported.Report.ImportedCommentsCount).toBe(1);
    expect(imported.Report.RestoredDesignPresetID).toBe('executive-memo');
    expect(imported.ImportedSuggestions[0].AuthorName).toBe('Copyedit Agent');
    expect(imported.ImportedComments[0].Messages[0].Message).toContain('Looks sharp.');
    expect(imported.Report.SummaryText).toContain('1 live MJ block restored');

    // Also verify real mammoth (no shim) round-trips the exported .docx bytes cleanly!
    const realRoundTrip = await service.ConvertDocxBytesToMarkdownWithReport(arrayBuffer, 'real-mammoth.docx');
    expect(realRoundTrip.Markdown).toContain(':::mj-block');
    expect(realRoundTrip.Markdown).toContain('"BlockID": "blk-arr-live"');
    expect(realRoundTrip.Report.RestoredMjBlocksCount).toBe(1);
    expect(realRoundTrip.Report.ImportedTrackedChangesCount).toBe(1);
    expect(realRoundTrip.Report.ImportedCommentsCount).toBe(1);
  });

  it('enforces strict preflight and blocks broken image URLs when Strict is true', async () => {
    const brokenDoc = [
      '# Broken Doc',
      '![Missing](local/not-uploaded.png)',
      '',
      '| C1 | C2 | C3 | C4 | C5 | C6 | C7 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 | 6 | 7 |',
    ].join('\n');

    const report = service.RunExportPreflight(brokenDoc, { Orientation: 'portrait', Strict: true });
    expect(report.Passed).toBe(false);
    expect(report.StrictFailed).toBe(true);
    expect(report.ErrorCount).toBe(1);
    expect(report.WarningCount).toBe(1);
    expect(report.RecommendedOrientation).toBe('landscape');

    await expect(
      service.ConvertMarkdownToDocxBytes(brokenDoc, 'Broken', { Strict: true }),
    ).rejects.toThrow(/Strict export preflight failed/i);
  });

  it('generates preset-synchronized printable PDF CSS including markup redline rules', () => {
    const css = service.BuildPrintablePdfCss(
      {
        PresetID: 'client-proposal',
        PageSize: 'letter',
        Orientation: 'landscape',
        Watermark: 'DRAFT',
        RunningHeader: 'Acme Proposal',
        RunningFooter: 'Confidential',
        ShowPageNumbers: true,
      },
      'markup',
    );
    expect(css).toContain('@page { size: letter landscape;');
    expect(css).toContain('ins.mj-print-ins');
    expect(css).toContain('del.mj-print-del');
    expect(css).toContain('.mj-print-comments-section');
  });
});
