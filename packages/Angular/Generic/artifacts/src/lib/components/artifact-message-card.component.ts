import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, Type, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { ArtifactPreviewResolverService } from '../services/artifact-preview-resolver.service';
import { IArtifactPreviewComponent } from '../interfaces/artifact-viewer-plugin.interface';

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
        @if (previewComponentType && currentVersion) {
          <!-- Inline preview: a clickable wrapper still opens the full right-side viewer.
               Media controls inside the preview (video/audio) stop their own click propagation. -->
          <div class="artifact-preview-wrapper" (click)="openFullView()" [title]="displayName">
            <ng-container
              *ngComponentOutlet="previewComponentType; inputs: previewInputs"
            ></ng-container>
            <div class="artifact-preview-caption">
              <i class="fa-solid" [ngClass]="getArtifactIcon()"></i>
              <span class="artifact-name">{{ displayName }}</span>
              <span class="artifact-type-badge" [style.background]="getTypeBadgeColor()">
                {{ artifact.Type }}
              </span>
              <span class="artifact-version">v{{ currentVersion.VersionNumber || 1 }}</span>
              <span class="open-icon"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
            </div>
          </div>
        } @else {
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
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
    }

    .skeleton-icon {
      width: 32px;
      height: 32px;
      background: var(--mj-border-default);
      border-radius: 6px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-text {
      flex: 1;
      height: 32px;
      background: var(--mj-border-default);
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
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border: 1px solid color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-bg-surface));
      border-radius: 6px;
      color: var(--mj-status-error);
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
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-info-bar:hover {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-shadow-sm);
    }

    .artifact-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      flex-shrink: 0;
      color: var(--mj-text-muted);
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
      color: var(--mj-text-primary);
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
      color: var(--mj-text-inverse);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-radius: 3px;
      text-transform: uppercase;
    }

    .artifact-version {
      font-size: 11px;
      color: var(--mj-text-muted);
      font-weight: 500;
    }

    .open-icon {
      flex-shrink: 0;
      color: var(--mj-text-disabled);
      font-size: 14px;
      transition: color 200ms ease;
    }

    .artifact-info-bar:hover .open-icon {
      color: var(--mj-brand-primary);
    }

    .artifact-preview-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .artifact-preview-wrapper:hover {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-shadow-sm);
    }

    .artifact-preview-caption {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--mj-text-muted);
      font-size: 12px;
    }

    .artifact-preview-caption .artifact-name {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .artifact-preview-caption .open-icon {
      color: var(--mj-text-disabled);
      transition: color 200ms ease;
    }

    .artifact-preview-wrapper:hover .artifact-preview-caption .open-icon {
      color: var(--mj-brand-primary);
    }
  `]
})
export class ArtifactMessageCardComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  @Input() artifactId!: string;
  @Input() VersionNumber?: number;

  /** @deprecated Use {@link VersionNumber}. */
  @Input() set versionNumber(value: number | undefined) {
    this.VersionNumber = value;
  }
  /** @deprecated Use {@link VersionNumber}. */
  get versionNumber(): number | undefined {
    return this.VersionNumber;
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
  @Input() Artifact?: MJArtifactEntity;

  /** @deprecated Use {@link Artifact}. */
  @Input() set artifact(value: MJArtifactEntity | undefined) {
    this.Artifact = value;
  }
  /** @deprecated Use {@link Artifact}. */
  get artifact(): MJArtifactEntity | undefined {
    return this.Artifact;
  } // Optional - if provided, skips loading
  @Input() artifactVersion?: MJArtifactVersionEntity; // Optional - if provided, skips loading
  @Output() ActionPerformed = new EventEmitter<{action: string; artifact: MJArtifactEntity; version?: MJArtifactVersionEntity}>();

  /**
   * @deprecated Use {@link ActionPerformed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (actionPerformed) keeps working. Must stay AFTER ActionPerformed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() actionPerformed = this.ActionPerformed;

  public _artifact: MJArtifactEntity | null = null;  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
  public CurrentVersion: MJArtifactVersionEntity | null = null;

  /** @deprecated Use {@link CurrentVersion}. */
  public get _currentVersion(): MJArtifactVersionEntity | null {
    return this.CurrentVersion;
  }
  /** @deprecated Use {@link CurrentVersion}. */
  public set _currentVersion(value: MJArtifactVersionEntity | null) {
    this.CurrentVersion = value;
  }
  public Loading = true;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }
  public error = false;

  /**
   * Resolved inline-preview component for this artifact's type/contentType, or null when no plugin
   * exposes a matching preview (the card then falls back to its existing info-bar box). Resolved
   * SYNCHRONOUSLY up front (before the box renders) to avoid a flash / ExpressionChanged error.
   */
  public PreviewComponentType: Type<IArtifactPreviewComponent> | null = null;

  /** @deprecated Use {@link PreviewComponentType}. */
  public get previewComponentType(): Type<IArtifactPreviewComponent> | null {
    return this.PreviewComponentType;
  }
  /** @deprecated Use {@link PreviewComponentType}. */
  public set previewComponentType(value: Type<IArtifactPreviewComponent> | null) {
    this.PreviewComponentType = value;
  }

  /** Inputs forwarded to the dynamically rendered preview component via *ngComponentOutlet. */
  public PreviewInputs: Record<string, unknown> = {};

  /** @deprecated Use {@link PreviewInputs}. */
  public get previewInputs(): Record<string, unknown> {
    return this.PreviewInputs;
  }
  /** @deprecated Use {@link PreviewInputs}. */
  public set previewInputs(value: Record<string, unknown>) {
    this.PreviewInputs = value;
  }

  private destroy$ = new Subject<void>();
  private readonly previewResolver = inject(ArtifactPreviewResolverService);

  constructor(private artifactIconService: ArtifactIconService) {
  super();}

  async ngOnInit(): Promise<void> {
    // If entities are provided, use them directly
    if (this.Artifact && this.artifactVersion) {
      this._artifact = this.Artifact;
      this.CurrentVersion = this.artifactVersion;
      this.Loading = false;
    } else {
      // Otherwise load from database
      await this.loadArtifact();
    }
    // Resolve the inline preview once artifact + version are known. Synchronous so the correct
    // branch (preview vs. box) is decided before the template renders this state.
    this.resolvePreview();
  }

  /**
   * Pick the inline-preview component for this artifact, INDEPENDENTLY of the full viewer.
   * Type name comes from `artifact.Type`; content type from `artifactVersion.MimeType`.
   * No match → previewComponentType stays null → existing info-bar box renders unchanged.
   */
  private resolvePreview(): void {
    if (!this._artifact || !this.CurrentVersion) {
      this.PreviewComponentType = null;
      return;
    }
    this.PreviewComponentType = this.previewResolver.resolvePreviewComponent(
      this._artifact.Type,
      this.CurrentVersion.MimeType,
    );
    if (this.PreviewComponentType) {
      this.PreviewInputs = { artifactVersion: this.CurrentVersion };
    }
  }

  // Getters to access the internal properties
  public get ArtifactEntity(): MJArtifactEntity | null {
    return this._artifact;
  }

  /** @deprecated Use {@link ArtifactEntity}. */
  public get artifactEntity(): MJArtifactEntity | null {
    return this.ArtifactEntity;
  }

  public get currentVersion(): MJArtifactVersionEntity | null {  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    return this.CurrentVersion;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadArtifact(): Promise<void> {
    if (!this.artifactId) {
      this.error = true;
      this.Loading = false;
      return;
    }

    try {
      this.Loading = true;
      this.error = false;

      // Load artifact directly
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactEntity>({
        EntityName: 'MJ: Conversation Artifacts',
        ExtraFilter: `ID='${this.artifactId}'`,
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.CurrentUser);

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
      this.Loading = false;
    }
  }

  private async loadVersionContent(): Promise<void> {
    if (!this._artifact) return;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const filter = this.VersionNumber
        ? `ArtifactID='${this._artifact.ID}' AND VersionNumber=${this.VersionNumber}`
        : `ArtifactID='${this._artifact.ID}'`;

      const result = await rv.RunView<MJArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.CurrentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.CurrentVersion = result.Results[0];
      }
    } catch (err) {
      console.error('Error loading version content:', err);
    }
  }

  /**
   * Get the display name - prefer version-specific name if available, otherwise use artifact name
   */
  public get displayName(): string {
    if (this.CurrentVersion?.Name) {
      return this.CurrentVersion.Name;
    }
    return this._artifact?.Name || 'Untitled';
  }

  /**
   * Get the display description - prefer version-specific description if available, otherwise use artifact description
   */
  public get DisplayDescription(): string | null {
    if (this.CurrentVersion?.Description) {
      return this.CurrentVersion.Description;
    }
    return this._artifact?.Description || null;
  }

  /** @deprecated Use {@link DisplayDescription}. */
  public get displayDescription(): string | null {
    return this.DisplayDescription;
  }

  public get IsCodeArtifact(): boolean {
    if (!this._artifact) return false;
    const name = this._artifact.Name?.toLowerCase() || '';
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.sql', '.html', '.css', '.scss'];
    return codeExtensions.some(ext => name.endsWith(ext));
  }

  /** @deprecated Use {@link IsCodeArtifact}. */
  public get isCodeArtifact(): boolean {
    return this.IsCodeArtifact;
  }

  /**
   * Get the icon for this artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  public GetArtifactIcon(): string {
    if (!this._artifact) return 'fa-file';
    return this.artifactIconService.getArtifactIcon(this._artifact);
  }

  /** @deprecated Use {@link GetArtifactIcon}. */
  public getArtifactIcon(): string {
    return this.GetArtifactIcon();
  }

  public GetTypeBadgeColor(): string {
    if (!this._artifact) return '#6B7280';

    const type = this._artifact.Type?.toLowerCase() || '';

    if (type.includes('code')) return '#8B5CF6'; // Purple
    if (type.includes('report')) return '#3B82F6'; // Blue
    if (type.includes('dashboard')) return '#10B981'; // Green
    if (type.includes('document')) return '#F59E0B'; // Orange

    return '#6B7280'; // Gray
  }

  /** @deprecated Use {@link GetTypeBadgeColor}. */
  public getTypeBadgeColor(): string {
    return this.GetTypeBadgeColor();
  }

  public OpenFullView(): void {
    if (this._artifact) {
      this.ActionPerformed.emit({ action: 'open', artifact: this._artifact, version: this.CurrentVersion || undefined });
    }
  }

  /** @deprecated Use {@link OpenFullView}. */
  public openFullView(): void {
    return this.OpenFullView();
  }
}
