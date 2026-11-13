import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { MJTagEntity, MJTaggedItemEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { TagScopeFilterBuilder, type TagScopeContext } from '@memberjunction/tag-engine-base';

/**
 * Compact tag chips for a single record (mockup 22). Loads tags by
 * querying `MJ: Tagged Items` filtered to `(EntityID, RecordID)`, then
 * resolves names from `MJ: Tags` in a single batch. Render-only by
 * default; pass `Editable=true` to surface an inline add field and
 * per-chip remove buttons.
 *
 * Tag scope: suggestions only ever offer `Status='Active'` tags. Without a
 * `ScopeContext` they come from the whole instance. With one, they are
 * limited to global tags plus tags scoped to the context's records, and a
 * tag created inline is saved non-global with one `MJ: Tag Scopes` row per
 * scope entry. Set `AllowCreate=false` when tags are curated elsewhere.
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

/** A tag offered in the add field's suggestion list. */
export interface TagSuggestion {
  ID: string;
  Name: string;
}

/** A scope entry resolved to the IDs written on a `MJ: Tag Scopes` row. */
interface ResolvedScope {
  ScopeEntityID: string;
  ScopeRecordID: string;
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

  /**
   * Limits suggestions to global tags plus tags scoped to these records, and
   * scopes tags created inline to them. Null (the default) means instance-wide:
   * every active tag is suggested and new tags are global.
   */
  @Input()
  set ScopeContext(value: TagScopeContext | null) {
    if (this._scopeContext !== value) {
      this._scopeContext = value;
      this.clearSuggestions();
    }
  }
  get ScopeContext(): TagScopeContext | null {
    return this._scopeContext;
  }
  private _scopeContext: TagScopeContext | null = null;

  /** When false, the add field only applies existing tags and never offers to create one. */
  @Input()
  set AllowCreate(value: boolean) {
    this._allowCreate = value;
    if (!value) this.CanCreateNew = false;
  }
  get AllowCreate(): boolean {
    return this._allowCreate;
  }
  private _allowCreate = true;

  /** Cap visible chips and surface "+N more". Defaults to 6 for cards. */
  @Input() MaxDisplay = 6;

  /** Emitted when a chip is clicked. Lets the parent drive filter-by-tag. */
  @Output() TagClicked = new EventEmitter<{ TagID: string; Name: string }>();

  /** Emitted after add/remove so parents can refresh dependent data. */
  @Output() TagsChanged = new EventEmitter<void>();

  public tags: DisplayTag[] = [];
  public Loading = false;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }
  public AddInput = '';

  /** @deprecated Use {@link AddInput}. */
  public get addInput() {
    return this.AddInput;
  }
  /** @deprecated Use {@link AddInput}. */
  public set addInput(value) {
    this.AddInput = value;
  }
  public Suggestions: TagSuggestion[] = [];

  /** @deprecated Use {@link Suggestions}. */
  public get suggestions(): TagSuggestion[] {
    return this.Suggestions;
  }
  /** @deprecated Use {@link Suggestions}. */
  public set suggestions(value: TagSuggestion[]) {
    this.Suggestions = value;
  }
  public ShowSuggestions = false;

  /** @deprecated Use {@link ShowSuggestions}. */
  public get showSuggestions() {
    return this.ShowSuggestions;
  }
  /** @deprecated Use {@link ShowSuggestions}. */
  public set showSuggestions(value) {
    this.ShowSuggestions = value;
  }
  /** True when the trimmed input doesn't exactly match any existing tag —
   *  drives the "Create '<term>'" affordance at the top of the dropdown. */
  public CanCreateNew = false;

  /** @deprecated Use {@link CanCreateNew}. */
  public get canCreateNew() {
    return this.CanCreateNew;
  }
  /** @deprecated Use {@link CanCreateNew}. */
  public set canCreateNew(value) {
    this.CanCreateNew = value;
  }

  private initialized = false;
  private entityID: string | null = null;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._entityName && this._recordId) await this.loadTags();
  }

  public get DisplayedTags(): DisplayTag[] {
    return this.tags.slice(0, this.MaxDisplay);
  }

  /** @deprecated Use {@link DisplayedTags}. */
  public get displayedTags(): DisplayTag[] {
    return this.DisplayedTags;
  }

  public get ExtraTagCount(): number {
    return Math.max(0, this.tags.length - this.MaxDisplay);
  }

  /** @deprecated Use {@link ExtraTagCount}. */
  public get extraTagCount(): number {
    return this.ExtraTagCount;
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
    this.AddInput = value;
    const term = value.trim();
    if (term.length < 1) {
      this.clearSuggestions();
      this.cdr.markForCheck();
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escaped = term.replace(/'/g, "''");
      // Active tags only, limited to the scope context when one is set.
      const visibility = TagScopeFilterBuilder.Instance.BuildVisibilityFilter(this._scopeContext, this.ProviderToUse);
      const result = await rv.RunView<TagSuggestion>({
        EntityName: 'MJ: Tags',
        ExtraFilter: `(${visibility}) AND Name LIKE '%${escaped}%'`,
        Fields: ['ID', 'Name'],
        OrderBy: 'Name',
        MaxRows: 8,
        ResultType: 'simple',
      });
      const alreadyApplied = new Set(this.tags.map((t) => t.TagID.toLowerCase()));
      this.Suggestions = (result.Results ?? [])
        .map((t) => ({ ID: String(t.ID), Name: String(t.Name) }))
        .filter((t) => !alreadyApplied.has(t.ID.toLowerCase()));
      // Offer "Create '<term>'" when the typed text doesn't exactly
      // match any existing tag (case-insensitive). Without this, typing
      // a brand-new tag name and hitting Enter does nothing — there's
      // no suggestion to click.
      const lowerTerm = term.toLowerCase();
      this.CanCreateNew = this._allowCreate && !this.Suggestions.some(
        (s) => s.Name.toLowerCase() === lowerTerm,
      );
      this.ShowSuggestions = true;
    } catch (e) {
      LogError(`tag-chips: suggestion lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cdr.markForCheck();
    }
  }

  /**
   * Enter-key handler on the input. If suggestions are showing,
   * picks the first one (existing tag); otherwise creates a new tag
   * from the typed text and applies it. Closes the suggestion menu
   * on either path.
   */
  public async OnAddInputSubmit(event?: Event): Promise<void> {
    event?.preventDefault();
    const term = this.AddInput.trim();
    if (term.length === 0) return;
    // Existing tag in suggestions takes priority — Enter selects the
    // first match (matching most autocomplete UIs).
    if (this.Suggestions.length > 0) {
      await this.OnAddTag(this.Suggestions[0]);
      return;
    }
    if (this.CanCreateNew && this._allowCreate) {
      await this.createAndAddTag(term);
    }
  }

  public async OnAddTag(tag: TagSuggestion): Promise<void> {
    if (!this._entityName || !this._recordId) return;
    await this.applyTagToRecord(tag.ID, tag.Name);
  }

  /** Click handler for the "Create '<term>'" affordance. Creates the
   *  `MJ: Tags` row then attaches it via the standard apply path. */
  public async OnCreateNew(): Promise<void> {
    if (!this._allowCreate) return;
    const term = this.AddInput.trim();
    if (term.length === 0) return;
    await this.createAndAddTag(term);
  }

  private async createAndAddTag(name: string): Promise<void> {
    if (!this._allowCreate || !this._entityName || !this._recordId) return;
    try {
      const scopes = this.scopesForNewTag();
      if (scopes == null) return;
      const md = this.metadata();
      const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', this.ProviderToUse.CurrentUser ?? undefined);
      tag.NewRecord();
      tag.Name = name;
      // MJ: Tags requires both Name (canonical) and DisplayName (UI).
      // Default DisplayName to the same text the user typed — they can
      // refine it later via the Tags entity editor if needed.
      tag.DisplayName = name;
      // A scoped tag is saved non-global before its scope rows exist, so a
      // failed scope write leaves a tag no other tenant can see.
      if (scopes.length > 0) tag.IsGlobal = false;
      const ok = await tag.Save();
      if (!ok) {
        LogError(`tag-chips: create-tag save failed: ${tag.LatestResult?.CompleteMessage ?? 'unknown'}`);
        return;
      }
      if (!(await this.saveTagScopes(tag.ID, scopes))) return;
      await this.applyTagToRecord(tag.ID, tag.Name);
    } catch (e) {
      LogError(`tag-chips: create-and-add failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * The scope rows a newly created tag gets: none when there is no scope
   * context (or it is `globalOnly`), otherwise one per entry. Returns null
   * when an entry's entity cannot be resolved, so no half-scoped tag is made.
   */
  private scopesForNewTag(): ResolvedScope[] | null {
    const ctx = this._scopeContext;
    if (!ctx || ctx.globalOnly || ctx.scopes.length === 0) return [];
    const resolved: ResolvedScope[] = [];
    for (const entry of ctx.scopes) {
      const entityId = entry.entityId ?? (entry.entityName ? this.ProviderToUse.EntityByName(entry.entityName)?.ID : undefined);
      if (!entityId || !entry.recordId) {
        LogError(`tag-chips: scope entry ${entry.entityName ?? entry.entityId ?? '(no entity)'} could not be resolved; tag not created`);
        return null;
      }
      resolved.push({ ScopeEntityID: entityId, ScopeRecordID: entry.recordId });
    }
    return resolved;
  }

  /** Writes one `MJ: Tag Scopes` row per scope. Returns false on the first failure. */
  private async saveTagScopes(tagId: string, scopes: ResolvedScope[]): Promise<boolean> {
    const md = this.metadata();
    for (const s of scopes) {
      const scope = await md.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', this.ProviderToUse.CurrentUser ?? undefined);
      scope.NewRecord();
      scope.TagID = tagId;
      scope.ScopeEntityID = s.ScopeEntityID;
      scope.ScopeRecordID = s.ScopeRecordID;
      if (!(await scope.Save())) {
        LogError(`tag-chips: tag scope save failed; tag left unapplied: ${scope.LatestResult?.CompleteMessage ?? 'unknown'}`);
        return false;
      }
    }
    return true;
  }

  private clearSuggestions(): void {
    this.Suggestions = [];
    this.CanCreateNew = false;
    this.ShowSuggestions = false;
  }

  private async applyTagToRecord(tagId: string, tagName: string): Promise<void> {
    if (!this._entityName || !this._recordId) return;
    try {
      const md = this.metadata();
      const entity = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', this.ProviderToUse.CurrentUser ?? undefined);
      entity.NewRecord();
      entity.TagID = tagId;
      entity.RecordID = this._recordId;
      const entityInfo = md.EntityByName(this._entityName);
      if (entityInfo) entity.EntityID = entityInfo.ID;
      entity.Weight = 1.0;
      const ok = await entity.Save();
      if (!ok) {
        LogError(`tag-chips: attach-tag save failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
        return;
      }
      this.tags = [...this.tags, { TaggedItemID: entity.ID, TagID: tagId, Name: tagName }];
      this.AddInput = '';
      this.Suggestions = [];
      this.CanCreateNew = false;
      this.ShowSuggestions = false;
      this.TagsChanged.emit();
      this.cdr.markForCheck();
    } catch (e) {
      LogError(`tag-chips: apply failed: ${e instanceof Error ? e.message : String(e)}`);
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
    this.Loading = true;
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
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  private metadata(): Metadata {
    // ProviderToUse always resolves (it falls back to the global default itself), so a
    // `?? new Metadata()` arm here was dead code that would have defeated an injected provider.
    return this.ProviderToUse as unknown as Metadata;
  }
}
