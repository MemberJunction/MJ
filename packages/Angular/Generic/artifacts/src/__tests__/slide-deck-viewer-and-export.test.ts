/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import * as Y from 'yjs';
import { MJGlobal } from '@memberjunction/global';
import {
  SlideDeckEngine,
  type DocumentBlockExecutionResult,
  type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { BaseArtifactViewerPluginComponent } from '../lib/components/base-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';

describe('Wave 2 Slides: SlideDeckExportService, Per-Slide Yjs Session Sync & SlideDeckArtifactViewerComponent', () => {
  let exportService: SlideDeckExportService;
  let collabService: DocumentCollaborationService;

  beforeEach(() => {
    exportService = new SlideDeckExportService();
    collabService = new DocumentCollaborationService();
  });

  it('registers SlideDeckArtifactViewerComponent under BaseArtifactViewerPluginComponent as SlideDeckArtifactViewerPlugin', async () => {
    // Ensure class reference is evaluated
    expect(SlideDeckArtifactViewerComponent).toBeDefined();
    const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
      BaseArtifactViewerPluginComponent,
      'SlideDeckArtifactViewerPlugin',
    );
    expect(reg?.SubClass).toBe(SlideDeckArtifactViewerComponent);
  });

  it('exports a valid OpenXML .pptx PKZIP archive freezing live MJ blocks (Accept #2) with editable <a:t> text runs, <a:tbl> tables, and speaker notes (Accept #5)', () => {
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Q4 Executive Board Deck', 'deck-pptx-1');
    const resultsMap = new Map<string, DocumentBlockExecutionResult>([
      [
        'slide-blk-ev-1',
        {
          Success: true,
          BlockID: 'slide-blk-ev-1',
          Kind: 'EntityView',
          Mode: 'Live',
          Columns: [
            { Name: 'Name', DisplayName: 'Initiative Name', Type: 'nvarchar' },
            { Name: 'Owner', DisplayName: 'Executive Owner', Type: 'nvarchar' },
          ],
          Rows: [
            { Name: 'AI Agent Governance', Owner: 'Alice Vance' },
            { Name: 'Realtime Yjs Sync', Owner: 'Bob Chen' },
          ],
          TotalRowCount: 2,
        },
      ],
    ]);

    const pkg = exportService.ExportToPptxPackage(deck, resultsMap, {
      ID: 'user-1',
      Name: 'Alice Vance',
    });

    // 1. Verify PKZIP magic bytes ('PK\x03\x04')
    expect(pkg.Bytes.byteLength).toBeGreaterThan(1500);
    expect(pkg.Bytes[0]).toBe(0x50); // 'P'
    expect(pkg.Bytes[1]).toBe(0x4b); // 'K'
    expect(pkg.Bytes[2]).toBe(0x03);
    expect(pkg.Bytes[3]).toBe(0x04);

    // 2. Verify live block was frozen during export (Accept #2)
    expect(pkg.SlideCount).toBe(3);
    expect(pkg.FrozenBlockCount).toBe(1);
    const frozenSlide3Block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(
      pkg.FrozenDeck.Slides[2].Regions[0],
    );
    expect(frozenSlide3Block?.Mode).toBe('Frozen');
    expect(frozenSlide3Block?.FrozenSnapshot?.Rows).toHaveLength(2);

    // 3. Unzip and inspect the OpenXML parts (Accept #5)
    const entries = exportService.InspectPptxArchiveEntries(pkg.Bytes);
    expect(entries.has('[Content_Types].xml')).toBe(true);
    expect(entries.has('ppt/presentation.xml')).toBe(true);
    expect(entries.has('ppt/theme/theme1.xml')).toBe(true);
    expect(entries.has('ppt/slides/slide1.xml')).toBe(true);
    expect(entries.has('ppt/slides/slide2.xml')).toBe(true);
    expect(entries.has('ppt/slides/slide3.xml')).toBe(true);
    expect(entries.has('ppt/notesSlides/notesSlide1.xml')).toBe(true);

    const slide1Xml = entries.get('ppt/slides/slide1.xml')!;
    expect(slide1Xml).toContain('<a:t>Q4 Executive Board Deck</a:t>');

    const slide3Xml = entries.get('ppt/slides/slide3.xml')!;
    // Editable DrawingML table (<a:tbl>) with frozen viewer-scoped rows
    expect(slide3Xml).toContain('<a:tbl>');
    expect(slide3Xml).toContain('<a:t>Initiative Name</a:t>');
    expect(slide3Xml).toContain('<a:t>AI Agent Governance</a:t>');
    expect(slide3Xml).toContain('<a:t>Realtime Yjs Sync</a:t>');

    const notes1Xml = entries.get('ppt/notesSlides/notesSlide1.xml')!;
    expect(notes1Xml).toContain('Welcome everyone.');
  });

  it('builds a 16:9 widescreen printable HTML document for .pdf export with frozen live block tables and speaker notes', () => {
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Printable Strategy Deck', 'deck-pdf-1');
    const resultsMap = new Map<string, DocumentBlockExecutionResult>([
      [
        'slide-blk-ev-1',
        {
          Success: true,
          BlockID: 'slide-blk-ev-1',
          Kind: 'EntityView',
          Mode: 'Live',
          Columns: [{ Name: 'Name', DisplayName: 'Initiative', Type: 'nvarchar' }],
          Rows: [{ Name: 'Zero-Trust FLS Pipeline' }],
          TotalRowCount: 1,
        },
      ],
    ]);

    const html = exportService.BuildPrintableDeckHtml(deck, resultsMap, true);
    expect(html).toContain('@page { size: 16in 9in; margin: 0; }');
    expect(html).toContain('Printable Strategy Deck');
    expect(html).toContain('Zero-Trust FLS Pipeline');
    expect(html).toContain('Speaker Notes:');
  });

  it('merges concurrent per-slide edits and deck reordering across two DocumentCollaborationSessions via Yjs CRDT (Accept #1)', () => {
    const initialDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Shared Sync Deck', 'deck-sync');
    const initialJson = SlideDeckEngine.Instance.SerializeDeckSpec(initialDeck);

    const sessionA = collabService.CreateSession('deck-sync', initialJson, {
      id: 'u-alice',
      name: 'Alice',
    });
    const sessionB = collabService.CreateSession('deck-sync', '', {
      id: 'u-bob',
      name: 'Bob',
    }, true, true);

    // Initial sync from A to B
    Y.applyUpdate(sessionB.Doc, Y.encodeStateAsUpdate(sessionA.Doc), 'remote');

    // Alice updates Slide 1 title & speaker notes
    const aliceSlide1 = {
      ...initialDeck.Slides[0],
      Title: 'Alice Edited Slide 1 Headline',
      SpeakerNotes: 'Alice updated speaker notes on slide 1',
    };
    sessionA.UpdateSlideInDeck(aliceSlide1, initialDeck);

    // Concurrently, Bob updates Slide 2 title AND reorders slides to ['slide-3', 'slide-1', 'slide-2']
    const bobSlide2 = {
      ...initialDeck.Slides[1],
      Title: 'Bob Edited Slide 2 Pillars',
    };
    sessionB.UpdateSlideInDeck(bobSlide2, initialDeck);
    sessionB.ReorderSlidesInDeck(['slide-3', 'slide-1', 'slide-2'], initialDeck);

    // Exchange Yjs updates in both directions
    const updateFromA = Y.encodeStateAsUpdate(sessionA.Doc);
    const updateFromB = Y.encodeStateAsUpdate(sessionB.Doc);
    Y.applyUpdate(sessionB.Doc, updateFromA, 'remote');
    Y.applyUpdate(sessionA.Doc, updateFromB, 'remote');

    const convergedA = SlideDeckEngine.Instance.ParseDeckSpec(sessionA.GetContent());
    const convergedB = SlideDeckEngine.Instance.ParseDeckSpec(sessionB.GetContent());

    expect(convergedA.Slides.map((s) => s.SlideID)).toEqual(['slide-3', 'slide-1', 'slide-2']);
    expect(convergedB.Slides.map((s) => s.SlideID)).toEqual(['slide-3', 'slide-1', 'slide-2']);

    const s1 = convergedA.Slides.find((s) => s.SlideID === 'slide-1')!;
    const s2 = convergedA.Slides.find((s) => s.SlideID === 'slide-2')!;
    expect(s1.Title).toBe('Alice Edited Slide 1 Headline');
    expect(s1.SpeakerNotes).toBe('Alice updated speaker notes on slide 1');
    expect(s2.Title).toBe('Bob Edited Slide 2 Pillars');

    sessionA.Destroy();
    sessionB.Destroy();
  });

  it('SlideDeckArtifactViewerComponent supports slide authoring, O6 Presentation freeze & refresh, brand seed theming (Accept #4), OLE Whiteboard embedding, and @SlidesAgent single-slide updates (Accept #3)', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: SlideDeckExportService, useValue: exportService },
      ],
    });

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    const seededDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Enterprise Cloud Deck', 'art-slides-1');
    component.artifactVersion = {
      ID: 'ver-slides-1',
      ArtifactID: 'art-slides-1',
      VersionNumber: 1,
      Name: 'Enterprise Cloud Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    } as unknown as MJArtifactVersionEntity;
    component.readonly = false;

    component.ngOnInit();
    expect(component.Deck.Slides).toHaveLength(3);
    expect(component.HasDisplayContent).toBe(true);
    expect(component.SupportsInlineEdit).toBe(true);
    expect(component.GetCurrentStateSnapshot()?.title).toContain('Enterprise Cloud Deck');

    // 1. Add a 4th slide and reorder it
    component.OnAddSlide('BigNumber');
    expect(component.Deck.Slides).toHaveLength(4);
    const addedId = component.ActiveSlideID;
    component.OnMoveSlide(addedId, -1);
    expect(component.Deck.Slides[0].SlideID).toBe(addedId);

    // 2. Apply Organization Brand Color Seeds (Accept #4)
    component.BrandSeedOrgName = 'Nova Cybernetics';
    component.BrandSeedPrimaryColor = '#6D28D9';
    component.BrandSeedAccentColor = '#10B981';
    component.BrandSeedBackgroundColor = '#0F172A';
    component.OnApplyOrganizationBrandSeeds();
    expect(component.Deck.Theme.BrandSeedSource).toBe('Nova Cybernetics');
    expect(component.Deck.Theme.PrimaryColor.toUpperCase()).toBe('#6D28D9');
    expect(component.Deck.Master.OrganizationName).toBe('Nova Cybernetics');

    // 3. Enter Presenter View (O6) -> live MJ blocks are frozen automatically
    component.EnterPresentationMode('presenter');
    expect(component.WorkspaceMode).toBe('presenter');
    expect(component.PresentationFrozenDeck).not.toBeNull();
    const frozenSlide = component.PresentationFrozenDeck!.Slides.find((s) => s.SlideID === 'slide-3')!;
    const frozenBlock = SlideDeckEngine.Instance.ExtractRegionBlockSpec(frozenSlide.Regions[0]);
    expect(frozenBlock?.Mode).toBe('Frozen');

    // One-click Refresh Live Data during presentation (O6)
    await component.RefreshLiveBlocksDuringPresentation();
    expect(component.PresentationFrozenAt).toBeInstanceOf(Date);
    component.ExitPresentationMode();
    expect(component.WorkspaceMode).toBe('edit');

    // 4. Embed an inline OLE Whiteboard in slide-2
    component.SelectSlide('slide-2');
    await component.EmbedInlineWhiteboardInRegion(component.ActiveSlide.Regions[0]);
    const wbBlock = component.GetRegionBlockSpec(component.ActiveSlide.Regions[0]);
    expect(wbBlock?.Kind).toBe('Artifact');
    expect(wbBlock?.ArtifactType).toBe('Whiteboard');

    // 5. Post an anchored SlideRegion comment with @SlidesAgent -> updates ONLY slide-2 (Accept #3)
    const slide1SnapshotBeforeAgent = JSON.stringify(
      component.Deck.Slides.find((s) => s.SlideID === 'slide-1'),
    );
    component.OpenCommentForSlideRegion('slide-2', 'right', 'Right Column');
    component.NewCommentDraft =
      '@SlidesAgent Title: AI-Governed Architecture Pillars\nRefine executive summary bullets';
    await component.SubmitSlideRegionComment();

    const slide1SnapshotAfterAgent = JSON.stringify(
      component.Deck.Slides.find((s) => s.SlideID === 'slide-1'),
    );
    expect(slide1SnapshotAfterAgent).toBe(slide1SnapshotBeforeAgent);
    const updatedSlide2 = component.Deck.Slides.find((s) => s.SlideID === 'slide-2')!;
    expect(updatedSlide2.Title).toBe('AI-Governed Architecture Pillars');
    expect(component.AnchoredThreads[0].Messages).toHaveLength(2);
    expect(component.AnchoredThreads[0].Messages[1].Role).toBe('Agent');

    // 6. Export .pptx package from component
    const exportedPkg = component.OnExportPptx();
    expect(exportedPkg.SlideCount).toBe(4);
    expect(component.LastExportedPptxSummary?.SlideCount).toBe(4);

    component.ngOnDestroy();
  });
});
