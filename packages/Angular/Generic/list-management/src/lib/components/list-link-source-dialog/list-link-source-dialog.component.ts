import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import type { MJListEntity, MJQueryEntity, MJQueryFieldEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import type { ListSourceKind, ListSourceParameterInfo } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';

type ViewOption = Pick<MJUserViewEntity, 'ID' | 'Name'>;
type QueryOption = Pick<MJQueryEntity, 'ID' | 'Name' | 'Category'>;
type FieldOption = Pick<MJQueryFieldEntity, 'Name' | 'SourceEntityID' | 'SourceFieldName'>;
type SourceChange = Parameters<ListRefreshService['UpdateListAsync']>[1];

/**
 * Links a list to the view or query it refreshes from, or changes it. Only the list's owner may
 * link a source (the server enforces it). For a query, the owner picks the column holding the
 * record key and fills in the query's parameters. Saving fills the list right away from the new
 * source, adding records only.
 */
@Component({
  standalone: false,
  selector: 'mj-list-link-source-dialog',
  templateUrl: './list-link-source-dialog.component.html',
  styleUrls: ['./list-link-source-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListLinkSourceDialogComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly refresh = inject(ListRefreshService);

  /** Whether the dialog is open. Opening it (re)loads the choices. */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (value !== this._visible) {
      this._visible = value;
      if (value) void this.LoadAsync();
    }
  }
  private _visible = false;

  /** The list to link. Required. */
  @Input() ListID: string | null = null;

  /** The source was saved. */
  @Output() Linked = new EventEmitter<void>();
  /** The dialog was closed without saving. */
  @Output() Cancel = new EventEmitter<void>();

  public Kind: ListSourceKind = 'view';
  public Views: ViewOption[] = [];
  public Queries: QueryOption[] = [];
  public Fields: FieldOption[] = [];
  public Parameters: ListSourceParameterInfo[] = [];
  public ParameterValues: Record<string, string> = {};
  public SelectedViewID: string | null = null;
  public SelectedQueryID: string | null = null;
  public KeyField: string | null = null;
  public EntityName = '';
  public IsLoading = false;
  public IsSaving = false;
  public ErrorMessage: string | null = null;

  private list: MJListEntity | null = null;

  public get CanSave(): boolean {
    if (this.IsSaving || this.IsLoading) return false;
    if (this.Kind === 'view') return !!this.SelectedViewID;
    const requiredFilled = this.Parameters.every((p) => !p.IsRequired || !!this.ParameterValues[p.Name]?.trim());
    return !!this.SelectedQueryID && !!this.KeyField && requiredFilled;
  }

  public async LoadAsync(): Promise<void> {
    if (!this.ListID) return;
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      const p = this.ProviderToUse;
      this.list = await p.GetEntityObject<MJListEntity>('MJ: Lists', p.CurrentUser);
      if (!(await this.list.Load(this.ListID))) throw new Error('Could not load the list.');
      this.EntityName = this.list.Entity ?? '';
      await this.loadChoicesAsync(this.list.EntityID);
      this.applyCurrentSource(this.list);
      if (this.SelectedQueryID) await this.loadQueryDetailsAsync(this.SelectedQueryID);
    } catch (e) {
      this.ErrorMessage = errorText(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public OnKindChange(kind: ListSourceKind): void {
    this.Kind = kind;
    this.cdr.markForCheck();
  }

  public async OnQueryChange(queryID: string | null): Promise<void> {
    this.SelectedQueryID = queryID;
    this.KeyField = null;
    this.Fields = [];
    this.Parameters = [];
    this.ParameterValues = {};
    this.cdr.markForCheck();
    if (queryID) await this.loadQueryDetailsAsync(queryID);
  }

  public async OnSave(): Promise<void> {
    if (!this.ListID || !this.CanSave) return;
    this.IsSaving = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      this.refresh.Provider = this.ProviderToUse;
      await this.refresh.UpdateListAsync(this.ListID, this.Kind === 'view' ? this.viewChange() : this.queryChange());
      this.Linked.emit();
    } catch (e) {
      this.ErrorMessage = errorText(e);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  public OnCancel(): void {
    this.Cancel.emit();
  }

  private viewChange(): SourceChange {
    return { SourceViewID: this.SelectedViewID, SourceQueryID: null, SourceQueryKeyField: null, SourceQueryParameters: null };
  }

  private queryChange(): SourceChange {
    const values: Record<string, string> = {};
    for (const p of this.Parameters) {
      const v = this.ParameterValues[p.Name]?.trim();
      if (v) values[p.Name] = v;
    }
    return {
      SourceViewID: null,
      SourceQueryID: this.SelectedQueryID,
      SourceQueryKeyField: this.KeyField,
      SourceQueryParameters: Object.keys(values).length ? JSON.stringify(values) : null,
    };
  }

  private applyCurrentSource(list: MJListEntity): void {
    this.Kind = list.SourceQueryID ? 'query' : 'view';
    this.SelectedViewID = list.SourceViewID;
    this.SelectedQueryID = list.SourceQueryID;
    this.KeyField = list.SourceQueryKeyField;
  }

  /** The views on the list's entity, and the approved queries, the user can see. */
  private async loadChoicesAsync(entityID: string): Promise<void> {
    const [views, queries] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews([
      { EntityName: 'MJ: User Views', ExtraFilter: `EntityID='${EscapeSQLString(entityID)}'`, Fields: ['ID', 'Name'], OrderBy: 'Name', ResultType: 'simple' },
      { EntityName: 'MJ: Queries', ExtraFilter: `Status='Approved'`, Fields: ['ID', 'Name', 'Category'], OrderBy: 'Name', ResultType: 'simple' },
    ]);
    if (!views.Success) throw new Error(views.ErrorMessage ?? 'Could not load views');
    if (!queries.Success) throw new Error(queries.ErrorMessage ?? 'Could not load queries');
    this.Views = views.Results as ViewOption[];
    this.Queries = queries.Results as QueryOption[];
  }

  /** The query's columns and parameters; preselects the column that maps to the entity's key. */
  private async loadQueryDetailsAsync(queryID: string): Promise<void> {
    this.refresh.Provider = this.ProviderToUse;
    const stored = this.list && UUIDsEqual(this.list.SourceQueryID, queryID) ? this.list.SourceQueryParameters : null;
    const [fields, parameters] = await Promise.all([
      RunView.FromMetadataProvider(this.ProviderToUse).RunView<FieldOption>({
        EntityName: 'MJ: Query Fields',
        ExtraFilter: `QueryID='${EscapeSQLString(queryID)}'`,
        Fields: ['Name', 'SourceEntityID', 'SourceFieldName'],
        OrderBy: 'Sequence',
        ResultType: 'simple',
      }),
      this.refresh.LoadSourceParametersAsync(queryID, stored),
    ]);
    if (!fields.Success) throw new Error(fields.ErrorMessage ?? 'Could not load query columns');
    this.Fields = fields.Results;
    this.Parameters = parameters;
    this.ParameterValues = Object.fromEntries(parameters.map((p) => [p.Name, p.CurrentValue ?? '']));
    if (!this.KeyField) this.KeyField = this.suggestKeyField();
    this.cdr.markForCheck();
  }

  private suggestKeyField(): string | null {
    const entity = this.list ? this.ProviderToUse.EntityByID(this.list.EntityID) : undefined;
    if (!entity || entity.PrimaryKeys.length !== 1) return null;
    const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: a query source needs a single-column key, checked above
    const match = this.Fields.find((f) => UUIDsEqual(f.SourceEntityID, entity.ID) && f.SourceFieldName?.toLowerCase() === pkName.toLowerCase());
    return match?.Name ?? null;
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
