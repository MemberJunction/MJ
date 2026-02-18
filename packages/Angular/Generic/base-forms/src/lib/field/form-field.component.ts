import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { BaseEntity, EntityFieldInfo, Metadata, CompositeKey, KeyValuePair, RunView } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
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
 * **Edit mode**: Native HTML inputs with custom-built select and autocomplete components.
 *
 * Uses:
 * - Native `<input>` for text, number, date
 * - Custom styled dropdown for value list selections
 * - Custom autocomplete with floating dropdown for foreign key search
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
export class MjFormFieldComponent implements OnChanges, OnDestroy {
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

  /** Set field value, mark touched, run validation, and emit change event */
  set Value(newValue: unknown) {
    if (!this.Record) return;
    const oldValue = this.Record.Get(this.FieldName);
    this.Record.Set(this.FieldName, newValue);
    this._touched = true;
    this.runFieldValidation();
    this.ValueChange.emit({ FieldName: this.FieldName, OldValue: oldValue, NewValue: newValue });
  }

  /** Whether this field is read-only based on entity metadata */
  get IsFieldReadOnly(): boolean {
    if (!this.FieldInfo) return false;
    return this.FieldInfo.ReadOnly;
  }

  /** Whether this field has been modified (dirty). Only shown for saved records (not new). */
  get IsDirty(): boolean {
    if (!this.Record || !this.Record.IsSaved) return false;
    const field = this.Record.Fields?.find(f => f.Name === this.FieldName);
    return field?.Dirty ?? false;
  }

  /** Whether this field is required (not nullable) */
  get IsRequired(): boolean {
    return this.FieldInfo?.AllowsNull === false;
  }

  /** Whether this is a required field that is currently empty (for validation styling) */
  get IsRequiredEmpty(): boolean {
    // Defer to the validation system when it has active errors for this field
    if (this.ShowErrors) return false;
    if (!this.IsRequired || !this.EditMode) return false;
    const val = this.Value;
    return val === null || val === undefined || val === '';
  }

  // ---- INLINE VALIDATION ----

  /** Whether the user has interacted with (changed) this field */
  private _touched = false;

  /** Locally computed validation errors for this field */
  private _fieldErrors: ValidationErrorInfo[] = [];

  /** Validation errors for this field from the best available source */
  get FieldErrors(): ValidationErrorInfo[] {
    // If touched, use fresh local validation (covers real-time feedback)
    if (this._touched) {
      return this._fieldErrors;
    }
    // Otherwise use form-level errors from save failure (covers untouched fields)
    const contextErrors = this.FormContext?.validationErrors;
    if (contextErrors && contextErrors.length > 0) {
      return contextErrors.filter(e => e.Source === this.FieldName);
    }
    return [];
  }

  /** Whether to show validation messages (touched OR form-level showValidation) */
  get ShowValidation(): boolean {
    if (!this.EditMode || this.IsFieldReadOnly) return false;
    return this._touched || (this.FormContext?.showValidation === true);
  }

  /** Whether this field has active error-level validation failures to display */
  get ShowErrors(): boolean {
    return this.ShowValidation && this.FieldErrors.some(e => e.Type === 'Failure');
  }

  /** Whether this field has active warning-level validation issues to display */
  get ShowWarnings(): boolean {
    return this.ShowValidation && !this.ShowErrors && this.FieldErrors.some(e => e.Type === 'Warning');
  }

  /** Error messages to render in the template */
  get DisplayErrors(): ValidationErrorInfo[] {
    if (!this.ShowValidation) return [];
    return this.FieldErrors.filter(e => e.Type === 'Failure');
  }

  /** Warning messages to render in the template */
  get DisplayWarnings(): ValidationErrorInfo[] {
    if (!this.ShowValidation) return [];
    return this.FieldErrors.filter(e => e.Type === 'Warning');
  }

  /**
   * Runs validation for this field using the full Record.Validate() method.
   * This captures both built-in field checks and custom Validate() overrides
   * (including cross-field rules). Results are filtered to this field only.
   */
  private runFieldValidation(): void {
    if (!this.Record || !this.EditMode) {
      this._fieldErrors = [];
      return;
    }
    try {
      const result = this.Record.Validate();
      this._fieldErrors = result.Errors.filter(e => e.Source === this.FieldName);
    } catch {
      this._fieldErrors = [];
    }
    this.cdr.markForCheck();
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

  // ============================================
  // DROPDOWN POSITIONING (shared by FK, value list, select)
  // ============================================

  /** Calculated position for fixed-position dropdowns */
  DropdownTop = 0;
  DropdownLeft = 0;
  DropdownWidth = 0;
  OpenAbove = false;

  /** Cleanup function for scroll/resize listeners */
  private _scrollCleanup: (() => void) | null = null;

  /** Inline style for the fixed-position dropdown */
  get DropdownPositionStyle(): Record<string, string> {
    if (this.OpenAbove) {
      return {
        'position': 'fixed',
        'bottom': (window.innerHeight - this.DropdownTop) + 'px',
        'top': 'auto',
        'left': this.DropdownLeft + 'px',
        'width': this.DropdownWidth + 'px',
        'z-index': '10000'
      };
    }
    return {
      'position': 'fixed',
      'top': this.DropdownTop + 'px',
      'bottom': 'auto',
      'left': this.DropdownLeft + 'px',
      'width': this.DropdownWidth + 'px',
      'z-index': '10000'
    };
  }

  /** Calculate dropdown position relative to viewport from anchor element */
  private updateDropdownPosition(anchorEl: HTMLElement): void {
    const rect = anchorEl.getBoundingClientRect();
    const dropdownMaxHeight = 240;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow) {
      this.OpenAbove = true;
      this.DropdownTop = rect.top - gap;
    } else {
      this.OpenAbove = false;
      this.DropdownTop = rect.bottom + gap;
    }
    this.DropdownLeft = rect.left;
    this.DropdownWidth = rect.width;
  }

  /** Start listening for scroll/resize to close dropdowns */
  private startScrollListener(): void {
    this.stopScrollListener();

    const onScroll = () => {
      this.closeAllDropdowns();
      this.cdr.markForCheck();
    };
    const onResize = () => {
      this.closeAllDropdowns();
      this.cdr.markForCheck();
    };

    document.addEventListener('scroll', onScroll, true); // capture phase catches all scrollable ancestors
    window.addEventListener('resize', onResize);

    this._scrollCleanup = () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }

  /** Remove scroll/resize listeners */
  private stopScrollListener(): void {
    if (this._scrollCleanup) {
      this._scrollCleanup();
      this._scrollCleanup = null;
    }
  }

  /** Close all dropdown types */
  private closeAllDropdowns(): void {
    this.ShowFKDropdown = false;
    this.ShowValueListDropdown = false;
    this.ShowSelectDropdown = false;
    this.stopScrollListener();
  }

  // ============================================
  // FK AUTOCOMPLETE (custom implementation)
  // ============================================

  /** Suggestions returned from the FK entity search */
  FKSuggestions: FKSuggestion[] = [];

  /** Whether the current FK value is a confirmed match (user selected from dropdown) */
  FKIsMatched = false;

  /** Whether the FK dropdown is visible */
  ShowFKDropdown = false;

  /** Text the user is currently typing in the FK search input. null = use display name. */
  private _fkInputText: string | null = null;

  /** Debounce timer for FK search */
  private _fkSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Last known FK input element for position recalculation */
  private _lastFKInputEl: HTMLElement | null = null;

  /** The display text shown in the FK search input */
  get FKSearchText(): string {
    if (this._fkInputText !== null) return this._fkInputText;
    return this.FKDisplayName || '';
  }

  /** Handle typing in the FK search input */
  OnFKInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._fkInputText = input.value;
    this._lastFKInputEl = input;
    this.FKIsMatched = false;

    // Debounce search
    if (this._fkSearchTimeout) clearTimeout(this._fkSearchTimeout);
    this._fkSearchTimeout = setTimeout(() => {
      if (this._fkInputText && this._fkInputText.length >= 1) {
        this.searchRelatedEntity(this._fkInputText);
      } else {
        this.FKSuggestions = [];
        this.ShowFKDropdown = false;
        this.stopScrollListener();
        this.cdr.markForCheck();
      }
    }, 300);
  }

  /** Show dropdown on focus if suggestions exist */
  OnFKFocus(event: FocusEvent): void {
    const input = event.target as HTMLElement;
    this._lastFKInputEl = input;
    if (this.FKSuggestions.length > 0) {
      this.updateDropdownPosition(input);
      this.startScrollListener();
      this.ShowFKDropdown = true;
      this.cdr.markForCheck();
    }
  }

  /** Hide dropdown on blur, revert to matched name if user didn't select */
  OnFKBlur(): void {
    // Small delay so mousedown on dropdown items fires first
    setTimeout(() => {
      this.ShowFKDropdown = false;
      this.stopScrollListener();
      // If user was typing but didn't select, revert to display name
      if (!this.FKIsMatched && this._fkInputText !== null) {
        this._fkInputText = null;
      }
      this.cdr.markForCheck();
    }, 200);
  }

  /** Select an item from the FK dropdown */
  OnFKSelectItem(suggestion: FKSuggestion, event: MouseEvent): void {
    event.preventDefault();
    this._fkInputText = suggestion.DisplayName;
    this.Value = suggestion.PrimaryKeyValue;
    this.FKIsMatched = true;
    this.ShowFKDropdown = false;
    this.stopScrollListener();

    // Update virtual name field for visual consistency after save
    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      this.Record.Set(nameFieldMap, suggestion.DisplayName);
    }
    this.cdr.markForCheck();
  }

  /** Clear FK value via the X button */
  OnFKClearClick(event: MouseEvent): void {
    event.preventDefault();
    this.Value = null;
    this._fkInputText = null;
    this.FKIsMatched = false;
    this.FKSuggestions = [];
    this.ShowFKDropdown = false;
    this.stopScrollListener();
    this._resolvedFKName = undefined;
    this._resolvedFKValue = undefined;

    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      this.Record.Set(nameFieldMap, '');
    }
    this.cdr.markForCheck();
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
      if (this.FKSuggestions.length > 0 && this._lastFKInputEl) {
        this.updateDropdownPosition(this._lastFKInputEl);
        this.startScrollListener();
      }
      this.ShowFKDropdown = this.FKSuggestions.length > 0;
    } else {
      this.FKSuggestions = [];
      this.ShowFKDropdown = false;
      this.stopScrollListener();
    }
    this.cdr.markForCheck();
  }

  // ============================================
  // VALUE LIST AUTOCOMPLETE (for 'autocomplete' type)
  // ============================================

  /** Whether the value list dropdown is visible */
  ShowValueListDropdown = false;

  /** Current filter text for the value list */
  private _valueListFilter = '';

  /** Filtered possible values based on what the user typed */
  get FilteredPossibleValues(): string[] {
    if (!this._valueListFilter) return this.PossibleValues;
    const filter = this._valueListFilter.toLowerCase();
    return this.PossibleValues.filter(v => v.toLowerCase().includes(filter));
  }

  /** Handle typing in the value list autocomplete */
  OnValueListInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._valueListFilter = input.value;
    this.Value = input.value;
    this.updateDropdownPosition(input);
    if (!this._scrollCleanup) this.startScrollListener();
    this.ShowValueListDropdown = true;
    this.cdr.markForCheck();
  }

  /** Show dropdown on focus */
  OnValueListFocus(event: FocusEvent): void {
    const input = event.target as HTMLElement;
    this.updateDropdownPosition(input);
    this.startScrollListener();
    this.ShowValueListDropdown = true;
    this.cdr.markForCheck();
  }

  /** Hide dropdown on blur */
  OnValueListBlur(): void {
    setTimeout(() => {
      this.ShowValueListDropdown = false;
      this.stopScrollListener();
      this.cdr.markForCheck();
    }, 200);
  }

  /** Select an item from the value list dropdown */
  OnValueListSelect(value: string, event: MouseEvent): void {
    event.preventDefault();
    this.Value = value;
    this._valueListFilter = '';
    this.ShowValueListDropdown = false;
    this.stopScrollListener();
    this.cdr.markForCheck();
  }

  // ============================================
  // CUSTOM SELECT DROPDOWN (replaces native <select>)
  // ============================================

  /** Whether the custom select dropdown is visible */
  ShowSelectDropdown = false;

  /** Toggle the custom select dropdown */
  OnSelectTriggerClick(event: Event): void {
    event.preventDefault();
    if (this.ShowSelectDropdown) {
      this.ShowSelectDropdown = false;
      this.stopScrollListener();
    } else {
      const el = event.currentTarget as HTMLElement;
      this.updateDropdownPosition(el);
      this.startScrollListener();
      this.ShowSelectDropdown = true;
    }
    this.cdr.markForCheck();
  }

  /** Close the select dropdown on blur */
  OnSelectTriggerBlur(): void {
    setTimeout(() => {
      this.ShowSelectDropdown = false;
      this.stopScrollListener();
      this.cdr.markForCheck();
    }, 200);
  }

  /** Select an option from the custom select dropdown */
  OnSelectOptionClick(value: string, event: MouseEvent): void {
    event.preventDefault();
    this.Value = value;
    this.ShowSelectDropdown = false;
    this.stopScrollListener();
    this.cdr.markForCheck();
  }

  // ============================================
  // GENERAL PROPERTIES
  // ============================================

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
      // Reset FK state when record changes
      if (changes['Record']) {
        this._fkInputText = null;
        this.FKIsMatched = false;
        this.FKSuggestions = [];
        this.ShowFKDropdown = false;
        this._resolvedFKName = undefined;
        this._resolvedFKValue = undefined;
        this._fkNameLoading = false;
        // Reset validation state for new record
        this._touched = false;
        this._fieldErrors = [];
      }
      // Reset validation state when exiting edit mode
      if (changes['EditMode'] && !this.EditMode) {
        this._touched = false;
        this._fieldErrors = [];
      }
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this._fkSearchTimeout) {
      clearTimeout(this._fkSearchTimeout);
    }
    this.stopScrollListener();
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
