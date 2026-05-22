import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import type { SharedListSummary, SharePermissionLevel } from '@memberjunction/lists-base';

/**
 * "Shared With Me" view (mockup 17). Lists every `MJ: List` the current
 * user has direct-share access to, plus a permission badge per row.
 *
 * Drop into the Lists app as a tab/resource. Click events bubble up via
 * `OpenList` so the host app can route through its own navigation
 * (NavigationService etc.) — keeps this component framework-agnostic.
 */
@Component({
  standalone: false,
  selector: 'mj-lists-shared-with-me',
  templateUrl: './shared-with-me.component.html',
  styleUrls: ['./shared-with-me.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListsSharedWithMeComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Emitted when the user clicks a card. Host wires this to navigation.
   *  Includes ListName so the host can open a properly-titled tab without
   *  a second fetch. */
  @Output() OpenList = new EventEmitter<{ ListID: string; ListName: string }>();

  /** Permission-level filter (empty = "All Permissions"). */
  public filterLevel: SharePermissionLevel | '' = '';

  /** Free-text filter on list name. */
  public filterText = '';

  public loading = false;
  public errorMessage: string | null = null;
  private allShares: SharedListSummary[] = [];

  async ngOnInit(): Promise<void> {
    await this.loadShares();
  }

  public get visibleShares(): SharedListSummary[] {
    const term = this.filterText.trim().toLowerCase();
    return this.allShares.filter((s) => {
      if (this.filterLevel && s.PermissionLevel !== this.filterLevel) return false;
      if (term && !s.ListName.toLowerCase().includes(term)) return false;
      return true;
    });
  }

  public OnFilterChange(): void {
    this.cdr.markForCheck();
  }

  public OnCardClick(listId: string): void {
    const share = this.allShares.find((s) => s.ListID === listId);
    this.OpenList.emit({ ListID: listId, ListName: share?.ListName ?? '' });
  }

  public async Refresh(): Promise<void> {
    await this.loadShares();
  }

  /**
   * Friendly-format the "shared at" timestamp into a relative phrase
   * ("3d ago", "2w ago"). Matches the mockup; falls back to absolute on
   * older entries.
   */
  public formatRelative(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return date.toLocaleDateString();
  }

  /** Badge variant class for the permission-level chip. */
  public badgeClass(level: SharePermissionLevel): string {
    switch (level) {
      case 'Owner':
        return 'badge--owner';
      case 'Edit':
        return 'badge--editor';
      default:
        return 'badge--viewer';
    }
  }

  public badgeLabel(level: SharePermissionLevel): string {
    switch (level) {
      case 'Owner':
        return 'Owner';
      case 'Edit':
        return 'Editor';
      default:
        return 'Viewer';
    }
  }

  private async loadShares(): Promise<void> {
    this.loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      this.allShares = await client.ListsSharedWithMe();
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
      this.allShares = [];
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
