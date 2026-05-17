import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { MJTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';

/**
 * Compact tag chips for a single record (mockup 22). Loads tags by
 * querying `MJ: Tagged Items` filtered to `(EntityID, RecordID)`, then
 * resolves names from `MJ: Tags` in a single batch. Render-only by
 * default; pass `Editable=true` to surface an inline add field and
 * per-chip remove buttons.
 *
 * Intentionally lightweight — not a tag manager. For richer tag tooling
 * (cloud view, related records, etc.) use `mj-record-tags` from
 * `@memberjunction/ng-record-tags`.
 */

interface DisplayTag {
  /** TaggedItem row ID — used for removal. */
  TaggedItemID: string;
  /** Tag.ID — useful for downstream filtering / lookups. */
  TagID: string;
  /** Tag display name. */
  Name: string;
}

@Component({
  standalone: false,
  selector: 'mj-tag-chips',
  templateUrl: './tag-chips.component.html',
  styleUrls: ['./tag-chips.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagChipsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Entity name (e.g. 'MJ: Lists'). Required. */
  @Input()
  set EntityName(value: string | null) {
    if (this._entityName !== value) {
      this._entityName = value;
      if (this.initialized && value && this._recordId) void this.loadTags();
    }
  }
  get EntityName(): string | null {
    return this._entityName;
  }
  private _entityName: string | null = null;

  /** Record ID (the row's primary key, serialized). Required. */
  @Input()
  set RecordID(value: string | null) {
    if (this._recordId !== value) {
      this._recordId = value;
      if (this.initialized && value && this._entityName) void this.loadTags();
    }
  }
  get RecordID(): string | null {
    return this._recordId;
  }
  private _recordId: string | null = null;

  /** When true, shows add input + remove buttons on chips. */
  @Input() Editable = false;

  /** Cap visible chips and surface "+N more". Defaults to 6 for cards. */
  @Input() MaxDisplay = 6;

  /** Emitted when a chip is clicked. Lets the parent drive filter-by-tag. */
  @Output() TagClicked = new EventEmitter<{ TagID: string; Name: string }>();

  /** Emitted after add/remove so parents can refresh dependent data. */
  @Output() TagsChanged = new EventEmitter<void>();

  public tags: DisplayTag[] = [];
  public loading = false;
  public addInput = '';
  public suggestions: MJTagEntity[] = [];
  public showSuggestions = false;

  private initialized = false;
  private entityID: string | null = null;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._entityName && this._recordId) await this.loadTags();
  }

  public get displayedTags(): DisplayTag[] {
    return this.tags.slice(0, this.MaxDisplay);
  }

  public get extraTagCount(): number {
    return Math.max(0, this.tags.length - this.MaxDisplay);
  }

  public OnTagClick(tag: DisplayTag): void {
    this.TagClicked.emit({ TagID: tag.TagID, Name: tag.Name });
  }

  public async OnRemove(tag: DisplayTag, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.Editable) return;
    try {
      const md = this.metadata();
      const entity = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', this.ProviderToUse.CurrentUser ?? undefined);
      const loaded = await entity.Load(tag.TaggedItemID);
      if (!loaded) return;
      const ok = await entity.Delete();
      if (ok) {
        this.tags = this.tags.filter((t) => t.TaggedItemID !== tag.TaggedItemID);
        this.TagsChanged.emit();
        this.cdr.markForCheck();
      }
    } catch (e) {
      LogError(`tag-chips: remove failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public async OnAddInputChange(value: string): Promise<void> {
    this.addInput = value;
    const term = value.trim();
    if (term.length < 1) {
      this.suggestions = [];
      this.showSuggestions = false;
      this.cdr.markForCheck();
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escaped = term.replace(/'/g, "''");
      const result = await rv.RunView<MJTagEntity>({
        EntityName: 'MJ: Tags',
        ExtraFilter: `Name LIKE '%${escaped}%'`,
        OrderBy: 'Name',
        MaxRows: 8,
        ResultType: 'entity_object',
      });
      const alreadyApplied = new Set(this.tags.map((t) => t.TagID));
      this.suggestions = (result.Results ?? []).filter((t) => !alreadyApplied.has(t.ID));
      this.showSuggestions = true;
    } catch (e) {
      LogError(`tag-chips: suggestion lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdr.markForCheck();
    }
  }

  public async OnAddTag(tag: MJTagEntity): Promise<void> {
    if (!this._entityName || !this._recordId) return;
    try {
      const md = this.metadata();
      const entity = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', this.ProviderToUse.CurrentUser ?? undefined);
      entity.NewRecord();
      entity.TagID = tag.ID;
      entity.RecordID = this._recordId;
      const entityInfo = md.EntityByName(this._entityName);
      if (entityInfo) entity.EntityID = entityInfo.ID;
      entity.Weight = 1.0;
      const ok = await entity.Save();
      if (ok) {
        this.tags = [...this.tags, { TaggedItemID: entity.ID, TagID: tag.ID, Name: tag.Name }];
        this.addInput = '';
        this.suggestions = [];
        this.showSuggestions = false;
        this.TagsChanged.emit();
        this.cdr.markForCheck();
      }
    } catch (e) {
      LogError(`tag-chips: add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Bulk-load tags + their names in two RunViews — one for the join
   * rows and one to resolve display names. Cheap; this typically returns
   * fewer than 10 rows.
   */
  private async loadTags(): Promise<void> {
    if (!this._entityName || !this._recordId) {
      this.tags = [];
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const md = this.metadata();
      const entityInfo = md.EntityByName(this._entityName);
      if (!entityInfo) {
        this.tags = [];
        return;
      }
      this.entityID = entityInfo.ID;

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const recordIdEscaped = this._recordId.replace(/'/g, "''");
      const joinResult = await rv.RunView<{ ID: string; TagID: string }>({
        EntityName: 'MJ: Tagged Items',
        ExtraFilter: `EntityID='${entityInfo.ID}' AND RecordID='${recordIdEscaped}'`,
        Fields: ['ID', 'TagID'],
        ResultType: 'simple',
      });
      if (!joinResult.Success) {
        this.tags = [];
        return;
      }
      const rows = joinResult.Results ?? [];
      if (rows.length === 0) {
        this.tags = [];
        return;
      }
      const tagIds = Array.from(new Set(rows.map((r) => String(r.TagID))));
      const tagsResult = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: Tags',
        ExtraFilter: `ID IN (${tagIds.map((id) => `'${id}'`).join(',')})`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
      });
      const nameById = new Map<string, string>();
      for (const t of tagsResult.Results ?? []) nameById.set(String(t.ID), String(t.Name));
      this.tags = rows
        .map((r) => ({
          TaggedItemID: String(r.ID),
          TagID: String(r.TagID),
          Name: nameById.get(String(r.TagID)) ?? '(unknown tag)',
        }))
        .sort((a, b) => a.Name.localeCompare(b.Name));
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private metadata(): Metadata {
    return (this.ProviderToUse as unknown as Metadata) ?? new Metadata();
  }
}
