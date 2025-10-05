import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ArtifactEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-collection-artifact-card',
  template: `
    <div class="artifact-card" (click)="onSelect()">
      <div class="card-icon">
        <i class="fas" [ngClass]="getIconClass()"></i>
      </div>
      <div class="card-content">
        <div class="card-header">
          <h4 class="artifact-name">{{ artifact.Name }}</h4>
          <span class="artifact-type">{{ artifact.Type }}</span>
        </div>
        <div class="artifact-description" *ngIf="artifact.Description">
          {{ artifact.Description }}
        </div>
        <div class="artifact-meta">
          <span class="meta-item" *ngIf="artifact.__mj_UpdatedAt">
            <i class="fas fa-clock"></i> {{ artifact.__mj_UpdatedAt | date:'short' }}
          </span>
        </div>
      </div>
      <div class="card-actions">
        <button class="action-btn" (click)="onView($event)" title="View">
          <i class="fas fa-eye"></i>
        </button>
        <button class="action-btn" (click)="onEdit($event)" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="action-btn" (click)="onRemove($event)" title="Remove from collection">
          <i class="fas fa-times"></i>
        </button>
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
export class CollectionArtifactCardComponent {
  @Input() artifact!: ArtifactEntity;

  @Output() selected = new EventEmitter<ArtifactEntity>();
  @Output() viewed = new EventEmitter<ArtifactEntity>();
  @Output() edited = new EventEmitter<ArtifactEntity>();
  @Output() removed = new EventEmitter<ArtifactEntity>();

  getIconClass(): string {
    const type = this.artifact.Type?.toLowerCase() || '';

    if (type.includes('code')) return 'fa-code';
    if (type.includes('markdown')) return 'fa-file-lines';
    if (type.includes('html')) return 'fa-file-code';
    if (type.includes('json')) return 'fa-brackets-curly';
    if (type.includes('text')) return 'fa-file-alt';

    return 'fa-file';
  }

  onSelect(): void {
    this.selected.emit(this.artifact);
  }

  onView(event: Event): void {
    event.stopPropagation();
    this.viewed.emit(this.artifact);
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