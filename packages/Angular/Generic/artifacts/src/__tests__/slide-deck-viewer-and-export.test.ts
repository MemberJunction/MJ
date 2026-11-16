/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef, ElementRef } from '@angular/core';
import * as Y from 'yjs';
import {
  type BaseEntity,
  type EntityInfo,
  type IMetadataProvider,
  type IRunViewProvider,
  type RunViewParams,
  type RunViewResult,
  UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
  DocumentLiveBlockEngine,
  MJArtifactVersionEntity,
  SlideDeckEngine,
  type DocumentBlockExecutionResult,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import {
  BaseArtifactViewerPluginComponent,
  type NavigationRequest,
} from '../lib/components/base-artifact-viewer.component';
import {
  SlideDeckArtifactViewerComponent,
  type SlideDeckSuggestion,
} from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';

interface MockSavedRecordFields {
  ID: string;
  NewRecord: () => boolean;
  Load: () => Promise<boolean>;
  Save: () => Promise<boolean>;
  [key: string]: string | number | boolean | null | undefined | (() => boolean) | (() => Promise<boolean>);
}

interface MockEntityPermission {
  CanRead: boolean;
}

interface MockEntityDescriptor {
  ID: string;
  Name: string;
  DisplayNameOrName: string;
  FieldLevelSecurityApplies: boolean;
  GetUserPermisions: (user: UserInfo) => MockEntityPermission;
  Fields: Array<{
    Name: string;
    IsPrimaryKey: boolean;
    DefaultInView: boolean;
    IsBinaryFieldType: boolean;
    TSType: string;
  }>;
}

function makeArtifactVersionEntity(props: {
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
  Name: string;
  Content: string;
  Configuration?: string | null;
}): MJArtifactVersionEntity {
  const entity = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(entity, {
    ID: { value: props.ID, enumerable: true },
    ArtifactID: { value: props.ArtifactID, enumerable: true },
    VersionNumber: { value: props.VersionNumber, enumerable: true },
    Name: { value: props.Name, enumerable: true },
    Content: { value: props.Content, enumerable: true },
    Configuration: { value: props.Configuration ?? null, writable: true, enumerable: true },
  });
  return entity;
}

function makeMockSavedRecord(base: MockSavedRecordFields): BaseEntity {
  const partial: Partial<BaseEntity> = base;
  return partial as BaseEntity;
}

function makeSlideMockProvider(config: {
  CurrentUser: UserInfo;
  Entities: MockEntityDescriptor[];
  RunView: <T>(params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult<T>>;
  GetEntityObject: (entityName: string, contextUser?: UserInfo) => Promise<BaseEntity>;
}): IMetadataProvider {
  const provider: Partial<IMetadataProvider & IRunViewProvider> = {
    CurrentUser: config.CurrentUser,
    Entities: config.Entities as EntityInfo[],
    EntityByName: (name: string) =>
      config.Entities.find((e) => e.Name === name) as EntityInfo | undefined,
    RunView: config.RunView as IRunViewProvider['RunView'],
    GetEntityObject: config.GetEntityObject as IMetadataProvider['GetEntityObject'],
  };
  return provider as IMetadataProvider;
}

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
    const seededDeck = SlideDeckEngine.Instance.CreateDefaultDeck(
      'Enterprise Cloud Deck',
      'a1111111-1111-4111-8111-111111111101',
    );
    unpermissionedComp.artifactVersion = makeArtifactVersionEntity({
      ID: 'a2222222-2222-4222-8222-222222222201',
      ArtifactID: 'a1111111-1111-4111-8111-111111111101',
      VersionNumber: 1,
      Name: 'Enterprise Cloud Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    });
    unpermissionedComp.readonly = false;
    unpermissionedComp.ngOnInit();
    expect(unpermissionedComp.IsEditable).toBe(false);
    expect(unpermissionedComp.AnchoredThreads).toHaveLength(0);
    unpermissionedComp.ngOnDestroy();

    // Now wire a mock provider resolving owner permissions for 'art-slides-1'
    const ownerUser = new UserInfo(undefined, {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Alice Owner',
      Email: 'alice@memberjunction.org',
      IsActive: true,
    });
    let entitySeq = 0;
    const savedSlideEntities: Array<{ entityName: string; record: MockSavedRecordFields }> = [];
    const ownerProvider = makeSlideMockProvider({
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
      RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifacts') {
          const rows = [
            {
              ID: 'a1111111-1111-4111-8111-111111111101',
              UserID: ownerUser.ID,
              EnvironmentID: 'e1111111-1111-4111-8111-111111111101',
            },
          ] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          const rows = [{ ID: 'type-whiteboard-1', Name: 'Whiteboard' }] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        return { Success: true, Results: [] as T[], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
      GetEntityObject: async (entityName: string) => {
        const id = `88888888-0000-4000-8000-${String(++entitySeq).padStart(12, '0')}`;
        const rec: MockSavedRecordFields = {
          ID: id,
          NewRecord: () => true,
          Load: async () => true,
          Save: async () => {
            savedSlideEntities.push({ entityName, record: { ...rec } });
            return true;
          },
        };
        return makeMockSavedRecord(rec);
      },
    });

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    component.Provider = ownerProvider;
    component.artifactVersion = makeArtifactVersionEntity({
      ID: 'a2222222-2222-4222-8222-222222222201',
      ArtifactID: 'a1111111-1111-4111-8111-111111111101',
      VersionNumber: 1,
      Name: 'Enterprise Cloud Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    });
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

    const savedConversations: MockSavedRecordFields[] = [];
    const savedDetails: MockSavedRecordFields[] = [];
    const savedArtifacts: MockSavedRecordFields[] = [];
    const savedVersions: MockSavedRecordFields[] = [];
    const getEntityCalls: Array<{ entityName: string; contextUser: UserInfo | undefined }> = [];

    const mockUser = new UserInfo(undefined, {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Sarah Chen',
      Email: 'sarah.chen@memberjunction.org',
      IsActive: true,
    });

    const mockProvider = makeSlideMockProvider({
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
      RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifacts') {
          const rows = [
            {
              ID: '22222222-3333-4444-8555-666666666666',
              UserID: mockUser.ID,
              EnvironmentID: 'env-1',
            },
          ] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          const rows = [{ ID: 'type-wb-1', Name: 'Whiteboard' }] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Conversations') {
          const rows = [
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
          ] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Conversation Details') {
          const rows = [
            {
              ID: 'dddddddd-1111-4222-8333-444444444444',
              ConversationID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
              Role: 'User',
              Message: 'Hydrated SlideRegion thread from database',
            },
          ] as T[];
          return { Success: true, Results: rows, TotalRowCount: 1, RowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
        }
        return { Success: true, Results: [] as T[], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
      GetEntityObject: async (entityName: string, contextUser?: UserInfo) => {
        getEntityCalls.push({ entityName, contextUser });
        const rec: MockSavedRecordFields = {
          ID: `99999999-0000-4000-8000-${String(getEntityCalls.length).padStart(12, '0')}`,
          NewRecord: () => true,
          Load: async () => true,
          Save: async () => {
            if (entityName === 'MJ: Conversations') savedConversations.push({ ...rec });
            if (entityName === 'MJ: Conversation Details') savedDetails.push({ ...rec });
            if (entityName === 'MJ: Artifacts') savedArtifacts.push({ ...rec });
            if (entityName === 'MJ: Artifact Versions') savedVersions.push({ ...rec });
            return true;
          },
        };
        return makeMockSavedRecord(rec);
      },
    });

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    component.Provider = mockProvider;
    const seededDeck = SlideDeckEngine.Instance.CreateDefaultDeck(
      'Governed Security Deck',
      '22222222-3333-4444-8555-666666666666',
    );
    component.artifactVersion = makeArtifactVersionEntity({
      ID: 'ver-sec-1',
      ArtifactID: '22222222-3333-4444-8555-666666666666',
      VersionNumber: 1,
      Name: 'Governed Security Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(seededDeck),
    });
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

  it('fixes P0-20 PPTX & PDF export fidelity: 4:3 dimensions, theme fmtScheme 3-item lists, stripped XML control chars, wide table gridCols, hidden slide filtering, real chart rasterization, and sandboxed PDF iframe print', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('P0-20 Export Deck\u0007\u000B', 'deck-p020');
    const deck: SlideDeckSpec = {
      ...baseDeck,
      AspectRatio: '4:3',
      Slides: [
        {
          ...baseDeck.Slides[0],
          Regions: [
            {
              RegionID: 'r-img-ok',
              Label: 'Brand Visual',
              Kind: 'image',
              MarkdownContent: '',
              ImageUrl: 'https://cdn.example.com/chart.png',
              ImageAlt: 'Quarterly Chart',
            },
            {
              RegionID: 'r-img-xss',
              Label: 'Unsafe Image',
              Kind: 'image',
              MarkdownContent: '',
              ImageUrl: 'javascript:alert(1)',
              ImageAlt: 'Blocked',
            },
            {
              RegionID: 'r-md-tbl',
              Label: 'Metrics Table',
              Kind: 'table',
              MarkdownContent: '| Metric | Q1 | Q2 |\n|---|---|---|\n| ARR | 120 | 145 |',
            },
          ],
        },
        {
          ...baseDeck.Slides[1],
          Hidden: true,
          Title: 'Hidden Appendix Slide',
        },
        {
          ...baseDeck.Slides[2],
          Regions: [
            {
              RegionID: 'r-chart-blk',
              Label: 'Revenue Chart',
              Kind: 'mj-block',
              MarkdownContent: '',
              BlockSpec: {
                BlockID: 'blk-chart-real',
                Kind: 'EntityView',
                Mode: 'Live',
                Title: 'Revenue by Region',
                EntityName: 'MJ: Artifacts',
                DisplayMode: 'chart',
                ChartType: 'bar',
              },
            },
            {
              RegionID: 'r-wide-tbl',
              Label: 'Wide Table',
              Kind: 'mj-block',
              MarkdownContent: '',
              BlockSpec: {
                BlockID: 'blk-wide-tbl',
                Kind: 'EntityView',
                Mode: 'Live',
                Title: 'Wide Metrics',
                EntityName: 'MJ: Artifacts',
                DisplayMode: 'table',
              },
            },
          ],
        },
      ],
    };

    const wideCols = Array.from({ length: 12 }, (_, idx) => ({
      Name: `C${idx + 1}`,
      DisplayName: `Col ${idx + 1}`,
      Type: 'nvarchar',
    }));
    const wideRow: Record<string, string> = {};
    for (const col of wideCols) wideRow[col.Name] = 'v';

    const resultsMap = new Map<string, DocumentBlockExecutionResult>([
      [
        'blk-chart-real',
        {
          Success: true,
          BlockID: 'blk-chart-real',
          Kind: 'EntityView',
          Mode: 'Live',
          Columns: [
            { Name: 'Region', DisplayName: 'Region', Type: 'nvarchar' },
            { Name: 'ARR', DisplayName: 'ARR', Type: 'decimal' },
          ],
          Rows: [
            { Region: 'NA', ARR: 240 },
            { Region: 'EMEA', ARR: 160 },
          ],
          TotalRowCount: 2,
        },
      ],
      [
        'blk-wide-tbl',
        {
          Success: true,
          BlockID: 'blk-wide-tbl',
          Kind: 'EntityView',
          Mode: 'Live',
          Columns: wideCols,
          Rows: [wideRow],
          TotalRowCount: 1,
        },
      ],
    ]);

    // Default PPTX export excludes hidden slides
    const pkgVisible = exportService.ExportToPptxPackage(deck, resultsMap, {
      ID: 'u-1',
      Name: 'Analyst',
    });
    expect(pkgVisible.SlideCount).toBe(2);
    const entries = exportService.InspectPptxArchiveEntries(pkgVisible.Bytes);
    const chart1Xml = entries.get('ppt/charts/chart1.xml') ?? '';
    expect(chart1Xml).toContain('<c:chartSpace');
    expect(chart1Xml).toContain('ARR');

    const presXml = entries.get('ppt/presentation.xml')!;
    expect(presXml).toContain('cx="9144000" cy="6858000" type="screen4x3"');

    const themeXml = entries.get('ppt/theme/theme1.xml')!;
    expect(themeXml).toContain('<a:fmtScheme name="MJFormat">');
    expect(themeXml.match(/<a:solidFill>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(themeXml).toContain('<a:lnStyleLst>');
    expect(themeXml).toContain('<a:effectStyleLst>');
    expect(themeXml).toContain('<a:bgFillStyleLst>');

    const slide1Xml = entries.get('ppt/slides/slide1.xml')!;
    expect(slide1Xml).not.toContain('\u0007');
    expect(slide1Xml).not.toContain('\u000B');

    const slide2Xml = entries.get('ppt/slides/slide2.xml')!;
    expect(slide2Xml).toContain('<a:gridCol');
    // Ensure positive gridCol widths even for 12 columns
    expect(slide2Xml).not.toContain('w="0"');
    expect(slide2Xml).toContain('http://schemas.openxmlformats.org/drawingml/2006/chart');

    // IncludeHiddenSlides: true emits show="0" on hidden slide
    const pkgWithHidden = exportService.ExportToPptxPackage(
      deck,
      resultsMap,
      { ID: 'u-1', Name: 'Analyst' },
      { IncludeHiddenSlides: true },
    );
    expect(pkgWithHidden.SlideCount).toBe(3);
    const hiddenEntries = exportService.InspectPptxArchiveEntries(pkgWithHidden.Bytes);
    expect(hiddenEntries.get('ppt/slides/slide2.xml')).toContain('show="0">');

    // Printable HTML honors 4:3, visible total count, image sanitization, and markdown pipe table
    const html = exportService.BuildPrintableDeckHtml(deck, resultsMap, false);
    expect(html).toContain('@page { size: 10in 7.5in; margin: 0; }');
    expect(html).toContain('<span>1 / 2</span>');
    expect(html).toContain('<span>2 / 2</span>');
    expect(html).not.toContain('Hidden Appendix Slide');
    expect(html).toContain('https://cdn.example.com/chart.png');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('<th>ARR</th>');

    // ExportPrintablePdf uses sandboxed iframe print helper (no window.open)
    const openSpy = vi.spyOn(window, 'open');
    const createElSpy = vi.spyOn(document, 'createElement');
    const printedHtml = exportService.ExportPrintablePdf(deck, resultsMap, false);
    expect(printedHtml).toContain('<span>1 / 2</span>');
    expect(openSpy).not.toHaveBeenCalled();
    expect(createElSpy).toHaveBeenCalledWith('iframe');
  });

  it('validates Raw JSON syntax/schema, blocks dirty exit on invalid JSON, preserves locks against non-locker editors, and validates circular/depth>3 OLE embeds', async () => {
    const injector = Injector.create({
      providers: [
        { provide: SlideDeckExportService, useValue: exportService },
        { provide: DocumentCollaborationService, useValue: collabService },
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: () => undefined, detectChanges: () => undefined },
        },
      ],
    });
    const editorUser = new UserInfo(undefined, { ID: 'editor-user', Name: 'Bob Editor', Email: 'bob@example.com' });
    const ownerId = 'owner-user';
    const mockProvider = makeSlideMockProvider({
      CurrentUser: editorUser,
      Entities: [],
      RunView: async <T,>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: 'aaaaaaaa-1111-4111-8111-111111111111', UserID: ownerId }] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [] as T[], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
      GetEntityObject: async () =>
        makeMockSavedRecord({ ID: 'r1', NewRecord: () => true, Load: async () => true, Save: async () => true }),
    });
    vi.spyOn(collabService, 'ResolvePermissionsFromServer').mockResolvedValue({
      ArtifactID: 'aaaaaaaa-1111-4111-8111-111111111111',
      Source: 'ArtifactPermission',
      CanRead: true,
      CanEdit: true,
      CanShare: false,
      CanDelete: false,
      Reason: 'Shared editor',
    });

    const lockedDeck = SlideDeckEngine.Instance.CreateDefaultDeck(
      'Lock & JSON Guard Deck',
      'aaaaaaaa-1111-4111-8111-111111111111',
    );
    const lockRes = SlideDeckEngine.Instance.SetSlideLock(
      lockedDeck,
      lockedDeck.Slides[1].SlideID,
      true,
      ownerId,
      false,
      ownerId,
    );
    const regionLockRes = SlideDeckEngine.Instance.SetRegionLock(
      lockRes.Deck,
      lockRes.Deck.Slides[2].SlideID,
      lockRes.Deck.Slides[2].Regions[0].RegionID,
      true,
      ownerId,
      false,
      ownerId,
    );

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    component.Provider = mockProvider;
    component.readonly = false;
    component.artifactVersion = makeArtifactVersionEntity({
      ID: 'ver-lock-1',
      ArtifactID: 'aaaaaaaa-1111-4111-8111-111111111111',
      VersionNumber: 1,
      Name: 'Lock & JSON Guard Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(regionLockRes.Deck),
    });
    component.ngOnInit();
    await new Promise((r) => setTimeout(r, 20));

    // Invalid JSON syntax / schema preserves Deck and keeps workspace in 'source'
    component.SetWorkspaceMode('source');
    const originalSlidesLen = component.Deck.Slides.length;
    component.OnRawDeckJsonTextChange('{bad json');
    expect(component.HasUnsavedChanges).toBe(true);
    expect(component.ApplyRawJsonSource()).toBe(false);
    expect(component.RawJsonErrorMessage).toContain('Invalid JSON syntax');
    expect(component.Deck.Slides).toHaveLength(originalSlidesLen);
    component.SetWorkspaceMode('edit');
    expect(component.WorkspaceMode).toBe('source');

    component.OnRawDeckJsonTextChange('{"Title":"Missing Slides"}');
    expect(component.ApplyRawJsonSource()).toBe(false);
    expect(component.RawJsonErrorMessage).toContain('Invalid SlideDeck JSON schema');

    // Lock bypass checks against non-locker non-owner editor:
    // 1) Raw JSON cannot mutate/delete locked slide
    const stripped = { ...regionLockRes.Deck, Slides: [regionLockRes.Deck.Slides[0]] };
    component.OnRawDeckJsonTextChange(JSON.stringify(stripped));
    expect(component.ApplyRawJsonSource()).toBe(false);
    expect(component.Deck.Slides).toHaveLength(originalSlidesLen);

    // Reload clean remote deck to leave source cleanly
    component.ReloadRemoteDeckIntoRawJson();
    component.SetWorkspaceMode('edit');

    // 2) ConvertDraftMarkdownToDeck cannot clobber locked slide
    const preMdSlides = component.Deck.Slides.map((s) => s.Title);
    component.MarkdownConversionDraft = '# Replaced All Slides';
    component.ConvertDraftMarkdownToDeck();
    expect(component.Deck.Slides.map((s) => s.Title)).toEqual(preMdSlides);

    // 3) ChangeSlideLayoutById blocked on locked slide AND on slide containing a locked region
    const lockedSlide1LayoutBefore = component.Deck.Slides[1].Layout;
    component.ChangeSlideLayoutById(component.Deck.Slides[1].SlideID, 'BigNumber');
    expect(component.Deck.Slides[1].Layout).toBe(lockedSlide1LayoutBefore);
    component.ChangeSlideLayoutById(component.Deck.Slides[2].SlideID, 'BigNumber');
    expect(component.Deck.Slides[2].Layout).not.toBe('BigNumber');

    // 4) Speaker notes & region blurs blocked when locked
    component.SelectSlide(component.Deck.Slides[1].SlideID);
    const lockedNotesBefore = component.ActiveSlide.SpeakerNotes;
    component.OnSpeakerNotesChange('Unauthorized notes overwrite');
    expect(component.ActiveSlide.SpeakerNotes).toBe(lockedNotesBefore);

    // 5) AllowEditors allows edit while keeping lock toggle restricted to locker/owner
    expect(component.CanToggleCurrentSlideLock).toBe(false);
    const allowEditorsRes = SlideDeckEngine.Instance.SetSlideLock(
      component.Deck,
      component.Deck.Slides[1].SlideID,
      true,
      ownerId,
      true,
      ownerId,
    );
    component.Deck = allowEditorsRes.Deck;
    expect(component.CanEditSlideElements).toBe(true);
    expect(component.CanToggleCurrentSlideLock).toBe(false);
    component.OnSpeakerNotesChange('Authorized editor notes with AllowEditors=true');
    expect(component.ActiveSlide.SpeakerNotes).toBe('Authorized editor notes with AllowEditors=true');

    // 6) Circular self-embed & max depth > 3 guards
    const hostId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const selfBlock = {
      BlockID: 'blk-self-ole',
      Kind: 'Artifact' as const,
      Mode: 'Live' as const,
      Title: 'Self Embed',
      ArtifactType: 'Slide Deck' as const,
      ArtifactID: hostId,
    };
    expect(component.GetOrCreateEmbeddedArtifactVersion(component.Deck.Slides[0].Regions[0], selfBlock)).toBeNull();
    expect(component.GetEmbeddedArtifactError(selfBlock)).toContain('Circular');

    component.AncestorArtifactIDs = new Set(['id-a', 'id-b', 'id-c']);
    const deepBlock = {
      BlockID: 'blk-deep-ole',
      Kind: 'Artifact' as const,
      Mode: 'Live' as const,
      Title: 'Depth 4 Embed',
      ArtifactType: 'Whiteboard' as const,
      ArtifactID: 'bbbbbbbb-2222-4222-8222-222222222222',
    };
    expect(component.GetOrCreateEmbeddedArtifactVersion(component.Deck.Slides[0].Regions[0], deepBlock)).toBeNull();
    expect(component.GetEmbeddedArtifactError(deepBlock)).toContain('Maximum nested artifact embed depth');

    component.ngOnDestroy();
  });

  it('tracks IsWaitingForInitialCollabSync, IsSavingVersion, present<->presenter round-trip, latestWorkbookVersions, NW-1 Drift compare/refreeze, and NW-3 comment reply/@Agent/:: anchor/Yjs suggestions', async () => {
    const injector = Injector.create({
      providers: [
        { provide: SlideDeckExportService, useValue: exportService },
        { provide: DocumentCollaborationService, useValue: collabService },
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: () => undefined, detectChanges: () => undefined },
        },
      ],
    });

    const mockUser = new UserInfo(undefined, { ID: 'user-nw-1', Name: 'Alice Analyst', Email: 'alice@example.com' });
    const deckId = '33333333-4444-4555-8666-777777777777';
    const wbId = '44444444-5555-4666-8777-888888888888';
    const convId = '55555555-6666-4777-8888-999999999999';
    const capturedQueries: Array<{ EntityName: string; OrderBy?: string }> = [];
    const savedDetails: MockSavedRecordFields[] = [];

    const mockProvider = makeSlideMockProvider({
      CurrentUser: mockUser,
      Entities: [
        {
          ID: 'ent-art-1',
          Name: 'MJ: Artifacts',
          DisplayNameOrName: 'MJ: Artifacts',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [],
        },
        {
          ID: 'ent-conv-1',
          Name: 'MJ: Conversations',
          DisplayNameOrName: 'MJ: Conversations',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [],
        },
        {
          ID: 'ent-art-2',
          Name: 'MJ: Entity',
          DisplayNameOrName: 'MJ: Entity',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [
            { Name: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
            { Name: 'Name', IsPrimaryKey: false, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
          ],
        },
      ],
      RunView: async <T,>(params: RunViewParams): Promise<RunViewResult<T>> => {
        capturedQueries.push({
          EntityName: params.EntityName ?? '',
          OrderBy: typeof params.OrderBy === 'string' ? params.OrderBy : undefined,
        });
        if (params.EntityName === 'MJ: Artifact Versions') {
          const v2 = makeArtifactVersionEntity({
            ID: '66666666-0000-4000-8000-000000000002',
            ArtifactID: wbId,
            VersionNumber: 2,
            Name: 'Sales Model v2',
            Content: '{}',
          });
          const v1 = makeArtifactVersionEntity({
            ID: '66666666-0000-4000-8000-000000000001',
            ArtifactID: wbId,
            VersionNumber: 1,
            Name: 'Sales Model v1',
            Content: '{}',
          });
          return {
            Success: true,
            Results: [v2, v1] as T[],
            TotalRowCount: 2,
            RowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Conversations') {
          return {
            Success: true,
            Results: [
              {
                ID: convId,
                Name: 'SlideComment: Slide 2 · Left',
                LinkedEntityID: 'ent-art-1',
                LinkedRecordID: deckId,
                AnchorType: 'SlideRegion',
                AnchorKey: 'slide-2::main',
                AnchorMetadata: JSON.stringify({ slideId: 'slide-2', regionId: 'main', status: 'Open', agentMode: 'edit' }),
                IsResolved: false,
                IsArchived: false,
                __mj_CreatedAt: '2026-11-15T10:00:00.000Z',
              },
            ] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Conversation Details') {
          // Return newest-first (DESC); viewer reverses into chronological ASC
          return {
            Success: true,
            Results: [
              {
                ID: 'det-2',
                ConversationID: convId,
                User: 'AI Assistant',
                Role: 'AI',
                Message: 'Second message',
                __mj_CreatedAt: '2026-11-15T10:02:00.000Z',
              },
              {
                ID: 'det-1',
                ConversationID: convId,
                User: 'Alice Analyst',
                Role: 'User',
                Message: 'First message',
                __mj_CreatedAt: '2026-11-15T10:01:00.000Z',
              },
            ] as T[],
            TotalRowCount: 2,
            RowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [] as T[], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
      GetEntityObject: async (entityName: string) => {
        const rec: MockSavedRecordFields = {
          ID: '77777777-0000-4000-8000-000000000001',
          NewRecord: () => true,
          Load: async () => true,
          Save: async () => {
            if (entityName === 'MJ: Conversation Details') savedDetails.push({ ...rec });
            return true;
          },
        };
        return makeMockSavedRecord(rec);
      },
    });

    vi.spyOn(collabService, 'ResolvePermissionsFromServer').mockResolvedValue({
      ArtifactID: deckId,
      Source: 'Owner',
      CanRead: true,
      CanEdit: true,
      CanShare: true,
      CanDelete: true,
      Reason: 'Owner',
    });
    const mentionSpy = vi
      .spyOn(collabService, 'ExecuteAnchoredCommentAgentMention')
      .mockResolvedValue({
        HandledByServer: true,
        Success: true,
        ReplyBody: 'Updated Slide 2 recommendation.',
      });
    const hasBackendSpy = vi.spyOn(collabService, 'HasCollaborationBackend').mockReturnValue(false);
    vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValue({
      Success: true,
      BlockID: 'blk-frozen-drift',
      Kind: 'EntityView',
      Mode: 'Live',
      Columns: [{ Name: 'Name', DisplayName: 'Name', Type: 'nvarchar' }],
      Rows: [{ Name: 'Alpha Updated' }, { Name: 'Beta New' }],
      TotalRowCount: 2,
    });

    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Next-Wave Deck', deckId);
    deck.Slides[0].Regions[0] = {
      RegionID: 'r-sheet-chart',
      Label: 'Pinned Workbook Chart',
      Kind: 'mj-block',
      MarkdownContent: '',
      BlockSpec: {
        BlockID: 'blk-sheet-pin',
        Kind: 'Artifact',
        ArtifactType: 'Spreadsheet',
        ArtifactID: wbId,
        VersionID: '66666666-0000-4000-8000-000000000001',
        SheetID: 'Sheet1',
        SheetChartID: 'chart-rev',
        Mode: 'Live',
        Title: 'Pinned Chart',
      },
    };
    deck.Slides[0].Regions.push({
      RegionID: 'r-frozen-drift',
      Label: 'Frozen Pipeline',
      Kind: 'mj-block',
      MarkdownContent: '',
      BlockSpec: {
        BlockID: 'blk-frozen-drift',
        Kind: 'EntityView',
        EntityName: 'MJ: Artifacts',
        Mode: 'Frozen',
        Title: 'Frozen Pipeline',
        FrozenSnapshot: {
          Columns: [{ Name: 'Name', DisplayName: 'Name', Type: 'nvarchar' }],
          Rows: [{ Name: 'Alpha Old' }],
          TotalRowCount: 1,
          FrozenAt: '2026-11-15T09:00:00.000Z',
          FrozenByUserID: 'user-nw-1',
          FrozenByUserName: 'Alice Analyst',
          SecurityWarningAcknowledged: true,
        },
      },
    });

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    component.Provider = mockProvider;
    component.readonly = false;
    component.artifactVersion = makeArtifactVersionEntity({
      ID: 'ver-nw-1',
      ArtifactID: deckId,
      VersionNumber: 1,
      Name: 'Next-Wave Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
    });

    component.ngOnInit();
    await new Promise((r) => setTimeout(r, 40));

    // Hydrated details queried DESC and reversed to chronological ASC
    const detQuery = capturedQueries.find((q) => q.EntityName === 'MJ: Conversation Details');
    expect(detQuery?.OrderBy).toBe('__mj_CreatedAt DESC');
    expect(component.AnchoredThreads).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages.map((m) => m.Message)).toEqual([
      'First message',
      'Second message',
    ]);

    // :: AnchorKey jumps cleanly to slide-2 + right
    component.JumpToSlideAnchorKey('slide-2::right');
    expect(component.ActiveSlideID).toBe('slide-2');
    expect(component.FocusedRegionID).toBe('right');

    // Reply + @Agent dispatch
    component.SetThreadReplyDraft(convId, '@DeckAgent refine bullet points');
    await component.SubmitReplyToAnchoredSlideThread(component.AnchoredThreads[0]);
    expect(savedDetails).toHaveLength(1);
    expect(mentionSpy).toHaveBeenCalledWith(
      deckId,
      'DeckAgent',
      'edit',
      '@DeckAgent refine bullet points',
      '',
      mockProvider,
      convId,
    );
    expect(component.AnchoredThreads[0].Messages.at(-1)?.Message).toBe('Updated Slide 2 recommendation.');

    // latestWorkbookVersions populated on init for SheetChartID block
    component.SelectSlide(deck.Slides[0].SlideID);
    const sheetBlock = component.ActiveSlide.Regions[0].BlockSpec!;
    expect(component.GetNewerSourceWorkbookVersion(sheetBlock)?.VersionNumber).toBe(2);

    // NW-1 Drift Governance: compare with live & refreeze
    await component.CompareActiveSlideDriftWithLive();
    expect(component.ActiveSlideHasAnyDrift).toBe(true);
    expect(component.ActiveSlideDriftSummaries[0].ChangedRowCount).toBe(1);
    expect(component.ActiveSlideDriftSummaries[0].AddedRowCount).toBe(1);

    // present <-> presenter preserves PresentationFrozenDeck, PresentationRefreshCount, PresenterElapsedSeconds
    component.EnterPresentationMode('present');
    const frozenDeckRef = component.PresentationFrozenDeck;
    const refreshCountBefore = component.PresentationRefreshCount;
    component.PresenterElapsedSeconds = 42;
    component.EnterPresentationMode('presenter');
    expect(component.PresentationFrozenDeck).toBe(frozenDeckRef);
    expect(component.PresentationRefreshCount).toBe(refreshCountBefore);
    expect(component.PresenterElapsedSeconds).toBe(42);
    component.EnterPresentationMode('present');
    expect(component.PresentationFrozenDeck).toBe(frozenDeckRef);
    expect(component.PresentationRefreshCount).toBe(refreshCountBefore);
    expect(component.PresenterElapsedSeconds).toBe(42);

    // Exporting in presentation mode uses PresentationFrozenDeck even if Slide 1 title changes later
    const mutatedSlide1 = { ...component.Deck.Slides[0], Title: 'Live Edit After Freeze' };
    component.Deck = {
      ...component.Deck,
      Slides: [mutatedSlide1, ...component.Deck.Slides.slice(1)],
    };
    const exportedPdf = component.OnExportPdf();
    expect(exportedPdf).not.toContain('Live Edit After Freeze');
    component.ExitPresentationMode();

    // Verify navigationRequest output emits strongly-typed NavigationRequest cleanly
    const navEvents: NavigationRequest[] = [];
    component.navigationRequest.subscribe((evt) => navEvents.push(evt));
    component.navigationRequest.emit({
      appName: 'Artifacts',
      navItemName: 'Artifact',
      queryParams: { artifactId: wbId },
    });
    expect(navEvents).toHaveLength(1);

    // Suggested edit Accept applies cleanly
    const sug: SlideDeckSuggestion = {
      SuggestionID: 'sug-unit-1',
      SlideID: deck.Slides[1].SlideID,
      Field: 'slide-title',
      AuthorID: 'agent-1',
      AuthorName: 'DeckAgent',
      OriginalText: deck.Slides[1].Title,
      SuggestedText: 'Executive Summary (Polished)',
      Status: 'Pending',
      CreatedAt: '2026-11-15T12:00:00.000Z',
    };
    component.AcceptSlideSuggestion(sug);
    expect(component.Deck.Slides[1].Title).toBe('Executive Summary (Polished)');

    // IsSavingVersion tracks OnSaveVersionCheckpoint lifecycle
    const commitSpy = vi.spyOn(collabService, 'CommitInlineEditOnServer').mockResolvedValue({
      HandledByServer: true,
      Success: true,
      VersionNumber: 2,
    });
    expect(component.HasUnsavedChanges).toBe(true);
    const savePromise = component.OnSaveVersionCheckpoint();
    expect(component.IsSavingVersion).toBe(true);
    await savePromise;
    expect(component.IsSavingVersion).toBe(false);
    expect(commitSpy).toHaveBeenCalled();

    // IsWaitingForInitialCollabSync gates IsEditable=false until websocket initial sync completes
    hasBackendSpy.mockReturnValue(true);
    const gatedComponent = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    gatedComponent.Provider = mockProvider;
    gatedComponent.readonly = false;
    gatedComponent.CollaborationWsUrl = 'ws://127.0.0.1:0/collab';
    gatedComponent.artifactVersion = makeArtifactVersionEntity({
      ID: 'ver-gated-1',
      ArtifactID: deckId,
      VersionNumber: 1,
      Name: 'Gated Sync Deck',
      Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
    });
    gatedComponent.ngOnInit();
    await new Promise((r) => setTimeout(r, 20));
    expect(gatedComponent.IsWaitingForInitialCollabSync).toBe(true);
    expect(gatedComponent.IsEditable).toBe(false);
    gatedComponent.ngOnDestroy();

    component.ngOnDestroy();
  });

  it('tracks dirty state while typing in contenteditable and flushes unblurred DOM edits on OnSaveVersionCheckpoint', async () => {
    const hostEl = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.setAttribute('data-testid', 'editable-slide-title');
    titleEl.setAttribute('contenteditable', 'true');
    titleEl.innerText = 'Original Slide Heading';
    hostEl.appendChild(titleEl);
    document.body.appendChild(hostEl);

    const injector = Injector.create({
      providers: [
        { provide: ElementRef, useValue: new ElementRef(hostEl) },
        { provide: SlideDeckExportService, useValue: exportService },
        { provide: DocumentCollaborationService, useValue: collabService },
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: () => undefined, detectChanges: () => undefined },
        },
      ],
    });

    const ownerUser = new UserInfo(undefined, {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Slide Author',
      Email: 'author@example.com',
    });
    const deckId = 'bbbbbbbb-2222-4222-8222-222222222222';
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Unblurred Checkpoint Deck', 'deck-unblurred-checkpoint');
    deck.Slides[0].Title = 'Original Slide Heading';

    const mockProvider = makeSlideMockProvider({
      CurrentUser: ownerUser,
      Entities: [],
      RunView: async <T,>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: deckId, UserID: ownerUser.ID }] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [] as T[], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
      GetEntityObject: async () =>
        makeMockSavedRecord({
          ID: '33333333-3333-4333-8333-333333333333',
          NewRecord: () => true,
          Load: async () => true,
          Save: async () => true,
        }),
    });

    vi.spyOn(collabService, 'HasCollaborationBackend').mockReturnValue(false);
    vi.spyOn(collabService, 'ResolvePermissionsFromServer').mockResolvedValue({
      ArtifactID: deckId,
      CanRead: true,
      CanEdit: true,
      CanDelete: false,
      CanShare: true,
      Source: 'Owner',
      Reason: '',
    });
    const commitSpy = vi.spyOn(collabService, 'CommitInlineEditOnServer').mockResolvedValue({
      HandledByServer: true,
      Success: true,
      VersionNumber: 2,
    });

    const component = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    try {
      component.Provider = mockProvider;
      component.readonly = false;
      component.artifactVersion = makeArtifactVersionEntity({
        ID: '44444444-4444-4444-8444-444444444444',
        ArtifactID: deckId,
        VersionNumber: 1,
        Name: 'Unblurred Checkpoint Deck',
        Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
      });
      component.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      expect(component.HasUnsavedChanges).toBe(false);
      titleEl.focus();
      titleEl.innerText = 'Unblurred Typed Heading';
      component.OnSlideContentEditableInput();
      expect(component.HasUnsavedChanges).toBe(true);

      await component.OnSaveVersionCheckpoint();
      expect(component.Deck.Slides[0].Title).toBe('Unblurred Typed Heading');
      expect(commitSpy).toHaveBeenCalledTimes(1);
      const committedContent = commitSpy.mock.calls[0]?.[1];
      expect(committedContent).toContain('Unblurred Typed Heading');
      expect(component.HasUnsavedChanges).toBe(false);
    } finally {
      component.ngOnDestroy();
      hostEl.remove();
    }
  });

  it('does NOT add a Frozen block with SnapshotVerified === false to VerifiedBlockIds in ExportToPptxPackage or OnExportPptx', async () => {
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Frozen Verification Gate', 'deck-frozen-gate');
    const frozenRegionBlockId = 'slide-blk-frozen-unverified';
    deck.Slides[0].Regions = [
      {
        RegionID: 'reg-frozen-1',
        Kind: 'rich-text',
        Label: 'Frozen Data',
        MarkdownContent: [
          ':::mj-block',
          JSON.stringify({
            BlockID: frozenRegionBlockId,
            Kind: 'EntityView',
            Title: 'Confidential Revenue',
            EntityName: 'Sales',
            Mode: 'Frozen',
            FrozenSnapshot: {
              SnapshotAt: '2026-11-15T00:00:00.000Z',
              SnapshotByUserID: 'user-1',
              SnapshotByUserName: 'Alice',
              Columns: [{ Name: 'Secret', DisplayName: 'Secret', Type: 'nvarchar' }],
              Rows: [{ Secret: 'FORGED_ROW_VALUE' }],
              TotalRowCount: 1,
            },
          }),
          ':::',
        ].join('\n'),
      },
    ];

    const exportSpy = vi.spyOn(SlideDeckEngine.Instance, 'ExportDeckToPptxBytes');
    const unverifiedResults = new Map<string, DocumentBlockExecutionResult>([
      [
        frozenRegionBlockId,
        {
          Success: true,
          BlockID: frozenRegionBlockId,
          Kind: 'EntityView',
          Mode: 'Frozen',
          Columns: [{ Name: 'Secret', DisplayName: 'Secret', Type: 'nvarchar' }],
          Rows: [{ Secret: 'FORGED_ROW_VALUE' }],
          TotalRowCount: 1,
          FrozenSnapshot: {
            FrozenAt: '2026-11-15T00:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            SnapshotVerified: false,
          },
          FrozenMetadata: {
            FrozenAt: '2026-11-15T00:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            SnapshotVerified: false,
          },
        },
      ],
    ]);

    const unverifiedPkg = exportService.ExportToPptxPackage(deck, unverifiedResults, {
      ID: 'user-1',
      Name: 'Alice',
    });
    const firstCallOpts = exportSpy.mock.calls[0]?.[1];
    expect(firstCallOpts?.VerifiedBlockIds?.has(frozenRegionBlockId)).toBe(false);
    const unverifiedSlideXml = exportService.InspectPptxArchiveEntries(unverifiedPkg.Bytes).get('ppt/slides/slide1.xml') ?? '';
    expect(unverifiedSlideXml).not.toContain('FORGED_ROW_VALUE');

    const verifiedResults = new Map<string, DocumentBlockExecutionResult>([
      [
        frozenRegionBlockId,
        {
          Success: true,
          BlockID: frozenRegionBlockId,
          Kind: 'EntityView',
          Mode: 'Frozen',
          Columns: [{ Name: 'Secret', DisplayName: 'Secret', Type: 'nvarchar' }],
          Rows: [{ Secret: 'VERIFIED_ROW_VALUE' }],
          TotalRowCount: 1,
          FrozenSnapshot: {
            FrozenAt: '2026-11-15T00:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            SnapshotVerified: true,
          },
          FrozenMetadata: {
            FrozenAt: '2026-11-15T00:00:00.000Z',
            FrozenByUserID: 'user-1',
            FrozenByUserName: 'Alice',
            SnapshotVerified: true,
          },
        },
      ],
    ]);

    exportSpy.mockClear();
    exportService.ExportToPptxPackage(deck, verifiedResults, {
      ID: 'user-1',
      Name: 'Alice',
    });
    const secondCallOpts = exportSpy.mock.calls[0]?.[1];
    expect(secondCallOpts?.VerifiedBlockIds?.has(frozenRegionBlockId)).toBe(true);
    exportSpy.mockRestore();
  });

  it('Lower #7: sanitizes SlideDeck Theme CSS properties on SafeTheme and rejects </style/url() injection in print HTML', () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { detectChanges: () => {}, markForCheck: () => {} } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: SlideDeckExportService, useValue: exportService },
        { provide: DocumentCollaborationService, useValue: collabService },
      ],
    });
    const comp = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('CSS Injection Test', 'deck-css-guard');
    deck.Theme.BackgroundColor = 'red; background-image: url(https://evil.example/x)';
    deck.Theme.PrimaryColor = '#fff;</style><script>alert(1)</script>';
    deck.Theme.HeadingFont = 'Inter; } body { display:none';
    comp.Deck = deck;

    expect(comp.SafeTheme.BackgroundColor).toBe('#ffffff');
    expect(comp.SafeTheme.PrimaryColor).toBe('#4f46e5');
    expect(comp.SafeTheme.HeadingFont).toBe('Inter, system-ui, sans-serif');

    const printableHtml = exportService.BuildPrintableDeckHtml(deck, new Map(), false);
    expect(printableHtml).not.toContain('evil.example');
    expect(printableHtml).not.toContain('<script>alert(1)</script>');
  });
});
