import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges, SimpleChanges } from '@angular/core';
import { BaseEntity, EntityFieldInfo, Metadata, CompositeKey, KeyValuePair, RunView } from '@memberjunction/core';
import { FormContext } from '../types/form-types';
import { FormNavigationEvent } from '../types/navigation-events';

/**
 * Represents a suggestion item for FK autocomplete search results.
 */
export interface FKSuggestion {
  PrimaryKeyValue: unknown;
  DisplayName: string;
}

/**
 * Modern form field component that renders entity fields in both read-only and edit modes.
 *
 * **Read mode**: Clean text display with optional hyperlinks (email, URL, record).
 * **Edit mode**: Native HTML inputs + PrimeNG components for advanced types.
 *
 * Uses:
 * - Native `<input>` for text, number, date
 * - PrimeNG `<p-select>` for value list dropdowns (replaces native select)
 * - PrimeNG `<p-autocomplete>` for foreign key search with match feedback
 * - Custom-styled `<input type="checkbox">` for booleans
 *
 * All navigation (clicking FK links, email links, URL links) is emitted as events.
 *
 * @example
 * ```html
 * <mj-form-field
 *   [Record]="record"
 *   [EditMode]="editMode"
 *   FieldName="CustomerName"
 *   Type="textbox"
 *   [FormContext]="formContext"
 *   (Navigate)="onNavigate($event)"
 *   (ValueChange)="onValueChange($event)">
 * </mj-form-field>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-field.component.html',
  styleUrls: ['./form-field.component.css']
})
export class MjFormFieldComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** The entity record containing this field */
  @Input() Record!: BaseEntity;

  /** Whether the form is in edit mode */
  @Input() EditMode = false;

  /** The field code name (must match a field on the entity) */
  @Input() FieldName = '';

  /**
   * The control type to render in edit mode.
   * Determines which input component is used.
   *
   * Also accepts deprecated Kendo-style type names for backward compatibility:
   * - `'dropdownlist'` → `'select'`
   * - `'numerictextbox'` → `'number'`
   */
  @Input()
  set Type(value: 'textbox' | 'textarea' | 'number' | 'datepicker' | 'checkbox' | 'select' | 'autocomplete' | 'code' | 'dropdownlist' | 'numerictextbox') {
    // Normalize deprecated Kendo type names to modern equivalents
    switch (value) {
      case 'dropdownlist':  this._type = 'select'; break;
      case 'numerictextbox': this._type = 'number'; break;
      default:              this._type = value; break;
    }
  }
  get Type(): 'textbox' | 'textarea' | 'number' | 'datepicker' | 'checkbox' | 'select' | 'autocomplete' | 'code' {
    return this._type;
  }
  private _type: 'textbox' | 'textarea' | 'number' | 'datepicker' | 'checkbox' | 'select' | 'autocomplete' | 'code' = 'textbox';

  /**
   * Link type for read-only rendering.
   * - 'Email': renders as mailto link
   * - 'URL': renders as external hyperlink
   * - 'Record': renders as FK link to related entity record
   * - 'None': renders as plain text
   */
  @Input() LinkType: 'Email' | 'URL' | 'Record' | 'None' = 'None';

  /** Whether to show the field label */
  @Input() ShowLabel = true;

  /** Form-level context (search filter, showEmptyFields) */
  @Input() FormContext?: FormContext;

  // ---- Deprecated camelCase aliases (backward compat) ----

  /** @deprecated Use [Record] instead */
  @Input('record') set _deprecatedRecord(value: BaseEntity) { this.Record = value; }

  /** @deprecated Use [FormContext] instead */
  @Input('formContext') set _deprecatedFormContext(value: FormContext | undefined) { this.FormContext = value; }

  /** Whether to hide this field when empty in read-only mode. Default: true */
  @Input() HideWhenEmptyInReadOnlyMode = true;

  /** Override display name (defaults to entity field metadata DisplayName) */
  @Input() DisplayNameOverride = '';

  /** Override possible values for select/autocomplete */
  @Input() PossibleValuesOverride: string[] | null = null;

  /** Emitted when the field value changes */
  @Output() ValueChange = new EventEmitter<{ FieldName: string; OldValue: unknown; NewValue: unknown }>();

  /** Emitted when a navigation action is triggered (FK link click, email click, etc.) */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  // ---- Computed Properties ----

  /** Get EntityFieldInfo metadata for this field */
  get FieldInfo(): EntityFieldInfo | undefined {
    return this.Record?.EntityInfo?.Fields?.find(f => f.Name === this.FieldName);
  }

  /** Display name from metadata or override */
  get DisplayName(): string {
    if (this.DisplayNameOverride) return this.DisplayNameOverride;

    // Friendly labels for standard MJ timestamp fields
    if (this.FieldName === '__mj_CreatedAt') return 'Created';
    if (this.FieldName === '__mj_UpdatedAt') return 'Updated';

    // For FK fields that have a mapped name field, use the name field's
    // friendly label (e.g., show "Parent" instead of "Parent ID")
    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      const nameField = this.Record?.EntityInfo?.Fields?.find(f => f.Name === nameFieldMap);
      if (nameField) {
        return nameField.DisplayNameOrName;
      }
    }

    return this.FieldInfo?.DisplayNameOrName ?? this.FieldName;
  }

  /** Display name with search highlighting applied */
  get HighlightedDisplayName(): string {
    const filter = this.FormContext?.sectionFilter?.trim();
    if (!filter) return this.DisplayName;

    const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    return this.DisplayName.replace(regex, '<mark class="mj-forms-search-highlight">$&</mark>');
  }

  /** Current field value */
  get Value(): unknown {
    return this.Record?.Get(this.FieldName);
  }

  /** Set field value and emit change event */
  set Value(newValue: unknown) {
    if (!this.Record) return;
    const oldValue = this.Record.Get(this.FieldName);
    this.Record.Set(this.FieldName, newValue);
    this.ValueChange.emit({ FieldName: this.FieldName, OldValue: oldValue, NewValue: newValue });
  }

  /** Whether this field is read-only based on entity metadata */
  get IsFieldReadOnly(): boolean {
    if (!this.FieldInfo) return false;
    return this.FieldInfo.ReadOnly;
  }

  /** Whether this field has been modified (dirty) */
  get IsDirty(): boolean {
    if (!this.Record) return false;
    const field = this.Record.Fields?.find(f => f.Name === this.FieldName);
    return field?.Dirty ?? false;
  }

  /** Whether this field should be hidden (empty in read-only mode) */
  get ShouldHideField(): boolean {
    if (this.EditMode) return false;
    if (!this.HideWhenEmptyInReadOnlyMode) return false;
    if (this.FormContext?.showEmptyFields) return false;
    const val = this.Value;
    return val === null || val === undefined || val === '';
  }

  /** Possible values for select/autocomplete from entity metadata or override */
  get PossibleValues(): string[] {
    if (this.PossibleValuesOverride) return this.PossibleValuesOverride;
    const values = this.FieldInfo?.EntityFieldValues;
    if (values && values.length > 0) {
      return values.map(v => v.Value);
    }
    return [];
  }

  /** PrimeNG Select option objects (label/value pairs) */
  get SelectOptions(): { label: string; value: string }[] {
    return this.PossibleValues.map(v => ({ label: v, value: v }));
  }

  /** Whether this field has a related entity (foreign key) */
  get HasRelatedEntity(): boolean {
    const re = this.FieldInfo?.RelatedEntity;
    return re != null && re.length > 0;
  }

  /**
   * For FK fields, returns the human-readable name to display instead of the raw ID.
   *
   * Resolution order:
   * 1. If `RelatedEntityNameFieldMap` exists, read the name from the joined field on the record (sync).
   * 2. Otherwise, fall back to an async `GetEntityRecordName` lookup (result cached in `_resolvedFKName`).
   */
  get FKDisplayName(): string | null {
    if (!this.Record || !this.HasRelatedEntity) return null;

    // Fast path: name field is joined into our record's view
    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      const val = this.Record.Get(nameFieldMap);
      if (val != null && val !== '') return String(val);
    }

    // Async fallback: resolved via GetEntityRecordName
    if (this._resolvedFKName !== undefined) {
      return this._resolvedFKName;
    }

    // Kick off async resolution if not already in flight
    this.resolveFKNameAsync();
    return null; // will render once resolved
  }

  /**
   * Whether this FK field should display the related entity name
   * with a hyperlink instead of the raw ID value.
   */
  get IsFKWithNameField(): boolean {
    return this.HasRelatedEntity && this.FKDisplayName != null;
  }

  // ---- Async FK name resolution ----

  /** Cached result from GetEntityRecordName. undefined = not yet resolved. */
  private _resolvedFKName: string | null | undefined = undefined;

  /** Tracks which FK value we resolved so we can invalidate on record change */
  private _resolvedFKValue: unknown = undefined;

  /** Whether an async lookup is in flight */
  private _fkNameLoading = false;

  /**
   * Asynchronously resolves the display name for an FK field that lacks
   * a RelatedEntityNameFieldMap by calling Metadata.GetEntityRecordName.
   */
  private resolveFKNameAsync(): void {
    if (this._fkNameLoading) return;

    const fkValue = this.Value;
    if (fkValue == null || fkValue === '') return;

    const fieldInfo = this.FieldInfo;
    if (!fieldInfo?.RelatedEntity || !fieldInfo?.RelatedEntityFieldName) return;

    this._fkNameLoading = true;
    this._resolvedFKValue = fkValue;

    const pk = new CompositeKey([{
      FieldName: fieldInfo.RelatedEntityFieldName,
      Value: fkValue
    }]);

    const md = new Metadata();
    md.GetEntityRecordName(fieldInfo.RelatedEntity, pk)
      .then(name => {
        this._resolvedFKName = name || null;
        this._fkNameLoading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this._resolvedFKName = null;
        this._fkNameLoading = false;
      });
  }

  // ---- FK Autocomplete (edit mode) ----

  /** Suggestions returned from the FK entity search */
  FKSuggestions: FKSuggestion[] = [];

  /** Whether the current FK value is a confirmed match (user selected from dropdown) */
  FKIsMatched = false;

  /** The user's last explicit selection from the autocomplete */
  private _fkSelectedItem: FKSuggestion | null = null;

  /** Cached initial model to avoid recreating objects on each CD cycle */
  private _cachedFKModel: FKSuggestion | null = null;
  private _cachedFKModelKey = '';

  /**
   * Model for the PrimeNG AutoComplete.
   * Returns the last user selection, or constructs a model from the resolved FK display name.
   */
  get FKAutoCompleteModel(): FKSuggestion | null {
    if (this._fkSelectedItem) return this._fkSelectedItem;

    const value = this.Value;
    if (value == null || value === '') return null;

    const name = this.FKDisplayName;
    const key = `${value}:${name}`;

    if (key !== this._cachedFKModelKey) {
      this._cachedFKModelKey = key;
      if (name) {
        this._cachedFKModel = { PrimaryKeyValue: value, DisplayName: name };
        this.FKIsMatched = true;
      } else {
        // Name not yet resolved - show nothing (placeholder visible)
        this._cachedFKModel = null;
      }
    }

    return this._cachedFKModel;
  }

  /**
   * Handle model change from PrimeNG AutoComplete.
   * Value can be an FKSuggestion object (selected) or a string (typing).
   */
  OnFKModelChange(value: FKSuggestion | string | null): void {
    if (value && typeof value === 'object' && 'PrimaryKeyValue' in value) {
      // User selected from suggestions
      this._fkSelectedItem = value;
      this.Value = value.PrimaryKeyValue;
      this.FKIsMatched = true;

      // Update virtual name field for visual consistency after save
      const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
      if (nameFieldMap) {
        this.Record.Set(nameFieldMap, value.DisplayName);
      }
    } else if (typeof value === 'string') {
      // User is typing - don't update FK value yet
      this._fkSelectedItem = null;
      this.FKIsMatched = false;
    } else {
      // Cleared
      this._fkSelectedItem = null;
      this.FKIsMatched = false;
    }
    this.cdr.markForCheck();
  }

  /**
   * Handle autocomplete search event from PrimeNG.
   * Searches the related entity by its name field.
   */
  OnFKSearch(event: { query: string }): void {
    const query = event.query?.trim();
    if (!query || query.length < 1) {
      this.FKSuggestions = [];
      return;
    }
    this.searchRelatedEntity(query);
  }

  /**
   * Perform a RunView search on the related entity's name field.
   */
  private async searchRelatedEntity(query: string): Promise<void> {
    const fieldInfo = this.FieldInfo;
    if (!fieldInfo?.RelatedEntity) return;

    const md = new Metadata();
    const relatedEntity = md.Entities.find(e => e.Name === fieldInfo.RelatedEntity);
    if (!relatedEntity?.NameField) return;

    const nameFieldName = relatedEntity.NameField.Name;
    const pkFieldName = fieldInfo.RelatedEntityFieldName || 'ID';
    const escapedQuery = query.replace(/'/g, "''");

    const rv = new RunView();
    const result = await rv.RunView<Record<string, unknown>>({
      EntityName: fieldInfo.RelatedEntity,
      ExtraFilter: `[${nameFieldName}] LIKE '%${escapedQuery}%'`,
      MaxRows: 20,
      ResultType: 'simple',
      Fields: [pkFieldName, nameFieldName]
    });

    if (result.Success) {
      this.FKSuggestions = result.Results.map(r => ({
        PrimaryKeyValue: r[pkFieldName],
        DisplayName: String(r[nameFieldName] || '')
      }));
    } else {
      this.FKSuggestions = [];
    }
    this.cdr.markForCheck();
  }

  /** Handle autocomplete clear */
  OnFKClear(): void {
    this.Value = null;
    this._fkSelectedItem = null;
    this._cachedFKModel = null;
    this._cachedFKModelKey = '';
    this.FKIsMatched = false;

    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      this.Record.Set(nameFieldMap, '');
    }
    this.cdr.markForCheck();
  }

  /** Whether the field's varchar(max) - long text that gets markdown rendering */
  get IsLongText(): boolean {
    return this.FieldInfo?.Length === -1;
  }

  /** Format a value for display */
  FormatValue(): string {
    const val = this.Value;
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      return val.toLocaleString();
    }
    return String(val);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['FormContext'] || changes['EditMode'] || changes['Record']) {
      // Reset FK selection cache when record changes
      if (changes['Record']) {
        this._fkSelectedItem = null;
        this._cachedFKModel = null;
        this._cachedFKModelKey = '';
        this._resolvedFKName = undefined;
        this._resolvedFKValue = undefined;
        this._fkNameLoading = false;
      }
      this.cdr.markForCheck();
    }
  }

  // ---- Navigation Handlers ----

  /**
   * Handle click on a record FK link in read-only mode.
   */
  OnRecordLinkClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.FieldInfo || !this.Record) return;
    const relatedEntityName = this.FieldInfo.RelatedEntity;
    if (!relatedEntityName) return;

    const fkValue = this.Value;
    if (!fkValue) return;

    // Build a CompositeKey for the FK target record using the related entity's PK field
    const relatedFieldName = this.FieldInfo.RelatedEntityFieldName || 'ID';
    const targetKey = new CompositeKey([new KeyValuePair(relatedFieldName, fkValue)]);

    this.Navigate.emit({
      Kind: 'record',
      EntityName: relatedEntityName,
      PrimaryKey: targetKey,
      OpenInNewTab: event.ctrlKey || event.metaKey
    });
  }

  /**
   * Handle click on an email link in read-only mode.
   */
  OnEmailLinkClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const email = this.FormatValue();
    if (!email) return;
    this.Navigate.emit({
      Kind: 'email',
      EmailAddress: email
    });
  }

  /**
   * Handle click on a URL link in read-only mode.
   */
  OnUrlLinkClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const url = this.FormatValue();
    if (!url) return;
    this.Navigate.emit({
      Kind: 'external-link',
      Url: url,
      OpenInNewTab: true
    });
  }

  /**
   * Handle value change from a native input.
   */
  OnInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.Value = input.value;
  }

  /**
   * Handle value change from a number input.
   */
  OnNumberChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const num = input.valueAsNumber;
    this.Value = isNaN(num) ? null : num;
  }

  /**
   * Handle value change from a date input.
   */
  OnDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.Value = input.value ? new Date(input.value) : null;
  }

  /**
   * Handle value change from a checkbox.
   */
  OnCheckboxChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.Value = input.checked;
  }

  /**
   * Handle value change from a select.
   */
  OnSelectChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.Value = select.value;
  }

  /**
   * Get date value formatted for HTML date input.
   */
  get DateInputValue(): string {
    const val = this.Value;
    if (!val) return '';
    const date = val instanceof Date ? val : new Date(String(val));
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }
}
