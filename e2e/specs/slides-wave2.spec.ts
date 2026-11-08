/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wave 2 E2E Specification — Real Angular Slides Editor + Real Yjs WebSocket
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mounts the real AOT-compiled Angular components in Chromium via esbuild:
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
import type { ArtifactCollaborationServer as ArtifactCollaborationServerType } from '../../packages/MJServer/src/collaboration/ArtifactCollaborationServer';
import type { InMemoryYjsRoomRelay as InMemoryYjsRoomRelayType } from '../../packages/MJServer/src/collaboration/YjsRoomRelay';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCREENSHOT_DIR = path.resolve(REPO_ROOT, 'guides', 'screenshots', 'wave2');
const DECK_ARTIFACT_ID = '22222222-3333-4444-8555-666666666666';

const INITIAL_SLIDE_DECK_JSON = JSON.stringify(
  {
    SchemaVersion: '1.0',
    DeckID: DECK_ARTIFACT_ID,
    Title: 'Q4 Enterprise AI & Collaborative Cloud Strategy',
    Subtitle: 'Board of Directors Executive Briefing',
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
      HeaderText: 'MemberJunction Enterprise Strategy',
      FooterText: 'Confidential · Board Review',
      ShowSlideNumbers: true,
      ShowDate: true,
      OrganizationName: 'MemberJunction',
    },
    Slides: [
      {
        SlideID: 'slide-1',
        SlideNumber: 1,
        Layout: 'Title',
        Title: 'Q4 Enterprise AI & Collaborative Cloud Strategy',
        Subtitle: 'Real-Time Yjs Co-Authoring, Governed Live Blocks & MS OLE Canvases',
        Regions: [
          {
            RegionID: 'main',
            Label: 'Cover Tagline & Presenter Metadata',
            Kind: 'rich-text',
            MarkdownContent:
              '### Executive Briefing\n- Prepared for Board of Directors\n- Powered by MemberJunction Collaborative Slides',
          },
        ],
        SpeakerNotes:
          'Welcome the board and highlight our transition to live governed presentations.',
        Transition: 'fade',
      },
      {
        SlideID: 'slide-2',
        SlideNumber: 2,
        Layout: 'TwoColumn',
        Title: 'Strategic Architecture Pillars',
        Subtitle: 'Per-Slide CRDT Isolation & Zero-Trust Data Governance',
        Regions: [
          {
            RegionID: 'left',
            Label: 'Left Column',
            Kind: 'rich-text',
            MarkdownContent:
              '- **Per-Slide Yjs CRDT:** Concurrent edits merge conflict-free\n- **Viewer RLS & FLS:** Every viewer sees only permitted rows\n- **Brand Theme Seeds:** Contrast-safe palette derivation',
          },
          {
            RegionID: 'right',
            Label: 'Right Column',
            Kind: 'rich-text',
            MarkdownContent:
              '- **Presentation Freeze (O6):** Stable metrics while presenting\n- **Inline OLE Whiteboards:** Interactive architecture diagrams\n- **OpenXML .pptx Export:** Editable text shapes & native tables',
          },
        ],
        SpeakerNotes:
          'Walk through how two authors can edit separate slides while a third reorders the deck.',
        Transition: 'slide',
      },
      {
        SlideID: 'slide-3',
        SlideNumber: 3,
        Layout: 'LiveDataSlide',
        Title: 'Live Enterprise Portfolio Telemetry (Viewer RLS/FLS)',
        Subtitle: 'Refreshes on open and freezes automatically in Presentation Mode (O6)',
        Regions: [
          {
            RegionID: 'data',
            Label: 'Live MJ Data / Chart Region',
            Kind: 'mj-block',
            MarkdownContent: [
              ':::mj-block',
              JSON.stringify(
                {
                  BlockID: 'slide-blk-ev-1',
                  Kind: 'EntityView',
                  Mode: 'Live',
                  Title: 'Live Portfolio Initiatives (Viewer RLS/FLS)',
                  EntityName: 'MJ: Artifacts',
                  ExtraFilter: 'IsActive = 1',
                  DisplayMode: 'table',
                },
                null,
                2,
              ),
              ':::',
            ].join('\n'),
            BlockSpec: {
              BlockID: 'slide-blk-ev-1',
              Kind: 'EntityView',
              Mode: 'Live',
              Title: 'Live Portfolio Initiatives (Viewer RLS/FLS)',
              EntityName: 'MJ: Artifacts',
              ExtraFilter: 'IsActive = 1',
              DisplayMode: 'table',
            },
          },
          {
            RegionID: 'narrative',
            Label: 'Executive Commentary',
            Kind: 'rich-text',
            MarkdownContent:
              '### Key Takeaways\n- Data refreshes live under each viewer\'s MJ permissions\n- Freezes automatically when Presentation Mode begins (`O6`)\n- Exports as a native DrawingML table in `.pptx`',
          },
        ],
        SpeakerNotes:
          'Emphasize that freezing requires explicit acknowledgment (O5) or Presentation Mode (O6).',
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
};

async function buildWave2AngularBundle(): Promise<string> {
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
    const artifactId = params.get('artifactId') || ${JSON.stringify(DECK_ARTIFACT_ID)};
    const wsPort = window.location.port;

    const userMap = {
      sarah: { ID: 'a1111111-1111-4111-8111-111111111111', Name: 'Sarah Chen', Email: 'sarah.chen@memberjunction.org', IsActive: true },
      marcus: { ID: 'b2222222-2222-4222-8222-222222222222', Name: 'Marcus Vance', Email: 'marcus.vance@memberjunction.org', IsActive: true },
    };
    globalThis.__MJ_CURRENT_USER__ = userMap[userKey] || userMap.sarah;
    globalThis.__MJ_COLLAB_WS_URL__ = \`ws://127.0.0.1:\${wsPort}/collaboration/yjs?apiKey=token-\${userKey}&artifactId=\${encodeURIComponent(artifactId)}\`;

    export class Wave2HostAppComponent {
      constructor() {
        this.currentUser = globalThis.__MJ_CURRENT_USER__;
        this.isReadonly = params.get('readonly') === 'true';
        this.deckVersion = {
          ID: 'ver-slides-wave2-1',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'Q4 Enterprise AI & Collaborative Cloud Strategy',
          Content: ${JSON.stringify(INITIAL_SLIDE_DECK_JSON)},
        };
      }
      static ɵfac = function Wave2HostAppComponent_Factory(t) { return new (t || Wave2HostAppComponent)(); };
      static ɵcmp = i0.ɵɵdefineComponent({
        type: Wave2HostAppComponent,
        selectors: [['mj-wave2-app']],
        decls: 12,
        vars: 4,
        consts: [
          [1, 'mj-shell-header', 'data-testid', 'mj-shell-header'],
          [1, 'mj-shell-brand'],
          [1, 'mj-shell-brand-badge'],
          [1, 'mj-shell-breadcrumb'],
          [1, 'mj-shell-user'],
          [1, 'mj-shell-body'],
          [3, 'artifactVersion', 'readonly'],
        ],
        template: function Wave2HostAppComponent_Template(rf, ctx) {
          if (rf & 1) {
            i0.ɵɵelementStart(0, 'header', 0)(1, 'div', 1)(2, 'span', 2);
            i0.ɵɵtext(3, 'MJ Explorer · Slides');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(4, 'span');
            i0.ɵɵtext(5, 'Q4 Enterprise AI & Collaborative Cloud Strategy');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(6, 'span', 3);
            i0.ɵɵtext(7, '/ Collections / Executive Briefings / Presentation (v1)');
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(8, 'div', 4);
            i0.ɵɵtext(9);
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(10, 'div', 5);
            i0.ɵɵelement(11, 'mj-slide-deck-artifact-viewer', 6);
            i0.ɵɵelementEnd();
          }
          if (rf & 2) {
            i0.ɵɵadvance(9);
            i0.ɵɵtextInterpolate2('Signed in as ', ctx.currentUser.Name, ' (', ctx.currentUser.Email, ')');
            i0.ɵɵadvance(2);
            i0.ɵɵproperty('artifactVersion', ctx.deckVersion)('readonly', ctx.isReadonly);
          }
        },
        dependencies: [SlideDeckArtifactViewerComponent],
        encapsulation: 2,
      });
    }

    export class Wave2HostModule {
      static ɵfac = function Wave2HostModule_Factory(t) { return new (t || Wave2HostModule)(); };
      static ɵmod = i0.ɵɵdefineNgModule({
        type: Wave2HostModule,
        bootstrap: [Wave2HostAppComponent],
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
    i0.ɵɵsetNgModuleScope(Wave2HostModule, {
      declarations: [
        Wave2HostAppComponent,
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
        SlideDeckArtifactViewerComponent,
        ArtifactTypePluginViewerComponent,
      ],
    });

    platformBrowser().bootstrapModule(Wave2HostModule).catch((err) => {
      console.error('Angular bootstrap error:', err);
    });
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: artifactsDir,
      sourcefile: 'wave2-e2e-entry.js',
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
              export const ArtifactMetadataEngine = { Instance: { FindArtifactType: () => null } };
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
                    return [
                      {
                        ID: 'e-artifacts',
                        Name: 'MJ: Artifacts',
                        DisplayNameOrName: 'MJ: Artifacts',
                        FieldLevelSecurityApplies: false,
                        GetUserPermisions: () => ({ CanRead: true }),
                        Fields: [
                          { Name: 'Name', DisplayNameOrName: 'Initiative Name', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'Type', DisplayNameOrName: 'Artifact Type', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'Status', DisplayNameOrName: 'Governance Status', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                        ],
                      },
                    ];
                  },
                  get Queries() {
                    return [];
                  },
                };
                Provider = Metadata.Provider;
                get CurrentUser() { return Metadata.Provider.CurrentUser; }
                get Entities() { return Metadata.Provider.Entities; }
                get Queries() { return Metadata.Provider.Queries; }
              }
              export class RunView {
                static FromMetadataProvider() { return new RunView(); }
                async RunView(params) {
                  if (params && params.EntityName === 'MJ: Artifacts' && params.ExtraFilter && params.ExtraFilter.includes('22222222-3333-4444-8555-666666666666')) {
                    return {
                      Success: true,
                      Results: [{ ID: '22222222-3333-4444-8555-666666666666', UserID: 'a1111111-1111-4111-8111-111111111111', EnvironmentID: 'env-1' }],
                      TotalRowCount: 1,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifacts') {
                    return {
                      Success: true,
                      Results: [
                        { Name: 'Q4 Enterprise AI & Collaborative Cloud Strategy', Type: 'Presentation', Status: 'Active (RLS/FLS Verified)' },
                        { Name: 'Yjs Collaboration & OLE Host Topology', Type: 'Whiteboard', Status: 'Inline OLE Shared' },
                      ],
                      TotalRowCount: 2,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                      Success: true,
                      Results: [{ ID: 'perm-marcus-slides', ArtifactID: '22222222-3333-4444-8555-666666666666', UserID: 'b2222222-2222-4222-8222-222222222222', CanRead: true, CanEdit: true }],
                      TotalRowCount: 1,
                    };
                  }
                  return { Success: true, Results: [], TotalRowCount: 0 };
                }
              }
              export class RunQuery {
                static FromMetadataProvider() { return new RunQuery(); }
                async RunQuery() { return { Success: true, Results: [], RowCount: 0 }; }
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

function buildWave2IndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MJ Explorer — Collaborative Slides &amp; OLE Presentation Studio</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
    :root {
      --mj-bg-page: #f1f5f9;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-elevated: #f8fafc;
      --mj-bg-surface-sunken: #e2e8f0;
      --mj-bg-surface-card: #ffffff;
      --mj-bg-surface-hover: #f1f5f9;
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
    mj-wave2-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    .mj-shell-header {
      height: 46px;
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
      background: var(--mj-brand-primary);
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
    }
    .mj-shell-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    mj-slide-deck-artifact-viewer {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <mj-wave2-app></mj-wave2-app>
  <script src="/wave2-bundle.js"></script>
</body>
</html>`;
}

function createServerMetadataProvider(
  savedVersions: Array<{ ID: string; VersionNumber: number; Content: string }>,
): IMetadataProvider {
  const provider = {
    Entities: [{ ID: 'e-artifacts', Name: 'MJ: Artifacts' }],
    RunView: async (params: { EntityName: string }) => {
      if (params.EntityName === 'MJ: Artifact Working States') {
        return { Success: true, Results: [], TotalRowCount: 0 };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (savedVersions.length === 0) {
          return {
            Success: true,
            Results: [
              {
                ID: 'ver-slides-wave2-1',
                ArtifactID: DECK_ARTIFACT_ID,
                VersionNumber: 1,
                Content: INITIAL_SLIDE_DECK_JSON,
              },
            ],
            TotalRowCount: 1,
          };
        }
        const sorted = [...savedVersions].sort((a, b) => b.VersionNumber - a.VersionNumber);
        return { Success: true, Results: sorted, TotalRowCount: sorted.length };
      }
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: DECK_ARTIFACT_ID,
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
            ArtifactID: DECK_ARTIFACT_ID,
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
          ArtifactID: DECK_ARTIFACT_ID,
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
        ArtifactID: DECK_ARTIFACT_ID,
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
      sourcefile: 'collab-server-wave2-entry.ts',
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

  const tmpOut = path.join(REPO_ROOT, 'e2e', '.tmp-collab-server-wave2.cjs');
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
  'Wave 2 E2E — Real Compiled Angular Slides Editor, Per-Slide Yjs Sync, Brand Themes, O6 Presenter View, OLE Whiteboard & .pptx Export',
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
      bundleJs = await buildWave2AngularBundle();
      const loaded = await loadCollaborationServerModule();
      collabServerInstance = loaded.ArtifactCollaborationServer.Instance;
      InMemoryYjsRoomRelayClass = loaded.InMemoryYjsRoomRelay;

      const indexHtml = buildWave2IndexHtml();
      server = http.createServer((req, res) => {
        const reqUrl = req.url ?? '/';
        if (reqUrl.startsWith('/wave2-bundle.js')) {
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

    test('1. Renders real Angular SlideDeckArtifactViewerComponent with 16:9 visual stage, filmstrip rail, in-place editable regions, and Speaker Notes', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      await expect(page.getByTestId('mj-slides-shell')).toBeVisible();
      await expect(page.getByTestId('slides-filmstrip-rail')).toBeVisible();
      await expect(page.getByTestId('slide-canvas-stage')).toBeVisible();
      await expect(page.getByTestId('slides-collab-status')).toContainText('Live Yjs Sync');

      // Verify in-place contenteditable title & subtitle on the 16:9 slide stage
      const editableTitle = page.getByTestId('editable-slide-title');
      await expect(editableTitle).toBeVisible();
      await expect(editableTitle).toHaveAttribute('contenteditable', 'true');
      await expect(editableTitle).toContainText('Q4 Enterprise AI & Collaborative Cloud Strategy');

      // Verify Speaker Notes bar
      await expect(page.getByTestId('speaker-notes-panel')).toBeVisible();
      await expect(page.getByTestId('speaker-notes-input')).toHaveValue(
        /Welcome the board and highlight our transition/,
      );

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '01-slides-editor-workspace.png'),
        fullPage: false,
      });
    });

    test('2. Switches canonical slide layouts and re-themes the entire deck from Organization Brand Color Seeds (Accept #4)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Select Slide 2 (TwoColumn)
      await page.getByTestId('filmstrip-slide-slide-2').click();
      await expect(page.getByTestId('editable-slide-title')).toContainText(
        'Strategic Architecture Pillars',
      );

      // Open Theme & Brand Seeds drawer
      await page.getByTestId('toggle-theme-drawer-btn').click();
      await expect(page.getByTestId('theme-brand-drawer')).toBeVisible();

      // Fill Organization Brand Color Seeds (Accept #4) and apply
      await page.getByTestId('brand-seed-org-input').fill('Nova Cybernetics');
      await page.getByTestId('brand-seed-primary-input').fill('#7C3AED');
      await page.getByTestId('brand-seed-accent-input').fill('#10B981');
      await page.getByTestId('brand-seed-bg-input').fill('#0F172A');
      await page.getByTestId('apply-brand-seeds-btn').click();

      // Verify 16:9 stage re-themes dynamically and displays active brand seed badge
      await expect(page.getByTestId('active-brand-seed-badge')).toContainText(
        'Brand: Nova Cybernetics',
      );

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-slides-layouts-and-brand-theme.png'),
        fullPage: false,
      });
    });

    test('3. Hosts Live MJ EntityView block (with O5 freeze modal) and embeds interactive Inline OLE Whiteboard on a slide region (§ 3.4.1 & § 5.1)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Navigate to Slide 3 (LiveDataSlide)
      await page.getByTestId('filmstrip-slide-slide-3').click();
      await expect(page.getByTestId('slide-live-block-table-data')).toBeVisible();
      await expect(page.getByTestId('slide-block-mode-data')).toContainText('Live (Viewer RLS/FLS)');

      // Embed an Inline OLE Whiteboard in the right-hand region ('narrative')
      await page.getByTestId('region-insert-whiteboard-narrative').click();
      const oleContainer = page.getByTestId('slide-ole-artifact-host-narrative');
      await expect(oleContainer).toBeVisible();
      await expect(oleContainer.locator('mj-realtime-whiteboard-host')).toBeVisible();

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '03-slides-live-mj-block-and-ole-whiteboard.png'),
        fullPage: false,
      });
    });

    test('4. Enters Presenter View (O6), automatically freezes live MJ blocks for presentation stability, and supports one-click Refresh Live Data', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Select Slide 3 (LiveDataSlide) and enter Presenter View
      await page.getByTestId('filmstrip-slide-slide-3').click();
      await page.getByTestId('slides-mode-presenter').click();

      // Verify O6 Presentation Freeze Banner + Presenter Cockpit (Timer, Next Slide, Speaker Notes)
      await expect(page.getByTestId('o6-presentation-freeze-banner')).toBeVisible();
      await expect(page.getByTestId('presenter-view-cockpit')).toBeVisible();
      await expect(page.getByTestId('presenter-elapsed-timer')).toBeVisible();
      await expect(page.getByTestId('presenter-speaker-notes-card')).toContainText(
        'Emphasize that freezing requires explicit acknowledgment',
      );

      // Verify Live MJ Block on Slide 3 was automatically frozen upon entering Presentation Mode (O6)
      const freezeBanner = page.getByTestId('o6-presentation-freeze-banner');
      await expect(freezeBanner).toHaveAttribute('data-refresh-count', '0');
      const initialFrozenAt = await freezeBanner.getAttribute('data-frozen-at');
      expect(initialFrozenAt).toBeTruthy();
      await expect(page.getByTestId('slide-block-mode-data')).toContainText('Frozen Snapshot');

      // Click one-click Refresh Live Data button (O6) and verify data-refresh-count increments and data-frozen-at updates
      await page.getByTestId('presenter-refresh-live-btn').click();
      await expect(freezeBanner).toHaveAttribute('data-refresh-count', '1');
      const refreshedFrozenAt = await freezeBanner.getAttribute('data-frozen-at');
      expect(refreshedFrozenAt).toBeTruthy();
      expect(refreshedFrozenAt).not.toBe(initialFrozenAt);
      await expect(page.getByTestId('slide-block-mode-data')).toContainText('Frozen Snapshot');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '04-slides-presenter-view-o6-freeze.png'),
        fullPage: false,
      });
    });

    test('5. Anchors SlideRegion comment threads (AnchorType=SlideRegion) and invokes @SlidesAgent to update a single slide in isolation (Accept #3)', async ({
      page,
    }) => {
      await resetRoomState();
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
        waitUntil: 'networkidle',
      });

      // Select Slide 2 and click comment button on the 'left' region
      await page.getByTestId('filmstrip-slide-slide-2').click();
      await page.getByTestId('region-comment-btn-left').click();
      await expect(page.getByTestId('slide-comments-drawer')).toBeVisible();

      // Invoke @SlidesAgent to rewrite ONLY Slide 2 (Accept #3)
      await page
        .getByTestId('slide-comment-draft-input')
        .fill('@SlidesAgent Title: AI-Refined Zero-Trust Pillars\nSynthesize executive takeaways');
      await page.getByTestId('submit-slide-comment-btn').click();

      // Verify Slide 2 title updated in place and @SlidesAgent replied in the anchored thread
      await expect(page.getByTestId('editable-slide-title')).toContainText(
        'AI-Refined Zero-Trust Pillars',
      );
      await expect(page.getByTestId('slide-comment-thread-list')).toContainText(
        'in isolation via SlideDeckToolLibrary.update_slide',
      );

      // Verify Slide 1 and Slide 3 in the filmstrip rail were untouched (Accept #3)
      await expect(page.getByTestId('filmstrip-slide-slide-1')).toContainText(
        'Q4 Enterprise AI & Collaborative Cloud Strategy',
      );
      await expect(page.getByTestId('filmstrip-slide-slide-3')).toContainText(
        'Live Enterprise Portfolio Telemetry',
      );

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-slides-anchored-comments-and-agent.png'),
        fullPage: false,
      });
    });

    test('6. Synchronizes concurrent multi-user per-slide edits & slide reordering over Yjs WebSockets (Accept #1) and verifies OpenXML .pptx export (Accept #2 & #5)', async ({
      browser,
    }) => {
      await resetRoomState();
      const contextSarah = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const contextMarcus = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const pageSarah = await contextSarah.newPage();
      const pageMarcus = await contextMarcus.newPage();

      try {
        await pageSarah.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=sarah`, {
          waitUntil: 'networkidle',
        });
        await pageMarcus.goto(`${baseUrl}/?artifactId=${DECK_ARTIFACT_ID}&user=marcus`, {
          waitUntil: 'networkidle',
        });

        await expect(pageSarah.getByTestId('slides-collab-status')).toContainText('Live Yjs Sync');
        await expect(pageMarcus.getByTestId('slides-collab-status')).toContainText('Live Yjs Sync');

        // Sarah edits Slide 1's Speaker Notes (updates slidesById['slide-1'])
        await pageSarah
          .getByTestId('speaker-notes-input')
          .fill('Sarah live speaker notes synced over Yjs');

        // Concurrently, Marcus selects Slide 2, edits its Speaker Notes (updates slidesById['slide-2']),
        // AND moves Slide 3 up in the deck order (updates slideOrder Y.Array)
        await pageMarcus.getByTestId('filmstrip-slide-slide-2').click();
        await pageMarcus
          .getByTestId('speaker-notes-input')
          .fill('Marcus concurrent speaker notes on Slide 2');
        await pageMarcus.getByTestId('move-slide-up-slide-3').click();

        // Verify Sarah's filmstrip rail converges the new slide order (slide-1, slide-3, slide-2)
        await expect(async () => {
          const cards = await pageSarah
            .locator('[data-testid^="filmstrip-slide-"]')
            .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
          expect(cards).toEqual([
            'filmstrip-slide-slide-1',
            'filmstrip-slide-slide-3',
            'filmstrip-slide-slide-2',
          ]);
        }).toPass({ timeout: 5000 });

        // Verify on Sarah's page that Marcus's Slide 2 Speaker Notes arrived over Yjs
        await pageSarah.getByTestId('filmstrip-slide-slide-2').click();
        await expect(pageSarah.getByTestId('speaker-notes-input')).toHaveValue(
          'Marcus concurrent speaker notes on Slide 2',
        );

        // Verify on Marcus's page that Sarah's Slide 1 Speaker Notes arrived over Yjs
        await pageMarcus.getByTestId('filmstrip-slide-slide-1').click();
        await expect(pageMarcus.getByTestId('speaker-notes-input')).toHaveValue(
          'Sarah live speaker notes synced over Yjs',
        );

        // Return Sarah to Slide 1, open Theme drawer, apply Brand Theme Seeds (deckMeta), and compact version to server
        await pageSarah.getByTestId('filmstrip-slide-slide-1').click();
        await pageSarah.getByTestId('toggle-theme-drawer-btn').click();
        await pageSarah.getByTestId('apply-brand-seeds-btn').click();
        await pageSarah.getByTestId('save-slide-version-btn').click();

        // Verify server savedVersions compacted the converged slideOrder, both speaker notes, AND the Brand Theme from deckMeta
        await expect(async () => {
          expect(savedVersions.length).toBeGreaterThanOrEqual(1);
          const compactedDeck = JSON.parse(savedVersions[savedVersions.length - 1].Content);
          expect(compactedDeck.Slides.map((s: { SlideID: string }) => s.SlideID)).toEqual([
            'slide-1',
            'slide-3',
            'slide-2',
          ]);
          const s1 = compactedDeck.Slides.find((s: { SlideID: string }) => s.SlideID === 'slide-1');
          const s2 = compactedDeck.Slides.find((s: { SlideID: string }) => s.SlideID === 'slide-2');
          expect(s1.SpeakerNotes).toBe('Sarah live speaker notes synced over Yjs');
          expect(s2.SpeakerNotes).toBe('Marcus concurrent speaker notes on Slide 2');
          expect(compactedDeck.Theme.BrandSeedSource).toBe('Acme Enterprise');
          expect(compactedDeck.Master.OrganizationName).toBe('Acme Enterprise');
        }).toPass({ timeout: 5000 });

        await pageSarah.getByTestId('export-pptx-btn').click();

        const exportSummary = pageSarah.getByTestId('pptx-export-audit-summary');
        await expect(exportSummary).toBeVisible();
        await expect(exportSummary).toContainText('Slides: 3');
        await expect(exportSummary).toContainText('Frozen Live Blocks: 1');

        await pageSarah.screenshot({
          path: path.join(SCREENSHOT_DIR, '06-slides-multi-user-yjs-sync-and-pptx.png'),
          fullPage: false,
        });
      } finally {
        await contextSarah.close();
        await contextMarcus.close();
      }
    });
  },
);
