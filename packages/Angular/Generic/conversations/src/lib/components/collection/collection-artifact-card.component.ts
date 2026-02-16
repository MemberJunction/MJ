import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
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
        <button class="action-btn" (click)="onView($event)" title="View">
          <i class="fas fa-eye"></i>
        </button>
        @if (canShare) {
          <button class="action-btn" (click)="onShare($event)" title="Share">
            <i class="fas fa-share-nodes"></i>
          </button>
        }
        @if (canEdit) {
          <button class="action-btn" (click)="onEdit($event)" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
        }
        @if (canEdit) {
          <button class="action-btn" (click)="onRemove($event)" title="Remove from collection">
            <i class="fas fa-times"></i>
          </button>
        }
      </div>
    </div>
    `,
  styles: [`
    .artifact-card { display: flex; gap: 16px; padding: 16px; border: 1px solid #E8E8E8; border-radius: 8px; cursor: pointer; transition: all 150ms ease; background: white; }
    .artifact-card:hover { border-color: #0076B6; box-shadow: 0 2px 8px rgba(0,118,182,0.1); }

    .card-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 8px; background: #F0F8FF; color: #0076B6; font-size: 20px; }

    .card-content { flex: 1; min-width: 0; }
    .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .artifact-name { margin: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .version-badge { padding: 2px 8px; background: #FFF3E0; color: #E65100; border-radius: 3px; font-size: 11px; font-weight: 600; font-family: monospace; }
    .artifact-type { padding: 2px 8px; background: #E3F2FD; color: #1976D2; border-radius: 3px; font-size: 11px; font-weight: 500; text-transform: uppercase; }

    .artifact-description { font-size: 13px; color: #666; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .artifact-meta { display: flex; gap: 16px; font-size: 12px; color: #999; }
    .meta-item { display: flex; align-items: center; gap: 4px; }

    .card-actions { display: none; align-items: center; gap: 4px; }
    .artifact-card:hover .card-actions { display: flex; }
    .action-btn { padding: 8px; background: transparent; border: none; cursor: pointer; border-radius: 4px; color: #666; transition: all 150ms ease; }
    .action-btn:hover { background: #F4F4F4; color: #0076B6; }
  `]
})
export class CollectionArtifactCardComponent implements OnInit, OnChanges {
  @Input() artifact!: MJArtifactEntity;
  @Input() version?: MJArtifactVersionEntity; // Optional version info
  @Input() currentUser!: UserInfo;

  @Output() selected = new EventEmitter<any>();
  @Output() viewed = new EventEmitter<any>();
  @Output() shared = new EventEmitter<any>();
  @Output() edited = new EventEmitter<any>();
  @Output() removed = new EventEmitter<any>();

  canShare: boolean = false;
  canEdit: boolean = false;

  constructor(
    private artifactPermissionService: ArtifactPermissionService,
    private artifactIconService: ArtifactIconService
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
    if (!this.artifact || !this.currentUser) return;

    try {
      this.canShare = await this.artifactPermissionService.checkPermission(
        this.artifact.ID,
        this.currentUser.ID,
        'share',
        this.currentUser
      );

      this.canEdit = await this.artifactPermissionService.checkPermission(
        this.artifact.ID,
        this.currentUser.ID,
        'edit',
        this.currentUser
      );
    } catch (err) {
      console.error('Error loading artifact permissions:', err);
    }
  }

  /**
   * Get the icon for this artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  getIconClass(): string {
    return this.artifactIconService.getArtifactIcon(this.artifact);
  }

  onSelect(): void {
    this.selected.emit(this.artifact);
  }

  onView(event: Event): void {
    event.stopPropagation();
    this.viewed.emit(this.artifact);
  }

  onShare(event: Event): void {
    event.stopPropagation();
    this.shared.emit(this.artifact);
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    this.edited.emit(this.artifact);
  }

  onRemove(event: Event): void {
    event.stopPropagation();
    this.removed.emit(this.artifact);
  }
}