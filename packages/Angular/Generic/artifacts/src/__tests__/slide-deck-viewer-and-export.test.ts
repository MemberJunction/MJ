/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import * as Y from 'yjs';
import type { IMetadataProvider } from '@memberjunction/core';
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

  it('SlideDeckArtifactViewerComponent fails closed when permissions are unresolved (B3), shows 0 initial seed comments (A1), embeds real child Whiteboards (A6), and persists only real User comments (A1)', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: SlideDeckExportService, useValue: exportService },
      ],
    });

    // Verify fail-closed IsEditable = false when ArtifactID is set without a provider / resolved permissions
    const unpermissionedComp = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    const seededDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Enterprise Cloud Deck', 'art-slides-1');
    unpermissionedComp.artifactVersion = {
      ID: 'ver-slides-1',
      ArtifactID: 'art-slides-1',
      VersionNumber: 1,
      Name: 'Enterprise Cloud Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    } as unknown as MJArtifactVersionEntity;
    unpermissionedComp.readonly = false;
    unpermissionedComp.ngOnInit();
    expect(unpermissionedComp.IsEditable).toBe(false);
    expect(unpermissionedComp.AnchoredThreads).toHaveLength(0);
    unpermissionedComp.ngOnDestroy();

    // Now wire a mock provider resolving owner permissions for 'art-slides-1'
    const ownerUser = {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Alice Owner',
      Email: 'alice@memberjunction.org',
      IsActive: true,
    };
    let entitySeq = 0;
    const savedSlideEntities: Array<{ entityName: string; record: Record<string, unknown> }> = [];
    const ownerProvider = {
      CurrentUser: ownerUser,
      Entities: [
        {
          ID: 'ent-artifacts-1',
          Name: 'MJ: Artifacts',
          DisplayNameOrName: 'MJ: Artifacts',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [{ Name: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' }],
        },
      ],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'ent-artifacts-1', Name: 'MJ: Artifacts' } : undefined,
      RunView: async (params: { EntityName: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: 'art-slides-1', UserID: ownerUser.ID, EnvironmentID: 'env-slides-1' }],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          return {
            Success: true,
            Results: [{ ID: 'type-whiteboard-1', Name: 'Whiteboard' }],
            TotalRowCount: 1,
          };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      },
      GetEntityObject: async (entityName: string) => {
        const id = `88888888-0000-4000-8000-${String(++entitySeq).padStart(12, '0')}`;
        const rec: Record<string, unknown> = {
          ID: id,
          NewRecord: () => undefined,
          Load: async () => true,
          Save: async () => {
            savedSlideEntities.push({ entityName, record: { ...rec } });
            return true;
          },
        };
        return rec;
      },
    } as unknown as IMetadataProvider;

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    component.Provider = ownerProvider;
    component.artifactVersion = {
      ID: 'ver-slides-1',
      ArtifactID: 'art-slides-1',
      VersionNumber: 1,
      Name: 'Enterprise Cloud Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    } as unknown as MJArtifactVersionEntity;
    component.readonly = false;

    component.ngOnInit();
    await new Promise((r) => setTimeout(r, 25));

    expect(component.IsEditable).toBe(true);
    expect(component.Deck.Slides).toHaveLength(3);
    expect(component.AnchoredThreads).toHaveLength(0);
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
    expect(component.PresentationRefreshCount).toBe(0);
    await component.RefreshLiveBlocksDuringPresentation();
    expect(component.PresentationRefreshCount).toBe(1);
    expect(component.PresentationFrozenAt).toBeInstanceOf(Date);
    component.ExitPresentationMode();
    expect(component.WorkspaceMode).toBe('edit');

    // 4. Embed an inline OLE Whiteboard in slide-2 -> saves real child Artifact + Version BEFORE inserting spec
    component.SelectSlide('slide-2');
    await component.EmbedInlineWhiteboardInRegion(component.ActiveSlide.Regions[0]);
    const wbBlock = component.GetRegionBlockSpec(component.ActiveSlide.Regions[0]);
    expect(wbBlock?.Kind).toBe('Artifact');
    expect(wbBlock?.ArtifactType).toBe('Whiteboard');
    expect(wbBlock?.ArtifactID).toMatch(/^88888888-0000-4000-8000-/);
    expect(wbBlock?.VersionID).toMatch(/^88888888-0000-4000-8000-/);

    // 5. Post an anchored SlideRegion comment containing @SlidesAgent -> persists ONLY User comment with ZERO fake agent mutation
    const slide2TitleBefore = component.Deck.Slides.find((s) => s.SlideID === 'slide-2')!.Title;
    component.OpenCommentForSlideRegion('slide-2', 'right', 'Right Column');
    component.NewCommentDraft = '@SlidesAgent Please review this column';
    await component.SubmitSlideRegionComment();

    expect(component.Deck.Slides.find((s) => s.SlideID === 'slide-2')!.Title).toBe(slide2TitleBefore);
    expect(component.AnchoredThreads).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages[0].Role).toBe('User');

    // 6. Export .pptx package from component
    const exportedPkg = component.OnExportPptx();
    expect(exportedPkg.SlideCount).toBe(4);
    expect(component.LastExportedPptxSummary?.SlideCount).toBe(4);

    component.ngOnDestroy();
  });

  it('surfaces access-denied live block errors without synthetic fallback rows and persists/hydrates SlideRegion anchored threads & delegated child Whiteboards with contextUser', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: SlideDeckExportService, useValue: exportService },
      ],
    });

    const savedConversations: Array<Record<string, unknown>> = [];
    const savedDetails: Array<Record<string, unknown>> = [];
    const savedArtifacts: Array<Record<string, unknown>> = [];
    const savedVersions: Array<Record<string, unknown>> = [];
    const getEntityCalls: Array<{ entityName: string; contextUser: unknown }> = [];

    const mockUser = {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Sarah Chen',
      Email: 'sarah.chen@memberjunction.org',
      IsActive: true,
    };

    const mockProvider = {
      CurrentUser: mockUser,
      Entities: [
        {
          ID: 'AE24303E-F36B-1410-8DB0-00021F8B792E',
          Name: 'MJ: Artifacts',
          DisplayNameOrName: 'MJ: Artifacts',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [{ Name: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' }],
        },
        {
          ID: 'e-restricted-finance',
          Name: 'MJ: Confidential Financials',
          DisplayNameOrName: 'MJ: Confidential Financials',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: false }),
          Fields: [],
        },
      ],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'AE24303E-F36B-1410-8DB0-00021F8B792E', Name: 'MJ: Artifacts' } : undefined,
      RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [
              {
                ID: '22222222-3333-4444-8555-666666666666',
                UserID: mockUser.ID,
                EnvironmentID: 'env-1',
              },
            ],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          return {
            Success: true,
            Results: [{ ID: 'type-wb-1', Name: 'Whiteboard' }],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Conversations') {
          return {
            Success: true,
            Results: [
              {
                ID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                Name: 'SlideComment: Slide 1 · Primary Content (slide-1:main)',
                LinkedEntityID: 'AE24303E-F36B-1410-8DB0-00021F8B792E',
                LinkedRecordID: '22222222-3333-4444-8555-666666666666',
                AnchorType: 'SlideRegion',
                AnchorKey: 'slide-1:main',
                IsResolved: false,
                AnchorMetadata: JSON.stringify({
                  slideId: 'slide-1',
                  regionId: 'main',
                  anchorDisplayName: 'Slide 1 · Primary Content',
                  quotedText: 'Hydrated Quote',
                  agentMode: 'edit',
                  status: 'Open',
                }),
              },
            ],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Conversation Details') {
          return {
            Success: true,
            Results: [
              {
                ID: 'dddddddd-1111-4222-8333-444444444444',
                ConversationID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                Role: 'User',
                Message: 'Hydrated SlideRegion thread from database',
              },
            ],
            TotalRowCount: 1,
          };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      },
      GetEntityObject: async (entityName: string, contextUser?: unknown) => {
        getEntityCalls.push({ entityName, contextUser });
        const rec: Record<string, unknown> = {
          ID: `99999999-0000-4000-8000-${String(getEntityCalls.length).padStart(12, '0')}`,
          NewRecord: () => undefined,
          Load: async () => true,
          Save: async () => {
            if (entityName === 'MJ: Conversations') savedConversations.push({ ...rec });
            if (entityName === 'MJ: Conversation Details') savedDetails.push({ ...rec });
            if (entityName === 'MJ: Artifacts') savedArtifacts.push({ ...rec });
            if (entityName === 'MJ: Artifact Versions') savedVersions.push({ ...rec });
            return true;
          },
        };
        return rec;
      },
    };

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    Object.defineProperty(component, 'ProviderToUse', {
      get: () => mockProvider,
    });
    const seededDeck = SlideDeckEngine.Instance.CreateDefaultDeck(
      'Governed Security Deck',
      '22222222-3333-4444-8555-666666666666',
    );
    component.artifactVersion = {
      ID: 'ver-sec-1',
      ArtifactID: '22222222-3333-4444-8555-666666666666',
      VersionNumber: 1,
      Name: 'Governed Security Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    } as unknown as MJArtifactVersionEntity;
    component.readonly = false;

    component.ngOnInit();
    await new Promise((r) => setTimeout(r, 30));

    // Verify SlideRegion anchored conversation was hydrated and filtered via FilterReadableAnchoredConversations
    expect(component.AnchoredThreads).toHaveLength(1);
    expect(component.AnchoredThreads[0].ConversationID).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(component.AnchoredThreads[0].Messages[0].Message).toBe(
      'Hydrated SlideRegion thread from database',
    );

    // Execute an access-denied live block -> must NOT fall back to synthetic preview rows
    const restrictedRegion = component.Deck.Slides[2].Regions[0];
    const restrictedBlock = {
      BlockID: 'blk-restricted-fin',
      Kind: 'EntityView' as const,
      Mode: 'Live' as const,
      Title: 'Confidential Financials',
      EntityName: 'MJ: Confidential Financials',
    };
    await component.ExecuteSlideRegionBlock(restrictedRegion, restrictedBlock);
    const blockError = component.GetBlockExecutionError(restrictedBlock);
    expect(blockError).not.toBeNull();
    expect(blockError?.Success).toBe(false);
    expect(blockError?.AccessDenied).toBe(true);
    expect(blockError?.ErrorMessage).toContain('You do not have permission to read');
    expect(component.GetDisplayRowsForBlock(restrictedBlock).Rows).toEqual([]);

    // Post a new SlideRegion comment -> verify AnchorType = 'SlideRegion', AnchorKey, LinkedEntityID, LinkedRecordID, and contextUser
    component.OpenCommentForSlideRegion('slide-2', 'left', 'Left Column');
    component.NewCommentDraft = 'Check slide region anchor metadata';
    await component.SubmitSlideRegionComment();

    expect(savedConversations).toHaveLength(1);
    expect(savedConversations[0].AnchorType).toBe('SlideRegion');
    expect(savedConversations[0].AnchorKey).toBe('slide-2:left');
    expect(savedConversations[0].LinkedEntityID).toBe('AE24303E-F36B-1410-8DB0-00021F8B792E');
    expect(savedConversations[0].LinkedRecordID).toBe('22222222-3333-4444-8555-666666666666');
    expect(savedConversations[0].UserID).toBe(mockUser.ID);
    expect(savedDetails).toHaveLength(1);

    // Embed an inline OLE Whiteboard -> verify child artifact + initial v1 version record are created with contextUser
    await component.EmbedInlineWhiteboardInRegion(component.Deck.Slides[1].Regions[0]);
    expect(savedArtifacts).toHaveLength(1);
    expect(savedArtifacts[0].UserID).toBe(mockUser.ID);
    expect(savedArtifacts[0].DelegateEntityID).toBe('AE24303E-F36B-1410-8DB0-00021F8B792E');
    expect(savedArtifacts[0].DelegateRecordID).toBe('22222222-3333-4444-8555-666666666666');
    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0].VersionNumber).toBe(1);
    expect(savedVersions[0].UserID).toBe(mockUser.ID);
    expect(getEntityCalls.every((c) => c.contextUser === mockUser)).toBe(true);

    component.ngOnDestroy();
  });
});
