import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';

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
        <div *ngIf="versions.length === 0" class="empty-state">
          <i class="fas fa-history"></i>
          <p>No version history available</p>
        </div>

        <div
          *ngFor="let version of versions"
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

          <div class="version-actions" *ngIf="version.VersionNumber === selectedVersion">
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
        </div>
      </div>

      <div class="diff-panel" *ngIf="showDiff && currentVersionContent && previousVersionContent && selectedVersion">
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

    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; color: #999; }
    .empty-state i { font-size: 48px; margin-bottom: 16px; }
    .empty-state p { margin: 0; font-size: 14px; }

    .diff-panel { border-top: 2px solid #D9D9D9; max-height: 50%; overflow: hidden; display: flex; flex-direction: column; }
    .diff-header { padding: 12px 16px; background: #F8F8F8; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .diff-header h4 { margin: 0; font-size: 13px; font-weight: 600; }
    .btn-close-diff { padding: 4px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #666; }
    .btn-close-diff:hover { background: rgba(0,0,0,0.1); }
    .diff-content { flex: 1; overflow-y: auto; padding: 16px; }
    .diff-content pre { margin: 0; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; }
  `]
})
export class ArtifactVersionHistoryComponent implements OnInit {
  @Input() artifact!: ArtifactEntity;
  @Input() currentUser!: UserInfo;

  @Output() closed = new EventEmitter<void>();
  @Output() versionRestored = new EventEmitter<number>();
  @Output() versionSelected = new EventEmitter<number>();

  public versions: ArtifactVersionEntity[] = [];
  public selectedVersion: number | null = null;
  public showDiff: boolean = false;
  public currentVersionContent: string = '';
  public previousVersionContent: string = '';

  ngOnInit() {
    this.loadVersions();
  }

  private async loadVersions(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${this.artifact.ID}'`,
        OrderBy: 'VersionNumber DESC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.versions = result.Results || [];
      }
    } catch (error) {
      console.error('Failed to load version history:', error);
    }
  }

  onSelectVersion(version: ArtifactVersionEntity): void {
    this.selectedVersion = version.VersionNumber;
    this.versionSelected.emit(version.VersionNumber);
  }

  async onRestoreVersion(version: ArtifactVersionEntity): Promise<void> {
    if (!confirm(`Restore to version ${version.VersionNumber}? This will create a new version.`)) return;

    try {
      // Restoring creates a new version with the old content
      this.versionRestored.emit(version.VersionNumber);
      alert(`Version ${version.VersionNumber} has been restored as the latest version`);
    } catch (error) {
      console.error('Failed to restore version:', error);
      alert('Failed to restore version');
    }
  }

  async onCompareVersion(version: ArtifactVersionEntity): Promise<void> {
    if (version.VersionNumber === 1) {
      alert('Cannot compare: this is the first version');
      return;
    }

    try {
      this.currentVersionContent = version.Content || '';

      // Load previous version
      const previousVersion = this.versions.find(v => v.VersionNumber === version.VersionNumber - 1);
      if (previousVersion) {
        this.previousVersionContent = previousVersion.Content || '';
        this.showDiff = true;
      }
    } catch (error) {
      console.error('Failed to load version for comparison:', error);
      alert('Failed to compare versions');
    }
  }

  onDownloadVersion(version: ArtifactVersionEntity): void {
    try {
      const content = version.Content || '';
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.artifact.Name}_v${version.VersionNumber}.txt`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download version:', error);
      alert('Failed to download version');
    }
  }

  getContentSize(content: string | null): string {
    if (!content) return '0 B';
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getDiffSummary(): string {
    // Simple line-based diff summary
    const currentLines = this.currentVersionContent.split('\n');
    const previousLines = this.previousVersionContent.split('\n');

    const added = currentLines.length - previousLines.length;
    const summary = `Lines: ${previousLines.length} → ${currentLines.length} (${added > 0 ? '+' : ''}${added})\n\n`;

    // Show a simple comparison
    return summary + '(Full diff view would require a diff library)';
  }

  onClose(): void {
    this.closed.emit();
  }
}