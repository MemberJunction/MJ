import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactToolLibrary } from '@memberjunction/ai-core-plus';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { WhiteboardToolLibrary } from '../artifact-tools/WhiteboardToolLibrary';
import { SlideDeckToolLibrary } from '../artifact-tools/SlideDeckToolLibrary';

const SAMPLE_DOC = `# Quarterly Strategy Report

Executive overview of Q4 platform deliverables and customer adoption metrics.

## Architecture & Collaboration

Real-time Yjs synchronization powers Docs, Slides, and Sheets.

| Component | Status | Owner |
| --- | --- | --- |
| Yjs Relay | Active | Platform Team |
| OLE Blocks | Active | UI Team |

## Action Items

- [ ] Complete Wave 1 review
- [x] Verify database migration
`;

describe('DocumentToolLibrary (@RegisterClass BaseArtifactToolLibrary)', () => {
  const lib = new DocumentToolLibrary();

  it('registers DocumentToolLibrary in MJGlobal ClassFactory under BaseArtifactToolLibrary', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
      BaseArtifactToolLibrary,
      'DocumentToolLibrary',
    );
    expect(instance).toBeInstanceOf(DocumentToolLibrary);
  });

  it('exposes all structured document inspection and mutation tools', () => {
    const toolNames = lib.GetToolList().map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'get_outline',
        'get_section',
        'get_blocks',
        'search_blocks',
        'grep',
        'get_lines',
        'insert_block_after',
        'replace_block',
        'delete_block',
        'upsert_table',
        'insert_live_block',
        'embed_artifact_block',
        'propose_suggestion',
      ]),
    );
  });

  it('get_outline returns hierarchical headings with line numbers and word counts', async () => {
    const res = await lib.InvokeTool('get_outline', {}, SAMPLE_DOC);
    expect(res.success).toBe(true);
    const data = res.data as { outline: Array<{ title: string; level: number }>; revisionHash: string };
    expect(data.outline.map((h) => h.title)).toEqual([
      'Quarterly Strategy Report',
      'Architecture & Collaboration',
      'Action Items',
    ]);
    expect(data.revisionHash).toBeTruthy();
  });

  it('get_section retrieves a section by heading title substring', async () => {
    const res = await lib.InvokeTool('get_section', { heading: 'Architecture' }, SAMPLE_DOC);
    expect(res.success).toBe(true);
    const data = res.data as { title: string; markdown: string };
    expect(data.title).toBe('Architecture & Collaboration');
    expect(data.markdown).toContain('Real-time Yjs synchronization');
    expect(data.markdown).toContain('| Yjs Relay | Active | Platform Team |');
  });

  it('get_blocks and search_blocks locate blocks and return revisionHash', async () => {
    const blocksRes = await lib.InvokeTool('get_blocks', {}, SAMPLE_DOC);
    expect(blocksRes.success).toBe(true);
    const blocksData = blocksRes.data as {
      blocks: Array<{ blockId: string; kind: string; rawMarkdown: string }>;
      revisionHash: string;
    };
    expect(blocksData.blocks.length).toBeGreaterThanOrEqual(5);

    const searchRes = await lib.InvokeTool('search_blocks', { query: 'Yjs synchronization' }, SAMPLE_DOC);
    expect(searchRes.success).toBe(true);
    const matches = (searchRes.data as { matches: Array<{ rawMarkdown: string }> }).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].rawMarkdown).toContain('Real-time Yjs synchronization');
  });

  it('insert_block_after, replace_block, and delete_block mutate blocks and enforce optimistic concurrency revisionHash', async () => {
    const blocksRes = await lib.InvokeTool('get_blocks', {}, SAMPLE_DOC);
    const { blocks, revisionHash } = blocksRes.data as {
      blocks: Array<{ blockId: string; kind: string }>;
      revisionHash: string;
    };
    const firstBlockId = blocks[0].blockId;

    // Stale revisionHash must be rejected
    const staleRes = await lib.InvokeTool(
      'insert_block_after',
      {
        afterBlockId: firstBlockId,
        markdown: '> [!NOTE]\n> Inserted callout.',
        expectedRevisionHash: 'stale-hash-000',
      },
      SAMPLE_DOC,
    );
    expect(staleRes.success).toBe(false);
    expect(staleRes.errorMessage).toContain('Revision conflict');

    // Valid revisionHash succeeds
    const insertRes = await lib.InvokeTool(
      'insert_block_after',
      {
        afterBlockId: firstBlockId,
        markdown: '> [!NOTE]\n> Inserted callout.',
        expectedRevisionHash: revisionHash,
      },
      SAMPLE_DOC,
    );
    expect(insertRes.success).toBe(true);
    const updatedDoc = (insertRes.data as { updatedContent: string }).updatedContent;
    expect(updatedDoc).toContain('> [!NOTE]\n> Inserted callout.');

    // Replace block
    const replaceRes = await lib.InvokeTool(
      'replace_block',
      {
        blockId: firstBlockId,
        markdown: '# Updated Q4 Executive Report',
      },
      updatedDoc,
    );
    expect(replaceRes.success).toBe(true);
    const afterReplace = (replaceRes.data as { updatedContent: string }).updatedContent;
    expect(afterReplace).toContain('# Updated Q4 Executive Report');

    // Delete block
    const deleteRes = await lib.InvokeTool('delete_block', { blockId: firstBlockId }, afterReplace);
    expect(deleteRes.success).toBe(true);
    const afterDelete = (deleteRes.data as { updatedContent: string }).updatedContent;
    expect(afterDelete).not.toContain('# Updated Q4 Executive Report');
  });

  it('upsert_table, insert_live_block, embed_artifact_block, and propose_suggestion work end-to-end', async () => {
    const tableRes = await lib.InvokeTool(
      'upsert_table',
      {
        headers: ['Metric', 'Target', 'Actual'],
        rows: [
          ['Latency', '<50ms', '22ms'],
          ['Uptime', '99.9%', '99.98%'],
        ],
      },
      SAMPLE_DOC,
    );
    expect(tableRes.success).toBe(true);
    const docWithTable = (tableRes.data as { updatedContent: string }).updatedContent;
    expect(docWithTable).toContain('| Metric | Target | Actual |');

    const liveRes = await lib.InvokeTool(
      'insert_live_block',
      {
        kind: 'EntityView',
        title: 'Active Projects View',
        entityName: 'MJ: Projects',
      },
      docWithTable,
    );
    expect(liveRes.success).toBe(true);
    const docWithLive = (liveRes.data as { updatedContent: string }).updatedContent;
    expect(docWithLive).toContain(':::mj-block');
    expect(docWithLive).toContain('"EntityName": "MJ: Projects"');

    const oleRes = await lib.InvokeTool(
      'embed_artifact_block',
      {
        artifactId: 'wb-12345',
        artifactType: 'Whiteboard',
        title: 'Architecture Diagram',
        embedMode: 'Inline',
      },
      docWithLive,
    );
    expect(oleRes.success).toBe(true);
    const docWithOle = (oleRes.data as { updatedContent: string }).updatedContent;
    expect(docWithOle).toContain('"ArtifactID": "wb-12345"');
    expect(docWithOle).toContain('"ArtifactType": "Whiteboard"');

    const blocksRes = await lib.InvokeTool('get_blocks', {}, docWithOle);
    const firstBlock = (blocksRes.data as { blocks: Array<{ blockId: string }> }).blocks[0];
    const suggestRes = await lib.InvokeTool(
      'propose_suggestion',
      {
        targetBlockId: firstBlock.blockId,
        proposedText: '# Executive Summary (Final)',
        rationale: 'Tighter title for board deck',
        authorName: '@DocsAgent',
      },
      docWithOle,
    );
    expect(suggestRes.success).toBe(true);
    const proposal = (suggestRes.data as { suggestion: { status: string; authorName: string } }).suggestion;
    expect(proposal.status).toBe('pending');
    expect(proposal.authorName).toBe('@DocsAgent');
  });
});

describe('WhiteboardToolLibrary (@RegisterClass BaseArtifactToolLibrary)', () => {
  const wbLib = new WhiteboardToolLibrary();

  it('registers WhiteboardToolLibrary in MJGlobal ClassFactory under BaseArtifactToolLibrary', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
      BaseArtifactToolLibrary,
      'WhiteboardToolLibrary',
    );
    expect(instance).toBeInstanceOf(WhiteboardToolLibrary);
  });

  it('creates nodes, connects nodes, adds sticky notes, auto-layouts, deletes elements, and summarizes board', async () => {
    const initialJson = JSON.stringify({
      version: 2,
      seq: 1,
      idCounter: 1,
      zCounter: 1,
      pageCounter: 1,
      activePageId: 'page-1',
      pages: [{ id: 'page-1', name: 'Architecture', items: [] }],
    });

    // Upsert 2 nodes
    const upsertRes = await wbLib.InvokeTool(
      'upsert_nodes',
      {
        nodes: [
          { id: 'node-api', label: 'MJServer Yjs Gateway', shape: 'rect', x: 100, y: 100 },
          { id: 'node-db', label: 'SQL Server Working State', shape: 'ellipse', x: 400, y: 100 },
        ],
      },
      initialJson,
    );
    expect(upsertRes.success).toBe(true);
    const afterUpsert = (upsertRes.data as { updatedContent: string }).updatedContent;

    // Connect the 2 nodes
    const connectRes = await wbLib.InvokeTool(
      'connect_nodes',
      {
        connections: [{ fromId: 'node-api', toId: 'node-db', label: 'Checkpoints VARBINARY' }],
      },
      afterUpsert,
    );
    expect(connectRes.success).toBe(true);
    const afterConnect = (connectRes.data as { updatedContent: string }).updatedContent;

    // Add sticky note
    const stickyRes = await wbLib.InvokeTool(
      'add_sticky_notes',
      {
        notes: [{ text: 'Review permission revocation flow', x: 100, y: 260 }],
      },
      afterConnect,
    );
    expect(stickyRes.success).toBe(true);
    const afterSticky = (stickyRes.data as { updatedContent: string }).updatedContent;

    // Auto-layout
    const layoutRes = await wbLib.InvokeTool('auto_layout', { columns: 2, spacingX: 260, spacingY: 160 }, afterSticky);
    expect(layoutRes.success).toBe(true);
    const afterLayout = (layoutRes.data as { updatedContent: string }).updatedContent;

    // Summary
    const summaryRes = await wbLib.InvokeTool('get_board_summary', {}, afterLayout);
    expect(summaryRes.success).toBe(true);
    const summary = summaryRes.data as { totalElements: number; countsByKind: Record<string, number> };
    expect(summary.totalElements).toBe(4);
    expect(summary.countsByKind['shape']).toBe(2);
    expect(summary.countsByKind['connector']).toBe(1);
    expect(summary.countsByKind['sticky']).toBe(1);

    // List elements filtered by kind
    const listRes = await wbLib.InvokeTool('list_elements', { kind: 'shape' }, afterLayout);
    expect(listRes.success).toBe(true);
    expect((listRes.data as { elements: unknown[] }).elements).toHaveLength(2);

    // Delete element
    const delRes = await wbLib.InvokeTool('delete_elements', { ids: ['node-db'] }, afterLayout);
    expect(delRes.success).toBe(true);
    const afterDel = (delRes.data as { updatedContent: string }).updatedContent;
    const finalSummary = await wbLib.InvokeTool('get_board_summary', {}, afterDel);
    expect((finalSummary.data as { totalElements: number }).totalElements).toBe(2); // node-db + its attached connector removed
  });
});

describe('SlideDeckToolLibrary (@RegisterClass BaseArtifactToolLibrary — Wave 2 Slides)', () => {
  const slideLib = new SlideDeckToolLibrary();

  it('registers SlideDeckToolLibrary in MJGlobal ClassFactory under BaseArtifactToolLibrary', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
      BaseArtifactToolLibrary,
      'SlideDeckToolLibrary',
    );
    expect(instance).toBeInstanceOf(SlideDeckToolLibrary);
  });

  it('exposes all structured slide deck perception and mutation tools', () => {
    const toolNames = slideLib.GetToolList().map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'read_deck',
        'get_deck_outline',
        'get_slide',
        'add_slide',
        'update_slide',
        'delete_slide',
        'reorder_slides',
        'upsert_slide_element',
        'update_slide_region',
        'delete_slide_element',
        'update_speaker_notes',
        'apply_theme',
        'generate_deck_from_markdown',
      ]),
    );
  });

  it('generates a deck from Markdown, updates a single slide in isolation (Accept #3), embeds live/OLE blocks, reorders, and applies brand themes (Accept #4)', async () => {
    // 1. Convert SAMPLE_DOC Markdown into a structured presentation deck
    const genRes = await slideLib.InvokeTool(
      'generate_deck_from_markdown',
      { markdown: SAMPLE_DOC, title: 'Q4 Strategy Presentation' },
      '',
    );
    expect(genRes.success).toBe(true);
    const deckJson1 = (genRes.data as { updatedContent: string }).updatedContent;

    const readRes = await slideLib.InvokeTool('read_deck', { includeFullSlides: true }, deckJson1);
    expect(readRes.success).toBe(true);
    const rev1 = (readRes.data as { revisionHash: string }).revisionHash;
    const initialSlides = (readRes.data as { slides: Array<{ SlideID: string; Title: string }> }).slides;
    expect(initialSlides.length).toBeGreaterThanOrEqual(3);

    const slide1Before = JSON.stringify(initialSlides[0]);
    const slide3Before = JSON.stringify(initialSlides[2]);

    // 2. Update ONLY slide-2 via update_slide (Accept #3)
    const updateSlide2Res = await slideLib.InvokeTool(
      'update_slide',
      {
        slideId: 'slide-2',
        title: 'AI-Rewritten Architecture & Collaboration Slide',
        speakerNotes: 'Agent updated speaker notes for slide 2 only.',
        expectedRevisionHash: rev1,
      },
      deckJson1,
    );
    expect(updateSlide2Res.success).toBe(true);
    const deckJson2 = (updateSlide2Res.data as { updatedContent: string }).updatedContent;
    const parsedAfterSlide2 = JSON.parse(deckJson2) as { Slides: Array<{ SlideID: string; Title: string }> };

    // Verify slide-1 and slide-3 were untouched
    expect(JSON.stringify(parsedAfterSlide2.Slides[0])).toBe(slide1Before);
    expect(JSON.stringify(parsedAfterSlide2.Slides[2])).toBe(slide3Before);
    expect(parsedAfterSlide2.Slides[1].Title).toBe('AI-Rewritten Architecture & Collaboration Slide');

    // Verify stale revision hash is rejected
    const staleRes = await slideLib.InvokeTool(
      'update_slide',
      { slideId: 'slide-2', title: 'Should Fail', expectedRevisionHash: rev1 },
      deckJson2,
    );
    expect(staleRes.success).toBe(false);

    // 3. Upsert a Live MJ EntityView block and an OLE Whiteboard block into slide-2
    const upsertLiveRes = await slideLib.InvokeTool(
      'upsert_slide_element',
      {
        slideId: 'slide-2',
        regionId: 'live-data',
        kind: 'mj-block',
        mjBlock: {
          Kind: 'EntityView',
          EntityName: 'MJ: Artifacts',
          Title: 'Live Governed Artifacts',
        },
      },
      deckJson2,
    );
    expect(upsertLiveRes.success).toBe(true);
    const deckJson3 = (upsertLiveRes.data as { updatedContent: string }).updatedContent;
    expect(deckJson3).toContain('"Kind": "EntityView"');

    // 4. Apply organization brand color seeds (Accept #4)
    const themeRes = await slideLib.InvokeTool(
      'apply_theme',
      {
        organizationName: 'Global FinTech',
        primaryColor: '#0F766E',
        accentColor: '#F59E0B',
        backgroundColor: '#0F172A',
      },
      deckJson3,
    );
    expect(themeRes.success).toBe(true);
    const deckJson4 = (themeRes.data as { updatedContent: string }).updatedContent;
    expect(deckJson4).toContain('Global FinTech');

    // 5. Reorder slides
    const reorderRes = await slideLib.InvokeTool(
      'reorder_slides',
      { slideIds: ['slide-3', 'slide-1', 'slide-2'] },
      deckJson4,
    );
    expect(reorderRes.success).toBe(true);
    const orderedIds = (reorderRes.data as { orderedSlideIds: string[] }).orderedSlideIds;
    expect(orderedIds).toEqual(['slide-3', 'slide-1', 'slide-2']);
  });
});
