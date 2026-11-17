/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import {
  type EntityInfo,
  type EntityUserPermissionInfo,
  type IMetadataProvider,
  type IRunViewProvider,
  type ProviderConfigDataBase,
  type RunViewParams,
  type RunViewResult,
  UserInfo,
} from '@memberjunction/core';
import {
  MJArtifactVersionEntity,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  BuildCanonicalDocumentSuggestionRecord,
  BuildCanonicalSlideSuggestionRecord,
  BuildCanonicalSpreadsheetSuggestionRecord,
  MergeConfigurationSuggestions,
  NormalizeArtifactSuggestionStatus,
  NormalizeDocumentSuggestion,
  NormalizeSlideSuggestion,
  NormalizeSpreadsheetSuggestion,
  ParseSuggestionsFromConfiguration,
  type ArtifactSuggestionRecord,
} from '../lib/utils/artifact-suggestion-normalizer.util';
import type {
  ArtifactNavigationAnchor,
  ArtifactSelectionAnchor,
} from '../lib/components/base-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from '../lib/components/plugins/markdown-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';
import { ArtifactFileService } from '../lib/services/artifact-file.service';

function stubObj<T extends object>(fields: Partial<T>): T {
  return Object.assign(Object.create(null) as T, fields);
}

interface SavedRecord {
  ID: string;
  Configuration?: string;
  NewRecord: () => boolean;
  Load: () => Promise<boolean>;
  Save: () => Promise<boolean>;
}

function createOwnerProvider(artifactId: string, ownerId: string): {
  provider: IMetadataProvider & IRunViewProvider;
  savedVersions: SavedRecord[];
} {
  const savedVersions: SavedRecord[] = [];
  const ownerUser = new UserInfo(undefined, {
    ID: ownerId,
    Name: 'Contract Owner',
    Email: 'owner@example.com',
  });
  let seq = 0;

  const runViewImpl = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
    if (params.EntityName === 'MJ: Artifacts') {
      return stubObj<RunViewResult<T>>({
        Success: true,
        Results: [Object.assign(Object.create(null), { ID: artifactId, UserID: ownerId })],
        RowCount: 1,
        TotalRowCount: 1,
      });
    }
    return stubObj<RunViewResult<T>>({
      Success: true,
      Results: [],
      RowCount: 0,
      TotalRowCount: 0,
    });
  };

  const provider = stubObj<
    IMetadataProvider &
      IRunViewProvider & {
        ExecuteGQL: (query: string) => Promise<Record<string, object>>;
        GetRunViewProvider: () => Promise<IRunViewProvider>;
      }
  >({
    CurrentUser: ownerUser,
    Entities: [],
    Roles: [],
    Queries: [],
    ConfigData: stubObj<ProviderConfigDataBase & { URL: string }>({ URL: 'https://example.com/graphql' }),
    EntityByName: (name: string) =>
      name === 'MJ: Artifacts'
        ? stubObj<EntityInfo>({
            ID: '99999999-9999-4999-8999-999999999999',
            Name: 'MJ: Artifacts',
            Fields: [],
            GetUserPermisions: (user: UserInfo) =>
              stubObj<EntityUserPermissionInfo>({
                User: user,
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
              }),
          })
        : undefined,
    ExecuteGQL: async (query: string): Promise<Record<string, object>> => {
      if (query.includes('ResolveArtifactPermissions')) {
        return {
          ResolveArtifactPermissions: {
            ArtifactID: artifactId,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
          },
        };
      }
      if (query.includes('MintArtifactCollaborationTicket')) {
        return {
          MintArtifactCollaborationTicket: {
            Success: false,
            Ticket: '',
            WsPath: '',
            CanRead: true,
            CanEdit: true,
          },
        };
      }
      return {};
    },
    RunView: runViewImpl,
    GetRunViewProvider: async () =>
      stubObj<IRunViewProvider>({
        RunView: runViewImpl,
        RunViews: async <T>(params: RunViewParams[]) => Promise.all(params.map((p) => runViewImpl<T>(p))),
      }),
    GetEntityObject: async () => {
      const rec: SavedRecord = {
        ID: `88888888-8888-4888-8888-${String(++seq).padStart(12, '0')}`,
        NewRecord: () => true,
        Load: async () => true,
        Save: async () => {
          savedVersions.push({ ...rec });
          return true;
        },
      };
      return rec;
    },
  });
  return { provider, savedVersions };
}

describe('NW-1, NW-3 & NW-6 Viewer Contracts (Docs, Sheets, Slides)', () => {
  let collabService: DocumentCollaborationService;

  beforeEach(() => {
    collabService = new DocumentCollaborationService();
    vi.spyOn(collabService, 'HasCollaborationBackend').mockReturnValue(false);
  });

  afterEach(() => {
    collabService.ngOnDestroy();
    vi.restoreAllMocks();
  });

  describe('NW-3 Suggestion Normalization & Configuration.suggestions Persistence', () => {
    it('normalizes canonical ArtifactSuggestionRecord across Docs, Sheets, and Slides and preserves existing Configuration keys', () => {
      expect(NormalizeArtifactSuggestionStatus('pending')).toBe('Pending');
      expect(NormalizeArtifactSuggestionStatus('ACCEPTED')).toBe('Accepted');
      expect(NormalizeArtifactSuggestionStatus('Rejected')).toBe('Rejected');

      const docCanonical = BuildCanonicalDocumentSuggestionRecord(
        {
          SuggestionID: 'sug-doc-1',
          BlockID: 'seg-1',
          AuthorName: 'Agent Writer',
          CreatedAt: '2026-11-15T12:00:00.000Z',
          OriginalMarkdown: 'Old prose',
          ProposedMarkdown: 'Polished prose',
          Rationale: 'Clarity',
          Status: 'Pending',
        },
        '11111111-1111-4111-8111-111111111111',
        { Heading: 'Introduction' },
      );
      expect(docCanonical.Domain).toBe('document');
      expect(docCanonical.Anchor.blockId).toBe('seg-1');
      expect(docCanonical.Anchor.heading).toBe('Introduction');

      const docParsed = NormalizeDocumentSuggestion(docCanonical);
      expect(docParsed?.ProposedMarkdown).toBe('Polished prose');
      expect(docParsed?.Status).toBe('Pending');

      const sheetCanonical = BuildCanonicalSpreadsheetSuggestionRecord(
        {
          SuggestionID: 'sug-sheet-1',
          SheetID: 'sheet-main',
          Range: 'B4',
          ProposedValue: '=SUM(B2:B3)',
          CurrentDisplayValue: '0',
          Rationale: 'Formula fix',
          AuthorName: 'SheetsAgent',
          AuthorUserID: 'agent-1',
          IsAgent: true,
          CreatedAt: '2026-11-15T12:05:00.000Z',
          Status: 'pending',
        },
        'Revenue',
      );
      expect(sheetCanonical.Domain).toBe('spreadsheet');
      expect(sheetCanonical.Anchor.sheet).toBe('Revenue');
      expect(sheetCanonical.Status).toBe('Pending');

      const sheetParsed = NormalizeSpreadsheetSuggestion(sheetCanonical);
      expect(sheetParsed?.Status).toBe('pending');
      expect(sheetParsed?.ProposedValue).toBe('=SUM(B2:B3)');

      const slideCanonical = BuildCanonicalSlideSuggestionRecord({
        SuggestionID: 'sug-slide-1',
        SlideID: 'slide-2',
        RegionID: 'reg-title',
        Field: 'slide-title',
        AuthorID: 'agent-2',
        AuthorName: 'DeckAgent',
        OriginalText: 'Q3 Outlook',
        SuggestedText: 'Q3 Revenue Acceleration',
        Status: 'Accepted',
        CreatedAt: '2026-11-15T12:10:00.000Z',
      });
      const slideParsed = NormalizeSlideSuggestion(slideCanonical);
      expect(slideParsed?.Status).toBe('Accepted');
      expect(slideParsed?.SuggestedText).toBe('Q3 Revenue Acceleration');

      // MergeConfigurationSuggestions preserves PreviewSnapshot & ThumbnailDataUrl
      const existingConfig = JSON.stringify({
        ThumbnailDataUrl: 'data:image/png;base64,AAA',
        PreviewSnapshot: { Title: 'Saved Preview' },
      });
      const mergedJson = MergeConfigurationSuggestions(existingConfig, [
        docCanonical,
        sheetCanonical,
        slideCanonical,
      ]);
      const parsedConfig = JSON.parse(mergedJson) as {
        ThumbnailDataUrl: string;
        PreviewSnapshot: { Title: string };
        suggestions: ArtifactSuggestionRecord[];
      };
      expect(parsedConfig.ThumbnailDataUrl).toBe('data:image/png;base64,AAA');
      expect(parsedConfig.PreviewSnapshot.Title).toBe('Saved Preview');
      expect(ParseSuggestionsFromConfiguration(mergedJson, 'spreadsheet')).toHaveLength(1);
      expect(ParseSuggestionsFromConfiguration(mergedJson, 'slides')).toHaveLength(1);
    });

    it('hydrates and updates Configuration.suggestions in Docs, Sheets, and Slides viewers + parses both ":" and "#" slide anchors', async () => {
      const ownerId = '11111111-1111-4111-8111-111111111111';
      const artifactId = '22222222-2222-4222-8222-222222222222';
      const { provider } = createOwnerProvider(artifactId, ownerId);

      // 1. Slides: hydrate from Configuration.suggestions + test ":" and "#" anchor compat
      const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Suggestions Deck', artifactId);
      const slideId = deck.Slides[0].SlideID;
      deck.Slides[0].Title = 'Draft Title';
      const slideReg = deck.Slides[0].Regions[0];
      const slideSug: ArtifactSuggestionRecord = {
        SuggestionID: 'sug-slide-cfg-1',
        Domain: 'slides',
        ArtifactID: artifactId,
        Anchor: {
          domain: 'slides',
          slideId,
          elementId: slideReg?.RegionID,
        },
        OriginalSlice: 'Draft Title',
        ProposedReplacement: 'Board-Ready Title',
        Rationale: 'Executive framing',
        AuthorName: 'DeckAgent',
        CreatedAt: '2026-11-15T12:00:00.000Z',
        Status: 'Pending',
        Field: 'slide-title',
      };
      const slidesInjector = Injector.create({
        providers: [
          { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        ],
      });
      const slidesViewer = runInInjectionContext(slidesInjector, () => new SlideDeckArtifactViewerComponent());
      slidesViewer.Provider = provider;
      slidesViewer.readonly = false;
      slidesViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '33333333-3333-4333-8333-333333333333',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'Suggestions Deck',
        Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
        Configuration: JSON.stringify({ suggestions: [slideSug] }),
      });
      slidesViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      expect(slidesViewer.SharedSuggestions).toHaveLength(1);
      slidesViewer.AcceptSlideSuggestion(slidesViewer.SharedSuggestions[0]);
      expect(slidesViewer.Deck.Slides[0].Title).toBe('Board-Ready Title');
      expect(
        ParseSuggestionsFromConfiguration(slidesViewer.artifactVersion.Configuration, 'slides')[0]?.Status,
      ).toBe('Accepted');

      // Anchored comments parse both canonical ':' and legacy '#' region keys
      const targetRegionId = slideReg?.RegionID ?? 'body';
      const colonAnchor = `${slideId}:${targetRegionId}`;
      const hashAnchor = `${slideId}#${targetRegionId}`;
      slidesViewer.PendingAnchorKey = '';
      slidesViewer.JumpToSlideAnchorKey(colonAnchor);
      expect(slidesViewer.ActiveSlide?.SlideID).toBe(slideId);
      if (slideReg) {
        expect(slidesViewer.PendingAnchorKey).toBe(colonAnchor);
        expect(slidesViewer.FocusedRegionID).toBe(targetRegionId);
      }
      slidesViewer.PendingAnchorKey = '';
      slidesViewer.JumpToSlideAnchorKey(hashAnchor);
      expect(slidesViewer.ActiveSlide?.SlideID).toBe(slideId);
      if (slideReg) {
        expect(slidesViewer.PendingAnchorKey).toBe(colonAnchor);
        expect(slidesViewer.FocusedRegionID).toBe(targetRegionId);
      }

      // 2. Sheets: hydrate from Configuration.suggestions + accept updates Configuration
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Suggestions Sheet');
      const sheetId = wb.Worksheets[0].SheetID;
      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A1', { Value: 10 });
      const sheetSug: ArtifactSuggestionRecord = {
        SuggestionID: 'sug-sheet-cfg-1',
        Domain: 'spreadsheet',
        ArtifactID: artifactId,
        Anchor: { domain: 'spreadsheet', sheetId, range: 'A1' },
        OriginalSlice: '10',
        ProposedReplacement: '42',
        Rationale: 'Updated forecast',
        AuthorName: 'SheetsAgent',
        CreatedAt: '2026-11-15T12:00:00.000Z',
        Status: 'Pending',
      };
      const sheetsInjector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: ArtifactFileService, useValue: null },
        ],
      });
      const sheetsViewer = runInInjectionContext(sheetsInjector, () => new SpreadsheetArtifactViewerComponent());
      sheetsViewer.Provider = provider;
      sheetsViewer.readonly = false;
      sheetsViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '44444444-4444-4444-8444-444444444444',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'Suggestions Sheet',
        Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
        Configuration: JSON.stringify({ suggestions: [sheetSug] }),
      });
      await sheetsViewer.ngOnInit();

      expect(sheetsViewer.CellSuggestions).toHaveLength(1);
      sheetsViewer.AcceptCellSuggestion(sheetsViewer.CellSuggestions[0]);
      expect(sheetsViewer.ActiveSheet.Cells['A1']?.RawValue).toBe(42);
      expect(
        ParseSuggestionsFromConfiguration(sheetsViewer.artifactVersion.Configuration, 'spreadsheet')[0]?.Status,
      ).toBe('Accepted');

      // 3. Docs: hydrate from Configuration.suggestions + accept updates Configuration
      const docInjector = Injector.create({
        providers: [
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
          { provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } },
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        ],
      });
      const docsViewer = runInInjectionContext(docInjector, () => new MarkdownArtifactViewerComponent());
      docsViewer.Provider = provider;
      docsViewer.readonly = false;
      docsViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '55555555-5555-4555-8555-555555555555',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'Suggestions Doc',
        Content: '## Overview\n\nOriginal paragraph.',
        Configuration: '{}',
      });
      docsViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));
      const firstSegId = docsViewer.DocumentSegments[0]?.SegmentID ?? 'seg-0';
      const docSug: ArtifactSuggestionRecord = {
        SuggestionID: 'sug-doc-cfg-1',
        Domain: 'document',
        ArtifactID: artifactId,
        Anchor: { domain: 'document', blockId: firstSegId },
        OriginalSlice: docsViewer.DocumentSegments[0].RawMarkdown,
        ProposedReplacement: '## Executive Summary',
        Rationale: 'More specific heading',
        AuthorName: 'DocsAgent',
        CreatedAt: '2026-11-15T12:00:00.000Z',
        Status: 'Pending',
        BlockID: firstSegId,
        OriginalMarkdown: docsViewer.DocumentSegments[0].RawMarkdown,
        ProposedMarkdown: '## Executive Summary',
      };
      docsViewer.artifactVersion.Configuration = JSON.stringify({ suggestions: [docSug] });
      docsViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      expect(docsViewer.Suggestions.length).toBeGreaterThanOrEqual(1);
      const pendingDocSug = docsViewer.Suggestions.find((s) => s.SuggestionID === 'sug-doc-cfg-1')!;
      docsViewer.AcceptSuggestion(pendingDocSug);
      expect(docsViewer.MarkdownContent).toContain('## Executive Summary');
      expect(
        ParseSuggestionsFromConfiguration(docsViewer.artifactVersion.Configuration, 'document')[0]?.Status,
      ).toBe('Accepted');

      slidesViewer.ngOnDestroy();
      sheetsViewer.ngOnDestroy();
      docsViewer.ngOnDestroy();
    });
  });

  describe('NW-1 PreVerifiedFrozenSnapshots & NW-6 ViewMode / NavigationAnchor / SelectionChanged', () => {
    it('supports ViewMode switching, NavigationAnchor focusing, SelectionChanged emission, and PreVerifiedFrozenSnapshots across Docs, Sheets, and Slides', async () => {
      const ownerId = '11111111-1111-4111-8111-111111111111';
      const artifactId = '66666666-6666-4666-8666-666666666666';
      const { provider } = createOwnerProvider(artifactId, ownerId);

      // ── Docs ──
      const docInjector = Injector.create({
        providers: [
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
          { provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } },
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        ],
      });
      const docsViewer = runInInjectionContext(docInjector, () => new MarkdownArtifactViewerComponent());
      docsViewer.Provider = provider;
      docsViewer.readonly = false;
      docsViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '77777777-7777-4777-8777-777777777777',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'NW6 Doc',
        Content: '## First Section\n\nBody one.\n\n## Second Section\n\nBody two.',
      });
      docsViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      const docSelections: ArtifactSelectionAnchor[] = [];
      docsViewer.SelectionChanged.subscribe((a) => docSelections.push(a));
      docsViewer.SyncViewMode = 'diff';
      expect(docsViewer.ViewMode).toBe('diff');
      docsViewer.SyncViewMode = 'suggest';
      expect(docsViewer.ViewMode).toBe('suggest');

      const secondHeading = docsViewer.OutlineItems.find((i) => i.Title === 'Second Section')!;
      docsViewer.NavigationAnchor = { Heading: 'Second Section' };
      expect(docsViewer.SelectedAnchorKey).toBe(secondHeading.ID);

      docsViewer.SelectOutlineItem(secondHeading);
      expect(docSelections.some((s) => s.domain === 'document' && s.heading === 'Second Section')).toBe(true);

      // ── Sheets ──
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('NW6 Workbook');
      const s1 = wb.Worksheets[0];
      const s2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Q4 Forecast');
      const liveTblId = 'tbl-frozen-nw1';
      const sheetsInjector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: ArtifactFileService, useValue: null },
        ],
      });
      const sheetsViewer = runInInjectionContext(sheetsInjector, () => new SpreadsheetArtifactViewerComponent());
      sheetsViewer.Provider = provider;
      sheetsViewer.readonly = false;
      sheetsViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '88888888-8888-4888-8888-888888888888',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'NW6 Workbook',
        Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
      });
      sheetsViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      const sheetSelections: ArtifactSelectionAnchor[] = [];
      sheetsViewer.SelectionChanged.subscribe((a) => sheetSelections.push(a));
      sheetsViewer.SyncViewMode = 'diff';
      expect(sheetsViewer.WorkspaceMode).toBe('diff');
      sheetsViewer.SyncViewMode = 'suggest';
      expect(sheetsViewer.WorkspaceMode).toBe('grid');
      expect(sheetsViewer.ShowCommentsDrawer).toBe(true);

      sheetsViewer.NavigationAnchor = { Sheet: s2.SheetID, Range: 'C5:D8' };
      expect(sheetsViewer.ActiveSheet.SheetID).toBe(s2.SheetID);
      expect(sheetsViewer.SelectedRange).toBe('C5:D8');

      sheetsViewer.SelectCell(2, 2);
      expect(
        sheetSelections.some(
          (a) => a.domain === 'spreadsheet' && a.sheet === s2.Name && a.range === sheetsViewer.ActiveCellAddress,
        ),
      ).toBe(true);

      // PreVerifiedFrozenSnapshots for Sheets LiveTable: true passes, false/missing fails closed
      const sampleTableSpec = {
        TableID: liveTblId,
        Title: 'Frozen Table',
        SourceType: 'EntityView' as const,
        Mode: 'Frozen' as const,
        AnchorCell: 'A1',
      };
      expect(sheetsViewer.IsLiveTableSnapshotVerified(sampleTableSpec)).toBe(false);
      sheetsViewer.PreVerifiedFrozenSnapshots = {
        [liveTblId]: { Verified: true, FrozenByUserName: 'Server Verified User' },
      };
      expect(sheetsViewer.IsLiveTableSnapshotVerified(sampleTableSpec)).toBe(true);
      expect(sheetsViewer.GetLiveTablePreVerifiedSnapshot(sampleTableSpec)?.FrozenByUserName).toBe(
        'Server Verified User',
      );
      sheetsViewer.PreVerifiedFrozenSnapshots = {
        [liveTblId]: { Verified: false },
      };
      expect(sheetsViewer.IsLiveTableSnapshotVerified(sampleTableSpec)).toBe(false);

      // ── Slides ──
      const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('NW6 Deck', artifactId);
      const addResult = SlideDeckEngine.Instance.AddSlide(baseDeck, {
        Title: 'Slide Two',
        Layout: 'TitleAndBody',
      });
      const deck = addResult.Deck;
      const slide2 = addResult.AddedSlide;
      const reg2Id = slide2.Regions[0]?.RegionID ?? 'reg-two';
      const slidesInjector = Injector.create({
        providers: [
          { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        ],
      });
      const slidesViewer = runInInjectionContext(slidesInjector, () => new SlideDeckArtifactViewerComponent());
      slidesViewer.Provider = provider;
      slidesViewer.readonly = false;
      slidesViewer.artifactVersion = stubObj<MJArtifactVersionEntity>({
        ID: '99999999-9999-4999-8999-999999999999',
        ArtifactID: artifactId,
        VersionNumber: 1,
        Name: 'NW6 Deck',
        Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
      });
      slidesViewer.ngOnInit();
      await new Promise((r) => setTimeout(r, 20));

      const slideSelections: ArtifactSelectionAnchor[] = [];
      slidesViewer.SelectionChanged.subscribe((a) => slideSelections.push(a));
      slidesViewer.SyncViewMode = 'present';
      expect(slidesViewer.WorkspaceMode).toBe('present');
      slidesViewer.SyncViewMode = 'edit';
      expect(slidesViewer.WorkspaceMode).toBe('edit');

      slidesViewer.NavigationAnchor = { SlideID: slide2.SlideID, ElementID: reg2Id };
      expect(slidesViewer.ActiveSlide?.SlideID).toBe(slide2.SlideID);
      expect(slidesViewer.FocusedRegionID).toBe(reg2Id);
      expect(slideSelections.some((a) => a.domain === 'slides' && a.slideId === slide2.SlideID)).toBe(true);

      // PreVerifiedFrozenSnapshots for Slides block: compound `${slideId}:${regionId}` resolves cleanly & false fails closed
      const slideBlock = stubObj<DocumentBlockSpec>({
        BlockID: 'blk-slide-frozen',
        Mode: 'Frozen',
        Kind: 'EntityView',
      });
      expect(slidesViewer.IsSnapshotVerified(slideBlock, reg2Id, slide2.SlideID)).toBe(false);
      slidesViewer.PreVerifiedFrozenSnapshots = {
        [`${slide2.SlideID}:${reg2Id}`]: { Verified: true, FrozenByUserName: 'Verified Slide Author' },
      };
      expect(slidesViewer.IsSnapshotVerified(slideBlock, reg2Id, slide2.SlideID)).toBe(true);
      expect(
        slidesViewer.GetBlockPreVerifiedSnapshot(slideBlock, reg2Id, slide2.SlideID)?.FrozenByUserName,
      ).toBe('Verified Slide Author');
      slidesViewer.PreVerifiedFrozenSnapshots = {
        'blk-slide-frozen': { Verified: false },
      };
      expect(slidesViewer.IsSnapshotVerified(slideBlock, reg2Id, slide2.SlideID)).toBe(false);

      // Keep unused variable s1 clean
      expect(s1.SheetID).toBeTruthy();

      docsViewer.ngOnDestroy();
      sheetsViewer.ngOnDestroy();
      slidesViewer.ngOnDestroy();
    });
  });
});
