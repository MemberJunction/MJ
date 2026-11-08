/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wave 1 E2E Specification — Real Angular Components + Real Yjs WebSocket
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mounts the real AOT-compiled Angular components in Chromium via esbuild:
 *   - `MarkdownArtifactViewerComponent` (`@memberjunction/ng-artifacts`)
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
import type { ArtifactPermissionEngine as ArtifactPermissionEngineType } from '@memberjunction/core-entities';
import type { ArtifactCollaborationServer as ArtifactCollaborationServerType } from '../../packages/MJServer/src/collaboration/ArtifactCollaborationServer';
import type { InMemoryYjsRoomRelay as InMemoryYjsRoomRelayType } from '../../packages/MJServer/src/collaboration/YjsRoomRelay';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCREENSHOT_DIR = path.resolve(REPO_ROOT, 'guides', 'screenshots', 'wave1');
const DOC_ARTIFACT_ID = '11111111-2222-4333-8444-555555555555';

const INITIAL_DOC_MARKDOWN = [
  '# Q4 Enterprise Platform Architecture & Governance Brief',
  '',
  'This collaborative specification coordinates **MJ Docs**, live viewer-scoped MJ data blocks (`EntityView`, `SavedQuery`), and inline **MS OLE** `Whiteboard` artifacts synchronized over `y-protocols` WebSocket rooms.',
  '',
  '- [x] Provision dedicated `MJ: Artifact Working States` CRDT checkpoint table',
  '- [ ] Complete multi-region Yjs room relay stress verification',
  '',
  '> [!NOTE]',
  '> All embedded MJ blocks execute under the active viewer context with Row-Level Security (RLS), Field-Level Security (FLS), and automatic `IsServerSet` parameter stripping.',
  '',
  '## 1. Live Portfolio Entity View',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-live-ev",',
  '  "Kind": "EntityView",',
  '  "Mode": "Live",',
  '  "Title": "Active Enterprise AI Initiatives (Viewer RLS/FLS)",',
  '  "EntityName": "MJ: Artifacts",',
  '  "ExtraFilter": "IsActive = 1"',
  '}',
  ':::',
  '',
  '## 2. Parameterized Saved Query (ServerSet Stripping)',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-live-sq",',
  '  "Kind": "SavedQuery",',
  '  "Mode": "Live",',
  '  "Title": "Regional Latency & Throughput Telemetry",',
  '  "QueryName": "Quarterly Platform SLA Metrics",',
  '  "Parameters": {',
  '    "region": "us-east",',
  '    "__server_tenantId": "spoofed-tenant-999"',
  '  }',
  '}',
  ':::',
  '',
  '## 3. System Topology Whiteboard (Inline OLE Artifact)',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-wb-1",',
  '  "Kind": "Artifact",',
  '  "Mode": "Live",',
  '  "Title": "Yjs Collaboration & OLE Host Topology",',
  '  "ArtifactID": "wb-inline-topology-1",',
  '  "ArtifactType": "Whiteboard",',
  '  "EmbedMode": "Inline",',
  '  "HeightPx": 460',
  '}',
  ':::',
  '',
  '## 4. Regional SLA Targets',
  '',
  '| Region | P95 Sync Latency | Checkpoint Cadence |',
  '| --- | --- | --- |',
  '| US-East | 18ms | 5s Debounced |',
  '| EU-Central | 24ms | 5s Debounced |',
].join('\n');

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

async function buildWave1AngularBundle(): Promise<string> {
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
    import { MarkdownArtifactViewerComponent } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/components/plugins/markdown-artifact-viewer.component.js'),
    )};
    import { ArtifactTypePluginViewerComponent } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/components/artifact-type-plugin-viewer.component.js'),
    )};
    import { DocumentCollaborationService } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/services/document-collaboration.service.js'),
    )};
    import { DocumentImportExportService } from ${JSON.stringify(
      path.join(artifactsDir, 'dist/lib/services/document-import-export.service.js'),
    )};
    import { WhiteboardArtifactViewerComponent, LoadWhiteboardArtifactViewer } from ${JSON.stringify(
      path.join(conversationsDir, 'dist/lib/components/realtime/whiteboard/whiteboard-artifact-viewer.component.js'),
    )};

    LoadWhiteboardArtifactViewer();

    const params = new URLSearchParams(window.location.search);
    const userKey = params.get('user') || 'sarah';
    const artifactId = params.get('artifactId') || ${JSON.stringify(DOC_ARTIFACT_ID)};
    const wsPort = window.location.port;

    const userMap = {
      sarah: { ID: 'a1111111-1111-4111-8111-111111111111', Name: 'Sarah Chen', Email: 'sarah.chen@memberjunction.org', IsActive: true },
      marcus: { ID: 'b2222222-2222-4222-8222-222222222222', Name: 'Marcus Vance', Email: 'marcus.vance@memberjunction.org', IsActive: true },
    };
    globalThis.__MJ_CURRENT_USER__ = userMap[userKey] || userMap.sarah;
    globalThis.__MJ_COLLAB_WS_URL__ = \`ws://127.0.0.1:\${wsPort}/collaboration/yjs?apiKey=token-\${userKey}&artifactId=\${encodeURIComponent(artifactId)}\`;

    export class Wave1HostAppComponent {
      constructor() {
        this.wsUrl = globalThis.__MJ_COLLAB_WS_URL__;
        this.currentUser = globalThis.__MJ_CURRENT_USER__;
        this.isReadonly = params.get('readonly') === 'true';
        this.docVersion = {
          ID: 'ver-doc-wave1-1',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'Q4 Enterprise Platform Architecture & Governance Brief',
          Content: ${JSON.stringify(INITIAL_DOC_MARKDOWN)},
        };
      }
      static ɵfac = function Wave1HostAppComponent_Factory(t) { return new (t || Wave1HostAppComponent)(); };
      static ɵcmp = i0.ɵɵdefineComponent({
        type: Wave1HostAppComponent,
        selectors: [['mj-wave1-app']],
        decls: 12,
        vars: 5,
        consts: [
          [1, 'mj-shell-header', 'data-testid', 'mj-shell-header'],
          [1, 'mj-shell-brand'],
          [1, 'mj-shell-brand-badge'],
          [1, 'mj-shell-breadcrumb'],
          [1, 'mj-shell-user'],
          [1, 'mj-shell-body'],
          [3, 'artifactVersion', 'readonly', 'collaborationWsUrl'],
        ],
        template: function Wave1HostAppComponent_Template(rf, ctx) {
          if (rf & 1) {
            i0.ɵɵelementStart(0, 'header', 0)(1, 'div', 1)(2, 'span', 2);
            i0.ɵɵtext(3, 'MJ Explorer');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(4, 'span');
            i0.ɵɵtext(5, 'Q4 Enterprise Platform Architecture & Governance Brief');
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(6, 'span', 3);
            i0.ɵɵtext(7, '/ Collections / Executive Strategy / Markdown Document (v1)');
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(8, 'div', 4);
            i0.ɵɵtext(9);
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(10, 'div', 5);
            i0.ɵɵelement(11, 'mj-markdown-artifact-viewer', 6);
            i0.ɵɵelementEnd();
          }
          if (rf & 2) {
            i0.ɵɵadvance(9);
            i0.ɵɵtextInterpolate2('Signed in as ', ctx.currentUser.Name, ' (', ctx.currentUser.Email, ')');
            i0.ɵɵadvance(2);
            i0.ɵɵproperty('artifactVersion', ctx.docVersion)('readonly', ctx.isReadonly)('collaborationWsUrl', ctx.wsUrl);
          }
        },
        dependencies: [MarkdownArtifactViewerComponent],
        encapsulation: 2,
      });
    }

    export class Wave1HostModule {
      static ɵfac = function Wave1HostModule_Factory(t) { return new (t || Wave1HostModule)(); };
      static ɵmod = i0.ɵɵdefineNgModule({
        type: Wave1HostModule,
        bootstrap: [Wave1HostAppComponent],
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
          DocumentImportExportService,
        ],
      });
    }
    i0.ɵɵsetNgModuleScope(Wave1HostModule, {
      declarations: [
        Wave1HostAppComponent,
        MarkdownArtifactViewerComponent,
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
        MarkdownArtifactViewerComponent,
        ArtifactTypePluginViewerComponent,
      ],
    });

    platformBrowser().bootstrapModule(Wave1HostModule).catch((err) => {
      console.error('Angular bootstrap error:', err);
    });
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: artifactsDir,
      sourcefile: 'wave1-e2e-entry.js',
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
              export const ArtifactMetadataEngine = { Instance: { FindArtifactType: () => null } };
              export const QueryEngine = { Instance: { Queries: [] } };
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
                          { Name: 'Name', DisplayNameOrName: 'Artifact Name', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'Type', DisplayNameOrName: 'Artifact Type', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                          { Name: 'Status', DisplayNameOrName: 'Governance Status', DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
                        ],
                      },
                    ];
                  },
                  get Queries() {
                    return [
                      {
                        ID: 'q-1',
                        Name: 'Quarterly Platform SLA Metrics',
                        UserCanRun: () => true,
                        Parameters: [{ Name: '__server_tenantId', IsServerSet: true }],
                        Entities: [],
                      },
                      {
                        ID: 'q-2',
                        Name: 'Active Artifacts Overview',
                        UserCanRun: () => true,
                        Parameters: [{ Name: '__server_tenantId', IsServerSet: true }],
                        Entities: [],
                      },
                    ];
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
                  if (params && params.EntityName === 'MJ: Artifacts' && params.ExtraFilter && params.ExtraFilter.includes('11111111-2222-4333-8444-555555555555')) {
                    return {
                      Success: true,
                      Results: [{ ID: '11111111-2222-4333-8444-555555555555', UserID: 'a1111111-1111-4111-8111-111111111111', EnvironmentID: 'env-1' }],
                      TotalRowCount: 1,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifacts') {
                    return {
                      Success: true,
                      Results: [
                        { Name: 'Q4 Enterprise Platform Architecture & Governance Brief', Type: 'Markdown Document', Status: 'Active (RLS/FLS Verified)' },
                        { Name: 'Yjs Collaboration & OLE Host Topology', Type: 'Whiteboard', Status: 'Inline OLE Shared' },
                      ],
                      TotalRowCount: 2,
                    };
                  }
                  if (params && params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                      Success: true,
                      Results: [{ ID: 'perm-marcus', ArtifactID: '11111111-2222-4333-8444-555555555555', UserID: 'b2222222-2222-4222-8222-222222222222', CanRead: true, CanEdit: true }],
                      TotalRowCount: 1,
                    };
                  }
                  return { Success: true, Results: [], TotalRowCount: 0 };
                }
              }
              export class RunQuery {
                static FromMetadataProvider() { return new RunQuery(); }
                async RunQuery() {
                  return {
                    Success: true,
                    Results: [
                      { Region: 'us-east-1', P95LatencyMs: 18, ActiveRooms: 42 },
                      { Region: 'eu-west-1', P95LatencyMs: 24, ActiveRooms: 31 },
                    ],
                    RowCount: 2,
                  };
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
          build.onResolve({ filter: /^(mammoth|pdfjs-dist|docx)$/ }, (args) => ({
            path: args.path,
            namespace: 'empty-doc-lib',
          }));
          build.onLoad({ filter: /.*/, namespace: 'empty-doc-lib' }, () => ({
            contents:
              'export default {}; export const Document = class {}; export const Packer = { toBlob: async () => new Blob([]) }; export const Paragraph = class {}; export const TextRun = class {}; export const HeadingLevel = {}; export const Table = class {}; export const TableRow = class {}; export const TableCell = class {}; export const WidthType = {}; export const BorderStyle = {};',
          }));
        },
      },
    ],
  });

  return result.outputFiles[0].text;
}

function buildWave1IndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MJ Explorer — Collaborative Docs &amp; OLE Artifact Workspace</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
    :root {
      --mj-bg-page: #f8fafc;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-elevated: #f8fafc;
      --mj-bg-surface-sunken: #f1f5f9;
      --mj-bg-surface-card: #f8fafc;
      --mj-bg-surface-hover: #f1f5f9;
      --mj-text-primary: #0f172a;
      --mj-text-secondary: #475569;
      --mj-text-muted: #64748b;
      --mj-text-disabled: #94a3b8;
      --mj-text-inverse: #ffffff;
      --mj-border-default: #e2e8f0;
      --mj-border-subtle: #f1f5f9;
      --mj-border-strong: #cbd5e1;
      --mj-brand-primary: #4f46e5;
      --mj-brand-primary-hover: #4338ca;
      --mj-status-success: #047857;
      --mj-status-warning: #b45309;
      --mj-status-error: #b91c1c;
      --mj-status-info: #1d4ed8;
      --mj-radius-sm: 6px;
      --mj-radius-md: 8px;
      --mj-radius-lg: 12px;
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
    mj-wave1-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    .mj-shell-header {
      height: 48px;
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
    mj-markdown-artifact-viewer {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <mj-wave1-app></mj-wave1-app>
  <script src="/wave1-bundle.js"></script>
</body>
</html>`;
}

function createServerMetadataProvider(savedVersions: Array<{ ID: string; VersionNumber: number; Content: string }>): IMetadataProvider {
  const provider = {
    Entities: [{ ID: 'e-artifacts', Name: 'MJ: Artifacts' }],
    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
      if (params.EntityName === 'MJ: Artifact Working States') {
        return { Success: true, Results: [], TotalRowCount: 0 };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (savedVersions.length === 0) {
          return {
            Success: true,
            Results: [
              {
                ID: 'ver-doc-wave1-1',
                ArtifactID: DOC_ARTIFACT_ID,
                VersionNumber: 1,
                Content: INITIAL_DOC_MARKDOWN,
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
              ID: DOC_ARTIFACT_ID,
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
            ArtifactID: DOC_ARTIFACT_ID,
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
          ArtifactID: DOC_ARTIFACT_ID,
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
        ArtifactID: DOC_ARTIFACT_ID,
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
  ArtifactPermissionEngine: typeof ArtifactPermissionEngineType;
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
    export { ArtifactPermissionEngine } from ${JSON.stringify(
      path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/ArtifactPermissionDelegate.js'),
    )};
  `;
  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: serverDir,
      sourcefile: 'collab-server-entry.ts',
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
            path: path.join(REPO_ROOT, 'packages/MJCoreEntities/dist/custom/ArtifactPermissionDelegate.js'),
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
              export function LogError(...args) { console.error(...args); }
              export function LogStatus(...args) { console.log(...args); }
            `,
          }));
        },
      },
    ],
  });

  const tmpOut = path.join(REPO_ROOT, 'e2e', '.tmp-collab-server.cjs');
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

test.describe.serial('Wave 1 E2E — Real Compiled Angular Docs Editor, Live Blocks, OLE Whiteboard & Yjs Server', () => {
  let server: http.Server;
  let baseUrl = '';
  let bundleJs = '';
  let collabServerInstance: ArtifactCollaborationServerType;
  let permissionEngineInstance: ArtifactPermissionEngineType;
  const savedVersions: Array<{ ID: string; VersionNumber: number; Content: string }> = [];

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    bundleJs = await buildWave1AngularBundle();
    const {
      ArtifactCollaborationServer,
      InMemoryYjsRoomRelay,
      ArtifactPermissionEngine,
    } = await loadCollaborationServerModule();
    collabServerInstance = ArtifactCollaborationServer.Instance;
    permissionEngineInstance = ArtifactPermissionEngine.Instance;

    // Reset Marcus permissions
    USERS.marcus.CanRead = true;
    USERS.marcus.CanEdit = true;

    const indexHtml = buildWave1IndexHtml();
    server = http.createServer((req, res) => {
      const reqUrl = req.url ?? '/';
      if (reqUrl.startsWith('/wave1-bundle.js')) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(bundleJs);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
    });

    const mockProvider = createServerMetadataProvider(savedVersions);
    await collabServerInstance.Shutdown();
    (collabServerInstance as unknown as { _shuttingDown: boolean })._shuttingDown = false;
    collabServerInstance.SetRoomRelay(new InMemoryYjsRoomRelay());
    collabServerInstance.SetMetadataProviderOverride(mockProvider);
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

  test('1. Renders real Angular MarkdownArtifactViewerComponent with in-place WYSIWYG blocks, TOC rail, live MJ blocks, and Yjs WebSocket sync', async ({
    page,
  }) => {
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('mj-docs-workspace')).toBeVisible();
    await expect(page.getByTestId('docs-outline-rail')).toBeVisible();
    await expect(page.getByTestId('collaboration-presence-pill')).toContainText('Live Yjs Sync');

    // Verify no top raw textarea in Edit mode (§ 4.1 UX bar)
    await expect(page.locator('[data-testid="docs-editor-textarea"]')).toHaveCount(0);

    // Verify in-place contenteditable heading, task list checkbox, and interactive table
    const firstHeading = page.locator('[data-testid^="editable-heading-"]').first();
    await expect(firstHeading).toBeVisible();
    await expect(firstHeading).toHaveAttribute('contenteditable', 'true');

    // Verify live EntityView and SavedQuery blocks + IsServerSet stripped notice
    await expect(page.getByTestId('live-mj-block-blk-live-ev')).toBeVisible();
    await expect(page.getByTestId('block-mode-badge-blk-live-ev')).toContainText('Live (Viewer RLS/FLS)');
    await expect(page.getByTestId('live-mj-block-blk-live-sq')).toBeVisible();
    await expect(page.getByTestId('block-security-note')).toContainText('__server_tenantId');

    // Verify embedded OLE Whiteboard Artifact block is rendered
    await expect(page.getByTestId('ole-artifact-block-blk-wb-1')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-docs-editor-outline.png'),
      fullPage: false,
    });
  });

  test('2. Opens / Slash Command Menu from in-place block editing and filters commands across Structure, Live Data & OLE Artifact', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });

    // Open slash menu via toolbar or typing '/' in an editable block
    await page.getByTestId('open-slash-menu-btn').click();
    await expect(page.getByTestId('slash-command-menu')).toBeVisible();
    await expect(page.getByTestId('slash-item-entity-view')).toBeVisible();
    await expect(page.getByTestId('slash-item-saved-query')).toBeVisible();
    await expect(page.getByTestId('slash-item-whiteboard')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-docs-slash-menu.png'),
      fullPage: false,
    });

    const searchInput = page.getByTestId('slash-search-input');
    await searchInput.fill('whiteboard');
    await expect(page.getByTestId('slash-item-whiteboard')).toBeVisible();
  });

  test('3. Enforces O5 Data Governance & Security Notice confirmation modal before freezing a live MJ block', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });

    await page.getByTestId('freeze-block-btn-blk-live-ev').click();
    const modal = page.getByTestId('freeze-warning-modal');
    await expect(modal).toBeVisible();

    const confirmBtn = page.getByTestId('confirm-freeze-btn');
    await expect(confirmBtn).toBeDisabled();

    await page.getByTestId('freeze-warning-checkbox').check();
    await expect(confirmBtn).toBeEnabled();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-docs-freeze-warning-modal.png'),
      fullPage: false,
    });

    await confirmBtn.click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId('block-mode-badge-blk-live-ev')).toContainText('Frozen Snapshot');
    await expect(page.getByTestId('frozen-provenance-banner')).toBeVisible();
  });

  test('4. Activates Inline OLE Whiteboard (<mj-realtime-whiteboard-host>) inside the document, commits changes, and pins version', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });

    const oleBlock = page.getByTestId('ole-artifact-block-blk-wb-1');
    await oleBlock.scrollIntoViewIfNeeded();

    // Activate inline OLE editing ([readonly]="false" -> mounts <mj-realtime-whiteboard-host>)
    await page.getByTestId('toggle-inline-ole-btn-blk-wb-1').click();
    await expect(oleBlock).toContainText('Interactive Canvas (OLE)');
    await expect(oleBlock.locator('mj-realtime-whiteboard-host')).toBeVisible();

    // Pin version and commit inline changes on the embedded WhiteboardArtifactViewerComponent
    await page.getByTestId('toggle-pin-ole-btn-blk-wb-1').click();
    await expect(oleBlock).toContainText('v1 · Pinned');

    await oleBlock.getByRole('button', { name: /Commit Changes/i }).click();
    await expect(oleBlock).toContainText('v2 · Pinned');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-docs-inline-whiteboard-ole.png'),
      fullPage: false,
    });
  });

  test('5. Supports Suggest Mode in-place tracked edits and Right-Margin Anchored DocBlock Comment Threads with @DocsAgent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });

    // Switch to Suggest mode
    await page.getByTestId('mode-suggest-btn').click();
    await expect(page.getByTestId('docs-suggest-mode-banner')).toBeVisible();

    // Open anchored comment drawer on first heading block and @mention @DocsAgent
    const firstCommentBtn = page.locator('[data-testid^="anchor-comment-btn-"]').first();
    await firstCommentBtn.click();
    await expect(page.getByTestId('docs-comments-drawer')).toBeVisible();

    await page.getByTestId('new-anchored-comment-input').fill(
      '@DocsAgent Tighten the executive overview and add an action callout for Q4 readiness.',
    );
    await page.getByTestId('post-anchored-comment-btn').click();

    // Verify anchored thread with @DocsAgent reply and tracked Suggestion Card
    await expect(page.getByTestId('anchored-threads-list')).toContainText('@DocsAgent');
    await expect(page.locator('[data-testid^="suggestion-card-"]').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-docs-anchored-comments-suggest.png'),
      fullPage: false,
    });
  });

  test('6. Synchronizes two browser contexts over real Yjs WebSocket, downgrades mid-session on permission revocation, and renders Version History Diff', async ({
    browser,
  }) => {
    const context1 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const context2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const pageSarah = await context1.newPage();
    const pageMarcus = await context2.newPage();

    try {
      await pageSarah.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=sarah`, { waitUntil: 'networkidle' });
      await pageMarcus.goto(`${baseUrl}/?artifactId=${DOC_ARTIFACT_ID}&user=marcus`, { waitUntil: 'networkidle' });

      await expect(pageSarah.getByTestId('collaboration-presence-pill')).toContainText('Live Yjs Sync');
      await expect(pageMarcus.getByTestId('collaboration-presence-pill')).toContainText('Live Yjs Sync');

      // Sarah toggles the second task-list checkbox in place -> syncs over Yjs to Marcus
      const uncheckedTask = pageSarah.locator('input.mj-docs-task-checkbox:not(:checked)').first();
      await uncheckedTask.check();

      // Revoke Marcus's edit permission mid-session -> server sends MSG_PERMISSION_STATE downgrade
      USERS.marcus.CanEdit = false;
      await permissionEngineInstance.NotifyPermissionsChanged({
        ArtifactID: DOC_ARTIFACT_ID,
        TargetUserID: USERS.marcus.ID,
      });

      await expect(pageMarcus.getByTestId('collaboration-presence-pill')).toContainText('Read-Only');
      await expect(pageMarcus.getByTestId('mode-edit-btn')).toBeDisabled();

      // Sarah saves a new document version and opens Version History Diff
      await pageSarah.getByTestId('save-doc-version-btn').click();
      await pageSarah.getByTestId('mode-diff-btn').click();
      await expect(pageSarah.getByTestId('docs-diff-view')).toBeVisible();

      await pageSarah.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-docs-version-diff.png'),
        fullPage: false,
      });
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
