import { Component, Input, Output, EventEmitter } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { RecentItem, FavoriteItem } from '../../models/explorer-state.interface';

@Component({
  selector: 'mj-explorer-navigation-panel',
  templateUrl: './navigation-panel.component.html',
  styleUrls: ['./navigation-panel.component.css']
})
export class NavigationPanelComponent {
  @Input() entities: EntityInfo[] = [];
  @Input() selectedEntityName: string | null = null;
  @Input() favorites: FavoriteItem[] = [];
  @Input() recentItems: RecentItem[] = [];
  @Input() collapsed = false;

  // Section expansion states
  @Input() favoritesSectionExpanded = true;
  @Input() recentSectionExpanded = true;
  @Input() entitiesSectionExpanded = true;
  @Input() viewsSectionExpanded = true;

  @Output() entitySelected = new EventEmitter<EntityInfo>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() sectionToggled = new EventEmitter<'favorites' | 'recent' | 'entities' | 'views'>();

  // Entity search/filter
  public entitySearchTerm = '';

  /**
   * Get filtered entities based on search term
   */
  get filteredEntities(): EntityInfo[] {
    if (!this.entitySearchTerm) {
      return this.entities;
    }
    const term = this.entitySearchTerm.toLowerCase();
    return this.entities.filter(e =>
      e.Name.toLowerCase().includes(term) ||
      (e.Description && e.Description.toLowerCase().includes(term))
    );
  }

  /**
   * Get favorites filtered to records only
   */
  get favoriteRecords(): FavoriteItem[] {
    return this.favorites.filter(f => f.type === 'record');
  }

  /**
   * Get favorites filtered to entities only
   */
  get favoriteEntities(): FavoriteItem[] {
    return this.favorites.filter(f => f.type === 'entity');
  }

  /**
   * Handle entity click
   */
  onEntityClick(entity: EntityInfo): void {
    this.entitySelected.emit(entity);
  }

  /**
   * Handle favorite click
   */
  onFavoriteClick(favorite: FavoriteItem): void {
    if (favorite.type === 'entity' && favorite.entityName) {
      const entity = this.entities.find(e => e.Name === favorite.entityName);
      if (entity) {
        this.entitySelected.emit(entity);
      }
    }
    // Record favorites would need different handling - navigate to record
  }

  /**
   * Handle recent item click
   */
  onRecentClick(item: RecentItem): void {
    const entity = this.entities.find(e => e.Name === item.entityName);
    if (entity) {
      this.entitySelected.emit(entity);
      // Note: The parent component should also navigate to the specific record
    }
  }

  /**
   * Handle section header click
   */
  onSectionToggle(section: 'favorites' | 'recent' | 'entities' | 'views'): void {
    this.sectionToggled.emit(section);
  }

  /**
   * Handle collapse toggle
   */
  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  /**
   * Check if entity is selected
   */
  isEntitySelected(entity: EntityInfo): boolean {
    return entity.Name === this.selectedEntityName;
  }

  /**
   * Get icon for entity
   */
  getEntityIcon(entity: EntityInfo): string {
    const icon = entity.Icon;
    if (!icon) {
      return 'fa-solid fa-table';
    }
    // If icon already has fa- prefix, use it as-is
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      // Ensure it has a style prefix (fa-solid, fa-regular, etc.)
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      // It's just "fa-something", add fa-solid prefix
      return `fa-solid ${icon}`;
    }
    // Check if it's just an icon name like "table" or "users"
    return `fa-solid fa-${icon}`;
  }

  /**
   * Format recent item timestamp
   */
  formatTimestamp(timestamp: Date): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }
}
