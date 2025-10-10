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
      } @else if (_artifact) {
        <div class="artifact-card" (click)="openFullView()">
          <div class="artifact-icon">
            <i class="fa-solid" [ngClass]="getArtifactIcon()"></i>
          </div>
          <div class="artifact-content">
            <div class="artifact-title">{{ displayName }}</div>
            <div class="artifact-meta">
              <span class="artifact-type-badge" [style.background]="getTypeBadgeColor()">
                {{ _artifact.Type }}
              </span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .inline-artifact-card {
      margin: 12px 0;
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
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-card:hover {
      border-color: #1e40af;
      box-shadow: 0 2px 8px rgba(30, 64, 175, 0.1);
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
      flex-shrink: 0;
    }

    .artifact-content {
      flex: 1;
      min-width: 0;
    }

    .artifact-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .artifact-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .artifact-type-badge {
      display: inline-block;
      padding: 2px 8px;
      color: white;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-radius: 4px;
      text-transform: uppercase;
    }
  `]
})
export class InlineArtifactComponent implements OnInit, OnDestroy {
  @Input() artifactId!: string;
  @Input() versionNumber?: number;
  @Input() currentUser!: UserInfo;
  @Input() artifact?: ArtifactEntity; // Optional - if provided, skips loading
  @Input() artifactVersion?: ArtifactVersionEntity; // Optional - if provided, skips loading
  @Output() actionPerformed = new EventEmitter<{action: string; artifact: ArtifactEntity; version?: ArtifactVersionEntity}>();

  public _artifact: ArtifactEntity | null = null;
  public _currentVersion: ArtifactVersionEntity | null = null;
  public loading = true;
  public error = false;

  private destroy$ = new Subject<void>();

  constructor(private artifactState: ArtifactStateService) {}

  async ngOnInit(): Promise<void> {
    // If entities are provided, use them directly
    if (this.artifact && this.artifactVersion) {
      this._artifact = this.artifact;
      this._currentVersion = this.artifactVersion;
      this.loading = false;
    } else {
      // Otherwise load from database
      await this.loadArtifact();
    }
  }

  // Getters to access the internal properties
  public get artifactEntity(): ArtifactEntity | null {
    return this._artifact;
  }

  public get currentVersion(): ArtifactVersionEntity | null {
    return this._currentVersion;
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
      this._artifact = await this.artifactState.loadArtifact(this.artifactId, this.currentUser);

      if (!this._artifact) {
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
    if (!this._artifact) return;

    try {
      const rv = new RunView();
      const filter = this.versionNumber
        ? `ArtifactID='${this._artifact.ID}' AND VersionNumber=${this.versionNumber}`
        : `ArtifactID='${this._artifact.ID}'`;

      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this._currentVersion = result.Results[0];
      }
    } catch (err) {
      console.error('Error loading version content:', err);
    }
  }

  /**
   * Get the display name - prefer version-specific name if available, otherwise use artifact name
   */
  public get displayName(): string {
    if (this._currentVersion?.Name) {
      return this._currentVersion.Name;
    }
    return this._artifact?.Name || 'Untitled';
  }

  /**
   * Get the display description - prefer version-specific description if available, otherwise use artifact description
   */
  public get displayDescription(): string | null {
    if (this._currentVersion?.Description) {
      return this._currentVersion.Description;
    }
    return this._artifact?.Description || null;
  }

  public get isNew(): boolean {
    if (!this._artifact) return false;
    const createdAt = new Date(this._artifact.__mj_CreatedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  }

  public get isCodeArtifact(): boolean {
    if (!this._artifact) return false;
    const name = this._artifact.Name?.toLowerCase() || '';
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.sql', '.html', '.css', '.scss'];
    return codeExtensions.some(ext => name.endsWith(ext));
  }

  public getArtifactIcon(): string {
    if (!this._artifact) return 'fa-file';

    const name = this._artifact.Name?.toLowerCase() || '';
    const type = this._artifact.Type?.toLowerCase() || '';

    if (type.includes('code') || this.isCodeArtifact) return 'fa-file-code';
    if (type.includes('report')) return 'fa-chart-line';
    if (type.includes('dashboard')) return 'fa-chart-bar';
    if (type.includes('document') || name.endsWith('.md')) return 'fa-file-lines';
    if (name.endsWith('.json')) return 'fa-file-code';
    if (name.endsWith('.html')) return 'fa-file-code';

    return 'fa-file';
  }

  public getTypeBadgeColor(): string {
    if (!this._artifact) return '#6B7280';

    const type = this._artifact.Type?.toLowerCase() || '';

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

    if (this._artifact) {
      // Only emit the action - don't call artifactState.openArtifact()
      // Let the parent decide how to handle (opens side panel, not modal)
      this.actionPerformed.emit({ action: 'open', artifact: this._artifact, version: this._currentVersion || undefined });
    }
  }
}
