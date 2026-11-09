/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wave 3 E2E Specification — Real Angular Sheets Editor + Real Yjs WebSocket
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mounts the real AOT-compiled Angular components in Chromium via esbuild:
 *   - `SpreadsheetArtifactViewerComponent` (`@memberjunction/ng-artifacts`)
 *   - `SlideDeckArtifactViewerComponent` (`@memberjunction/ng-artifacts`)
 *   - `ArtifactTypePluginViewerComponent` (`@memberjunction/ng-artifacts`)
 *   - `WhiteboardArtifactViewerComponent` (`@memberjunction/ng-conversations`)
 *   - `RealtimeWhiteboardHostComponent` (`@memberjunction/ng-whiteboard`)
 *
 * Connected over WebSocket (`/collaboration/yjs`) to a real in-process
 * `ArtifactCollaborationServer` (`@memberjunction/server`) instance.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SpreadsheetEngine } from '../../packages/MJCoreEntities/dist/custom/SpreadsheetEngine.js';
import type { ArtifactCollaborationServer as ArtifactCollaborationServerType } from '../../packages/MJServer/src/collaboration/ArtifactCollaborationServer';
import type { InMemoryYjsRoomRelay as InMemoryYjsRoomRelayType } from '../../packages/MJServer/src/collaboration/YjsRoomRelay';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCREENSHOT_DIR = path.resolve(REPO_ROOT, 'guides', 'screenshots', 'wave3');
const SHEET_ARTIFACT_ID = '33333333-4444-4555-8666-777777777777';

function createSeededWorkbookJson(): string {
  const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FY27 Enterprise Revenue & Renewals');
  wb.WorkbookID = SHEET_ARTIFACT_ID;
  const sheet1 = wb.Worksheets[0];
  sheet1.SheetID = 'sheet-rev';
  sheet1.Name = 'FY27 Revenue';
  sheet1.FrozenRows = 1;
  wb.ActiveSheetID = sheet1.SheetID;

  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'A1', {
    Value: 'Quarter / Segment',
    Style: { Bold: true, BackgroundColor: '#E2E8F0' },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B1', {
    Value: 'Booked ARR',
    Style: { Bold: true, BackgroundColor: '#E2E8F0', HorizontalAlign: 'right' },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'C1', {
    Value: 'YoY Growth',
    Style: { Bold: true, BackgroundColor: '#E2E8F0', HorizontalAlign: 'right' },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'D1', {
    Value: 'Weighted Forecast',
    Style: { Bold: true, BackgroundColor: '#E2E8F0', HorizontalAlign: 'right' },
  });

  const rows: Array<[string, number, number]> = [
    ['Q1 Enterprise Cloud', 100000, 0.18],
    ['Q2 Financial Services', 200000, 0.22],
    ['Q3 Healthcare AI', 300000, 0.25],
    ['Q4 Global Public Sector', 400000, 0.30],
  ];

  rows.forEach(([label, arr, growth], i) => {
    const r = i + 2;
    SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, `A${r}`, { Value: label });
    SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, `B${r}`, {
      Value: arr,
      Style: { FormatType: 'currency' },
    });
    SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, `C${r}`, {
      Value: growth,
      Style: { FormatType: 'percent' },
    });
    SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, `D${r}`, {
      Formula: `=ROUND(B${r}*(1+C${r}), 2)`,
      Style: { FormatType: 'currency' },
    });
  });

  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'A6', {
    Value: 'Total FY27 Portfolio',
    Style: { Bold: true },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B6', {
    Formula: '=SUM(B2:B5)',
    Style: { Bold: true, FormatType: 'currency' },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'C6', {
    Formula: '=AVERAGE(C2:C5)',
    Style: { Bold: true, FormatType: 'percent' },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'D6', {
    Formula: '=SUM(D2:D5)',
    Style: { Bold: true, FormatType: 'currency' },
  });

  // Add second worksheet tab ('Rates & Assumptions') for cross-sheet references
  const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Rates');
  sheet2.SheetID = 'sheet-rates';
  SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A1', {
    Value: 'Assumption',
    Style: { Bold: true },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'B1', {
    Value: 'Factor',
    Style: { Bold: true },
  });
  SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A2', { Value: 'Net Retention Target' });
  SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'B2', {
    Value: 1.15,
    Style: { FormatType: 'percent' },
  });

  SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
  return SpreadsheetEngine.Instance.SerializeWorkbook(wb);
}

const INITIAL_WORKBOOK_JSON = createSeededWorkbookJson();

const INITIAL_LINKED_SLIDE_DECK_JSON = JSON.stringify(
  {
    SchemaVersion: '1.0',
    DeckID: 'deck-linked-sheet-chart',
    Title: 'Executive Board Deck — Live Linked Sheet Chart (Accept #5)',
    Subtitle: 'Updates automatically when the source MJ Sheet changes',
    AspectRatio: '16:9',
    Theme: {
      ThemeID: 'mj-default',
      Name: 'MemberJunction Default',
      PrimaryColor: '#2563EB',
      AccentColor: '#0EA5E9',
      BackgroundColor: '#FFFFFF',
      SurfaceColor: '#F8FAFC',
      TextColor: '#0F172A',
      MutedTextColor: '#475569',
      HeadingFont: 'Inter, system-ui, sans-serif',
      BodyFont: 'Inter, system-ui, sans-serif',
    },
    Master: {
      HeaderText: 'MemberJunction Live Sheet-to-Slide Pipeline',
      FooterText: 'Wave 3 Accept #5 Verification',
      ShowSlideNumbers: true,
      ShowDate: true,
      OrganizationName: 'MemberJunction',
    },
    Slides: [
      {
        SlideID: 'slide-chart-1',
        SlideNumber: 1,
        Layout: 'TitleAndBody',
        Title: 'FY27 Revenue Bound to MJ Sheet',
        Subtitle: 'Source Artifact: FY27 Enterprise Revenue & Renewals (A2:B5)',
        Regions: [
          {
            RegionID: 'data',
            Label: 'Live Sheet Range Chart Region',
            Kind: 'mj-block',
            MarkdownContent: [
              ':::mj-block',
              JSON.stringify(
                {
                  BlockID: 'blk-sheet-chart-1',
                  Kind: 'Artifact',
                  Mode: 'Live',
                  Title: 'FY27 Quarterly Booked ARR (Live Sheet Range)',
                  ArtifactID: SHEET_ARTIFACT_ID,
                  ArtifactType: 'Excel Spreadsheet',
                  DisplayMode: 'table',
                  SheetID: 'sheet-rev',
                  SheetChartID: 'chart-1',
                  SheetRange: 'A2:B5',
                },
                null,
                2,
              ),
              ':::',
            ].join('\n'),
            BlockSpec: {
              BlockID: 'blk-sheet-chart-1',
              Kind: 'Artifact',
              Mode: 'Live',
              Title: 'FY27 Quarterly Booked ARR (Live Sheet Range)',
              ArtifactID: SHEET_ARTIFACT_ID,
              ArtifactType: 'Excel Spreadsheet',
              DisplayMode: 'table',
              SheetID: 'sheet-rev',
              SheetChartID: 'chart-1',
              SheetRange: 'A2:B5',
            },
          },
        ],
        SpeakerNotes: 'Demonstrates live range chart propagation from MJ Sheets into MJ Slides.',
        Transition: 'fade',
      },
    ],
  },
  null,
  2,
);

interface TestUserRecord {
  ID: string;
  Name: string;
  Email: string;
  IsActive: boolean;
  CanRead: boolean;
  CanEdit: boolean;
  RestrictedEntityAccess?: boolean;
}

const USERS: Record<string, TestUserRecord> = {
  sarah: {
    ID: 'a1111111-1111-4111-8111-111111111111',
    Name: 'Sarah Chen',
    Email: 'sarah.chen@memberjunction.org',
    IsActive: true,
    CanRead: true,
    CanEdit: true,
  },
  marcus: {
    ID: 'b2222222-2222-4222-8222-222222222222',
    Name: 'Marcus Vance',
    Email: 'marcus.vance@memberjunction.org',
    IsActive: true,
    CanRead: true,
    CanEdit: true,
  },
  restricted: {
    ID: 'c3333333-3333-4333-8333-333333333333',
    Name: 'Restricted Auditor',
    Email: 'restricted.auditor@memberjunction.org',
    IsActive: true,
    CanRead: true,
    CanEdit: false,
    RestrictedEntityAccess: true,
  },
};

async function buildWave3AngularBundle(): Promise<string> {
  const artifactsDir = path.join(REPO_ROOT, 'packages/Angular/Generic/artifacts');
  const conversationsDir = path.join(REPO_ROOT, 'packages/Angular/Generic/conversations');
  const whiteboardDir = path.join(REPO_ROOT, 'packages/Angular/Generic/whiteboard');
  const explorerDir = path.join(REPO_ROOT, 'packages/MJExplorer');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuildPath = require.resolve('esbuild', {
    paths: [require.resolve('@angular/build', { paths: [explorerDir] })],
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = require(esbuildPath) as {
    build: (opts: Record<string, unknown>) => Promise<{ outputFiles: Array<{ text: string }> }>;
  };

  const entrySource = `
    import 'zone.js';
    import '@angular/compiler';
    import * as i0 from '@angular/core';
    import { CommonModule } from '@angular/common';
    import { FormsModule } from '@angular/forms';
    import { BrowserModule, platformBrowser } from '@angular/platform-browser';
    import { MarkdownModule } from '@memberjunction/ng-markdown';
    import { CodeEditorModule } from '@memberjunction/ng-code-editor';
    import { WhiteboardModule, RealtimeWhiteboardHostComponent, WhiteboardSnapshotComponent } from '@memberjunction/ng-whiteboard';
    import { SpreadsheetArtifactViewerComponent } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/components/plugins/spreadsheet-artifact-viewer.component.js'),
    )};
    import { SlideDeckArtifactViewerComponent } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/components/plugins/slide-deck-artifact-viewer.component.js'),
    )};
    import { ArtifactTypePluginViewerComponent } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/components/artifact-type-plugin-viewer.component.js'),
    )};
    import { DocumentCollaborationService } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/services/document-collaboration.service.js'),
    )};
    import { SlideDeckExportService } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/services/slide-deck-export.service.js'),
    )};
    import { WhiteboardArtifactViewerComponent, LoadWhiteboardArtifactViewer } from ${JSON.stringify(
      path.join(conversationsDir, 'dist/lib/components/realtime/whiteboard/whiteboard-artifact-viewer.component.js'),
    )};

    LoadWhiteboardArtifactViewer();

    const params = new URLSearchParams(window.location.search);
    const userKey = params.get('user') || 'sarah';
    const artifactId = params.get('artifactId') || ${JSON.stringify(SHEET_ARTIFACT_ID)};
    const showSlidePreview = params.get('splitSlide') === 'true';
    const wsPort = window.location.port;

    const userMap = {
      sarah: { ID: 'a1111111-1111-4111-8111-111111111111', Name: 'Sarah Chen', Email: 'sarah.chen@memberjunction.org', IsActive: true, Restricted: false },
      marcus: { ID: 'b2222222-2222-4222-8222-222222222222', Name: 'Marcus Vance', Email: 'marcus.vance@memberjunction.org', IsActive: true, Restricted: false },
      restricted: { ID: 'c3333333-3333-4333-8333-333333333333', Name: 'Restricted Auditor', Email: 'restricted.auditor@memberjunction.org', IsActive: true, Restricted: true },
    };
    globalThis.__MJ_CURRENT_USER__ = userMap[userKey] || userMap.sarah;
    globalThis.__MJ_COLLAB_WS_URL__ = \`ws://127.0.0.1:\${wsPort}/collaboration/yjs?apiKey=token-\${userKey}\`;
    globalThis.__MJ_LATEST_SHEET_JSON__ = ${JSON.stringify(INITIAL_WORKBOOK_JSON)};

    export class Wave3HostAppComponent {
      constructor() {
        this.currentUser = globalThis.__MJ_CURRENT_USER__;
        this.isReadonly = params.get('readonly') === 'true';
        this.showSlideSplit = showSlidePreview;
        this.sheetVersion = {
          ID: 'ver-sheets-wave3-1',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'FY27 Enterprise Revenue & Renewals',
          Content: ${JSON.stringify(INITIAL_WORKBOOK_JSON)},
        };
        this.linkedDeckVersion = {
          ID: 'ver-linked-deck-1',
          ArtifactID: 'deck-linked-sheet-chart',
          VersionNumber: 1,
          Name: 'Executive Board Deck — Live Linked Sheet Chart',
          Content: ${JSON.stringify(INITIAL_LINKED_SLIDE_DECK_JSON)},
        };
      }
      toggleSlideSplit() {
        this.showSlideSplit = !this.showSlideSplit;
      }
      static ɵfac = function Wave3HostAppComponent_Factory(t) { return new (t || Wave3HostAppComponent)(); };
      static ɵcmp = i0.ɵɵdefineComponent({
        type: Wave3HostAppComponent,
        selectors: [['mj-wave3-app']],
        decls: 16,
        vars: 6,
        consts: [
          ['data-testid', 'mj-shell-header', 1, 'mj-shell-header'],
          [1, 'mj-shell-brand'],
          [1, 'mj-shell-brand-badge'],
          [1, 'mj-shell-breadcrumb'],
          [1, 'mj-shell-user'],
          ['type', 'button', 'data-testid', 'toggle-slide-split-btn', 1, 'mj-shell-split-btn', 3, 'click'],
          [1, 'mj-shell-body'],
          [1, 'mj-shell-pane-sheet'],
          [3, 'artifactVersion', 'readonly'],
          ['data-testid', 'linked-slide-split-pane', 1, 'mj-shell-pane-slide'],
        ],
        template: function Wave3HostAppComponent_Template(rf, ctx) {
          if (rf & 1) {
            i0.ɵɵelementStart(0, 'header', 0)(1, 'div', 1)(2, 'span', 2);
            i0.ɵɵtext(3, 'MJ Explorer · Sheets');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(4, 'span');
            i0.ɵɵtext(5, 'FY27 Enterprise Revenue & Renewals');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(6, 'span', 3);
            i0.ɵɵtext(7, '/ Finance & Operations / Collaborative Workbooks (v1)');
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(8, 'div', 4);
            i0.ɵɵelementStart(9, 'button', 5);
            i0.ɵɵlistener('click', function() { return ctx.toggleSlideSplit(); });
            i0.ɵɵtext(10, 'Toggle Linked Slide Preview (Accept #5)');
            i0.ɵɵelementEnd();
            i0.ɵɵtext(11);
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(12, 'div', 6)(13, 'div', 7);
            i0.ɵɵelement(14, 'mj-spreadsheet-artifact-viewer', 8);
            i0.ɵɵelementEnd();
            i0.ɵɵtemplate(15, function Wave3SlideSplit_Template(rf1) {
              if (rf1 & 1) {
                i0.ɵɵelementStart(0, 'div', 9);
                i0.ɵɵelement(1, 'mj-slide-deck-artifact-viewer', 8);
                i0.ɵɵelementEnd();
              }
              if (rf1 & 2) {
                const parentCtx = i0.ɵɵnextContext();
                i0.ɵɵadvance(1);
                i0.ɵɵproperty('artifactVersion', parentCtx.linkedDeckVersion)('readonly', false);
              }
            }, 2, 2, 'div', 9);
            i0.ɵɵelementEnd();
          }
          if (rf & 2) {
            i0.ɵɵadvance(11);
            i0.ɵɵtextInterpolate2(' · Signed in as ', ctx.currentUser.Name, ' (', ctx.currentUser.Email, ')');
            i0.ɵɵadvance(3);
            i0.ɵɵproperty('artifactVersion', ctx.sheetVersion)('readonly', ctx.isReadonly);
            i0.ɵɵadvance(1);
            i0.ɵɵconditional(ctx.showSlideSplit ? 15 : -1);
          }
        },
        dependencies: [SpreadsheetArtifactViewerComponent, SlideDeckArtifactViewerComponent],
        encapsulation: 2,
      });
    }

    export class Wave3HostModule {
      static ɵfac = function Wave3HostModule_Factory(t) { return new (t || Wave3HostModule)(); };
      static ɵmod = i0.ɵɵdefineNgModule({
        type: Wave3HostModule,
        bootstrap: [Wave3HostAppComponent],
      });
      static ɵinj = i0.ɵɵdefineInjector({
        imports: [
          BrowserModule,
          CommonModule,
          FormsModule,
          MarkdownModule,
          CodeEditorModule,
          WhiteboardModule,
        ],
        providers: [
          DocumentCollaborationService,
          SlideDeckExportService,
        ],
      });
    }
    i0.ɵɵsetNgModuleScope(Wave3HostModule, {
      declarations: [
        Wave3HostAppComponent,
        SpreadsheetArtifactViewerComponent,
        SlideDeckArtifactViewerComponent,
        ArtifactTypePluginViewerComponent,
      ],
      imports: [
        BrowserModule,
        CommonModule,
        FormsModule,
        MarkdownModule,
        CodeEditorModule,
        WhiteboardModule,
        WhiteboardArtifactViewerComponent,
        RealtimeWhiteboardHostComponent,
        WhiteboardSnapshotComponent,
      ],
      exports: [
        SpreadsheetArtifactViewerComponent,
        SlideDeckArtifactViewerComponent,
        ArtifactTypePluginViewerComponent,
      ],
    });

    platformBrowser().bootstrapModule(Wave3HostModule).catch((err) => {
      console.error('Angular bootstrap error:', err);
    });
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: artifactsDir,
      sourcefile: 'wave3-e2e-entry.js',
    },
    nodePaths: [path.join(explorerDir, 'node_modules'), path.join(artifactsDir, 'node_modules')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    plugins: [
      {
        name: 'mj-browser-shim',
        setup(build: {
          onResolve: (
            opts: { filter: RegExp },
            cb: (args: { path: string }) => { path: string; namespace?: string },
          ) => void;
          onLoad: (
            opts: { filter: RegExp; namespace?: string },
            cb: () => { contents: string; resolveDir?: string },
          ) => void;
        }) {
          build.onResolve({ filter: /artifact-file\.service/ }, () => ({
            path: 'mj-artifact-file-service-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^mj-artifact-file-service-shim$/, namespace: 'shim' }, () => ({
            contents: `
              import * as i0 from '@angular/core';
              export class ArtifactFileService {
                async getDownloadUrl() { return ''; }
                static ɵfac = function ArtifactFileService_Factory(t) { return new (t || ArtifactFileService)(); };
                static ɵprov = i0.ɵɵdefineInjectable({ token: ArtifactFileService, factory: ArtifactFileService.ɵfac, providedIn: 'root' });
              }
            `,
            resolveDir: artifactsDir,
          }));
          build.onResolve({ filter: /^@memberjunction\/core-entities$/ }, () => ({
            path: 'mj-core-entities-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^mj-core-entities-shim$/, namespace: 'shim' }, () => ({
            contents: `
              export { DocumentLiveBlockEngine } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/DocumentLiveBlockEngine.js'),
              )};
              export { ArtifactPermissionEngine } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/ArtifactPermissionDelegate.js'),
              )};
              export {
                SlideDeckEngine,
                SLIDE_LAYOUT_CATALOG,
                SLIDE_DECK_THEME_PRESETS,
              } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/SlideDeckEngine.js'),
              )};
              export {
                SpreadsheetEngine,
                ColumnIndexToLetter,
                ColumnLetterToIndex,
                ParseCellAddress,
                FormatCellAddress,
              } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/SpreadsheetEngine.js'),
              )};
              export const ArtifactMetadataEngine = {
                Instance: {
                  FindArtifactType: (name) => name === 'Whiteboard' ? { ID: 'wb-type-1', Name: 'Whiteboard', DriverClass: 'WhiteboardArtifactViewerPlugin' } : null,
                },
              };
              export const QueryEngine = { Instance: { Queries: [] } };
              export async function FilterReadableAnchoredConversations(_provider, _user, rows) {
                return rows || [];
              }
              export const UserInfoEngine = {
                Instance: {
                  GetSetting: () => null,
                  SetSettingDebounced: async () => undefined,
                },
              };
            `,
            resolveDir: artifactsDir,
          }));
          build.onResolve({ filter: /^@memberjunction\/core$/ }, () => ({
            path: 'mj-core-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^mj-core-shim$/, namespace: 'shim' }, () => ({
            contents: `
              export class Metadata {
                static Provider = {
                  get CurrentUser() {
                    return globalThis.__MJ_CURRENT_USER__ || { ID: 'a1111111-1111-4111-8111-111111111111', Name: 'Sarah Chen', Email: 'sarah.chen@memberjunction.org', IsActive: true };
                  },
                  get Entities() {
                    const isRestricted = Boolean(globalThis.__MJ_CURRENT_USER__?.Restricted);
                    return [
                      {
                        ID: 'e-artifacts',
                        Name: 'MJ: Artifacts',
                        DisplayNameOrName: 'MJ: Artifacts',
                        FieldLevelSecurityApplies: false,
                        GetUserPermisions: () => ({ CanRead: true }),
                        Fields: [
                          { Name: 'Name', DisplayNameOrName: 'Artifact Name', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'Type', DisplayNameOrName: 'Artifact Type', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                        ],
                      },
                      {
                        ID: 'e-agents',
                        Name: 'AI Agents',
                        DisplayNameOrName: 'AI Agents',
                        FieldLevelSecurityApplies: false,
                        GetUserPermisions: () => ({ CanRead: !isRestricted }),
                        Fields: [
                          { Name: 'Name', DisplayNameOrName: 'Agent Name', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'BaseQuotaARR', DisplayNameOrName: 'Base Quota ARR', DefaultInView: true, IsBinaryFieldType: false, TSType: 'number' },
                        ],
                      },
                    ];
                  },
                  get Queries() {
                    const isRestricted = Boolean(globalThis.__MJ_CURRENT_USER__?.Restricted);
                    return [
                      {
                        ID: 'q-renewals-2026',
                        Name: 'Renewals by Month',
                        CategoryPath: '/Finance/',
                        Status: 'Approved',
                        UserCanRun: () => !isRestricted,
                        Parameters: [
                          { Name: 'Year', Type: 'number', IsRequired: false, IsServerSet: false },
                        ],
                      },
                    ];
                  },
                  async GetEntityObject(entityName) {
                    if (entityName === 'MJ: Artifacts') {
                      return {
                        ID: 'wb-child-ole-1',
                        Name: '',
                        Description: '',
                        TypeID: 'wb-type-1',
                        UserID: '',
                        EnvironmentID: '',
                        DelegateEntityID: null,
                        DelegateRecordID: null,
                        Save: async () => true,
                      };
                    }
                    if (entityName === 'MJ: Artifact Versions') {
                      const obj = {
                        ID: 'wb-ver-ole-1',
                        ArtifactID: 'wb-child-ole-1',
                        VersionNumber: 1,
                        Name: '',
                        UserID: '',
                        Content: '',
                        ArtifactType: 'Whiteboard',
                        Save: async () => true,
                      };
                      return obj;
                    }
                    return { ID: 'mock-id', Save: async () => true };
                  },
                };
                Provider = Metadata.Provider;
                get CurrentUser() { return Metadata.Provider.CurrentUser; }
                get Entities() { return Metadata.Provider.Entities; }
                get Queries() { return Metadata.Provider.Queries; }
                GetEntityObject(entityName) { return Metadata.Provider.GetEntityObject(entityName); }
              }
              export class RunView {
                static FromMetadataProvider() { return new RunView(); }
                async RunViews(paramsArray) {
                  return Promise.all((paramsArray || []).map((p) => this.RunView(p)));
                }
                async RunView(params) {
                  const isRestricted = Boolean(globalThis.__MJ_CURRENT_USER__?.Restricted);
                  if (params && params.EntityName === 'AI Agents') {
                    if (isRestricted) {
                      return { Success: false, ErrorMessage: 'Permission denied on AI Agents', Results: [], TotalRowCount: 0 };
                    }
                    return {
                      Success: true,
                      Results: [
                        { Name: 'Sage Enterprise Copilot', BaseQuotaARR: 120000 },
                        { Name: 'Sheets Financial Analyst', BaseQuotaARR: 180000 },
                        { Name: 'Slide Deck Strategist', BaseQuotaARR: 95000 },
                      ],
                      TotalRowCount: 3,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifact Versions') {
                    return {
                      Success: true,
                      Results: [
                        {
                          ID: 'ver-sheets-wave3-latest',
                          ArtifactID: ${JSON.stringify(SHEET_ARTIFACT_ID)},
                          VersionNumber: 1,
                          Name: 'FY27 Enterprise Revenue & Renewals',
                          Content: globalThis.__MJ_LATEST_SHEET_JSON__ || ${JSON.stringify(INITIAL_WORKBOOK_JSON)},
                        },
                      ],
                      TotalRowCount: 1,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifacts') {
                    return {
                      Success: true,
                      Results: [{ ID: ${JSON.stringify(SHEET_ARTIFACT_ID)}, Name: 'FY27 Enterprise Revenue & Renewals', Type: 'Excel Spreadsheet', UserID: 'a1111111-1111-4111-8111-111111111111', EnvironmentID: 'env-1' }],
                      TotalRowCount: 1,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                      Success: true,
                      Results: [
                        { ID: 'perm-marcus-sheets', ArtifactID: ${JSON.stringify(SHEET_ARTIFACT_ID)}, UserID: 'b2222222-2222-4222-8222-222222222222', CanRead: true, CanEdit: true },
                        { ID: 'perm-restricted-sheets', ArtifactID: ${JSON.stringify(SHEET_ARTIFACT_ID)}, UserID: 'c3333333-3333-4333-8333-333333333333', CanRead: true, CanEdit: false },
                      ],
                      TotalRowCount: 2,
                    };
                  }
                  return { Success: true, Results: [], TotalRowCount: 0 };
                }
              }
              export class RunQuery {
                static FromMetadataProvider() { return new RunQuery(); }
                async RunQuery(params) {
                  const isRestricted = Boolean(globalThis.__MJ_CURRENT_USER__?.Restricted);
                  if (isRestricted) {
                    return { Success: false, ErrorMessage: 'User does not have permission to run query Renewals by Month', Results: [], RowCount: 0 };
                  }
                  if (params && (params.QueryName === 'Renewals by Month' || params.QueryID === 'q-renewals-2026')) {
                    return {
                      Success: true,
                      Results: [
                        { Month: 'Jan 2026', RenewalARR: 85000, Accounts: 12 },
                        { Month: 'Feb 2026', RenewalARR: 110000, Accounts: 15 },
                        { Month: 'Mar 2026', RenewalARR: 145000, Accounts: 19 },
                      ],
                      RowCount: 3,
                    };
                  }
                  return { Success: true, Results: [], RowCount: 0 };
                }
              }
              export function ProjectEntityValueRowsForUser(_provider, _entityInfo, rows) { return rows; }
              export function StripServerOnlyRunQueryParams(params) { return params || {}; }
              export function NormalizeToTables() { return []; }
              export class DataSnapshot { title = ''; interpretation = ''; custom = {}; }
              export function LogError(...args) { console.error(...args); }
              export function LogStatus(...args) { console.log(...args); }
            `,
            resolveDir: artifactsDir,
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-whiteboard$/ }, () => ({
            path: path.join(whiteboardDir, 'dist/public-api.js'),
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-artifacts$/ }, () => ({
            path: path.join(artifactsDir, 'dist/lib/components/base-artifact-viewer.component.js'),
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-base-types$/ }, () => ({
            path: path.join(REPO_ROOT, 'packages/Angular/Generic/base-types/dist/public-api.js'),
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-ui-components$/ }, () => ({
            path: path.join(REPO_ROOT, 'packages/Angular/Generic/ui-components/dist/public-api.js'),
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-code-editor$/ }, () => ({
            path: path.join(REPO_ROOT, 'packages/Angular/Generic/code-editor/dist/public-api.js'),
          }));
          build.onResolve({ filter: /^@memberjunction\/ng-markdown$/ }, () => ({
            path: path.join(REPO_ROOT, 'packages/Angular/Generic/markdown/dist/public-api.js'),
          }));
        },
      },
    ],
  });

  return result.outputFiles[0].text;
}

function buildWave3IndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MJ Explorer — Collaborative Sheets, Formulas &amp; Live Data Studio</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
    :root {
      --mj-bg-page: #f1f5f9;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-elevated: #f8fafc;
      --mj-bg-surface-sunken: #e2e8f0;
      --mj-bg-surface-card: #ffffff;
      --mj-bg-surface-hover: #f1f5f9;
      --mj-bg-overlay: rgba(15, 23, 42, 0.45);
      --mj-text-primary: #0f172a;
      --mj-text-secondary: #475569;
      --mj-text-muted: #64748b;
      --mj-text-disabled: #94a3b8;
      --mj-text-inverse: #ffffff;
      --mj-border-default: #cbd5e1;
      --mj-border-subtle: #e2e8f0;
      --mj-border-strong: #94a3b8;
      --mj-brand-primary: #2563eb;
      --mj-brand-primary-hover: #1d4ed8;
      --mj-brand-primary-subtle: #dbeafe;
      --mj-brand-accent: #0ea5e9;
      --mj-status-success: #047857;
      --mj-status-warning: #b45309;
      --mj-status-error: #b91c1c;
      --mj-status-info: #1d4ed8;
      --mj-shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08);
      --mj-shadow-md: 0 8px 24px rgba(15, 23, 42, 0.12);
      --mj-shadow-lg: 0 16px 40px rgba(15, 23, 42, 0.2);
      --mj-font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100vh;
      font-family: var(--mj-font-family);
      background: var(--mj-bg-page);
      color: var(--mj-text-primary);
      overflow: hidden;
    }
    mj-wave3-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    .mj-shell-header {
      height: 44px;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      border-bottom: 1px solid #1e293b;
      flex-shrink: 0;
      font-size: 13px;
    }
    .mj-shell-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
    }
    .mj-shell-brand-badge {
      background: #059669;
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
    }
    .mj-shell-breadcrumb {
      color: #94a3b8;
      font-weight: 500;
      font-size: 12px;
    }
    .mj-shell-user {
      font-size: 12px;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mj-shell-split-btn {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 5px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .mj-shell-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: row;
      overflow: hidden;
    }
    .mj-shell-pane-sheet {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .mj-shell-pane-slide {
      width: 48%;
      border-left: 2px solid var(--mj-border-strong);
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    mj-spreadsheet-artifact-viewer,
    mj-slide-deck-artifact-viewer {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <mj-wave3-app></mj-wave3-app>
  <script src="/wave3-bundle.js"></script>
</body>
</html>`;
}

function createServerMetadataProvider(
  savedVersions: Array<{ ID: string; VersionNumber: number; Content: string }>,
): IMetadataProvider {
  const provider = {
    Entities: [{ ID: 'e-artifacts', Name: 'MJ: Artifacts' }],
    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
      if (params.EntityName === 'MJ: Artifact Working States') {
        return { Success: true, Results: [], TotalRowCount: 0 };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (params.ExtraFilter && params.ExtraFilter.includes('deck-linked-sheet-chart')) {
          return {
            Success: true,
            Results: [
              {
                ID: 'ver-linked-deck-1',
                ArtifactID: 'deck-linked-sheet-chart',
                VersionNumber: 1,
                Content: INITIAL_LINKED_SLIDE_DECK_JSON,
              },
            ],
            TotalRowCount: 1,
          };
        }
        if (savedVersions.length === 0) {
          return {
            Success: true,
            Results: [
              {
                ID: 'ver-sheets-wave3-1',
                ArtifactID: SHEET_ARTIFACT_ID,
                VersionNumber: 1,
                Content: INITIAL_WORKBOOK_JSON,
              },
            ],
            TotalRowCount: 1,
          };
        }
        const sorted = [...savedVersions].sort((a, b) => b.VersionNumber - a.VersionNumber);
        return { Success: true, Results: sorted, TotalRowCount: sorted.length };
      }
      if (params.EntityName === 'MJ: Artifacts') {
        if (params.ExtraFilter && params.ExtraFilter.includes('deck-linked-sheet-chart')) {
          return {
            Success: true,
            Results: [
              {
                ID: 'deck-linked-sheet-chart',
                UserID: USERS.sarah.ID,
                EnvironmentID: 'env-1',
                DelegateEntityID: null,
                DelegateRecordID: null,
              },
            ],
            TotalRowCount: 1,
          };
        }
        return {
          Success: true,
          Results: [
            {
              ID: SHEET_ARTIFACT_ID,
              UserID: USERS.sarah.ID,
              EnvironmentID: 'env-1',
              DelegateEntityID: null,
              DelegateRecordID: null,
            },
          ],
          TotalRowCount: 1,
        };
      }
      if (params.EntityName === 'MJ: Artifact Permissions') {
        const perms = Object.values(USERS)
          .filter((u) => u.ID !== USERS.sarah.ID && u.CanRead)
          .map((u) => ({
            ID: `perm-${u.ID}`,
            ArtifactID: SHEET_ARTIFACT_ID,
            UserID: u.ID,
            CanRead: u.CanRead,
            CanEdit: u.CanEdit,
          }));
        return { Success: true, Results: perms, TotalRowCount: perms.length };
      }
      return { Success: true, Results: [], TotalRowCount: 0 };
    },
    GetEntityObject: async (entityName: string) => {
      if (entityName === 'MJ: Artifact Versions') {
        const verObj = {
          ID: `ver-${Date.now()}`,
          ArtifactID: SHEET_ARTIFACT_ID,
          VersionNumber: 1,
          UserID: USERS.sarah.ID,
          Content: '',
          ContentHash: '',
          NewRecord: () => undefined,
          Save: async () => {
            savedVersions.push({
              ID: verObj.ID,
              VersionNumber: verObj.VersionNumber,
              Content: verObj.Content,
            });
            return true;
          },
        };
        return verObj;
      }
      return {
        ID: `ws-${Date.now()}`,
        ArtifactID: SHEET_ARTIFACT_ID,
        YjsState: '',
        NewRecord: () => undefined,
        Load: async () => true,
        Save: async () => true,
      };
    },
  };
  return provider as unknown as IMetadataProvider;
}

async function loadCollaborationServerModule(): Promise<{
  ArtifactCollaborationServer: typeof ArtifactCollaborationServerType;
  InMemoryYjsRoomRelay: typeof InMemoryYjsRoomRelayType;
}> {
  const explorerDir = path.join(REPO_ROOT, 'packages/MJExplorer');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuildPath = require.resolve('esbuild', {
    paths: [require.resolve('@angular/build', { paths: [explorerDir] })],
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = require(esbuildPath);
  const serverDir = path.join(REPO_ROOT, 'packages/MJServer');
  const entry = `
    export { ArtifactCollaborationServer } from ${JSON.stringify(
      path.join(serverDir, 'src/collaboration/ArtifactCollaborationServer.ts'),
    )};
    export { InMemoryYjsRoomRelay } from ${JSON.stringify(
      path.join(serverDir, 'src/collaboration/YjsRoomRelay.ts'),
    )};
  `;
  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: serverDir,
      sourcefile: 'collab-server-wave3-entry.ts',
    },
    nodePaths: [path.join(serverDir, 'node_modules'), path.join(REPO_ROOT, 'node_modules')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    external: ['ws', 'yjs', 'y-protocols/*', 'lib0/*'],
    plugins: [
      {
        name: 'mj-server-shim',
        setup(build: {
          onResolve: (
            opts: { filter: RegExp },
            cb: (args: { path: string }) => { path: string; namespace?: string },
          ) => void;
          onLoad: (
            opts: { filter: RegExp; namespace?: string },
            cb: () => { contents: string; resolveDir?: string },
          ) => void;
        }) {
          build.onResolve({ filter: /^\.\.\/context\.js$/ }, () => ({
            path: 'server-context-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^server-context-shim$/, namespace: 'shim' }, () => ({
            contents: `export async function getUserPayload() { return null; }`,
          }));
          build.onResolve({ filter: /^@memberjunction\/core-entities$/ }, () => ({
            path: 'server-core-entities-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^server-core-entities-shim$/, namespace: 'shim' }, () => ({
            contents: `
              export { ArtifactPermissionEngine } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/ArtifactPermissionDelegate.js'),
              )};
              export { SlideDeckEngine } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/SlideDeckEngine.js'),
              )};
              export { SpreadsheetEngine } from ${JSON.stringify(
                path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/SpreadsheetEngine.js'),
              )};
            `,
            resolveDir: serverDir,
          }));
          build.onResolve({ filter: /^@memberjunction\/core$/ }, () => ({
            path: 'server-core-shim',
            namespace: 'shim',
          }));
          build.onLoad({ filter: /^server-core-shim$/, namespace: 'shim' }, () => ({
            contents: `
              export class Metadata { Provider = null; }
              export class RunView {
                static FromMetadataProvider(p) {
                  return {
                    RunView: (params, u) => p.RunView(params, u),
                    RunViews: async (arr, u) => Promise.all(arr.map((params) => p.RunView(params, u))),
                  };
                }
              }
              export class RunQuery {
                static FromMetadataProvider() {
                  return {
                    RunQuery: async () => ({ Success: true, Results: [], RowCount: 0 }),
                  };
                }
              }
              export function ProjectEntityValueRowsForUser(_provider, _entityInfo, rows) { return rows; }
              export function StripServerOnlyRunQueryParams(params) { return params || {}; }
              export function LogError(...args) { console.error(...args); }
              export function LogStatus(...args) { console.log(...args); }
            `,
          }));
        },
      },
    ],
  });

  const tmpOut = path.join(REPO_ROOT, 'e2e', '.tmp-collab-server-wave3.cjs');
  fs.writeFileSync(tmpOut, result.outputFiles[0].text, 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(tmpOut);
  try {
    fs.unlinkSync(tmpOut);
  } catch {
    // ignore cleanup error
  }
  return loaded;
}

test.describe.serial(
  'Wave 3 E2E — Real Compiled Angular Sheets Editor, Per-Cell/Per-Worksheet Yjs Sync, Live Tables, =MJ.QUERY, @SheetsAgent, .xlsx Round-Trip & Live Sheet-to-Slide Charts',
  () => {
    let server: http.Server;
    let baseUrl = '';
    let bundleJs = '';
    let collabServerInstance: ArtifactCollaborationServerType;
    let InMemoryYjsRoomRelayClass: typeof InMemoryYjsRoomRelayType;
    const savedVersions: Array<{ ID: string; VersionNumber: number; Content: string }> = [];

    async function resetRoomState(): Promise<void> {
      savedVersions.length = 0;
      const mockProvider = createServerMetadataProvider(savedVersions);
      await collabServerInstance.Shutdown();
      (collabServerInstance as unknown as { _shuttingDown: boolean })._shuttingDown = false;
      collabServerInstance.SetRoomRelay(new InMemoryYjsRoomRelayClass());
      collabServerInstance.SetMetadataProviderOverride(mockProvider);
    }

    test.beforeAll(async () => {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      bundleJs = await buildWave3AngularBundle();
      const loaded = await loadCollaborationServerModule();
      collabServerInstance = loaded.ArtifactCollaborationServer.Instance;
      InMemoryYjsRoomRelayClass = loaded.InMemoryYjsRoomRelay;

      const indexHtml = buildWave3IndexHtml();
      server = http.createServer((req, res) => {
        const reqUrl = req.url ?? '/';
        if (reqUrl.startsWith('/wave3-bundle.js')) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(bundleJs);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexHtml);
      });

      await resetRoomState();
      collabServerInstance.SetAuthResolverOverride(async (req) => {
        const parsed = new URL(req.url ?? '/', 'http://127.0.0.1');
        const apiKey = parsed.searchParams.get('apiKey') ?? '';
        const userKey = apiKey.replace(/^token-/, '');
        const u = USERS[userKey];
        if (!u || !u.IsActive) {
          return null;
        }
        return {
          ID: u.ID,
          Name: u.Name,
          Email: u.Email,
          IsActive: u.IsActive,
          UserRoles: [],
        } as unknown as UserInfo;
      });

      server.on('upgrade', (req, socket, head) => {
        if (!collabServerInstance.TryHandleUpgrade(req, socket, head)) {
          socket.destroy();
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            baseUrl = `http://127.0.0.1:${addr.port}`;
          }
          resolve();
        });
      });
    });

    test.afterAll(async () => {
      if (collabServerInstance) {
        await collabServerInstance.Shutdown();
      }
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    test('1. Multi-user collaborative spreadsheet grid, formula bar, currency/percent formatting & concurrent row insertion + formula edit over Yjs (Accept #1)', async ({
      browser,
    }) => {
      await resetRoomState();
      const ctxSarah = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const ctxMarcus = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const pageSarah = await ctxSarah.newPage();
      const pageMarcus = await ctxMarcus.newPage();

      try {
        await pageSarah.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
          waitUntil: 'networkidle',
        });
        await pageMarcus.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=marcus`, {
          waitUntil: 'networkidle',
        });

        await expect(pageSarah.getByTestId('mj-sheets-shell')).toBeVisible();
        await expect(pageSarah.getByTestId('sheets-collab-status')).toContainText('Live Sync');
        await expect(pageMarcus.getByTestId('sheets-collab-status')).toContainText('Live Sync');

        // Verify initial formatted values ($1,000,000.00 in B6)
        await expect(pageSarah.getByTestId('sheet-cell-B6')).toContainText('$1,000,000.00');

        // Marcus selects E1 and writes a formula referencing B2:B5 (=SUM(B2:B5))
        await pageMarcus.getByTestId('sheet-cell-E1').click();
        await pageMarcus.getByTestId('sheet-formula-input').fill('=SUM(B2:B5)');
        await pageMarcus.getByTestId('sheet-formula-apply-btn').click();
        await pageMarcus.getByTestId('sheet-format-currency-btn').click();

        // Sarah concurrently selects B2 and inserts a row at Row 2 (Accept #1)
        await pageSarah.getByTestId('sheet-cell-B2').click();
        await pageSarah.getByTestId('sheet-insert-row-btn').click();

        // Both Sarah and Marcus converge: the original B2:B5 shifted to B3:B6, so E1 evaluates to $1,000,000.00 and B7 holds the shifted total
        await expect(async () => {
          await expect(pageSarah.getByTestId('sheet-cell-B7')).toContainText('$1,000,000.00');
          await expect(pageSarah.getByTestId('sheet-cell-E1')).toContainText('$1,000,000.00');
          await expect(pageMarcus.getByTestId('sheet-cell-B7')).toContainText('$1,000,000.00');
        }).toPass({ timeout: 5000 });

        // Select E1 on Sarah's page to display the rewritten formula =SUM(B3:B6) in the Formula Bar
        await pageSarah.getByTestId('sheet-cell-E1').click();
        await expect(pageSarah.getByTestId('sheet-formula-input')).toHaveValue('=SUM(B3:B6)');

        await pageSarah.screenshot({
          path: path.join(SCREENSHOT_DIR, '01-sheets-collaborative-grid-and-formulas.png'),
          fullPage: false,
        });
      } finally {
        await ctxSarah.close();
        await ctxMarcus.close();
      }
    });

    test('2. Bound Live MJ Table with calculated formula column, =MJ.QUERY evaluation, O5 Freeze modal & restricted viewer RLS/FLS enforcement (Accept #2)', async ({
      browser,
    }) => {
      await resetRoomState();
      const ctxSarah = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const ctxRestricted = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const pageSarah = await ctxSarah.newPage();
      const pageRestricted = await ctxRestricted.newPage();

      try {
        await pageSarah.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
          waitUntil: 'networkidle',
        });

        // 1. Bind a Live MJ Entity View Table anchored at A8 with a Calculated Column ('Projected ARR' = '=ROUND(B{ROW}*1.15, 2)')
        await pageSarah.getByTestId('sheet-cell-A8').click();
        await pageSarah.getByTestId('sheet-add-live-table-btn').click();
        await expect(pageSarah.getByTestId('sheets-live-table-modal')).toBeVisible();

        await pageSarah.getByTestId('sheet-new-table-title').fill('Active AI Agents Quota');
        await pageSarah.getByTestId('sheet-new-table-entity').fill('AI Agents');
        await pageSarah.getByTestId('sheet-new-table-anchor').fill('A8');
        await pageSarah.getByTestId('sheet-new-table-calc-header').fill('Projected ARR (+15%)');
        await pageSarah.getByTestId('sheet-new-table-calc-formula').fill('=ROUND(B{ROW}*1.15, 2)');
        await pageSarah.getByTestId('sheet-confirm-add-table-btn').click();

        // Verify Live Table rows and adjacent Calculated Formula Column filled down automatically (Accept #2)
        await expect(pageSarah.getByTestId('sheet-cell-A8')).toContainText('Agent Name');
        await expect(pageSarah.getByTestId('sheet-cell-C8')).toContainText('Projected ARR (+15%)');
        await expect(pageSarah.getByTestId('sheet-cell-A9')).toContainText('Sage Enterprise Copilot');
        // 120,000 * 1.15 = $138,000.00
        await expect(pageSarah.getByTestId('sheet-cell-C9')).toContainText('$138,000.00');

        // 2. Insert =MJ.QUERY("Renewals by Month", 2026) at E8
        await pageSarah.getByTestId('sheet-cell-E8').click();
        await pageSarah.getByTestId('sheet-insert-mj-query-btn').click();
        await expect(pageSarah.getByTestId('sheet-cell-E8')).toContainText('Jan 2026');
        await expect(pageSarah.getByTestId('sheet-cell-F8')).toContainText('85000');
        await expect(pageSarah.getByTestId('sheet-cell-E9')).toContainText('Feb 2026');

        // 3. Open the same workbook as Restricted Auditor -> verify #MJ_ACCESS_DENIED! for =MJ.QUERY and AccessDenied on Live Table (Accept #2)
        await pageRestricted.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=restricted`, {
          waitUntil: 'networkidle',
        });
        await expect(pageRestricted.getByTestId('sheet-cell-E8')).toContainText(
          '#MJ_ACCESS_DENIED!',
        );

        // 4. Open O5 Freeze Confirmation Modal on Sarah's page for visual proof
        const freezeBtn = pageSarah.locator('[data-testid^="sheet-table-freeze-"]').first();
        await freezeBtn.click();
        await expect(pageSarah.getByTestId('sheets-freeze-modal')).toBeVisible();

        await pageSarah.screenshot({
          path: path.join(SCREENSHOT_DIR, '02-sheets-live-table-and-mj-query-functions.png'),
          fullPage: false,
        });

        // Confirm freeze and verify badge transitions to Frozen
        await pageSarah.getByTestId('sheet-freeze-confirm-checkbox').check();
        await pageSarah.getByTestId('sheet-freeze-confirm-btn').click();
        await expect(pageSarah.locator('[data-testid^="sheet-live-table-card-"]').first()).toContainText(
          'Frozen',
        );
      } finally {
        await ctxSarah.close();
        await ctxRestricted.close();
      }
    });

    test('3. Anchors SheetRange comment thread and invokes @SheetsAgent for headless formula evaluation and writeback (Accept #3)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Select E6 and open the Anchored Range Comments drawer
      await page.getByTestId('sheet-cell-E6').click();
      await page.getByTestId('sheet-toggle-comments-btn').click();
      await expect(page.getByTestId('sheets-comments-drawer')).toBeVisible();

      // Post an @SheetsAgent instruction to write a formula and evaluate it headlessly (Accept #3)
      await page
        .getByTestId('sheet-comment-input')
        .fill('@SheetsAgent please write =ROUND(B6*1.12, 2) here for FY28 stretch target');
      await page.getByTestId('sheet-post-comment-btn').click();

      // Verify E6 received the formula and evaluated to 1,120,000, and @SheetsAgent replied with the headless evaluated value
      await expect(page.getByTestId('sheet-cell-E6')).toContainText('1120000');
      await expect(page.getByTestId('sheet-threads-list')).toContainText(
        'Headless evaluated value: **1120000**',
      );

      await page.screenshot({
        path: path.join(
          SCREENSHOT_DIR,
          '03-sheets-agent-headless-formula-and-anchored-comments.png',
        ),
        fullPage: false,
      });
    });

    test('4. Imports a real OpenXML .xlsx budget workbook keeping formulas and currency/percent formats, and exports .xlsx & .csv (Accept #4)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Build a real .xlsx archive with formulas and currency/percent styles to import via file input
      const budgetWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FY27 Cloud Budget (.xlsx)');
      const s = budgetWb.Worksheets[0];
      s.Name = 'Cloud Budget';
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'A1', {
        Value: 'Cost Center',
        Style: { Bold: true },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'B1', {
        Value: 'Annual Spend',
        Style: { Bold: true },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'C1', {
        Value: 'Efficiency Gain',
        Style: { Bold: true },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'D1', {
        Value: 'Net Budget',
        Style: { Bold: true },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'A2', { Value: 'GPU Inference Cluster' });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'B2', {
        Value: 450000,
        Style: { FormatType: 'currency' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'C2', {
        Value: 0.15,
        Style: { FormatType: 'percent' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'D2', {
        Formula: '=ROUND(B2*(1-C2), 2)',
        Style: { FormatType: 'currency' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'A3', { Value: 'SQL Server HADR' });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'B3', {
        Value: 150000,
        Style: { FormatType: 'currency' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'C3', {
        Value: 0.10,
        Style: { FormatType: 'percent' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'D3', {
        Formula: '=ROUND(B3*(1-C3), 2)',
        Style: { FormatType: 'currency' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'A4', {
        Value: 'Total Cloud Budget',
        Style: { Bold: true },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'B4', {
        Formula: '=SUM(B2:B3)',
        Style: { Bold: true, FormatType: 'currency' },
      });
      SpreadsheetEngine.Instance.SetCell(budgetWb, s.SheetID, 'D4', {
        Formula: '=SUM(D2:D3)',
        Style: { Bold: true, FormatType: 'currency' },
      });

      const xlsxBytes = SpreadsheetEngine.Instance.ExportToXlsxBytes(budgetWb);
      const tmpXlsxPath = path.join(REPO_ROOT, 'e2e', '.tmp-budget-import.xlsx');
      fs.writeFileSync(tmpXlsxPath, Buffer.from(xlsxBytes));

      try {
        await page.getByTestId('sheet-import-file-input').setInputFiles(tmpXlsxPath);

        // Verify imported cells, formulas, and currency/percent formatting
        await expect(page.getByTestId('sheet-cell-A2')).toContainText('GPU Inference Cluster');
        await expect(page.getByTestId('sheet-cell-B2')).toContainText('$450,000.00');
        await expect(page.getByTestId('sheet-cell-C2')).toContainText('15.0%');
        await expect(page.getByTestId('sheet-cell-B4')).toContainText('$600,000.00');
        await expect(page.getByTestId('sheet-cell-D4')).toContainText('$517,500.00');

        // Select D4 to verify the imported <f> formula =SUM(D2:D3) is intact in the formula bar
        await page.getByTestId('sheet-cell-D4').click();
        await expect(page.getByTestId('sheet-formula-input')).toHaveValue('=SUM(D2:D3)');

        // Trigger .xlsx export and verify status banner confirmation
        await page.getByTestId('sheet-export-xlsx-btn').click();
        await expect(page.getByTestId('sheets-status-banner')).toContainText(
          'Exported OpenXML .xlsx',
        );

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, '04-sheets-xlsx-import-export-roundtrip.png'),
          fullPage: false,
        });
      } finally {
        try {
          fs.unlinkSync(tmpXlsxPath);
        } catch {
          // ignore
        }
      }
    });

    test('5. Creates a Range Chart on a Sheet and verifies live updates when placed in a Slide (Accept #5)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Select range A2:B5 using Shift-click and create a Range Chart
      await page.getByTestId('sheet-cell-A2').click();
      await page.getByTestId('sheet-cell-B5').click({ modifiers: ['Shift'] });
      await expect(page.getByTestId('sheet-selected-range-input')).toHaveValue('A2:B5');
      await page.getByTestId('sheet-add-chart-btn').click();

      // Verify SVG Range Chart renders on the Sheet with initial Q1 value 100000
      await expect(page.getByTestId('sheets-charts-section')).toBeVisible();
      await expect(page.getByTestId('sheet-chart-val-chart-1-0')).toContainText('100000');

      // Open the linked Slide Deck preview pane side-by-side (Accept #5)
      await page.getByTestId('toggle-slide-split-btn').click();
      const slidePane = page.getByTestId('linked-slide-split-pane');
      await expect(slidePane).toBeVisible();
      await slidePane.getByTestId('toggle-filmstrip-btn').click();
      await expect(slidePane.getByTestId('slide-live-block-table-data')).toContainText('100000');

      // Now edit B2 on the Sheet from 100000 to 550000 and sync to the global latest sheet store
      await page.getByTestId('sheet-cell-B2').click();
      await page.getByTestId('sheet-formula-input').fill('550000');
      await page.getByTestId('sheet-formula-apply-btn').click();

      // Verify the Range Chart on the Sheet immediately updated to 550000 and total B6 updated to $1,450,000.00
      await expect(page.getByTestId('sheet-chart-val-chart-1-0')).toContainText('550000');
      await expect(page.getByTestId('sheet-cell-B6')).toContainText('$1,450,000.00');

      // Push the updated workbook JSON to globalThis.__MJ_LATEST_SHEET_JSON__ and click Refresh on the Slide's live block
      await page.getByTestId('sheets-mode-source').click();
      const updatedJson = await page.getByTestId('sheets-source-textarea').inputValue();
      await page.evaluate((json) => {
        (globalThis as unknown as { __MJ_LATEST_SHEET_JSON__: string }).__MJ_LATEST_SHEET_JSON__ =
          json;
      }, updatedJson);
      await page.getByTestId('sheets-mode-grid').click();

      // Refresh the live Sheet-Chart block inside the Slide Deck viewer and verify 550000 appears live in the Slide!
      await slidePane.getByTestId('refresh-slide-block-data').click();
      await expect(slidePane.getByTestId('slide-live-block-table-data')).toContainText('550000');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-sheets-range-chart-live-in-slide.png'),
        fullPage: false,
      });
    });

    test('6. Embeds an interactive Inline OLE Whiteboard on a worksheet (§ 3.4.1), compacts an immutable Artifact Version, and renders Workbook Diff View', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${SHEET_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // 1. Embed an Inline OLE Whiteboard on the worksheet
      await page.getByTestId('sheet-add-whiteboard-btn').click();
      await expect(page.getByTestId('sheets-embedded-artifacts-section')).toBeVisible();
      const oleHost = page.getByTestId('sheet-ole-host-emb-1');
      await expect(oleHost).toBeVisible();
      await expect(oleHost.locator('mj-realtime-whiteboard-host')).toBeVisible();

      // 2. Edit a cell and compact a new immutable Artifact Version (v2) to the server
      await page.getByTestId('sheet-cell-B2').click();
      await page.getByTestId('sheet-formula-input').fill('175000');
      await page.getByTestId('sheet-formula-apply-btn').click();
      await page.getByTestId('sheet-save-version-btn').click();

      await expect(async () => {
        expect(savedVersions.length).toBeGreaterThanOrEqual(1);
        await expect(page.getByTestId('sheets-status-banner')).toContainText('v2');
      }).toPass({ timeout: 5000 });

      // 3. Verify Workbook Diff View shows added/removed lines, then return to Grid View for screenshot
      await page.getByTestId('sheets-mode-diff').click();
      await expect(page.getByTestId('sheets-diff-pane')).toBeVisible();
      await expect(page.getByTestId('sheets-diff-summary')).toContainText('added');
      await page.getByTestId('sheets-mode-grid').click();
      await expect(oleHost.locator('mj-realtime-whiteboard-host')).toBeVisible();

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-sheets-inline-ole-whiteboard-and-version-diff.png'),
        fullPage: false,
      });
    });
  },
);
