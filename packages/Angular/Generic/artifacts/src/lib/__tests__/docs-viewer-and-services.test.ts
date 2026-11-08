import { describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import { DocumentCollaborationService } from '../services/document-collaboration.service';
import { DocumentImportExportService } from '../services/document-import-export.service';
import type { MammothModuleShim } from '../components/previews/office-preview.logic';

const SAMPLE_COLLAB_DOC = [
  '# Executive Architecture Brief',
  '',
  'Overview of real-time Yjs synchronization and live blocks.',
  '',
  '## Live Metrics Block',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-metrics-1",',
  '  "Kind": "EntityView",',
  '  "Mode": "Live",',
  '  "Title": "Active Projects",',
  '  "EntityName": "MJ: Projects"',
  '}',
  ':::',
  '',
  '## Embedded Architecture Whiteboard',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-wb-1",',
  '  "Kind": "Artifact",',
  '  "Mode": "Live",',
  '  "Title": "System Topology",',
  '  "ArtifactID": "wb-artifact-99",',
  '  "ArtifactType": "Whiteboard",',
  '  "EmbedMode": "Inline"',
  '}',
  ':::',
  '',
  '| Component | Status |',
  '| --- | --- |',
  '| Yjs Room | Ready |',
].join('\n');

describe('DocumentCollaborationService — segmentation, outline, slash menu, diff, and Yjs session', () => {
  const service = new DocumentCollaborationService();

  it('ParseDocumentSegments splits prose blocks and :::mj-block directives accurately', () => {
    const segments = service.ParseDocumentSegments(SAMPLE_COLLAB_DOC);
    expect(segments.length).toBeGreaterThanOrEqual(6);

    const mjBlocks = segments.filter((s) => s.Kind === 'mj-block');
    expect(mjBlocks).toHaveLength(2);
    expect(mjBlocks[0].Descriptor?.Kind).toBe('EntityView');
    expect(mjBlocks[0].Descriptor?.EntityName).toBe('MJ: Projects');
    expect(mjBlocks[1].Descriptor?.Kind).toBe('Artifact');
    expect(mjBlocks[1].Descriptor?.ArtifactType).toBe('Whiteboard');
  });

  it('ExtractOutline returns both hierarchical headings and embedded MJ blocks', () => {
    const outline = service.ExtractOutline(SAMPLE_COLLAB_DOC);
    expect(outline.map((o) => o.Title)).toEqual([
      'Executive Architecture Brief',
      'Live Metrics Block',
      'Active Projects',
      'Embedded Architecture Whiteboard',
      'System Topology',
    ]);
    expect(outline.filter((o) => o.Kind === 'block')).toHaveLength(2);
  });

  it('ComputeWordStats counts words, lines, live blocks, and embedded artifacts', () => {
    const stats = service.ComputeWordStats(SAMPLE_COLLAB_DOC);
    expect(stats.Words).toBeGreaterThan(20);
    expect(stats.Lines).toBeGreaterThan(20);
    expect(stats.LiveBlocks).toBe(1);
    expect(stats.EmbeddedArtifacts).toBe(1);
  });

  it('GetSlashCommands returns all commands and filters by query', () => {
    const all = service.GetSlashCommands('');
    expect(all.length).toBeGreaterThanOrEqual(10);

    const wb = service.GetSlashCommands('/whiteboard');
    expect(wb).toHaveLength(1);
    expect(wb[0].BlockType).toBe('Artifact');

    const liveData = service.GetSlashCommands('Live Data');
    expect(liveData.map((c) => c.BlockType)).toEqual([
      'EntityView',
      'SavedQuery',
      'DashboardPart',
      'InteractiveComponent',
    ]);
  });

  it('ComputeLineDiff produces an exact LCS diff between document revisions', () => {
    const v1 = '# Report\n\nOld paragraph.\nShared footer.';
    const v2 = '# Report\n\nNew paragraph.\nAdded note.\nShared footer.';

    const diff = service.ComputeLineDiff(v1, v2);
    expect(diff.RemovedLines).toBe(1);
    expect(diff.AddedLines).toBe(2);
    expect(diff.UnchangedLines).toBe(3);
  });

  it('DocumentCollaborationSession manages Y.Doc text mutations and handles permission state frames', () => {
    const session = service.CreateSession(
      'art-doc-1',
      '# Hello Yjs',
      { id: 'u-1', name: 'Alice' },
      true,
    );

    const observedContents: string[] = [];
    const sub = session.ContentChanged$.subscribe((text) => observedContents.push(text));

    expect(session.GetContent()).toBe('# Hello Yjs');
    expect(session.CanEdit).toBe(true);

    session.SetContent('# Hello Yjs\n\nAppended paragraph.');
    expect(session.GetContent()).toBe('# Hello Yjs\n\nAppended paragraph.');
    expect(observedContents[observedContents.length - 1]).toBe('# Hello Yjs\n\nAppended paragraph.');

    session.SetContent('# Updated Title\n\nAppended paragraph.');
    expect(session.GetContent()).toBe('# Updated Title\n\nAppended paragraph.');

    // Simulate receiving a server permission-downgrade frame (MSG_PERMISSION_STATE = 3)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 3);
    encoding.writeVarString(encoder, JSON.stringify({ canRead: true, canEdit: false }));
    session.ApplyBinaryFrame(encoding.toUint8Array(encoder));

    expect(session.CanEdit).toBe(false);
    expect(session.Status).toBe('readonly');

    // Attempted edit while CanEdit === false is ignored
    session.SetContent('# Should Not Apply');
    expect(session.GetContent()).toBe('# Updated Title\n\nAppended paragraph.');

    sub.unsubscribe();
    session.Destroy();
  });
});

describe('DocumentImportExportService — .md, .docx (mammoth + docx), and .pdf conversion', () => {
  const importExport = new DocumentImportExportService();

  it('ImportMarkdown normalizes CRLF line endings while preserving :::mj-block directives', async () => {
    const raw = '# Title\r\n\r\n:::mj-block\r\n{"BlockID":"b1","Kind":"EntityView","Mode":"Live"}\r\n:::';
    const imported = await importExport.ImportMarkdown(raw);
    expect(imported).toBe('# Title\n\n:::mj-block\n{"BlockID":"b1","Kind":"EntityView","Mode":"Live"}\n:::');
  });

  it('ConvertDocxBytesToMarkdown converts DOCX HTML (headings, emphasis, and tables) into GFM Markdown', async () => {
    const mammothShim: MammothModuleShim = {
      convertToHtml: async () => ({
        value:
          '<h1>Quarterly Review</h1><p>This is <strong>bold</strong> and <em>italic</em>.</p>' +
          '<table><tr><th>Region</th><th>Revenue</th></tr><tr><td>North</td><td>$1.2M</td></tr></table>',
        messages: [],
      }),
    };

    const md = await importExport.ConvertDocxBytesToMarkdown(new ArrayBuffer(16), mammothShim);
    expect(md).toContain('# Quarterly Review');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('| Region | Revenue |');
    expect(md).toContain('| North | $1.2M |');
  });

  it('ConvertMarkdownToDocxBytes generates a valid .docx binary archive from Markdown and :::mj-block directives', async () => {
    const bytes = await importExport.ConvertMarkdownToDocxBytes(SAMPLE_COLLAB_DOC, 'Strategy Brief');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // DOCX is a ZIP container starting with PK\x03\x04 (0x50, 0x4b, 0x03, 0x04)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });
});
