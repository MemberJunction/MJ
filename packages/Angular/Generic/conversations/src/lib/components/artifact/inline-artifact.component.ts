import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Inline artifact display component that embeds rich artifact cards in conversation messages
 * Shows artifact preview, type badge, quick actions, and metadata
 */
@Component({
  selector: 'mj-inline-artifact',
  template: `
    <div class="inline-artifact-card" [class.loading]="loading" [class.error]="error">
      @if (loading) {
        <div class="artifact-skeleton">
          <div class="skeleton-header"></div>
          <div class="skeleton-content"></div>
          <div class="skeleton-actions"></div>
        </div>
      } @else if (error) {
        <div class="artifact-error">
          <i class="fa-solid fa-exclamation-circle"></i>
          <span>Failed to load artifact</span>
        </div>
      } @else if (artifact) {
        <div class="artifact-card" (click)="openFullView()">
          <!-- Header -->
          <div class="artifact-header">
            <div class="artifact-title-row">
              <div class="artifact-icon">
                <i class="fa-solid" [ngClass]="getArtifactIcon()"></i>
              </div>
              <div class="artifact-title">
                <span class="artifact-name">{{ artifact.Name }}</span>
                @if (isNew) {
                  <span class="new-badge">NEW</span>
                }
              </div>
            </div>
            <div class="artifact-meta">
              <span class="artifact-type-badge" [style.background]="getTypeBadgeColor()">
                {{ artifact.Type }}
              </span>
              <span class="artifact-version">v{{ currentVersion?.VersionNumber || 1 }}</span>
              @if (artifact.Description) {
                <span class="artifact-description">{{ artifact.Description }}</span>
              }
            </div>
          </div>

          <!-- Preview Content -->
          <div class="artifact-preview">
            @if (previewLines.length > 0) {
              <div class="preview-content" [class.code-preview]="isCodeArtifact">
                @for (line of previewLines; track $index; let i = $index) {
                  <div class="preview-line">
                    @if (isCodeArtifact) {
                      <span class="line-number">{{ i + 1 }}</span>
                    }
                    <span class="line-content">{{ line }}</span>
                  </div>
                }
                @if (hasMoreContent) {
                  <div class="preview-more">
                    <span>Show {{ remainingLines }} more lines...</span>
                  </div>
                }
              </div>
            } @else {
              <div class="preview-empty">
                <i class="fa-solid fa-file"></i>
                <span>No preview available</span>
              </div>
            }
          </div>

          <!-- Quick Actions Bar -->
          <div class="artifact-actions" (click)="$event.stopPropagation()">
            <button class="action-btn" (click)="saveToLibrary($event)" title="Save to Library">
              <i class="fa-solid fa-bookmark"></i>
              <span>Save</span>
            </button>
            <button class="action-btn" (click)="forkArtifact($event)" title="Fork">
              <i class="fa-solid fa-code-branch"></i>
              <span>Fork</span>
            </button>
            <button class="action-btn" (click)="viewHistory($event)" title="View History">
              <i class="fa-solid fa-history"></i>
              <span>History</span>
            </button>
            <button class="action-btn" (click)="shareArtifact($event)" title="Share">
              <i class="fa-solid fa-share-nodes"></i>
              <span>Share</span>
            </button>
            <button class="action-btn primary" (click)="openFullView($event)" title="View Full Artifact">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
              <span>Open</span>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .inline-artifact-card {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
      transition: all 200ms ease;
    }

    .artifact-skeleton {
      padding: 16px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
    }

    .skeleton-header {
      height: 24px;
      width: 60%;
      background: #E5E7EB;
      border-radius: 4px;
      margin-bottom: 12px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-content {
      height: 80px;
      background: #E5E7EB;
      border-radius: 4px;
      margin-bottom: 12px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-actions {
      height: 32px;
      width: 40%;
      background: #E5E7EB;
      border-radius: 4px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .artifact-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      background: #FEE2E2;
      border: 1px solid #FECACA;
      border-radius: 8px;
      color: #DC2626;
    }

    .artifact-error i {
      font-size: 18px;
    }

    .artifact-card {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-card:hover {
      border-color: #1e40af;
      box-shadow: 0 4px 12px rgba(30, 64, 175, 0.1);
    }

    /* Header */
    .artifact-header {
      padding: 16px;
      border-bottom: 1px solid #E5E7EB;
    }

    .artifact-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .artifact-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F3F4F6;
      border-radius: 6px;
      color: #6B7280;
      font-size: 18px;
    }

    .artifact-title {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .artifact-name {
      font-size: 15px;
      font-weight: 600;
      color: #111827;
    }

    .new-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #10B981;
      color: white;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      border-radius: 4px;
    }

    .artifact-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .artifact-type-badge {
      display: inline-block;
      padding: 4px 10px;
      color: white;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .artifact-version {
      font-size: 12px;
      color: #6B7280;
      font-weight: 500;
    }

    .artifact-description {
      font-size: 13px;
      color: #6B7280;
      flex: 1;
    }

    /* Preview */
    .artifact-preview {
      padding: 16px;
      background: #FAFAFA;
      max-height: 200px;
      overflow: hidden;
    }

    .preview-content {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .preview-content.code-preview {
      background: #1E1E1E;
      padding: 12px;
      border-radius: 6px;
      color: #D4D4D4;
    }

    .preview-line {
      display: flex;
      align-items: flex-start;
      white-space: pre;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line-number {
      display: inline-block;
      width: 40px;
      text-align: right;
      margin-right: 16px;
      color: #858585;
      user-select: none;
    }

    .line-content {
      flex: 1;
      word-break: break-all;
    }

    .preview-more {
      margin-top: 8px;
      padding: 8px;
      background: rgba(30, 64, 175, 0.05);
      border-radius: 4px;
      text-align: center;
      color: #1e40af;
      font-size: 12px;
      font-weight: 500;
    }

    .preview-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #9CA3AF;
    }

    .preview-empty i {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .preview-empty span {
      font-size: 13px;
    }

    /* Actions */
    .artifact-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #E5E7EB;
      background: white;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .action-btn:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
      color: #111827;
    }

    .action-btn.primary {
      background: #1e40af;
      border-color: #1e40af;
      color: white;
    }

    .action-btn.primary:hover {
      background: #1e3a8a;
      border-color: #1e3a8a;
    }

    .action-btn i {
      font-size: 14px;
    }
  `]
})
export class InlineArtifactComponent implements OnInit, OnDestroy {
  @Input() artifactId!: string;
  @Input() versionNumber?: number;
  @Input() currentUser!: UserInfo;
  @Output() actionPerformed = new EventEmitter<{action: string; artifact: ArtifactEntity}>();

  public artifact: ArtifactEntity | null = null;
  public currentVersion: ArtifactVersionEntity | null = null;
  public loading = true;
  public error = false;
  public previewLines: string[] = [];
  public hasMoreContent = false;
  public remainingLines = 0;

  private readonly PREVIEW_LINES = 10;
  private destroy$ = new Subject<void>();

  constructor(private artifactState: ArtifactStateService) {}

  async ngOnInit(): Promise<void> {
    await this.loadArtifact();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadArtifact(): Promise<void> {
    if (!this.artifactId) {
      this.error = true;
      this.loading = false;
      return;
    }

    try {
      this.loading = true;
      this.error = false;

      // Load artifact
      this.artifact = await this.artifactState.loadArtifact(this.artifactId, this.currentUser);

      if (!this.artifact) {
        this.error = true;
        return;
      }

      // Load version content
      await this.loadVersionContent();

    } catch (err) {
      console.error('Error loading artifact:', err);
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  private async loadVersionContent(): Promise<void> {
    if (!this.artifact) return;

    try {
      const rv = new RunView();
      const filter = this.versionNumber
        ? `ArtifactID='${this.artifact.ID}' AND VersionNumber=${this.versionNumber}`
        : `ArtifactID='${this.artifact.ID}'`;

      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.currentVersion = result.Results[0];
        this.generatePreview();
      }
    } catch (err) {
      console.error('Error loading version content:', err);
    }
  }

  private generatePreview(): void {
    if (!this.currentVersion?.Content) {
      this.previewLines = [];
      return;
    }

    const lines = this.currentVersion.Content.split('\n');
    this.previewLines = lines.slice(0, this.PREVIEW_LINES);
    this.hasMoreContent = lines.length > this.PREVIEW_LINES;
    this.remainingLines = Math.max(0, lines.length - this.PREVIEW_LINES);
  }

  public get isNew(): boolean {
    if (!this.artifact) return false;
    const createdAt = new Date(this.artifact.__mj_CreatedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  }

  public get isCodeArtifact(): boolean {
    if (!this.artifact) return false;
    const name = this.artifact.Name?.toLowerCase() || '';
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.sql', '.html', '.css', '.scss'];
    return codeExtensions.some(ext => name.endsWith(ext));
  }

  public getArtifactIcon(): string {
    if (!this.artifact) return 'fa-file';

    const name = this.artifact.Name?.toLowerCase() || '';
    const type = this.artifact.Type?.toLowerCase() || '';

    if (type.includes('code') || this.isCodeArtifact) return 'fa-file-code';
    if (type.includes('report')) return 'fa-chart-line';
    if (type.includes('dashboard')) return 'fa-chart-bar';
    if (type.includes('document') || name.endsWith('.md')) return 'fa-file-lines';
    if (name.endsWith('.json')) return 'fa-file-code';
    if (name.endsWith('.html')) return 'fa-file-code';

    return 'fa-file';
  }

  public getTypeBadgeColor(): string {
    if (!this.artifact) return '#6B7280';

    const type = this.artifact.Type?.toLowerCase() || '';

    if (type.includes('code')) return '#8B5CF6'; // Purple
    if (type.includes('report')) return '#3B82F6'; // Blue
    if (type.includes('dashboard')) return '#10B981'; // Green
    if (type.includes('document')) return '#F59E0B'; // Orange

    return '#6B7280'; // Gray
  }

  public openFullView(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (this.artifact) {
      this.artifactState.openArtifact(this.artifact.ID, this.versionNumber);
      this.actionPerformed.emit({ action: 'open', artifact: this.artifact });
    }
  }

  public saveToLibrary(event: Event): void {
    event.stopPropagation();
    if (this.artifact) {
      this.actionPerformed.emit({ action: 'save', artifact: this.artifact });
    }
  }

  public forkArtifact(event: Event): void {
    event.stopPropagation();
    if (this.artifact) {
      this.actionPerformed.emit({ action: 'fork', artifact: this.artifact });
    }
  }

  public viewHistory(event: Event): void {
    event.stopPropagation();
    if (this.artifact) {
      this.artifactState.openArtifact(this.artifact.ID);
      this.artifactState.setPanelMode('view');
      // Note: Parent component should switch to history tab
      this.actionPerformed.emit({ action: 'history', artifact: this.artifact });
    }
  }

  public shareArtifact(event: Event): void {
    event.stopPropagation();
    if (this.artifact) {
      this.actionPerformed.emit({ action: 'share', artifact: this.artifact });
    }
  }
}
