import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Metadata } from '@memberjunction/core';
import type { MJListEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import type { AudienceSource } from '@memberjunction/lists-base';

/**
 * Compact, read-only summary of an `AudienceSource`. Resolves names
 * (list / view → display name) so the user sees the audience as
 * "VIP Donors Q4 2026 (List, 348 records)" rather than a raw UUID.
 *
 * Pairs naturally with `AudienceSourcePickerComponent`: bind the same
 * `Source` to both, and the summary reflects the picker's current
 * selection live.
 */
@Component({
  standalone: false,
  selector: 'mj-audience-source-summary',
  templateUrl: './audience-source-summary.component.html',
  styleUrls: ['./audience-source-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudienceSourceSummaryComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input()
  set Source(value: AudienceSource | null) {
    this._source = value;
    if (value) void this.resolveLabel(value);
    else this.label = null;
  }
  get Source(): AudienceSource | null {
    return this._source;
  }
  private _source: AudienceSource | null = null;

  /** Optional pre-computed count to surface (e.g., from a prior resolve). */
  @Input() RecordCount: number | null = null;

  public label: string | null = null;
  public icon = 'fa-solid fa-bullseye';

  public get kindLabel(): string {
    if (!this._source) return '';
    if (this._source.kind === 'list') return 'List';
    if (this._source.kind === 'view') return 'View';
    return 'Ad-hoc Filter';
  }

  /**
   * Resolve a human-readable label for the source. Names are looked up
   * one-at-a-time; cheap because each picker change fires at most once.
   * Falls back to the underlying ID if the lookup fails — the summary
   * is informational, never load-bearing.
   */
  private async resolveLabel(source: AudienceSource): Promise<void> {
    try {
      const md = (this.ProviderToUse as unknown as Metadata) ?? new Metadata();
      if (source.kind === 'list') {
        const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', this.ProviderToUse.CurrentUser ?? undefined);
        const loaded = await list.Load(source.listId);
        this.label = loaded ? list.Name : source.listId;
        this.icon = 'fa-solid fa-list';
      } else if (source.kind === 'view') {
        const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', this.ProviderToUse.CurrentUser ?? undefined);
        const loaded = await view.Load(source.viewId);
        this.label = loaded ? view.Name : source.viewId;
        this.icon = 'fa-solid fa-eye';
      } else {
        this.label = `${source.entityName} — ${this.truncate(source.extraFilter, 80)}`;
        this.icon = 'fa-solid fa-filter';
      }
    } catch {
      this.label = '(unable to resolve)';
    } finally {
      this.cdr.markForCheck();
    }
  }

  private truncate(s: string, n: number): string {
    return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
  }
}
