import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';

@Component({
  standalone: false,
  selector: 'mj-collection-artifact-card',
  template: `
    <div class="artifact-card" (click)="onSelect()">
      <div class="card-icon">
        <i class="fas" [ngClass]="getIconClass()"></i>
      </div>
      <div class="card-content">
        <div class="card-header">
          <h4 class="artifact-name">{{ artifact.Name }}</h4>
          @if (version) {
            <span class="version-badge">v{{ version.VersionNumber }}</span>
          }
          <span class="artifact-type">{{ artifact.Type }}</span>
        </div>
        @if (artifact.Description) {
          <div class="artifact-description">
            {{ artifact.Description }}
          </div>
        }
        <div class="artifact-meta">
          @if (version && version.__mj_UpdatedAt) {
            <span class="meta-item">
              <i class="fas fa-clock"></i> {{ version.__mj_UpdatedAt | date:'short' }}
            </span>
          }
        </div>
      </div>
      <div class="card-actions">
        <button mjButton variant="flat" size="sm" (click)="onView($event)" title="View">
          <i class="fas fa-eye"></i>
        </button>
        @if (canShare) {
          <button mjButton variant="flat" size="sm" (click)="onShare($event)" title="Share">
            <i class="fas fa-share-nodes"></i>
          </button>
        }
        @if (canEdit) {
          <button mjButton variant="flat" size="sm" (click)="onEdit($event)" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
        }
        @if (canEdit) {
          <button mjButton variant="danger" size="sm" (click)="onRemove($event)" title="Remove from collection">
            <i class="fas fa-times"></i>
          </button>
        }
      </div>
    </div>
    `,
  styles: [`
    .artifact-card { display: flex; gap: 16px; padding: 16px; border: 1px solid var(--mj-border-default); border-radius: 8px; cursor: pointer; transition: all 150ms ease; background: var(--mj-bg-surface); }
    .artifact-card:hover { border-color: var(--mj-brand-primary); box-shadow: var(--mj-shadow-sm); }

    .card-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 8px; background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); color: var(--mj-brand-primary); font-size: 20px; }

    .card-content { flex: 1; min-width: 0; }
    .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .artifact-name { margin: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .version-badge { padding: 2px 8px; background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface)); color: var(--mj-status-warning); border-radius: 3px; font-size: 11px; font-weight: 600; font-family: monospace; }
    .artifact-type { padding: 2px 8px; background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); color: var(--mj-brand-primary); border-radius: 3px; font-size: 11px; font-weight: 500; text-transform: uppercase; }

    .artifact-description { font-size: 13px; color: var(--mj-text-muted); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .artifact-meta { display: flex; gap: 16px; font-size: 12px; color: var(--mj-text-disabled); }
    .meta-item { display: flex; align-items: center; gap: 4px; }

    .card-actions { display: none; align-items: center; gap: 4px; }
    .artifact-card:hover .card-actions { display: flex; }
    .action-btn { padding: 8px; background: transparent; border: none; cursor: pointer; border-radius: 4px; color: var(--mj-text-muted); transition: all 150ms ease; }
    .action-btn:hover { background: var(--mj-bg-surface-sunken); color: var(--mj-brand-primary); }
  `]
})
export class CollectionArtifactCardComponent implements OnInit, OnChanges {
  @Input() Artifact!: MJArtifactEntity;

  /** @deprecated Use {@link Artifact}. */
  @Input() set artifact(value: MJArtifactEntity) {
    this.Artifact = value;
  }
  /** @deprecated Use {@link Artifact}. */
  get artifact(): MJArtifactEntity {
    return this.Artifact;
  }
  @Input() version?: MJArtifactVersionEntity; // Optional version info
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  @Output() Selected = new EventEmitter<any>();

  /**
   * @deprecated Use {@link Selected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (selected) keeps working. Must stay AFTER Selected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() selected = this.Selected;
  @Output() Viewed = new EventEmitter<any>();

  /**
   * @deprecated Use {@link Viewed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (viewed) keeps working. Must stay AFTER Viewed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() viewed = this.Viewed;
  @Output() Shared = new EventEmitter<any>();

  /**
   * @deprecated Use {@link Shared}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (shared) keeps working. Must stay AFTER Shared: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() shared = this.Shared;
  @Output() Edited = new EventEmitter<any>();

  /**
   * @deprecated Use {@link Edited}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (edited) keeps working. Must stay AFTER Edited: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() edited = this.Edited;
  @Output() Removed = new EventEmitter<any>();

  /**
   * @deprecated Use {@link Removed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (removed) keeps working. Must stay AFTER Removed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() removed = this.Removed;

  canShare: boolean = false;
  canEdit: boolean = false;

  constructor(
    private artifactPermissionService: ArtifactPermissionService,
    private artifactIconService: ArtifactIconService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPermissions();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['artifact'] && !changes['artifact'].isFirstChange()) {
      await this.loadPermissions();
    }
  }

  private async loadPermissions(): Promise<void> {
    if (!this.Artifact || !this.CurrentUser) return;

    try {
      this.canShare = await this.artifactPermissionService.checkPermission(
        this.Artifact.ID,
        this.CurrentUser.ID,
        'share',
        this.CurrentUser
      );

      this.canEdit = await this.artifactPermissionService.checkPermission(
        this.Artifact.ID,
        this.CurrentUser.ID,
        'edit',
        this.CurrentUser
      );
    } catch (err) {
      console.error('Error loading artifact permissions:', err);
    } finally {
      this.cdr.detectChanges(); // zone.js 0.15: async permission checks don't trigger CD
    }
  }

  /**
   * Get the icon for this artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  GetIconClass(): string {
    return this.artifactIconService.getArtifactIcon(this.Artifact);
  }

  /** @deprecated Use {@link GetIconClass}. */
  getIconClass(): string {
    return this.GetIconClass();
  }

  OnSelect(): void {
    this.Selected.emit(this.Artifact);
  }

  /** @deprecated Use {@link OnSelect}. */
  onSelect(): void {
    return this.OnSelect();
  }

  OnView(event: Event): void {
    event.stopPropagation();
    this.Viewed.emit(this.Artifact);
  }

  /** @deprecated Use {@link OnView}. */
  onView(event: Event): void {
    return this.OnView(event);
  }

  OnShare(event: Event): void {
    event.stopPropagation();
    this.Shared.emit(this.Artifact);
  }

  /** @deprecated Use {@link OnShare}. */
  onShare(event: Event): void {
    return this.OnShare(event);
  }

  OnEdit(event: Event): void {
    event.stopPropagation();
    this.Edited.emit(this.Artifact);
  }

  /** @deprecated Use {@link OnEdit}. */
  onEdit(event: Event): void {
    return this.OnEdit(event);
  }

  OnRemove(event: Event): void {
    event.stopPropagation();
    this.Removed.emit(this.Artifact);
  }

  /** @deprecated Use {@link OnRemove}. */
  onRemove(event: Event): void {
    return this.OnRemove(event);
  }
}