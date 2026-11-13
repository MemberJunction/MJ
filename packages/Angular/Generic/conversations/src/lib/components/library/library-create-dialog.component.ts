import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  CreatedLibraryArtifactResult,
  LibraryCreationService,
  LibraryDriveExportFormat,
  LibraryStarterKind,
  RemoteDriveFileExistsError,
} from '../../services/library-creation.service';
import {
  LibraryCollectionNode,
  LibraryDriveSummary,
  LibraryItemSummary,
} from './library.models';

export type LibraryCreateDialogTab = 'blank' | 'upload' | 'custom';

interface StarterTileOption {
  Kind: LibraryStarterKind;
  Title: string;
  Subtitle: string;
  Icon: string;
  AccentClass: string;
  DefaultName: string;
}

const STARTER_TILES: ReadonlyArray<StarterTileOption> = [
  {
    Kind: 'document',
    Title: 'MJ Document',
    Subtitle: 'Rich Markdown, Suggesting mode & live MJ Entity Views',
    Icon: 'fa-solid fa-file-lines',
    AccentClass: 'accent-doc',
    DefaultName: 'Untitled Document',
  },
  {
    Kind: 'spreadsheet',
    Title: 'MJ Spreadsheet',
    Subtitle: 'Formulas, =MJ.QUERY() live tables & range charts',
    Icon: 'fa-solid fa-table-cells',
    AccentClass: 'accent-sheet',
    DefaultName: 'Untitled Spreadsheet',
  },
  {
    Kind: 'presentation',
    Title: 'MJ Presentation',
    Subtitle: '16:9 structured slides, speaker notes & live data',
    Icon: 'fa-solid fa-person-chalkboard',
    AccentClass: 'accent-slide',
    DefaultName: 'Untitled Presentation',
  },
  {
    Kind: 'query',
    Title: 'Data Query (SQL)',
    Subtitle: 'Versioned SQL script with side-by-side Git diff',
    Icon: 'fa-solid fa-database',
    AccentClass: 'accent-query',
    DefaultName: 'Untitled Data Query',
  },
];

@Component({
  standalone: false,
  selector: 'mj-library-create-dialog',
  template: `
    @if (IsOpen) {
      <mj-dialog
        [Title]="DialogTitle"
        [Visible]="true"
        [Width]="680"
        [MinWidth]="420"
        (Close)="Cancel()"
      >
        <div class="create-dialog-body" data-testid="library-create-dialog">
          <!-- Mode Tabs -->
          <div class="create-mode-tabs" role="tablist" aria-label="Creation mode">
            <button
              type="button"
              role="tab"
              class="create-mode-tab"
              [class.active]="ActiveTab === 'blank'"
              [attr.aria-selected]="ActiveTab === 'blank'"
              (click)="SwitchTab('blank')"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span>Create Blank</span>
            </button>
            <button
              type="button"
              role="tab"
              class="create-mode-tab"
              [class.active]="ActiveTab === 'upload'"
              [attr.aria-selected]="ActiveTab === 'upload'"
              (click)="SwitchTab('upload')"
            >
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>Upload / Convert File</span>
            </button>
            <button
              type="button"
              role="tab"
              class="create-mode-tab"
              [class.active]="ActiveTab === 'custom'"
              [attr.aria-selected]="ActiveTab === 'custom'"
              (click)="SwitchTab('custom')"
            >
              <i class="fa-solid fa-code"></i>
              <span>Custom Source</span>
            </button>
          </div>

          @if (ActiveTab === 'blank') {
            <div class="starter-grid">
              @for (tile of StarterTiles; track tile.Kind) {
                <button
                  type="button"
                  class="starter-option"
                  [class.selected]="SelectedKind === tile.Kind"
                  (click)="SelectStarterKind(tile)"
                  [attr.data-testid]="'dialog-starter-' + tile.Kind"
                >
                  <div class="starter-icon" [class]="tile.AccentClass">
                    <i [class]="tile.Icon"></i>
                  </div>
                  <div class="starter-copy">
                    <div class="starter-title">{{ tile.Title }}</div>
                    <div class="starter-sub">{{ tile.Subtitle }}</div>
                  </div>
                </button>
              }
            </div>

            <div class="field-group">
              <label class="field-label" for="lib-create-title">Title</label>
              <input
                id="lib-create-title"
                type="text"
                class="field-input"
                [(ngModel)]="Title"
                placeholder="Enter a title..."
                (keydown.enter)="Submit()"
                data-testid="library-create-title-input"
              />
            </div>

            <div class="field-group">
              <label class="field-label" for="lib-create-desc">Description (optional)</label>
              <input
                id="lib-create-desc"
                type="text"
                class="field-input"
                [(ngModel)]="Description"
                placeholder="Short summary for collaborators..."
              />
            </div>
          }

          @if (ActiveTab === 'upload') {
            <label
              class="drop-zone"
              [class.drag-over]="IsDragOver"
              (dragover)="OnDragOver($event)"
              (dragleave)="IsDragOver = false"
              (drop)="OnDrop($event)"
            >
              <input
                type="file"
                class="sr-only-file"
                (change)="OnFileSelected($event)"
                data-testid="library-upload-file-input"
              />
              <i class="fa-solid fa-file-arrow-up drop-icon"></i>
              @if (SelectedFile) {
                <div class="drop-primary">{{ SelectedFile.name }}</div>
                <div class="drop-secondary">
                  {{ FormatSize(SelectedFile.size) }} · Click or drop another file to replace
                </div>
              } @else {
                <div class="drop-primary">Drop a file here or click to browse</div>
                <div class="drop-secondary">
                  Supports .docx, .xlsx, .csv, .md, .pdf, images, audio/video, SQL, and JSON
                </div>
              }
            </label>

            @if (SelectedFile && IsSelectedFileConvertible) {
              <div class="convert-choice-card">
                <label class="convert-radio">
                  <input
                    type="radio"
                    name="convertMode"
                    [value]="true"
                    [(ngModel)]="ConvertToEditable"
                  />
                  <div>
                    <div class="convert-radio-title">
                      Convert to collaborative MJ Document / Spreadsheet (Recommended)
                    </div>
                    <div class="convert-radio-desc">
                      Opens in live Yjs Studio with Suggesting mode, formulas, and visual version diffs.
                    </div>
                  </div>
                </label>
                <label class="convert-radio">
                  <input
                    type="radio"
                    name="convertMode"
                    [value]="false"
                    [(ngModel)]="ConvertToEditable"
                  />
                  <div>
                    <div class="convert-radio-title">Store original binary file in Library</div>
                    <div class="convert-radio-desc">
                      Preserves exact original bytes in MJ Storage as a read-only file artifact.
                    </div>
                  </div>
                </label>
              </div>
            }

            <div class="field-group">
              <label class="field-label" for="lib-upload-title">Display Title</label>
              <input
                id="lib-upload-title"
                type="text"
                class="field-input"
                [(ngModel)]="Title"
                placeholder="Defaults to filename..."
              />
            </div>
          }

          @if (ActiveTab === 'custom') {
            <div class="field-row">
              <div class="field-group flex-1">
                <label class="field-label" for="lib-custom-title">Title</label>
                <input
                  id="lib-custom-title"
                  type="text"
                  class="field-input"
                  [(ngModel)]="Title"
                  placeholder="Artifact name"
                />
              </div>
              <div class="field-group flex-1">
                <label class="field-label" for="lib-custom-type">Artifact Type</label>
                <select
                  id="lib-custom-type"
                  class="field-select"
                  [(ngModel)]="SelectedCustomTypeId"
                >
                  @for (t of ArtifactTypes; track t.ID) {
                    <option [value]="t.ID">{{ t.Name }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label" for="lib-custom-content">Initial Content</label>
              <textarea
                id="lib-custom-content"
                class="field-textarea"
                rows="6"
                [(ngModel)]="CustomContent"
                placeholder="Paste JSON, HTML, SVG, Markdown, or code..."
              ></textarea>
            </div>
          }

          <!-- Shared Optional Collection Target -->
          <div class="field-group">
            <label class="field-label" for="lib-target-collection">Save into Collection (optional)</label>
            <select
              id="lib-target-collection"
              class="field-select"
              [(ngModel)]="TargetCollectionId"
            >
              <option value="">None (Personal Library Root)</option>
              @for (col of EditableCollections; track col.Id) {
                <option [value]="col.Id">{{ col.Label }}</option>
              }
            </select>
          </div>

          @if (ErrorMessage) {
            <mj-alert Variant="error">{{ ErrorMessage }}</mj-alert>
          }
        </div>

        <mj-dialog-actions>
          <button
            type="button"
            mjButton
            variant="primary"
            [disabled]="!CanSubmit || IsSubmitting"
            (click)="Submit()"
            data-testid="library-create-submit-btn"
          >
            @if (IsSubmitting) {
              <i class="fa-solid fa-spinner fa-spin"></i>
              Creating…
            } @else {
              <i class="fa-solid fa-plus"></i>
              {{ SubmitButtonLabel }}
            }
          </button>
          <button type="button" mjButton [disabled]="IsSubmitting" (click)="Cancel()">
            Cancel
          </button>
        </mj-dialog-actions>
      </mj-dialog>
    }
  `,
  styles: [
    `
      .create-dialog-body {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-4);
        padding: var(--mj-space-2) 0;
      }

      .create-mode-tabs {
        display: flex;
        gap: var(--mj-space-1);
        padding: 4px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
      }

      .create-mode-tab {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--mj-space-2);
        padding: 8px 12px;
        border: none;
        border-radius: var(--mj-radius-sm);
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .create-mode-tab.active {
        background: var(--mj-bg-surface);
        color: var(--mj-brand-primary);
        font-weight: 600;
        box-shadow: var(--mj-shadow-sm);
      }

      .starter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--mj-space-3);
      }

      .starter-option {
        display: flex;
        align-items: flex-start;
        gap: var(--mj-space-3);
        padding: var(--mj-space-3);
        text-align: left;
        background: var(--mj-bg-surface);
        border: 1.5px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        cursor: pointer;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }

      .starter-option:hover {
        border-color: var(--mj-border-strong);
        background: var(--mj-bg-surface-hover);
      }

      .starter-option.selected {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 7%, var(--mj-bg-surface));
      }

      .starter-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--mj-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      }

      .starter-icon.accent-sheet {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 14%, var(--mj-bg-surface));
      }

      .starter-icon.accent-slide {
        color: var(--mj-status-warning);
        background: color-mix(in srgb, var(--mj-status-warning) 14%, var(--mj-bg-surface));
      }

      .starter-title {
        font-size: var(--mj-text-sm);
        font-weight: 600;
        color: var(--mj-text-primary);
        margin-bottom: 2px;
      }

      .starter-sub {
        font-size: 12px;
        line-height: 1.35;
        color: var(--mj-text-muted);
      }

      .field-row {
        display: flex;
        gap: var(--mj-space-3);
      }

      .flex-1 {
        flex: 1;
      }

      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .field-input,
      .field-select,
      .field-textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 12px;
        border-radius: var(--mj-radius-sm);
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-family: inherit;
        font-size: var(--mj-text-sm);
      }

      .field-textarea {
        font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
        resize: vertical;
      }

      .drop-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: var(--mj-space-6);
        border: 2px dashed var(--mj-border-strong);
        border-radius: var(--mj-radius-lg);
        background: var(--mj-bg-surface-card);
        cursor: pointer;
        text-align: center;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }

      .drop-zone:hover,
      .drop-zone.drag-over {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
      }

      .sr-only-file {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      .drop-icon {
        font-size: 28px;
        color: var(--mj-brand-primary);
        margin-bottom: 4px;
      }

      .drop-primary {
        font-size: var(--mj-text-sm);
        font-weight: 600;
        color: var(--mj-text-primary);
      }

      .drop-secondary {
        font-size: 12px;
        color: var(--mj-text-muted);
      }

      .convert-choice-card {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2-5);
        padding: var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .convert-radio {
        display: flex;
        align-items: flex-start;
        gap: var(--mj-space-2-5);
        cursor: pointer;
      }

      .convert-radio input {
        margin-top: 3px;
      }

      .convert-radio-title {
        font-size: var(--mj-text-sm);
        font-weight: 600;
        color: var(--mj-text-primary);
      }

      .convert-radio-desc {
        font-size: 12px;
        color: var(--mj-text-muted);
      }

      @media (max-width: 600px) {
        .starter-grid {
          grid-template-columns: 1fr;
        }
        .field-row {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class LibraryCreateDialogComponent extends BaseAngularComponent implements OnChanges {
  @Input() IsOpen = false;
  @Input() InitialTab: LibraryCreateDialogTab = 'blank';
  @Input() InitialStarterKind: LibraryStarterKind = 'document';
  @Input() DefaultCollectionId: string | null = null;
  @Input() Collections: LibraryCollectionNode[] = [];
  @Input() EnvironmentId = '';
  @Input() CurrentUser!: UserInfo;

  @Output() Created = new EventEmitter<CreatedLibraryArtifactResult>();
  @Output() Cancelled = new EventEmitter<void>();

  public readonly StarterTiles = STARTER_TILES;
  public ActiveTab: LibraryCreateDialogTab = 'blank';
  public SelectedKind: LibraryStarterKind = 'document';
  public Title = 'Untitled Document';
  public Description = '';
  public TargetCollectionId = '';
  public SelectedFile: File | null = null;
  public ConvertToEditable = true;
  public IsDragOver = false;

  public ArtifactTypes: MJArtifactTypeEntity[] = [];
  public SelectedCustomTypeId = '';
  public CustomContent = '';

  public IsSubmitting = false;
  public ErrorMessage = '';

  private readonly creationService = inject(LibraryCreationService);
  private readonly notifications = inject(MJNotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.ActiveTab = this.InitialTab;
      this.SelectedKind = this.InitialStarterKind;
      const starter = STARTER_TILES.find((t) => t.Kind === this.InitialStarterKind) ?? STARTER_TILES[0];
      this.Title = this.ActiveTab === 'upload' ? '' : starter.DefaultName;
      this.Description = '';
      this.SelectedFile = null;
      this.ConvertToEditable = true;
      this.CustomContent = '';
      this.ErrorMessage = '';
      this.TargetCollectionId = this.DefaultCollectionId ?? '';
      void this.ensureArtifactTypesLoaded();
    }
  }

  public get DialogTitle(): string {
    if (this.ActiveTab === 'upload') return 'Upload or Convert File into Library';
    if (this.ActiveTab === 'custom') return 'Create Custom Library Item';
    return 'Create in Library';
  }

  public get SubmitButtonLabel(): string {
    if (this.ActiveTab === 'upload') {
      return this.SelectedFile && this.IsSelectedFileConvertible && this.ConvertToEditable
        ? 'Convert & Open in Studio'
        : 'Upload to Library';
    }
    return 'Create & Open in Studio';
  }

  public get IsSelectedFileConvertible(): boolean {
    return !!this.SelectedFile && this.creationService.IsConvertibleFileName(this.SelectedFile.name);
  }

  public get EditableCollections(): Array<{ Id: string; Label: string }> {
    const out: Array<{ Id: string; Label: string }> = [];
    const walk = (nodes: LibraryCollectionNode[], prefix: string): void => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.Name}` : n.Name;
        if (n.CanEdit) {
          out.push({ Id: n.Id, Label: label });
        }
        if (n.Children.length > 0) {
          walk(n.Children, label);
        }
      }
    };
    walk(this.Collections, '');
    return out;
  }

  public get CanSubmit(): boolean {
    if (this.ActiveTab === 'blank') {
      return this.Title.trim().length > 0;
    }
    if (this.ActiveTab === 'upload') {
      return this.SelectedFile !== null;
    }
    return this.Title.trim().length > 0 && this.SelectedCustomTypeId.length > 0 && this.CustomContent.trim().length > 0;
  }

  public SwitchTab(tab: LibraryCreateDialogTab): void {
    this.ActiveTab = tab;
    this.ErrorMessage = '';
    if (tab === 'blank' && !this.Title.trim()) {
      const starter = STARTER_TILES.find((t) => t.Kind === this.SelectedKind) ?? STARTER_TILES[0];
      this.Title = starter.DefaultName;
    }
  }

  public SelectStarterKind(tile: StarterTileOption): void {
    const previousDefault = STARTER_TILES.find((t) => t.Kind === this.SelectedKind)?.DefaultName;
    this.SelectedKind = tile.Kind;
    if (!this.Title.trim() || this.Title === previousDefault) {
      this.Title = tile.DefaultName;
    }
  }

  public OnDragOver(event: DragEvent): void {
    event.preventDefault();
    this.IsDragOver = true;
  }

  public OnDrop(event: DragEvent): void {
    event.preventDefault();
    this.IsDragOver = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      this.applySelectedFile(file);
    }
  }

  public OnFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) {
      this.applySelectedFile(file);
    }
  }

  public async Submit(): Promise<void> {
    if (!this.CanSubmit || this.IsSubmitting) return;
    this.IsSubmitting = true;
    this.ErrorMessage = '';
    this.cdr.detectChanges();

    try {
      let created: CreatedLibraryArtifactResult;
      const collectionId = this.TargetCollectionId || null;

      if (this.ActiveTab === 'blank') {
        created = await this.creationService.CreateBlankArtifact({
          Kind: this.SelectedKind,
          Title: this.Title,
          Description: this.Description,
          CollectionID: collectionId,
          EnvironmentID: this.EnvironmentId,
          CurrentUser: this.CurrentUser,
          Provider: this.ProviderToUse,
        });
      } else if (this.ActiveTab === 'upload' && this.SelectedFile) {
        created = await this.creationService.ImportLocalFileToLibrary({
          File: this.SelectedFile,
          ConvertToEditable: this.IsSelectedFileConvertible && this.ConvertToEditable,
          Title: this.Title,
          Description: this.Description,
          CollectionID: collectionId,
          EnvironmentID: this.EnvironmentId,
          CurrentUser: this.CurrentUser,
          Provider: this.ProviderToUse,
        });
      } else {
        created = await this.creationService.CreateCustomTextArtifact({
          Title: this.Title,
          Description: this.Description,
          Content: this.CustomContent,
          ArtifactTypeID: this.SelectedCustomTypeId,
          CollectionID: collectionId,
          EnvironmentID: this.EnvironmentId,
          CurrentUser: this.CurrentUser,
          Provider: this.ProviderToUse,
        });
      }

      this.notifications.CreateSimpleNotification(`Created "${created.Artifact.Name}"`, 'success', 3000);
      this.Created.emit(created);
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to create item.';
    } finally {
      this.IsSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  public Cancel(): void {
    this.Cancelled.emit();
  }

  public FormatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private applySelectedFile(file: File): void {
    this.SelectedFile = file;
    this.ConvertToEditable = this.creationService.IsConvertibleFileName(file.name);
    if (!this.Title.trim()) {
      const dot = file.name.lastIndexOf('.');
      this.Title = dot > 0 ? file.name.slice(0, dot) : file.name;
    }
  }

  private async ensureArtifactTypesLoaded(): Promise<void> {
    if (this.ArtifactTypes.length > 0) return;
    this.ArtifactTypes = await this.creationService.LoadEnabledArtifactTypes(this.CurrentUser, this.ProviderToUse);
    if (this.ArtifactTypes.length > 0 && !this.SelectedCustomTypeId) {
      const md = this.ArtifactTypes.find((t) => t.DriverClass === 'MarkdownArtifactViewerPlugin') ?? this.ArtifactTypes[0];
      this.SelectedCustomTypeId = md.ID;
    }
    this.cdr.detectChanges();
  }
}

/**
 * Dialog for publishing a snapshot of a native MJ Artifact directly into an external Connected Drive
 * (`.docx`, `.xlsx`, `.pptx`, `.md`, `.csv`, `.json`, `.sql`) with zero `MJ: Files` rows created.
 */
@Component({
  standalone: false,
  selector: 'mj-library-export-drive-dialog',
  template: `
    @if (IsOpen && Item) {
      <mj-dialog
        [Title]="'Export to Connected Drive: ' + Item.Name + ' (v' + EffectiveVersionNumber + ')'"
        [Visible]="true"
        [Width]="540"
        [MinWidth]="380"
        (Close)="Cancelled.emit()"
      >
        <div class="export-dialog-body" data-testid="library-export-drive-dialog">
          <div class="field-group">
            <label class="field-label" for="lib-export-drive">Destination Connected Drive</label>
            <select
              id="lib-export-drive"
              class="field-select"
              [(ngModel)]="SelectedAccountId"
              (ngModelChange)="ClearOverwritePrompt()"
            >
              @for (drive of Drives; track drive.AccountId) {
                <option [value]="drive.AccountId">
                  {{ drive.AccountName }} ({{ drive.ProviderName }})
                </option>
              }
            </select>
          </div>

          <div class="field-group">
            <label class="field-label" for="lib-export-folder">Remote Folder Path (optional)</label>
            <input
              id="lib-export-folder"
              type="text"
              class="field-input"
              [(ngModel)]="FolderPrefix"
              (ngModelChange)="ClearOverwritePrompt()"
              placeholder="e.g. Exports/2026"
            />
          </div>

          <div class="field-row">
            <div class="field-group flex-1">
              <label class="field-label" for="lib-export-format">Export Format</label>
              <select
                id="lib-export-format"
                class="field-select"
                [(ngModel)]="SelectedFormat"
                (ngModelChange)="ClearOverwritePrompt()"
              >
                @for (fmt of FormatOptions; track fmt.Format) {
                  <option [value]="fmt.Format">{{ fmt.Label }}</option>
                }
              </select>
            </div>
            <div class="field-group flex-1">
              <label class="field-label" for="lib-export-filename">File Name</label>
              <input
                id="lib-export-filename"
                type="text"
                class="field-input"
                [(ngModel)]="FileName"
                (ngModelChange)="ClearOverwritePrompt()"
              />
            </div>
          </div>

          <div class="stateless-note">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>
              Writes version v{{ EffectiveVersionNumber }} directly to the selected external drive without creating duplicate MJ: Files database records.
            </span>
          </div>

          @if (PendingOverwritePath) {
            <mj-alert Variant="warning" data-testid="library-export-overwrite-alert">
              A file already exists at <strong>{{ PendingOverwritePath }}</strong>. Click
              <strong>Overwrite Existing File</strong> to replace it, or change the file name above.
            </mj-alert>
          }

          @if (ErrorMessage) {
            <mj-alert Variant="error">{{ ErrorMessage }}</mj-alert>
          }
        </div>

        <mj-dialog-actions>
          <button
            type="button"
            mjButton
            variant="primary"
            [disabled]="!SelectedAccountId || IsExporting"
            (click)="ExportNow(!!PendingOverwritePath)"
            data-testid="library-export-confirm-btn"
          >
            @if (IsExporting) {
              <i class="fa-solid fa-spinner fa-spin"></i>
              Publishing…
            } @else if (PendingOverwritePath) {
              <i class="fa-solid fa-triangle-exclamation"></i>
              Overwrite Existing File
            } @else {
              <i class="fa-solid fa-cloud-arrow-up"></i>
              Publish to Drive
            }
          </button>
          <button type="button" mjButton [disabled]="IsExporting" (click)="Cancelled.emit()">
            Cancel
          </button>
        </mj-dialog-actions>
      </mj-dialog>
    }
  `,
  styles: [
    `
      .export-dialog-body {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-4);
        padding: var(--mj-space-2) 0;
      }

      .field-row {
        display: flex;
        gap: var(--mj-space-3);
      }

      .flex-1 {
        flex: 1;
      }

      .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .field-input,
      .field-select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 12px;
        border-radius: var(--mj-radius-sm);
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-family: inherit;
        font-size: var(--mj-text-sm);
      }

      .stateless-note {
        display: flex;
        align-items: flex-start;
        gap: var(--mj-space-2-5);
        padding: var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-border-default));
        font-size: 12px;
        color: var(--mj-text-secondary);
      }

      .stateless-note i {
        color: var(--mj-brand-primary);
        margin-top: 2px;
      }
    `,
  ],
})
export class LibraryExportDriveDialogComponent extends BaseAngularComponent implements OnChanges {
  @Input() IsOpen = false;
  @Input() Item: LibraryItemSummary | null = null;
  @Input() VersionNumber: number | null = null;
  @Input() Drives: LibraryDriveSummary[] = [];
  @Input() CurrentUser!: UserInfo;
  @Input() StorageClientOverride: GraphQLFileStorageClient | null = null;

  @Output() Published = new EventEmitter<{ AccountId: string; ObjectPath: string }>();
  @Output() Cancelled = new EventEmitter<void>();

  public SelectedAccountId = '';
  public FolderPrefix = '';
  public SelectedFormat: LibraryDriveExportFormat = 'docx';
  public FormatOptions: Array<{ Format: LibraryDriveExportFormat; Label: string }> = [];
  public FileName = '';
  public IsExporting = false;
  public ErrorMessage = '';
  public PendingOverwritePath: string | null = null;

  private readonly creationService = inject(LibraryCreationService);
  private readonly notifications = inject(MJNotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  public get EffectiveVersionNumber(): number {
    return this.VersionNumber ?? this.Item?.LatestVersionNumber ?? 1;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen && this.Item) {
      this.FormatOptions = this.creationService.GetSupportedDriveExportFormats(
        this.Item.DriverClass,
        this.Item.TypeName,
        this.Item.ContentMode,
        this.Item.FileName,
      );
      this.SelectedFormat = this.FormatOptions[0]?.Format ?? 'txt';
      this.SelectedAccountId = this.Drives[0]?.AccountId ?? '';
      this.FileName = this.Item.Name;
      this.ErrorMessage = '';
      this.PendingOverwritePath = null;
    }
  }

  public ClearOverwritePrompt(): void {
    this.PendingOverwritePath = null;
    this.ErrorMessage = '';
  }

  public async ExportNow(confirmOverwrite = false): Promise<void> {
    if (!this.Item || !this.SelectedAccountId || this.IsExporting) return;
    this.IsExporting = true;
    this.ErrorMessage = '';
    this.cdr.detectChanges();

    try {
      const versionEntity = await this.resolveTargetVersionEntity(this.Item);
      const content = versionEntity?.Content ?? '';
      const configuration = versionEntity?.Configuration ?? null;

      const published = await this.creationService.PublishArtifactVersionToConnectedDrive({
        ArtifactName: this.Item.Name,
        VersionContent: content,
        VersionConfiguration: configuration,
        VersionContentMode: versionEntity?.ContentMode ?? this.Item.ContentMode,
        ArtifactVersionID: versionEntity?.ID ?? this.Item.LatestVersionId,
        VersionFileID: versionEntity?.FileID ?? null,
        VersionMimeType: versionEntity?.MimeType ?? this.Item.MimeType,
        VersionFileName: versionEntity?.FileName ?? this.Item.FileName,
        Format: this.SelectedFormat,
        AccountID: this.SelectedAccountId,
        TargetFolderPrefix: this.FolderPrefix,
        TargetFileName: this.FileName,
        AllowOverwrite: confirmOverwrite,
        CurrentUser: this.CurrentUser,
        Provider: this.ProviderToUse,
        StorageClientOverride: this.StorageClientOverride ?? undefined,
      });

      this.PendingOverwritePath = null;
      this.notifications.CreateSimpleNotification(
        `Published "${published.ObjectPath}" to Connected Drive`,
        'success',
        3500,
      );
      this.Published.emit({
        AccountId: this.SelectedAccountId,
        ObjectPath: published.ObjectPath,
      });
    } catch (err) {
      if (err instanceof RemoteDriveFileExistsError) {
        this.PendingOverwritePath = err.ObjectPath;
        this.ErrorMessage = '';
      } else {
        this.ErrorMessage = err instanceof Error ? err.message : 'Export to Connected Drive failed.';
      }
    } finally {
      this.IsExporting = false;
      this.cdr.detectChanges();
    }
  }

  private async resolveTargetVersionEntity(
    item: LibraryItemSummary,
  ): Promise<MJArtifactVersionEntity | undefined> {
    const targetVersion = this.VersionNumber ?? item.LatestVersionNumber;
    if (this.VersionNumber != null && this.VersionNumber !== item.LatestVersionNumber) {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<MJArtifactVersionEntity>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(item.Id)}' AND VersionNumber=${Number(targetVersion)}`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        this.CurrentUser,
      );
      if (res.Success && res.Results && res.Results.length > 0) {
        return res.Results[0];
      }
    }
    if (item.LatestVersionId) {
      return ArtifactMetadataEngine.Instance.GetVersionContent(
        item.LatestVersionId,
        this.CurrentUser,
        this.ProviderToUse,
      );
    }
    return undefined;
  }
}
