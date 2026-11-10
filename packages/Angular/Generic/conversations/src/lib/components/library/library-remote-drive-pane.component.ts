import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo } from '@memberjunction/core';
import { StorageAccountWithProvider } from '@memberjunction/core-entities';
import {
  FileSearchResult,
  GraphQLDataProvider,
  GraphQLFileStorageClient,
  StorageObjectMetadata,
} from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { LibraryCreationService } from '../../services/library-creation.service';
import { LibraryCollectionNode } from './library.models';

type RemotePreviewKind = 'none' | 'docx' | 'xlsx' | 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'unsupported';

interface FolderEntry {
  Name: string;
  FullPrefix: string;
}

const MAX_TEXT_PREVIEW_METADATA_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_PREVIEW_READ_BYTES = 102_400;

/**
 * Stateless Connected Drive browser & inline remote preview pane.
 *
 * Architectural guarantee:
 * - Browses folders, searches, downloads, and previews remote cloud storage objects dynamically via
 *   `GraphQLFileStorageClient.ListObjects` and `CreatePreAuthDownloadUrl`.
 * - **Never creates `MJ: Files` database records.**
 * - Optionally converts a remote `.docx`, `.xlsx`, `.csv`, `.md`, `.sql`, or `.json` stream in memory
 *   into a `ContentMode = 'Text'` native `MJ: Artifacts` copy when the user explicitly clicks
 *   "Open Copy as MJ Doc / Sheet".
 */
@Component({
  standalone: false,
  selector: 'mj-library-remote-drive-pane',
  template: `
    <div class="remote-drive-shell" data-testid="library-remote-drive-pane">
      <!-- Drive Interior Toolbar -->
      <div class="remote-drive-toolbar">
        <div class="remote-drive-breadcrumb">
          @if (ShowBackButton) {
            <button
              type="button"
              mjButton
              variant="flat"
              size="sm"
              (click)="BackRequested.emit()"
              title="Back to Connected Drives"
            >
              <i class="fa-solid fa-arrow-left"></i>
            </button>
          }
          <button
            type="button"
            class="crumb-btn crumb-root"
            [class.crumb-active]="Breadcrumbs.length === 0"
            (click)="NavigateToPrefix('')"
          >
            <i [class]="ProviderIcon"></i>
            <span>{{ Account.account.Name }}</span>
          </button>
          @for (crumb of Breadcrumbs; track crumb.FullPrefix; let isLast = $last) {
            <i class="fa-solid fa-chevron-right crumb-sep" aria-hidden="true"></i>
            <button
              type="button"
              class="crumb-btn"
              [class.crumb-active]="isLast"
              (click)="NavigateToPrefix(crumb.FullPrefix)"
            >
              {{ crumb.Name }}
            </button>
          }
          <span class="remote-live-pill" title="Browsed dynamically from remote provider without creating MJ: Files rows">
            <i class="fa-solid fa-bolt"></i>
            Live Remote · Stateless
          </span>
        </div>

        <div class="remote-drive-actions">
          <mj-page-search
            AriaLabel="Filter or search remote drive files"
            [Placeholder]="SupportsProviderSearch ? 'Search remote drive...' : 'Filter current folder...'"
            [Value]="SearchTerm"
            (ValueChange)="OnSearchChanged($event)"
          ></mj-page-search>
          @if (SupportsProviderSearch && SearchTerm.trim().length >= 2) {
            <button
              type="button"
              mjButton
              variant="secondary"
              size="sm"
              [disabled]="IsSearchingRemote"
              (click)="RunRemoteSearch()"
            >
              <i class="fa-solid" [class.fa-magnifying-glass]="!IsSearchingRemote" [class.fa-spinner]="IsSearchingRemote" [class.fa-spin]="IsSearchingRemote"></i>
              Search Drive
            </button>
          }
          @if (RemoteSearchResults !== null) {
            <button type="button" mjButton variant="flat" size="sm" (click)="ClearRemoteSearch()">
              Clear Search
            </button>
          }
          <mj-refresh-button [Loading]="IsLoading" (Clicked)="ReloadListing()"></mj-refresh-button>
        </div>
      </div>

      <!-- Main Body: Split between Folder/File list and Inline Stateless Preview -->
      <div class="remote-drive-body" [class.has-preview]="SelectedObject !== null">
        <div class="remote-list-pane">
          @if (IsLoading) {
            <div class="remote-state">
              <mj-loading text="Listing remote folder..." size="medium"></mj-loading>
            </div>
          } @else if (ErrorMessage) {
            <mj-empty-state
              Variant="error"
              Title="Unable to browse connected drive"
              [Message]="ErrorMessage"
              ActionText="Retry"
              ActionIcon="fa-solid fa-rotate-right"
              (Action)="ReloadListing()"
            ></mj-empty-state>
          } @else if (RemoteSearchResults !== null) {
            @if (RemoteSearchResults.length === 0) {
              <mj-empty-state
                Variant="no-results"
                Title="No matching remote files"
                Message="No files matched your search query in this connected drive."
              ></mj-empty-state>
            } @else {
              <table class="remote-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                    <th>Size</th>
                    <th>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  @for (hit of RemoteSearchResults; track hit.path) {
                    <tr
                      class="remote-row"
                      [class.selected]="SelectedObject?.fullPath === hit.path"
                      (click)="SelectSearchHit(hit)"
                    >
                      <td class="cell-name">
                        <i [class]="GetFileIcon(hit.name, hit.contentType)"></i>
                        <span>{{ hit.name }}</span>
                      </td>
                      <td class="cell-muted">{{ hit.path }}</td>
                      <td class="cell-muted">{{ FormatBytes(hit.size) }}</td>
                      <td class="cell-muted">{{ hit.lastModified | date: 'mediumDate' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          } @else if (FilteredFolders.length === 0 && FilteredFiles.length === 0) {
            <mj-empty-state
              [Variant]="SearchTerm ? 'no-results' : 'empty'"
              Icon="fa-solid fa-cloud"
              [Title]="SearchTerm ? 'No matching items in folder' : 'This folder is empty'"
              [Message]="SearchTerm ? 'Try clearing the filter or searching across the entire drive.' : 'Remote files in this connected drive appear dynamically here.'"
            ></mj-empty-state>
          } @else {
            <table class="remote-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Last Modified</th>
                </tr>
              </thead>
              <tbody>
                @for (folder of FilteredFolders; track folder.FullPrefix) {
                  <tr class="remote-row folder-row" (click)="NavigateToPrefix(folder.FullPrefix)">
                    <td class="cell-name">
                      <i class="fa-solid fa-folder folder-glyph"></i>
                      <span class="folder-label">{{ folder.Name }}</span>
                    </td>
                    <td class="cell-muted">Folder</td>
                    <td class="cell-muted">—</td>
                    <td class="cell-muted">—</td>
                  </tr>
                }
                @for (file of FilteredFiles; track file.fullPath) {
                  <tr
                    class="remote-row"
                    [class.selected]="SelectedObject?.fullPath === file.fullPath"
                    (click)="SelectRemoteFile(file)"
                  >
                    <td class="cell-name">
                      <i [class]="GetFileIcon(file.name, file.contentType)"></i>
                      <span>{{ file.name }}</span>
                    </td>
                    <td class="cell-muted">{{ DescribeFileType(file.name, file.contentType) }}</td>
                    <td class="cell-muted">{{ FormatBytes(file.size) }}</td>
                    <td class="cell-muted">{{ file.lastModified | date: 'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Stateless Inline Remote Preview Drawer -->
        @if (SelectedObject) {
          <aside class="remote-preview-pane" data-testid="remote-stateless-preview">
            <header class="remote-preview-header">
              <div class="preview-title-group">
                <i [class]="GetFileIcon(SelectedObject.name, SelectedObject.contentType)"></i>
                <div class="preview-title-text">
                  <div class="preview-filename" [title]="SelectedObject.name">{{ SelectedObject.name }}</div>
                  <div class="preview-submeta">
                    <span>{{ FormatBytes(SelectedObject.size) }}</span>
                    <span>·</span>
                    <span>Streamed dynamically (no MJ: Files record)</span>
                  </div>
                </div>
              </div>
              <div class="preview-header-actions">
                @if (CanConvertSelectedObject) {
                  <button
                    type="button"
                    mjButton
                    variant="primary"
                    size="sm"
                    [disabled]="IsConvertingCopy"
                    (click)="ConvertCopyToNativeLibrary()"
                    title="Import an editable copy into Native Library as an MJ Document or Spreadsheet"
                  >
                    <i
                      class="fa-solid"
                      [class.fa-wand-magic-sparkles]="!IsConvertingCopy"
                      [class.fa-spinner]="IsConvertingCopy"
                      [class.fa-spin]="IsConvertingCopy"
                    ></i>
                    {{ IsConvertingCopy ? 'Converting…' : 'Open Copy in Studio' }}
                  </button>
                }
                <button
                  type="button"
                  mjButton
                  variant="secondary"
                  size="sm"
                  [disabled]="!PreviewUrl"
                  (click)="DownloadSelectedObject()"
                  title="Download file from Connected Drive"
                >
                  <i class="fa-solid fa-download"></i>
                  Download
                </button>
                <button
                  type="button"
                  mjButton
                  variant="flat"
                  size="sm"
                  (click)="ClosePreview()"
                  aria-label="Close remote preview"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </header>

            <div class="remote-preview-body">
              @if (IsLoadingPreview) {
                <div class="remote-state">
                  <mj-loading text="Opening remote stream..." size="medium"></mj-loading>
                </div>
              } @else if (PreviewError) {
                <mj-empty-state
                  Variant="error"
                  Title="Preview unavailable"
                  [Message]="PreviewError"
                ></mj-empty-state>
              } @else {
                @switch (PreviewKind) {
                  @case ('docx') {
                    <mj-docx-preview [Url]="PreviewUrl"></mj-docx-preview>
                  }
                  @case ('xlsx') {
                    <mj-xlsx-preview [Url]="PreviewUrl"></mj-xlsx-preview>
                  }
                  @case ('pdf') {
                    @if (SafePreviewUrl) {
                      <iframe
                        class="remote-pdf-frame"
                        [src]="SafePreviewUrl"
                        [title]="SelectedObject.name"
                      ></iframe>
                    }
                  }
                  @case ('image') {
                    <div class="remote-media-stage">
                      <img class="remote-image" [src]="PreviewUrl" [alt]="SelectedObject.name" />
                    </div>
                  }
                  @case ('video') {
                    <div class="remote-media-stage">
                      <video class="remote-video" controls [src]="PreviewUrl"></video>
                    </div>
                  }
                  @case ('audio') {
                    <div class="remote-media-stage">
                      <audio controls [src]="PreviewUrl"></audio>
                    </div>
                  }
                  @case ('text') {
                    <pre class="remote-text-preview">{{ PreviewTextContent }}</pre>
                  }
                  @default {
                    <mj-empty-state
                      Icon="fa-solid fa-file-arrow-down"
                      Title="Inline preview not available for this format"
                      Message="Click Download above to open this remote file locally."
                    ></mj-empty-state>
                  }
                }
              }
            </div>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        min-width: 0;
      }

      .remote-drive-shell {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
      }

      .remote-drive-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--mj-space-3);
        padding: var(--mj-space-3) var(--mj-space-4);
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .remote-drive-breadcrumb {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--mj-space-2);
        min-width: 0;
      }

      .crumb-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-1-5);
        padding: 4px 8px;
        border: none;
        border-radius: var(--mj-radius-sm);
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .crumb-btn:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }

      .crumb-btn.crumb-active {
        color: var(--mj-text-primary);
        font-weight: 600;
      }

      .crumb-sep {
        font-size: 10px;
        color: var(--mj-text-disabled);
      }

      .remote-live-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        border-radius: var(--mj-radius-full);
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 24%, var(--mj-border-default));
      }

      .remote-drive-actions {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
      }

      .remote-drive-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        flex: 1;
        min-height: 0;
      }

      .remote-drive-body.has-preview {
        grid-template-columns: minmax(280px, 44%) minmax(340px, 56%);
      }

      .remote-list-pane {
        overflow: auto;
        min-height: 280px;
      }

      .remote-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 240px;
        padding: var(--mj-space-6);
      }

      .remote-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--mj-text-sm);
      }

      .remote-table thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        text-align: left;
        padding: 10px var(--mj-space-4);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-muted);
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .remote-row {
        cursor: pointer;
        border-bottom: 1px solid var(--mj-border-subtle);
        transition: background-color 0.12s ease;
      }

      .remote-row:hover {
        background: var(--mj-bg-surface-hover);
      }

      .remote-row.selected {
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .remote-row td {
        padding: 10px var(--mj-space-4);
        vertical-align: middle;
      }

      .cell-name {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2-5);
        color: var(--mj-text-primary);
        font-weight: 500;
      }

      .folder-glyph {
        color: var(--mj-brand-primary);
        font-size: 15px;
      }

      .folder-label {
        font-weight: 600;
      }

      .cell-muted {
        color: var(--mj-text-muted);
        white-space: nowrap;
      }

      .remote-preview-pane {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-left: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
      }

      .remote-preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--mj-space-3);
        padding: var(--mj-space-3) var(--mj-space-4);
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .preview-title-group {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2-5);
        min-width: 0;
      }

      .preview-title-group > i {
        font-size: 18px;
        color: var(--mj-brand-primary);
      }

      .preview-title-text {
        min-width: 0;
      }

      .preview-filename {
        font-size: var(--mj-text-sm);
        font-weight: 600;
        color: var(--mj-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .preview-submeta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .preview-header-actions {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
        flex-shrink: 0;
      }

      .remote-preview-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
      }

      .remote-pdf-frame {
        width: 100%;
        flex: 1;
        min-height: 480px;
        border: none;
      }

      .remote-media-stage {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        padding: var(--mj-space-6);
        background: var(--mj-bg-surface-sunken);
      }

      .remote-image {
        max-width: 100%;
        max-height: 70vh;
        border-radius: var(--mj-radius-md);
        box-shadow: var(--mj-shadow-md);
      }

      .remote-video {
        max-width: 100%;
        max-height: 70vh;
        border-radius: var(--mj-radius-md);
      }

      .remote-text-preview {
        margin: 0;
        padding: var(--mj-space-5);
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 12.5px;
        line-height: 1.6;
        color: var(--mj-text-primary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      @media (max-width: 960px) {
        .remote-drive-body.has-preview {
          grid-template-columns: 1fr;
        }
        .remote-preview-pane {
          border-left: none;
          border-top: 1px solid var(--mj-border-default);
        }
      }
    `,
  ],
})
export class LibraryRemoteDrivePaneComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  @Input() Account!: StorageAccountWithProvider;
  @Input() CurrentPrefix = '';
  @Input() CurrentUser!: UserInfo;
  @Input() EnvironmentId = '';
  @Input() Collections: LibraryCollectionNode[] = [];
  @Input() ShowBackButton = false;
  @Input() StorageClientOverride: GraphQLFileStorageClient | null = null;

  @Output() PrefixChange = new EventEmitter<string>();
  @Output() BackRequested = new EventEmitter<void>();
  @Output() ArtifactConverted = new EventEmitter<{ ArtifactId: string; VersionNumber: number }>();

  public IsLoading = false;
  public ErrorMessage: string | null = null;
  public Folders: FolderEntry[] = [];
  public Files: StorageObjectMetadata[] = [];
  public SearchTerm = '';
  public IsSearchingRemote = false;
  public RemoteSearchResults: FileSearchResult[] | null = null;

  public SelectedObject: StorageObjectMetadata | null = null;
  public IsLoadingPreview = false;
  public PreviewError: string | null = null;
  public PreviewUrl: string | null = null;
  public SafePreviewUrl: SafeResourceUrl | null = null;
  public PreviewKind: RemotePreviewKind = 'none';
  public PreviewTextContent = '';
  public IsConvertingCopy = false;

  private previewRequestSeq = 0;
  private activePreviewAbort: AbortController | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly creationService = inject(LibraryCreationService);
  private readonly notifications = inject(MJNotificationService);

  public ngOnInit(): void {
    void this.ReloadListing();
  }

  public ngOnDestroy(): void {
    this.abortActivePreviewStream();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if ((changes['Account'] && !changes['Account'].firstChange) || (changes['CurrentPrefix'] && !changes['CurrentPrefix'].firstChange)) {
      this.ClosePreview();
      this.RemoteSearchResults = null;
      void this.ReloadListing();
    }
  }

  public get ProviderIcon(): string {
    const name = (this.Account?.provider?.Name ?? '').toLowerCase();
    if (name.includes('google drive')) return 'fa-brands fa-google-drive';
    if (name.includes('sharepoint') || name.includes('onedrive') || name.includes('azure')) return 'fa-brands fa-microsoft';
    if (name.includes('aws') || name.includes('s3')) return 'fa-brands fa-aws';
    if (name.includes('dropbox')) return 'fa-brands fa-dropbox';
    if (name.includes('box')) return 'fa-solid fa-box';
    return 'fa-solid fa-cloud';
  }

  public get SupportsProviderSearch(): boolean {
    return this.Account?.provider?.SupportsSearch === true;
  }

  public get Breadcrumbs(): FolderEntry[] {
    const clean = (this.CurrentPrefix ?? '').replace(/^\/+|\/+$/g, '');
    if (!clean) return [];
    const segments = clean.split('/').filter((s) => s.length > 0);
    const crumbs: FolderEntry[] = [];
    let running = '';
    for (const seg of segments) {
      running = `${running}${seg}/`;
      crumbs.push({ Name: seg, FullPrefix: running });
    }
    return crumbs;
  }

  public get FilteredFolders(): FolderEntry[] {
    const q = this.SearchTerm.trim().toLowerCase();
    if (!q) return this.Folders;
    return this.Folders.filter((f) => f.Name.toLowerCase().includes(q));
  }

  public get FilteredFiles(): StorageObjectMetadata[] {
    const q = this.SearchTerm.trim().toLowerCase();
    if (!q) return this.Files;
    return this.Files.filter((f) => f.name.toLowerCase().includes(q));
  }

  public get CanConvertSelectedObject(): boolean {
    return !!this.SelectedObject && this.creationService.IsConvertibleFileName(this.SelectedObject.name);
  }

  public async ReloadListing(): Promise<void> {
    if (!this.Account?.account?.ID) {
      return;
    }
    this.IsLoading = true;
    this.ErrorMessage = null;
    try {
      const client = this.getStorageClient();
      const result = await client.ListObjects(this.Account.account.ID, this.CurrentPrefix || '', '/');
      const prefixFolders: FolderEntry[] = (result.prefixes ?? []).map((p) => {
        const trimmed = p.replace(/\/+$/, '');
        const lastSlash = trimmed.lastIndexOf('/');
        const label = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
        return {
          Name: label || p,
          FullPrefix: p.endsWith('/') ? p : `${p}/`,
        };
      });
      const objectFolders: FolderEntry[] = (result.objects ?? [])
        .filter((o) => o.isDirectory)
        .map((o) => ({
          Name: o.name.replace(/\/+$/, ''),
          FullPrefix: o.fullPath.endsWith('/') ? o.fullPath : `${o.fullPath}/`,
        }));

      const seenPrefixes = new Set<string>();
      const mergedFolders: FolderEntry[] = [];
      for (const f of [...prefixFolders, ...objectFolders]) {
        if (!seenPrefixes.has(f.FullPrefix)) {
          seenPrefixes.add(f.FullPrefix);
          mergedFolders.push(f);
        }
      }
      this.Folders = mergedFolders.sort((a, b) => a.Name.localeCompare(b.Name));
      this.Files = (result.objects ?? [])
        .filter((o) => !o.isDirectory)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Could not list objects in this storage account.';
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  public NavigateToPrefix(prefix: string): void {
    this.CurrentPrefix = prefix;
    this.RemoteSearchResults = null;
    this.ClosePreview();
    this.PrefixChange.emit(prefix);
    void this.ReloadListing();
  }

  public OnSearchChanged(value: string): void {
    this.SearchTerm = value;
    if (!value.trim()) {
      this.RemoteSearchResults = null;
    }
  }

  public async RunRemoteSearch(): Promise<void> {
    const query = this.SearchTerm.trim();
    if (!query || !this.Account?.account?.ID) return;
    this.IsSearchingRemote = true;
    try {
      const client = this.getStorageClient();
      const response = await client.SearchFiles([this.Account.account.ID], query, {
        maxResultsPerAccount: 50,
      });
      const firstAccount = response.accountResults?.[0];
      this.RemoteSearchResults = firstAccount?.results ?? [];
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Remote search failed.',
        'error',
        4000,
      );
    } finally {
      this.IsSearchingRemote = false;
      this.cdr.detectChanges();
    }
  }

  public ClearRemoteSearch(): void {
    this.RemoteSearchResults = null;
    this.SearchTerm = '';
  }

  public SelectSearchHit(hit: FileSearchResult): void {
    const synthesized: StorageObjectMetadata = {
      name: hit.name,
      path: hit.path,
      fullPath: hit.path,
      size: hit.size,
      contentType: hit.contentType,
      lastModified: hit.lastModified,
      isDirectory: false,
    };
    void this.SelectRemoteFile(synthesized);
  }

  public async SelectRemoteFile(file: StorageObjectMetadata): Promise<void> {
    this.abortActivePreviewStream();
    const requestId = ++this.previewRequestSeq;

    this.SelectedObject = file;
    this.IsLoadingPreview = true;
    this.PreviewError = null;
    this.PreviewUrl = null;
    this.SafePreviewUrl = null;
    this.PreviewTextContent = '';
    this.PreviewKind = this.resolvePreviewKind(file.name, file.contentType);
    this.cdr.detectChanges();

    try {
      const client = this.getStorageClient();
      const signedUrl = await client.CreatePreAuthDownloadUrl(this.Account.account.ID, file.fullPath);
      if (requestId !== this.previewRequestSeq) {
        return;
      }
      this.PreviewUrl = signedUrl;

      if (this.PreviewKind === 'pdf') {
        this.SafePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(signedUrl);
      } else if (this.PreviewKind === 'text') {
        if (Number.isFinite(file.size) && file.size > MAX_TEXT_PREVIEW_METADATA_BYTES) {
          this.PreviewTextContent = `File is large (${this.FormatBytes(file.size)}) — click Download to view.`;
        } else {
          const controller = new AbortController();
          this.activePreviewAbort = controller;
          const previewText = await this.readBoundedTextPreview(
            signedUrl,
            controller,
            MAX_TEXT_PREVIEW_READ_BYTES,
          );
          if (requestId !== this.previewRequestSeq) {
            return;
          }
          this.PreviewTextContent = previewText;
        }
      }
    } catch (err) {
      if (requestId !== this.previewRequestSeq) {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      this.PreviewError = err instanceof Error ? err.message : 'Failed to open remote preview stream.';
    } finally {
      if (requestId === this.previewRequestSeq) {
        this.IsLoadingPreview = false;
        this.cdr.detectChanges();
      }
    }
  }

  public ClosePreview(): void {
    this.abortActivePreviewStream();
    this.previewRequestSeq++;
    this.SelectedObject = null;
    this.PreviewUrl = null;
    this.SafePreviewUrl = null;
    this.PreviewError = null;
    this.PreviewTextContent = '';
    this.PreviewKind = 'none';
    this.IsLoadingPreview = false;
  }

  private abortActivePreviewStream(): void {
    if (this.activePreviewAbort) {
      this.activePreviewAbort.abort();
      this.activePreviewAbort = null;
    }
  }

  private async readBoundedTextPreview(
    signedUrl: string,
    controller: AbortController,
    maxBytes: number,
  ): Promise<string> {
    const resp = await fetch(signedUrl, {
      signal: controller.signal,
      headers: { Range: `bytes=0-${maxBytes}` },
    });
    if (!resp.ok) {
      throw new Error(`Could not stream text preview (${resp.status}).`);
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      const fallback = await resp.text();
      return fallback.length > maxBytes
        ? `${fallback.slice(0, maxBytes)}\n\n… [Preview truncated at 100 KB]`
        : fallback;
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let truncated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }
        const remaining = maxBytes - totalBytes;
        if (value.byteLength >= remaining) {
          chunks.push(value.subarray(0, remaining));
          totalBytes += remaining;
          truncated = true;
          controller.abort();
          void reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
        totalBytes += value.byteLength;
      }
    } catch (readErr) {
      // Aborting the stream once we have collected maxBytes is intentional, not an error
      if (totalBytes < maxBytes) {
        throw readErr;
      }
    } finally {
      if (this.activePreviewAbort === controller) {
        this.activePreviewAbort = null;
      }
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoded = new TextDecoder('utf-8').decode(merged);
    return truncated ? `${decoded}\n\n… [Preview truncated at 100 KB]` : decoded;
  }

  public DownloadSelectedObject(): void {
    if (!this.PreviewUrl) return;
    window.open(this.PreviewUrl, '_blank', 'noopener');
  }

  public async ConvertCopyToNativeLibrary(): Promise<void> {
    if (!this.SelectedObject || this.IsConvertingCopy) return;
    this.IsConvertingCopy = true;
    this.cdr.detectChanges();
    try {
      const created = await this.creationService.ConvertRemoteDriveObjectToNativeArtifact({
        AccountID: this.Account.account.ID,
        ObjectPath: this.SelectedObject.fullPath,
        FileName: this.SelectedObject.name,
        EnvironmentID: this.EnvironmentId,
        CurrentUser: this.CurrentUser,
        Provider: this.ProviderToUse,
        StorageClientOverride: this.getStorageClient(),
      });
      this.notifications.CreateSimpleNotification(
        `Created editable copy "${created.Artifact.Name}" in Library`,
        'success',
        3500,
      );
      this.ArtifactConverted.emit({
        ArtifactId: created.Artifact.ID,
        VersionNumber: created.Version.VersionNumber,
      });
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Failed to convert remote file.',
        'error',
        4500,
      );
    } finally {
      this.IsConvertingCopy = false;
      this.cdr.detectChanges();
    }
  }

  public GetFileIcon(name: string, contentType?: string): string {
    const ext = this.getExtension(name);
    const mime = (contentType ?? '').toLowerCase();
    if (ext === 'pdf' || mime === 'application/pdf') return 'fa-solid fa-file-pdf';
    if (ext === 'docx' || ext === 'doc' || mime.includes('wordprocessingml')) return 'fa-solid fa-file-word';
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || mime.includes('spreadsheetml')) return 'fa-solid fa-file-excel';
    if (ext === 'pptx' || ext === 'ppt' || mime.includes('presentationml')) return 'fa-solid fa-file-powerpoint';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-solid fa-file-image';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'fa-solid fa-file-video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(ext)) return 'fa-solid fa-file-audio';
    if (['md', 'markdown', 'txt'].includes(ext)) return 'fa-solid fa-file-lines';
    if (['json', 'sql', 'ts', 'js', 'py', 'xml', 'yaml', 'yml'].includes(ext)) return 'fa-solid fa-file-code';
    return 'fa-solid fa-file';
  }

  public DescribeFileType(name: string, contentType?: string): string {
    const ext = this.getExtension(name);
    if (ext) return ext.toUpperCase();
    if (contentType && contentType !== 'application/octet-stream') return contentType;
    return 'File';
  }

  public FormatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let val = bytes;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${idx === 0 ? val : val.toFixed(1)} ${units[idx]}`;
  }

  private resolvePreviewKind(name: string, contentType?: string): RemotePreviewKind {
    const ext = this.getExtension(name);
    const mime = (contentType ?? '').toLowerCase();
    if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (ext === 'xlsx' || ext === 'xls' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (
      mime.startsWith('text/') ||
      ['md', 'markdown', 'txt', 'csv', 'json', 'sql', 'ts', 'js', 'py', 'xml', 'yaml', 'yml'].includes(ext)
    ) {
      return 'text';
    }
    return 'unsupported';
  }

  private getExtension(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).trim().toLowerCase() : '';
  }

  private getStorageClient(): GraphQLFileStorageClient {
    return this.StorageClientOverride ?? new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
  }
}
