import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtifactIconService } from '../services/artifact-icon.service';

/**
 * Artifact message card component - displays a simple info bar for artifacts in conversation messages.
 * Shows artifact icon, name, type badge, and version. Click to open full artifact viewer.
 */
@Component({
  standalone: false,
  selector: 'mj-artifact-message-card',
  template: `
    <div class="artifact-message-card" [class.loading]="loading" [class.error]="error">
      @if (loading) {
        <div class="artifact-skeleton">
          <div class="skeleton-icon"></div>
          <div class="skeleton-text"></div>
        </div>
      } @else if (error) {
        <div class="artifact-error">
          <i class="fa-solid fa-exclamation-circle"></i>
          <span>Failed to load artifact</span>
        </div>
      } @else if (artifact) {
        <div class="artifact-info-bar" (click)="openFullView()">
          <div class="artifact-icon">
            <i class="fa-solid" [ngClass]="getArtifactIcon()"></i>
          </div>
          <div class="artifact-info">
            <span class="artifact-name">{{ displayName }}</span>
            <div class="artifact-meta">
              <span class="artifact-type-badge" [style.background]="getTypeBadgeColor()">
                {{ artifact.Type }}
              </span>
              <span class="artifact-version">v{{ currentVersion?.VersionNumber || 1 }}</span>
            </div>
          </div>
          <div class="open-icon">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .artifact-message-card {
      margin: 12px 0;
    }

    .artifact-skeleton {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
    }

    .skeleton-icon {
      width: 32px;
      height: 32px;
      background: #E5E7EB;
      border-radius: 6px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-text {
      flex: 1;
      height: 32px;
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
      padding: 12px 16px;
      background: #FEE2E2;
      border: 1px solid #FECACA;
      border-radius: 6px;
      color: #DC2626;
      font-size: 14px;
    }

    .artifact-error i {
      font-size: 16px;
    }

    .artifact-info-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-info-bar:hover {
      border-color: #1e40af;
      box-shadow: 0 2px 8px rgba(30, 64, 175, 0.1);
    }

    .artifact-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F3F4F6;
      border-radius: 6px;
      flex-shrink: 0;
      color: #6B7280;
      font-size: 16px;
    }

    .artifact-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .artifact-name {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
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
      border-radius: 3px;
      text-transform: uppercase;
    }

    .artifact-version {
      font-size: 11px;
      color: #6B7280;
      font-weight: 500;
    }

    .open-icon {
      flex-shrink: 0;
      color: #9CA3AF;
      font-size: 14px;
      transition: color 200ms ease;
    }

    .artifact-info-bar:hover .open-icon {
      color: #1e40af;
    }
  `]
})
export class ArtifactMessageCardComponent implements OnInit, OnDestroy {
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

  constructor(private artifactIconService: ArtifactIconService) {}

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

      // Load artifact directly
      const rv = new RunView();
      const result = await rv.RunView<ArtifactEntity>({
        EntityName: 'MJ: Conversation Artifacts',
        ExtraFilter: `ID='${this.artifactId}'`,
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this._artifact = result.Results[0];
        // Load version content
        await this.loadVersionContent();
      } else {
        this.error = true;
      }

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

  public get isCodeArtifact(): boolean {
    if (!this._artifact) return false;
    const name = this._artifact.Name?.toLowerCase() || '';
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.sql', '.html', '.css', '.scss'];
    return codeExtensions.some(ext => name.endsWith(ext));
  }

  /**
   * Get the icon for this artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  public getArtifactIcon(): string {
    if (!this._artifact) return 'fa-file';
    return this.artifactIconService.getArtifactIcon(this._artifact);
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

  public openFullView(): void {
    if (this._artifact) {
      this.actionPerformed.emit({ action: 'open', artifact: this._artifact, version: this._currentVersion || undefined });
    }
  }
}
