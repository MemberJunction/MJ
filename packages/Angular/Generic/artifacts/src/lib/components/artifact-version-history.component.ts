import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { BuildVersionDownload } from './artifact-version-download.js';

@Component({
  standalone: false,
  selector: 'mj-artifact-version-history',
  template: `
    <div class="version-history">
      <div class="history-header">
        <h3>Version History</h3>
        <button class="btn-close" (click)="onClose()" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    
      <div class="version-list">
        @if (versions.length === 0) {
          <mj-empty-state
            Icon="fa-solid fa-clock-rotate-left"
            Title="No version history available"
            Size="compact" />
        }
    
        @for (version of versions; track version) {
          <div
            class="version-item"
            [class.selected]="version.VersionNumber === selectedVersion"
            (click)="onSelectVersion(version)">
            <div class="version-header">
              <div class="version-info">
                <span class="version-number">v{{ version.VersionNumber }}</span>
                <span class="version-date">{{ version.__mj_CreatedAt | date:'short' }}</span>
              </div>
              <div class="version-meta">
                <span class="version-size">
                  {{ getContentSize(version.Content) }}
                </span>
              </div>
            </div>
            @if (version.VersionNumber === selectedVersion) {
              <div class="version-actions">
                <button class="btn-action" (click)="onRestoreVersion(version); $event.stopPropagation()">
                  <i class="fas fa-undo"></i> Restore
                </button>
                <button class="btn-action" (click)="onCompareVersion(version); $event.stopPropagation()">
                  <i class="fas fa-code-compare"></i> Compare
                </button>
                <button class="btn-action" (click)="onDownloadVersion(version); $event.stopPropagation()">
                  <i class="fas fa-download"></i> Download
                </button>
              </div>
            }
          </div>
        }
      </div>
    
      @if (showDiff && currentVersionContent && previousVersionContent && selectedVersion) {
        <div class="diff-panel">
          <div class="diff-header">
            <h4>Changes from v{{ (selectedVersion || 1) - 1 }} to v{{ selectedVersion }}</h4>
            <button class="btn-close-diff" (click)="showDiff = false">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="diff-content">
            <pre>{{ getDiffSummary() }}</pre>
          </div>
        </div>
      }
    </div>
    `,
  styles: [`
    .version-history { display: flex; flex-direction: column; height: 100%; background: white; }
    .history-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .history-header h3 { margin: 0; font-size: 16px; }
    .btn-close { padding: 6px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .btn-close:hover { background: rgba(0,0,0,0.1); }

    .version-list { flex: 1; overflow-y: auto; }
    .version-item { padding: 16px; border-bottom: 1px solid #E8E8E8; cursor: pointer; transition: background 150ms ease; }
    .version-item:hover { background: #F9F9F9; }
    .version-item.selected { background: #E3F2FD; border-left: 3px solid #1976D2; }

    .version-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .version-info { display: flex; flex-direction: column; gap: 4px; }
    .version-number { font-size: 14px; font-weight: 600; }
    .version-date { font-size: 12px; color: #666; }
    .version-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 12px; color: #666; }
    .version-author { display: flex; align-items: center; gap: 4px; }
    .version-size { color: #999; }

    .version-notes { font-size: 13px; color: #333; margin-bottom: 8px; }

    .version-actions { display: flex; gap: 8px; margin-top: 12px; }
    .btn-action { padding: 6px 12px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .btn-action:hover { background: #005A8C; }

    .diff-panel { border-top: 2px solid #D9D9D9; max-height: 50%; overflow: hidden; display: flex; flex-direction: column; }
    .diff-header { padding: 12px 16px; background: #F8F8F8; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .diff-header h4 { margin: 0; font-size: 13px; font-weight: 600; }
    .btn-close-diff { padding: 4px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .btn-close-diff:hover { background: rgba(0,0,0,0.1); }
    .diff-content { flex: 1; overflow-y: auto; padding: 16px; }
    .diff-content pre { margin: 0; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; }
  `]
})
export class ArtifactVersionHistoryComponent extends BaseAngularComponent implements OnInit  {
  private confirmService = inject(MJConfirmService);

  @Input() Artifact!: MJArtifactEntity;

  /** @deprecated Use {@link Artifact}. */
  @Input() set artifact(value: MJArtifactEntity) {
    this.Artifact = value;
  }
  /** @deprecated Use {@link Artifact}. */
  get artifact(): MJArtifactEntity {
    return this.Artifact;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;
  @Output() VersionRestored = new EventEmitter<number>();

  /**
   * @deprecated Use {@link VersionRestored}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (versionRestored) keeps working. Must stay AFTER VersionRestored: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() versionRestored = this.VersionRestored;
  @Output() VersionSelected = new EventEmitter<number>();

  /**
   * @deprecated Use {@link VersionSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (versionSelected) keeps working. Must stay AFTER VersionSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() versionSelected = this.VersionSelected;

  public Versions: MJArtifactVersionEntity[] = [];

  /** @deprecated Use {@link Versions}. */
  public get versions(): MJArtifactVersionEntity[] {
    return this.Versions;
  }
  /** @deprecated Use {@link Versions}. */
  public set versions(value: MJArtifactVersionEntity[]) {
    this.Versions = value;
  }
  public SelectedVersion: number | null = null;

  /** @deprecated Use {@link SelectedVersion}. */
  public get selectedVersion(): number | null {
    return this.SelectedVersion;
  }
  /** @deprecated Use {@link SelectedVersion}. */
  public set selectedVersion(value: number | null) {
    this.SelectedVersion = value;
  }
  public ShowDiff: boolean = false;

  /** @deprecated Use {@link ShowDiff}. */
  public get showDiff(): boolean {
    return this.ShowDiff;
  }
  /** @deprecated Use {@link ShowDiff}. */
  public set showDiff(value: boolean) {
    this.ShowDiff = value;
  }
  public CurrentVersionContent: string = '';

  /** @deprecated Use {@link CurrentVersionContent}. */
  public get currentVersionContent(): string {
    return this.CurrentVersionContent;
  }
  /** @deprecated Use {@link CurrentVersionContent}. */
  public set currentVersionContent(value: string) {
    this.CurrentVersionContent = value;
  }
  public PreviousVersionContent: string = '';

  /** @deprecated Use {@link PreviousVersionContent}. */
  public get previousVersionContent(): string {
    return this.PreviousVersionContent;
  }
  /** @deprecated Use {@link PreviousVersionContent}. */
  public set previousVersionContent(value: string) {
    this.PreviousVersionContent = value;
  }

  ngOnInit() {
    this.loadVersions();
  }

  private async loadVersions(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${this.Artifact.ID}'`,
        OrderBy: 'VersionNumber DESC',
        ResultType: 'entity_object'
      }, this.CurrentUser);

      if (result.Success) {
        this.Versions = result.Results || [];
      }
    } catch (error) {
      console.error('Failed to load version history:', error);
    }
  }

  OnSelectVersion(version: MJArtifactVersionEntity): void {
    this.SelectedVersion = version.VersionNumber;
    this.VersionSelected.emit(version.VersionNumber);
  }

  /** @deprecated Use {@link OnSelectVersion}. */
  onSelectVersion(version: MJArtifactVersionEntity): void {
    return this.OnSelectVersion(version);
  }

  async OnRestoreVersion(version: MJArtifactVersionEntity): Promise<void> {
    if (!(await this.confirmService.Confirm({ title: 'Restore version', message: `Restore to version ${version.VersionNumber}?`, detail: 'This will create a new version.' }))) return;

    try {
      // Restoring creates a new version with the old content
      this.VersionRestored.emit(version.VersionNumber);
      alert(`Version ${version.VersionNumber} has been restored as the latest version`);
    } catch (error) {
      console.error('Failed to restore version:', error);
      alert('Failed to restore version');
    }
  }

  /** @deprecated Use {@link OnRestoreVersion}. */
  async onRestoreVersion(version: MJArtifactVersionEntity): Promise<void> {
    return this.OnRestoreVersion(version);
  }

  async OnCompareVersion(version: MJArtifactVersionEntity): Promise<void> {
    if (version.VersionNumber === 1) {
      alert('Cannot compare: this is the first version');
      return;
    }

    try {
      this.CurrentVersionContent = version.Content || '';

      // Load previous version
      const previousVersion = this.Versions.find(v => v.VersionNumber === version.VersionNumber - 1);
      if (previousVersion) {
        this.PreviousVersionContent = previousVersion.Content || '';
        this.ShowDiff = true;
      }
    } catch (error) {
      console.error('Failed to load version for comparison:', error);
      alert('Failed to compare versions');
    }
  }

  /** @deprecated Use {@link OnCompareVersion}. */
  async onCompareVersion(version: MJArtifactVersionEntity): Promise<void> {
    return this.OnCompareVersion(version);
  }

  OnDownloadVersion(version: MJArtifactVersionEntity): void {
    try {
      const content = version.Content || '';
      const download = BuildVersionDownload(content, version.FileName, this.Artifact.Name, version.VersionNumber, version.MimeType);
      const blob = new Blob([download.data], { type: download.mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = download.fileName;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download version:', error);
      alert('Failed to download version');
    }
  }

  /** @deprecated Use {@link OnDownloadVersion}. */
  onDownloadVersion(version: MJArtifactVersionEntity): void {
    return this.OnDownloadVersion(version);
  }

  GetContentSize(content: string | null): string {
    if (!content) return '0 B';
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** @deprecated Use {@link GetContentSize}. */
  getContentSize(content: string | null): string {
    return this.GetContentSize(content);
  }

  GetDiffSummary(): string {
    // Simple line-based diff summary
    const currentLines = this.CurrentVersionContent.split('\n');
    const previousLines = this.PreviousVersionContent.split('\n');

    const added = currentLines.length - previousLines.length;
    const summary = `Lines: ${previousLines.length} → ${currentLines.length} (${added > 0 ? '+' : ''}${added})\n\n`;

    // Show a simple comparison
    return summary + '(Full diff view would require a diff library)';
  }

  /** @deprecated Use {@link GetDiffSummary}. */
  getDiffSummary(): string {
    return this.GetDiffSummary();
  }

  OnClose(): void {
    this.Closed.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }
}