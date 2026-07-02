import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges, SimpleChanges, OnDestroy, ElementRef, Renderer2 } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseEntity, EntityInfo, EntityFieldInfo, EntityFieldTSType, CompositeKey, KeyValuePair, RunView } from '@memberjunction/core';
import { BaseEngineRegistry } from '@memberjunction/core';
import { ValidationErrorInfo, HighlightSearchMatches, detectRichTextFormat, RichTextFormat, UUIDsEqual } from '@memberjunction/global';
import { FormContext } from '../types/form-types';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormatFKCell, FilterCachedFKRows } from './fk-search-utils';
import { LinkedFieldOptionsStore } from './linked-field-options';

/**
 * How a field's value should be rendered/edited beyond a plain input.
 * - `markdown` / `html`: render formatted in read mode, code editor in edit mode
 * - `code`: source code (uses the field's CodeType as the editor language)
 * - `plain`: standard text rendering (default)
 */
export type FieldRichTextMode = 'markdown' | 'html' | 'code' | 'plain';

/**
 * One extra (non-name, non-PK) column rendered in an FK suggestion row.
 * Built from the related entity's fields where `DefaultInView === true`.
 */
export interface FKSuggestionColumn {
  /** Field code name on the related entity. */
  FieldName: string;
  /** Friendly column header (the field's DisplayNameOrName). */
  Header: string;
  /** Pre-formatted display value for this row+column. */
  Value: string;
  /**
   * {@link Value} with the query substring highlighted when this column is the one
   * being searched (else plain, still HTML-escaped). Bound to `[innerHTML]`.
   */
  HighlightedValue: string;
}

/**
 * A field the user can scope the FK search to, shown in the scope-picker menu.
 * `Group` separates the columns visible in the grid ('shown') from other
 * searchable fields like ID/Status ('other').
 */
export interface FKSearchableField {
  /** Related-entity field code name to search against. */
  FieldName: string;
  /** Friendly label (DisplayNameOrName) shown in the menu + scope pill. */
  Label: string;
  /** FontAwesome icon class for the menu row. */
  Icon: string;
  /** Which menu group this field belongs to. */
  Group: 'shown' | 'other';
}

/**
 * Represents a suggestion item for FK autocomplete search results.
 */
export interface FKSuggestion {
  /** Primary-key value used as the FK value when selected. */
  PrimaryKeyValue: unknown;
  /** The related entity's NameField value — the primary clickable label. */
  DisplayName: string;
  /** {@link DisplayName} with the typed query substring wrapped in a highlight mark. Bound to `[innerHTML]`. */
  HighlightedName: string;
  /** Additional DefaultInView columns shown to the right of the name (multi-column rows). */
  ExtraColumns: FKSuggestionColumn[];
  /**
   * Leading icon for this row — a FontAwesome class. Per-row when the related
   * entity has an `ExtendedType = 'Icon'` field; otherwise the entity-level
   * icon; null when neither exists.
   */
  Icon: string | null;
}

/**
 * Describes the column layout (besides the name column) for the FK suggestion
 * dropdown of the current related entity. Recomputed when the related entity changes.
 */
interface FKColumnPlan {
  /** Code name of the related entity's NameField (or PK fallback). */
  NameFieldName: string;
  /** Code name of the related entity's PK field used as the FK value. */
  PkFieldName: string;
  /**
   * The ordered list of ALL display columns INCLUDING the name field — this is the
   * user-reorderable column order. The name field is always present (can't be hidden)
   * but may sit anywhere in the order.
   */
  ColumnFields: string[];
  /** Non-name display columns (ColumnFields minus the name field), for cell building. */
  ExtraFieldNames: string[];
  /** Friendly headers for the extra columns, index-aligned with ExtraFieldNames. */
  ExtraHeaders: string[];
  /**
   * Code name of the related entity's `ExtendedType = 'Icon'` field, whose
   * per-row value is a FontAwesome class — or null if the entity has no such
   * field (then {@link EntityIcon} is used as a uniform fallback).
   */
  IconFieldName: string | null;
  /** Entity-level icon (`EntityInfo.Icon`) used when there's no per-row icon field. */
  EntityIcon: string | null;
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
export class MjFormFieldComponent extends BaseAngularComponent implements OnChanges, OnDestroy  {
  private cdr = inject(ChangeDetectorRef);
  private renderer = inject(Renderer2);
  private hostRef = inject(ElementRef<HTMLElement>);

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

  /**
   * Whether FK / record links are interactive. Driven by
   * `FormContext.enableRecordLinks`; false renders FK values as plain text
   * (dialog/slide-in surfaces). Undefined / true means links are live.
   */
  get RecordLinksEnabled(): boolean {
    return this.FormContext?.enableRecordLinks !== false;
  }

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

  /** Display name with search highlighting applied. Output is bound to `[innerHTML]`. */
  get HighlightedDisplayName(): string {
    return HighlightSearchMatches(this.DisplayName, this.FormContext?.sectionFilter ?? '', 'mj-forms-search-highlight');
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

    // If the FK value itself is null/empty, there's nothing to display
    // (the joined name field may still hold a stale cached value from the view)
    const fkValue = this.Value;
    if (fkValue == null || fkValue === '') return null;

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

    const md = this.ProviderToUse;
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
  /** Computed: dropdown is at least the trigger width, at most {@link DropdownMaxWidth}. */
  DropdownMinWidth = 0;
  DropdownMaxWidth = 0;
  OpenAbove = false;

  /**
   * Max width (px) of the FK suggestion dropdown. The panel grows to fit its
   * columns up to this cap (then scrolls horizontally). When null, defaults to
   * 2× the trigger width so multi-column rows aren't cramped by a narrow field.
   * Always additionally bounded by the viewport's right edge.
   */
  @Input() FKDropdownMaxWidth: number | null = null;

  /**
   * Whether to highlight the typed query substring within each suggestion's name
   * in the FK dropdown. On by default — uses the muted, theme-aware
   * `--mj-status-warning` highlight (not the old bright yellow). Set false for
   * plain, un-marked names.
   */
  @Input() FKHighlightMatches = true;

  /**
   * Whether to offer inline "create new" for the related record when the one you need
   * isn't found. The affordance only renders when this is true AND the current user can
   * create records of the related entity (entity allows creation + role permits it).
   */
  @Input() AllowFKCreate = true;

  /** Surface used for the inline create form: a modal dialog (default) or a slide-in. */
  @Input() FKCreatePresentation: 'dialog' | 'slide-in' = 'dialog';

  /** Cleanup function for scroll/resize listeners */
  private _scrollCleanup: (() => void) | null = null;

  /** Inline style for the fixed-position dropdown */
  get DropdownPositionStyle(): Record<string, string> {
    // min-width floors at the trigger width; max-width caps growth; the auto
    // intrinsic width then shrink-to-fits the columns between the two, and
    // `.mj-fk-options` scrolls horizontally once content exceeds the cap.
    const sizing = {
      'min-width': this.DropdownMinWidth + 'px',
      'max-width': this.DropdownMaxWidth + 'px',
      'width': 'max-content',
    };
    if (this.OpenAbove) {
      return {
        'position': 'fixed',
        'bottom': (window.innerHeight - this.DropdownTop) + 'px',
        'top': 'auto',
        'left': this.DropdownLeft + 'px',
        ...sizing,
        'z-index': '10000'
      };
    }
    return {
      'position': 'fixed',
      'top': this.DropdownTop + 'px',
      'bottom': 'auto',
      'left': this.DropdownLeft + 'px',
      ...sizing,
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
    // At least the trigger width; up to FKDropdownMaxWidth (default 2×), but never
    // past the viewport's right edge. Content fills between min and max; overflow
    // scrolls horizontally.
    this.DropdownMinWidth = rect.width;
    const desiredMax = this.FKDropdownMaxWidth ?? rect.width * 2;
    this.DropdownMaxWidth = Math.max(rect.width, Math.min(desiredMax, window.innerWidth - rect.left - 8));
  }

  // ---- Dropdown portal (escape transformed ancestors) ----

  /**
   * The dropdown is `position: fixed` with viewport coords. Inside the slide-in /
   * dialog overlays (which use CSS `transform`), a `fixed` descendant is positioned
   * relative to the transformed ancestor instead of the viewport, so it renders
   * off-screen. Re-parenting the dropdown element to `document.body` removes it from
   * any transformed containing block, restoring true viewport-fixed positioning.
   *
   * Call after change detection has rendered the dropdown (microtask). Angular still
   * owns the node — when the structural `@if` tears it down it removes the node by
   * reference regardless of where it currently lives, so no manual cleanup is needed
   * beyond clearing our tracking pointer.
   */
  private portalDropdownToBody(): void {
    // Already portaled and still in the DOM → nothing to do (e.g. typing while open).
    if (this._portaledDropdownEl?.isConnected) return;

    // The dropdown is rendered by `@if (ShowFKDropdown)`. On the synchronous cached
    // path (focus → searchCachedEntity → applySuggestions) the element may not be in
    // the DOM yet when we first look, so retry across a few frames until it renders.
    // (The async DB path lands here post-render, so it succeeds on the first try.)
    const tryPortal = (retriesLeft: number): void => {
      const host = this.hostRef?.nativeElement;
      if (!host) return;
      const dropdown = host.querySelector('.mj-fk-dropdown') as HTMLElement | null;
      if (dropdown) {
        if (dropdown.parentElement !== document.body) {
          this.renderer.appendChild(document.body, dropdown);
          this._portaledDropdownEl = dropdown;
        }
      } else if (retriesLeft > 0) {
        setTimeout(() => tryPortal(retriesLeft - 1), 0);
      }
    };
    Promise.resolve().then(() => tryPortal(5));
  }

  /** Tracks a dropdown element we relocated to body so we can drop the reference on close. */
  private _portaledDropdownEl: HTMLElement | null = null;

  /** Start listening for scroll/resize to close dropdowns */
  private startScrollListener(): void {
    this.stopScrollListener();

    const onScroll = (e: Event) => {
      // Scrolling WITHIN the dropdown (vertical list or horizontal column scroll)
      // must not close it — only an ancestor/page scroll, which would detach the
      // fixed-position panel from its trigger, should.
      const target = e.target as Node | null;
      if (this._portaledDropdownEl && target && this._portaledDropdownEl.contains(target)) return;
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
    this.FKActiveIndex = -1;
    this.FKLoading = false;
    this.FKNoMatches = false;
    this._portaledDropdownEl = null;
    this.ShowValueListDropdown = false;
    this.ShowSelectDropdown = false;
    this.stopScrollListener();
  }

  // ============================================
  // FK AUTOCOMPLETE (custom implementation)
  // ============================================

  /** Max rows shown on an empty-input focus-show (cached fast path only). */
  private static readonly FK_FOCUS_SHOW_LIMIT = 50;

  /** Max rows returned from a DB search. */
  private static readonly FK_DB_SEARCH_LIMIT = 20;

  /** Suggestions returned from the FK entity search */
  FKSuggestions: FKSuggestion[] = [];

  /**
   * The currently-linked record, pinned as a sticky "Currently selected" section at the
   * top of the dropdown (browse mode only). Null when there's no selection or the user is
   * actively filtering. Removed from {@link FKSuggestions} so it isn't listed twice.
   */
  FKSelectedSuggestion: FKSuggestion | null = null;

  /** Whether the current FK value is a confirmed match (user selected from dropdown) */
  FKIsMatched = false;

  /** Whether the FK dropdown is visible */
  ShowFKDropdown = false;

  /** Whether a DB search is currently in flight (drives the loading indicator). */
  FKLoading = false;

  /** True when a search completed with zero results (drives the "No matches" row). */
  FKNoMatches = false;

  /** Index of the keyboard-highlighted active suggestion (-1 = none). */
  FKActiveIndex = -1;

  /** Headers for the extra (DefaultInView) columns shown in the dropdown. */
  FKColumnHeaders: string[] = [];

  /** Field code names for the extra columns, index-aligned with {@link FKColumnHeaders}. */
  FKColumnFields: string[] = [];

  /** Code name of the name column (used as its sort key). */
  FKNameField = '';

  /** Whether rows render a leading icon column (drives the header's empty icon cell). */
  FKHasIconColumn = false;

  /** Active sort column (field code name), or null for natural (unsorted) order. */
  FKSortField: string | null = null;

  /** Active sort direction; only meaningful when {@link FKSortField} is set. */
  FKSortDir: 'asc' | 'desc' = 'asc';

  /** Unsorted snapshot of the current suggestions, used to restore natural order. */
  private _fkSuggestionsNatural: FKSuggestion[] = [];

  /** Text the user is currently typing in the FK search input. null = use display name. */
  private _fkInputText: string | null = null;

  /**
   * The active search query that produced the current results — `''` on a focus/clear
   * browse (full list), the typed text when filtering. Distinct from {@link _fkInputText},
   * which holds the *displayed* text (the selected record's name when not typing). This is
   * the correct signal for "browse mode" and for the create-footer label.
   */
  private _fkQuery = '';

  /** Debounce timer for FK search */
  private _fkSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Last known FK input element for position recalculation */
  private _lastFKInputEl: HTMLElement | null = null;

  /** Monotonic token so a slow DB response from a stale query can't clobber a newer one. */
  private _fkSearchSeq = 0;

  /** Cached column plan for the current related entity (rebuilt on demand). */
  private _fkColumnPlan: FKColumnPlan | null = null;

  // ---- Scope / search-field picker (Option B) ----

  /** Related-entity field code name currently searched against (defaults to the name field). */
  FKSearchField = '';

  /** Friendly label of {@link FKSearchField}, shown on the scope pill. */
  FKSearchFieldLabel = '';

  /** Whether the scope-picker menu is open. */
  FKShowScopeMenu = false;

  /** Whether the FK input is focused — the scope pill only appears while focused. */
  FKFocused = false;

  /** Fields the user can scope the search to (name + shown columns + other fields). */
  FKSearchableFields: FKSearchableField[] = [];

  // ---- Per-user persisted prefs (scope / sort / column widths) ----

  /** User-resized column widths in px, keyed by related-entity field code name. */
  private _fkColWidths: Record<string, number> = {};

  /** The (host entity|field) pref key currently loaded; reload when it changes. */
  private _fkPrefKey: string | null = null;

  /** Active column-resize drag, or null when not resizing. */
  private _fkResize: { field: string; startX: number; startWidth: number } | null = null;
  private _fkResizeMove: ((e: MouseEvent) => void) | null = null;
  private _fkResizeUp: (() => void) | null = null;

  /** The display text shown in the FK search input */
  get FKSearchText(): string {
    if (this._fkInputText !== null) return this._fkInputText;
    return this.FKDisplayName || '';
  }

  /**
   * True when this FK currently points at a real record (has a value AND we can show
   * its name). Drives the "linked" affordance — the chain icon + accent — so the user
   * can tell at a glance this is a resolved link, not free text.
   */
  get FKHasLinkedValue(): boolean {
    return this.Value != null && this.Value !== '' && this.FKDisplayName != null;
  }

  /** Whether a dropdown row is the record currently linked by this FK (UUID-safe compare). */
  IsFKRowSelected(suggestion: FKSuggestion): boolean {
    const v = this.Value;
    const pk = suggestion.PrimaryKeyValue;
    if (v == null || pk == null) return false;
    return UUIDsEqual(String(v), String(pk));
  }

  /**
   * Resolves the related `EntityInfo` for this FK field via the instance provider
   * (multi-provider safe — never the global `Metadata`).
   */
  private getRelatedEntityInfo(): EntityInfo | undefined {
    const relatedName = this.FieldInfo?.RelatedEntity;
    if (!relatedName) return undefined;
    return this.ProviderToUse.EntityByName(relatedName);
  }

  /**
   * Returns the LIVE cached array of records for the related entity IF a loaded
   * engine holds the full (unfiltered) set; otherwise null. Records are read-only —
   * never mutate. Wraps {@link BaseEngineRegistry.TryGetCachedRecords}.
   */
  private getCachedRecordsForRelatedEntity(): BaseEntity[] | null {
    const relatedName = this.FieldInfo?.RelatedEntity;
    if (!relatedName) return null;
    const registry = BaseEngineRegistry.Instance;
    const records = registry.TryGetCachedRecords<BaseEntity>(relatedName, { unfilteredOnly: true });
    // Treat an empty (or absent) cache as "no usable cache" so callers fall through
    // to the DB path and still show options on focus — never a blank dropdown.
    return records && records.length > 0 ? records : null;
  }

  /**
   * Builds (and memoizes) the column plan for the related entity: the name field,
   * the PK field used as the FK value, and the extra `DefaultInView` columns
   * (excluding the name + PK). Returns null when the related entity can't be resolved
   * or has no usable name/PK.
   */
  private buildColumnPlan(): FKColumnPlan | null {
    if (this._fkColumnPlan) {
      this.ensureLinkedFieldPrefsLoaded(this._fkColumnPlan);
      return this._fkColumnPlan;
    }

    const relatedEntity = this.getRelatedEntityInfo();
    if (!relatedEntity) return null;

    const nameField = relatedEntity.NameField;
    const pkFields = relatedEntity.PrimaryKeys;
    if (!nameField && (!pkFields || pkFields.length !== 1)) return null;

    const nameFieldName = nameField ? nameField.Name : pkFields[0].Name;
    const pkFieldName = this.FieldInfo?.RelatedEntityFieldName || (pkFields?.[0]?.Name ?? 'ID');

    // A field flagged ExtendedType='Icon' holds a per-row icon class — render it
    // as the row's leading glyph, not as a text column.
    const iconField = relatedEntity.Fields.find(f => f.ExtendedType === 'Icon');
    const iconFieldName = iconField?.Name ?? null;

    const columnFields = this.computeOrderedColumns(relatedEntity, nameFieldName, pkFieldName, iconFieldName);
    const extraFieldNames = columnFields.filter(c => c !== nameFieldName);

    this._fkColumnPlan = {
      NameFieldName: nameFieldName,
      PkFieldName: pkFieldName,
      ColumnFields: columnFields,
      ExtraFieldNames: extraFieldNames,
      ExtraHeaders: extraFieldNames.map(n => this.labelForRelatedField(n)),
      IconFieldName: iconFieldName,
      EntityIcon: relatedEntity.Icon || null
    };
    this.FKSearchableFields = this.buildSearchableFields(this._fkColumnPlan);
    this.ensureLinkedFieldPrefsLoaded(this._fkColumnPlan);
    return this._fkColumnPlan;
  }

  /**
   * Whether a `DefaultInView` field is worth showing as an extra dropdown column.
   * Excludes columns that read as opaque noise to a human picking a record:
   *   • Primary keys (UUIDs/identities).
   *   • Foreign-key columns — these hold the related record's raw ID (e.g. `ParentID`
   *     → a GUID), not a human-readable label. The view's joined *name* field (if it's
   *     itself `DefaultInView`) is the readable substitute and is kept.
   */
  private isUsefulExtraColumn(f: EntityFieldInfo): boolean {
    if (f.IsPrimaryKey) return false;
    if (f.RelatedEntityID && f.RelatedEntityID.length > 0) return false; // foreign key → raw ID
    return true;
  }

  /**
   * The ordered list of display columns INCLUDING the name field — the user-reorderable
   * column order. Honors a user `visibleFields` override (exact set + order, letting them
   * add fields like ID, drop defaults, or move the name field); otherwise falls back to
   * `[name, ...DefaultInView columns]`. The name field is always guaranteed present, and
   * the icon field is never a text column.
   */
  private computeOrderedColumns(
    relatedEntity: EntityInfo, nameFieldName: string, pkFieldName: string, iconFieldName: string | null
  ): string[] {
    const exists = (n: string) => n !== iconFieldName && !!relatedEntity.Fields.find(f => f.Name === n);

    const saved = this.fkHostEntityName && this.fkFieldCodeName
      ? LinkedFieldOptionsStore.Instance.Get(this.fkHostEntityName, this.fkFieldCodeName) : undefined;

    let cols: string[];
    if (saved?.visibleFields) {
      cols = saved.visibleFields.filter(exists);
      // Migrate older prefs (stored extras-only, without the name field) and guarantee
      // the name field is always present.
      if (!cols.includes(nameFieldName)) cols = [nameFieldName, ...cols];
    } else {
      const defaults = relatedEntity.Fields
        .filter(f => f.DefaultInView && f.Name !== nameFieldName && f.Name !== pkFieldName
          && f.Name !== iconFieldName && this.isUsefulExtraColumn(f))
        .map(f => f.Name);
      cols = [nameFieldName, ...defaults];
    }

    // De-dupe (preserve order) and ensure the name field is present.
    const seen = new Set<string>();
    const ordered = cols.filter(c => (seen.has(c) ? false : (seen.add(c), true)));
    if (!ordered.includes(nameFieldName)) ordered.unshift(nameFieldName);
    return ordered;
  }

  // ============================================
  // SCOPE PICKER + PER-USER PREFS
  // ============================================

  /** Host entity name (the entity whose form this field belongs to), or null. */
  private get fkHostEntityName(): string | null {
    return this.Record?.EntityInfo?.Name ?? null;
  }

  /** This FK field's code name on the host entity, or null. */
  private get fkFieldCodeName(): string | null {
    return this.FieldInfo?.Name ?? null;
  }

  /** Whether the active search column is the name field (drives where we highlight). */
  private isSearchingNameField(plan: FKColumnPlan): boolean {
    return !this.FKSearchField || this.FKSearchField === plan.NameFieldName;
  }

  /** A field is scope-searchable if it's a string column (LIKE-able) and not a system column. */
  private isScopeSearchableField(f: EntityFieldInfo): boolean {
    if (f.TSType !== EntityFieldTSType.String) return false;
    if (f.Name.startsWith('__mj_')) return false;
    return true;
  }

  /** Friendly label for a related-entity field code name. */
  private labelForRelatedField(name: string): string {
    return this.getRelatedEntityInfo()?.Fields.find(x => x.Name === name)?.DisplayNameOrName ?? name;
  }

  /** Whether a field code name exists on the related entity (guards stale saved prefs). */
  private isValidRelatedField(name: string): boolean {
    return !!this.getRelatedEntityInfo()?.Fields.find(x => x.Name === name);
  }

  /**
   * Build the scope-picker field list: the name + shown columns ('shown' group),
   * then any other searchable string fields like ID/Status ('other' group).
   */
  private buildSearchableFields(plan: FKColumnPlan): FKSearchableField[] {
    const re = this.getRelatedEntityInfo();
    if (!re) return [];
    const iconFor = (fieldName: string) => {
      if (fieldName === plan.NameFieldName) return 'fa-solid fa-font';
      return re.Fields.find(x => x.Name === fieldName)?.IsPrimaryKey ? 'fa-solid fa-hashtag' : 'fa-solid fa-tag';
    };
    // 'shown' group rendered in the actual column order so the menu matches the grid
    // (and so the up/down arrows hide correctly on the true first/last columns).
    const shown = new Set(plan.ColumnFields);
    const list: FKSearchableField[] = plan.ColumnFields.map(fieldName => ({
      FieldName: fieldName,
      Label: this.labelForRelatedField(fieldName),
      Icon: iconFor(fieldName),
      Group: 'shown' as const
    }));
    for (const f of re.Fields) {
      if (shown.has(f.Name) || f.Name === plan.IconFieldName) continue;
      if (!this.isScopeSearchableField(f)) continue;
      list.push({
        FieldName: f.Name,
        Label: f.DisplayNameOrName,
        Icon: f.IsPrimaryKey ? 'fa-solid fa-hashtag' : 'fa-solid fa-font',
        Group: 'other'
      });
    }
    return list;
  }

  /**
   * Load this (host entity, FK field)'s saved prefs — search scope, sort, column
   * widths — once per field. No-ops when the field hasn't changed. Falls back to
   * defaults (search the name field, natural sort, content-sized columns) and only
   * applies a saved value when it still resolves to a real field.
   */
  private ensureLinkedFieldPrefsLoaded(plan: FKColumnPlan): void {
    const key = this.fkHostEntityName && this.fkFieldCodeName
      ? `${this.fkHostEntityName}|${this.fkFieldCodeName}` : null;
    if (key === this._fkPrefKey) return;
    this._fkPrefKey = key;

    // Defaults
    this.FKSearchField = plan.NameFieldName;
    this._fkColWidths = {};

    const saved = this.fkHostEntityName && this.fkFieldCodeName
      ? LinkedFieldOptionsStore.Instance.Get(this.fkHostEntityName, this.fkFieldCodeName) : undefined;
    if (saved) {
      if (saved.searchField && this.isValidRelatedField(saved.searchField)) {
        this.FKSearchField = saved.searchField;
      }
      if (saved.sortField !== undefined && (saved.sortField === null || this.isValidRelatedField(saved.sortField))) {
        this.FKSortField = saved.sortField;
        this.FKSortDir = saved.sortDir ?? 'asc';
      }
      if (saved.colWidths) this._fkColWidths = { ...saved.colWidths };
    }
    this.FKSearchFieldLabel = this.labelForRelatedField(this.FKSearchField);
  }

  /** Format a raw cell value for display in the dropdown (delegates to the pure helper). */
  private formatCell(val: unknown): string {
    return FormatFKCell(val);
  }

  /**
   * Build the suggestion view-models from a set of plain rows (cached or DB),
   * applying the typed-query substring highlight to the name column.
   * `getField` abstracts cached BaseEntity rows (`.Get(name)`) vs simple objects.
   */
  private buildSuggestions(
    rows: ReadonlyArray<{ get: (field: string) => unknown }>,
    plan: FKColumnPlan,
    query: string
  ): FKSuggestion[] {
    const searchField = this.FKSearchField || plan.NameFieldName;
    // Only highlight the column actually being searched, and only when enabled.
    const nameQuery = (this.FKHighlightMatches && this.isSearchingNameField(plan)) ? query : '';
    return rows.map(row => {
      const name = this.formatCell(row.get(plan.NameFieldName));
      // Per-row icon from the entity's ExtendedType='Icon' field; else the
      // entity-level icon; else none.
      const rowIcon = plan.IconFieldName ? this.formatCell(row.get(plan.IconFieldName)).trim() : '';
      return {
        PrimaryKeyValue: row.get(plan.PkFieldName),
        DisplayName: name,
        // Empty query yields the (still HTML-escaped) plain name — no marks.
        HighlightedName: HighlightSearchMatches(name, nameQuery, 'mj-forms-search-highlight'),
        ExtraColumns: plan.ExtraFieldNames.map((fieldName, i) => {
          const value = this.formatCell(row.get(fieldName));
          const colQuery = (this.FKHighlightMatches && fieldName === searchField) ? query : '';
          return {
            FieldName: fieldName,
            Header: plan.ExtraHeaders[i],
            Value: value,
            HighlightedValue: HighlightSearchMatches(value, colQuery, 'mj-forms-search-highlight')
          };
        }),
        Icon: (rowIcon || plan.EntityIcon) || null
      };
    });
  }

  /** Apply a freshly-built suggestion list to the dropdown state + reposition + portal. */
  private applySuggestions(suggestions: FKSuggestion[], plan: FKColumnPlan): void {
    // Pinned "currently selected" row: in browse mode (empty query) with a valid linked
    // value, lift the selected record into a sticky section and remove it from the list so
    // the user can keep it or pick another without clearing first.
    this.FKSelectedSuggestion = null;
    const browseMode = this._fkQuery.trim().length === 0;
    if (browseMode && this.FKHasLinkedValue) {
      const idx = suggestions.findIndex(s => this.IsFKRowSelected(s));
      if (idx >= 0) {
        this.FKSelectedSuggestion = suggestions[idx];
        suggestions = suggestions.filter((_, i) => i !== idx);
      } else {
        // Selected record isn't in the (first-N) result — show a lightweight pinned row.
        this.FKSelectedSuggestion = this.buildSelectedFallbackSuggestion(plan);
      }
    }

    this._fkSuggestionsNatural = suggestions;
    this.FKNameField = plan.NameFieldName;
    // Full ordered column list (incl. the name field) + matching headers.
    this.FKColumnFields = plan.ColumnFields;
    this.FKColumnHeaders = plan.ColumnFields.map(c => c === plan.NameFieldName ? 'Name' : this.labelForRelatedField(c));
    this.FKHasIconColumn = (this.FKSelectedSuggestion?.Icon != null) || suggestions.some(s => s.Icon != null);
    this.FKSuggestions = this.sortSuggestions(suggestions);
    this.FKActiveIndex = this.FKSuggestions.length > 0 ? 0 : -1;
    this.FKNoMatches = suggestions.length === 0 && !this.FKSelectedSuggestion;

    // Show the dropdown for rows, a "no matches" state, or just the pinned selection.
    this.ShowFKDropdown = suggestions.length > 0 || this.FKNoMatches || !!this.FKSelectedSuggestion;
    if (this.ShowFKDropdown && this._lastFKInputEl) {
      this.updateDropdownPosition(this._lastFKInputEl);
      this.startScrollListener();
      this.portalDropdownToBody();
    }
    this.cdr.markForCheck();
  }

  /**
   * Build a lightweight pinned row for the selected record when it isn't present in the
   * current result set (DB beyond first-N, or cached beyond the focus-show limit). We have
   * its display name from the FK name resolution; extra-column values are left blank.
   */
  private buildSelectedFallbackSuggestion(plan: FKColumnPlan): FKSuggestion | null {
    const name = this.FKDisplayName;
    if (this.Value == null || this.Value === '' || !name) return null;
    return {
      PrimaryKeyValue: this.Value,
      DisplayName: name,
      HighlightedName: HighlightSearchMatches(name, '', 'mj-forms-search-highlight'),
      ExtraColumns: plan.ExtraFieldNames.map((fn, i) => ({
        FieldName: fn, Header: plan.ExtraHeaders[i], Value: '', HighlightedValue: ''
      })),
      Icon: plan.EntityIcon ?? null
    };
  }

  /**
   * Returns a sorted copy of the suggestions per the active sort column/direction.
   * Null sort field → natural order (original array, untouched). Sorts on the name
   * column's `DisplayName` or the matching extra column's formatted `Value`,
   * case-insensitively.
   */
  private sortSuggestions(suggestions: FKSuggestion[]): FKSuggestion[] {
    const field = this.FKSortField;
    if (!field) return suggestions;
    const keyOf = (s: FKSuggestion): string => {
      if (field === this.FKNameField) return s.DisplayName ?? '';
      return s.ExtraColumns.find(c => c.FieldName === field)?.Value ?? '';
    };
    const dir = this.FKSortDir === 'desc' ? -1 : 1;
    return [...suggestions].sort((a, b) =>
      dir * keyOf(a).localeCompare(keyOf(b), undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  /**
   * Toggle the sort on a column header: same column cycles asc → desc → none;
   * a new column starts at asc. Re-derives the visible list from the natural snapshot.
   */
  OnFKSortToggle(fieldName: string): void {
    if (this.FKSortField === fieldName) {
      if (this.FKSortDir === 'asc') this.FKSortDir = 'desc';
      else { this.FKSortField = null; this.FKSortDir = 'asc'; } // desc → cleared
    } else {
      this.FKSortField = fieldName;
      this.FKSortDir = 'asc';
    }
    this.FKSuggestions = this.sortSuggestions(this._fkSuggestionsNatural);
    this.FKActiveIndex = this.FKSuggestions.length > 0 ? 0 : -1;
    this.persistLinkedFieldSort();
    this.cdr.markForCheck();
  }

  /** Persist the active sort for this (host entity, FK field) pair. */
  private persistLinkedFieldSort(): void {
    if (this.fkHostEntityName && this.fkFieldCodeName) {
      LinkedFieldOptionsStore.Instance.SetSort(
        this.fkHostEntityName, this.fkFieldCodeName, this.FKSortField, this.FKSortDir
      );
    }
  }

  /** FontAwesome class for a column header's sort indicator (idle / asc / desc). */
  FKSortIcon(fieldName: string): string {
    if (this.FKSortField !== fieldName) return 'fa-solid fa-sort mj-fk-sort-icon mj-fk-sort-icon--idle';
    return this.FKSortDir === 'asc'
      ? 'fa-solid fa-sort-up mj-fk-sort-icon'
      : 'fa-solid fa-sort-down mj-fk-sort-icon';
  }

  // ---- Scope pill (search-field picker) ----

  /** Toggle the scope-picker menu. mousedown+preventDefault keeps the input focused. */
  OnFKScopeToggle(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.FKShowScopeMenu = !this.FKShowScopeMenu;
    this.cdr.markForCheck();
  }

  /** Whether a scope-menu row is the active search field. */
  IsFKScopeActive(field: FKSearchableField): boolean {
    return field.FieldName === (this.FKSearchField || this.FKNameField);
  }

  /** Whether there are non-visible searchable fields (drives the "Other fields" group). */
  get FKHasOtherSearchableFields(): boolean {
    return this.FKSearchableFields.some(f => f.Group === 'other');
  }

  /** User picked a field to search by — persist the override and re-run the search. */
  OnFKScopeSelect(event: MouseEvent, field: FKSearchableField): void {
    event.preventDefault();
    this.selectScope(field);
  }

  /** Set the active search field (used by click + the no-drag path of menu drag). */
  private selectScope(field: FKSearchableField): void {
    this.FKSearchField = field.FieldName;
    this.FKSearchFieldLabel = field.Label;
    this.FKShowScopeMenu = false;
    if (this.fkHostEntityName && this.fkFieldCodeName) {
      LinkedFieldOptionsStore.Instance.SetSearchField(this.fkHostEntityName, this.fkFieldCodeName, field.FieldName);
    }
    this.rerunCurrentFKSearch();
    this.cdr.markForCheck();
  }

  /** Re-run the active query against the (possibly newly-chosen) search field. */
  private rerunCurrentFKSearch(): void {
    const query = this._fkQuery;
    const cached = this.getCachedRecordsForRelatedEntity();
    if (cached) this.searchCachedEntity(cached, query);
    else void this.searchRelatedEntity(query);
  }

  // ---- Column visibility (show/hide a field as a column) ----

  /** Whether a field is currently rendered as a column (the Name column is always shown). */
  IsFKColumnVisible(field: FKSearchableField): boolean {
    return field.FieldName === this.FKNameField || this.FKColumnFields.includes(field.FieldName);
  }

  /** Whether this field's column visibility can be toggled (Name is always shown). */
  CanToggleFKColumn(field: FKSearchableField): boolean {
    return field.FieldName !== this.FKNameField;
  }

  /**
   * Toggle whether a field shows as a column. Persists the full visible set, then
   * rebuilds the column plan + re-runs the search so the grid reflects it live.
   * stopPropagation so the row's search-scope click doesn't also fire.
   */
  OnFKColumnToggle(event: MouseEvent, field: FKSearchableField): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.CanToggleFKColumn(field)) return;

    const next = [...this.FKColumnFields];
    const idx = next.indexOf(field.FieldName);
    if (idx >= 0) next.splice(idx, 1);
    else next.push(field.FieldName);
    this.applyVisibleColumns(next);
  }

  /** Persist a new visible-column set/order and rebuild the grid live. */
  private applyVisibleColumns(cols: string[]): void {
    if (this.fkHostEntityName && this.fkFieldCodeName) {
      LinkedFieldOptionsStore.Instance.SetVisibleFields(this.fkHostEntityName, this.fkFieldCodeName, cols);
    }
    this._fkColumnPlan = null; // force rebuild with the new column set/order
    this.rerunCurrentFKSearch();
    this.cdr.markForCheck();
  }

  // ---- Column reorder (up/down arrows in the field-selector menu) ----

  /** Whether the column can move up (it's a column and not already first). */
  CanMoveFKColumnUp(field: string): boolean {
    return this.FKColumnFields.indexOf(field) > 0;
  }

  /** Whether the column can move down (it's a column and not already last). */
  CanMoveFKColumnDown(field: string): boolean {
    const i = this.FKColumnFields.indexOf(field);
    return i >= 0 && i < this.FKColumnFields.length - 1;
  }

  /**
   * Move a column one slot up (delta -1) or down (delta +1) and persist. mousedown +
   * stopPropagation so the row's select-scope handler doesn't fire and the menu stays open.
   */
  MoveFKColumn(event: MouseEvent, field: string, delta: -1 | 1): void {
    event.preventDefault();
    event.stopPropagation();
    const cols = [...this.FKColumnFields];
    const i = cols.indexOf(field);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    this.applyVisibleColumns(cols);
  }

  /**
   * CSS `grid-template-columns` for the dropdown grid: optional icon column, then one
   * track per ordered column. The LAST column grows to fill any remaining width (`1fr`)
   * so the grid never leaves dead space on the right; earlier columns size to content.
   * A user-resized column uses its saved pixel width as the floor.
   */
  get FKGridTemplateColumns(): string {
    const cols: string[] = [];
    if (this.FKHasIconColumn) cols.push('min-content');
    const lastIdx = this.FKColumnFields.length - 1;
    this.FKColumnFields.forEach((field, i) => cols.push(this.fkColumnTrack(field, i === lastIdx)));
    return cols.join(' ');
  }

  /**
   * Track sizing for one column. Resized → fixed px (the last column still grows past it
   * via `1fr` when there's room). Default → content-sized, except the last column which
   * fills remaining space.
   */
  private fkColumnTrack(field: string, isLast: boolean): string {
    const w = this._fkColWidths[field];
    const min = field === this.FKNameField ? 120 : 80;
    if (w) return isLast ? `minmax(${w}px, 1fr)` : `${w}px`;
    return isLast ? `minmax(${min}px, 1fr)` : `minmax(${min}px, max-content)`;
  }

  /** Whether a column's cells should stretch to fill their track (last column or resized). */
  FKColumnFillsTrack(field: string, isLast: boolean): boolean {
    return isLast || this._fkColWidths[field] != null;
  }

  /** The built cell (value + highlighted html) for a non-name column of a suggestion. */
  FKCellFor(suggestion: FKSuggestion, field: string): FKSuggestionColumn | undefined {
    return suggestion.ExtraColumns.find(c => c.FieldName === field);
  }

  /** Header sort handler (grid headers click-to-sort only; drag-reorder is menu-only). */
  OnFKHeaderSort(event: MouseEvent, field: string): void {
    event.preventDefault(); // keep input focus so the body-portaled dropdown stays open
    this.OnFKSortToggle(field);
  }

  // ---- Column resize (drag a header's right edge) ----

  /** Begin resizing a column. stopPropagation so the header's sort handler doesn't fire. */
  OnFKColResizeStart(event: MouseEvent, field: string): void {
    event.preventDefault();
    event.stopPropagation();
    const headerCell = (event.target as HTMLElement).closest('.mj-fk-hcell') as HTMLElement | null;
    const startWidth = headerCell ? headerCell.offsetWidth : 120;
    this._fkResize = { field, startX: event.clientX, startWidth };
    this._fkResizeMove = (e: MouseEvent) => this.onFKColResizeMove(e);
    this._fkResizeUp = () => this.onFKColResizeEnd();
    document.addEventListener('mousemove', this._fkResizeMove);
    document.addEventListener('mouseup', this._fkResizeUp);
  }

  private onFKColResizeMove(e: MouseEvent): void {
    if (!this._fkResize) return;
    const width = Math.max(60, Math.round(this._fkResize.startWidth + (e.clientX - this._fkResize.startX)));
    this._fkColWidths = { ...this._fkColWidths, [this._fkResize.field]: width };
    this.cdr.markForCheck();
  }

  private onFKColResizeEnd(): void {
    if (this._fkResize) {
      const width = this._fkColWidths[this._fkResize.field];
      if (width && this.fkHostEntityName && this.fkFieldCodeName) {
        LinkedFieldOptionsStore.Instance.SetColWidth(
          this.fkHostEntityName, this.fkFieldCodeName, this._fkResize.field, width
        );
      }
    }
    this.teardownFKResizeListeners();
    this.cdr.markForCheck();
  }

  private teardownFKResizeListeners(): void {
    if (this._fkResizeMove) document.removeEventListener('mousemove', this._fkResizeMove);
    if (this._fkResizeUp) document.removeEventListener('mouseup', this._fkResizeUp);
    this._fkResize = null;
    this._fkResizeMove = null;
    this._fkResizeUp = null;
  }

  /** Handle typing in the FK search input */
  OnFKInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._fkInputText = input.value;
    this._lastFKInputEl = input;
    this.FKIsMatched = false;

    const query = this._fkInputText;

    // Cached fast path: filter the in-memory array immediately (no DB, no debounce).
    const cached = this.getCachedRecordsForRelatedEntity();
    if (cached) {
      if (this._fkSearchTimeout) { clearTimeout(this._fkSearchTimeout); this._fkSearchTimeout = null; }
      this.searchCachedEntity(cached, query);
      return;
    }

    // DB path: debounce a RunView search. Empty query (cleared field) → first N,
    // so clearing the field reveals the list rather than closing it.
    if (this._fkSearchTimeout) clearTimeout(this._fkSearchTimeout);
    this._fkSearchTimeout = setTimeout(() => {
      void this.searchRelatedEntity(this._fkInputText ?? '');
    }, 300);
  }

  /**
   * Show dropdown on focus. With a cached-unfiltered entity we immediately show the
   * first N rows (sorted by name) even on empty input — zero DB round-trips. Without
   * a cache we keep prior behavior: only re-open if we already have suggestions.
   */
  OnFKFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    this._lastFKInputEl = input;
    this.FKFocused = true; // reveal the scope pill while focused
    // Select any pre-filled (linked) text so the first keystroke replaces it instead
    // of appending — matches how a searchable dropdown behaves.
    if (input.value) input.select();
    this.showInitialFKSuggestions();
  }

  /**
   * Show the initial suggestion list (no/empty query): the full set from a cached
   * unfiltered engine, otherwise the first N rows via a DB query. Used on focus and
   * when the field is cleared, so the user always sees options without typing.
   */
  private showInitialFKSuggestions(): void {
    // Always show the FULL list (empty query) on focus/clear — even when a value is
    // already selected — so the user can browse and re-pick like a normal dropdown.
    // Filtering only kicks in once they actually type (OnFKInput).
    const cached = this.getCachedRecordsForRelatedEntity();
    if (cached) {
      if (this._fkSearchTimeout) { clearTimeout(this._fkSearchTimeout); this._fkSearchTimeout = null; }
      this.searchCachedEntity(cached, '');
      return;
    }
    void this.searchRelatedEntity('');
  }

  /**
   * In-memory search over a cached-unfiltered entity array. Case-insensitive substring
   * on the name field. Empty query → first N rows sorted by name (focus-show). Instant,
   * no spinner, no DB.
   */
  private searchCachedEntity(records: ReadonlyArray<BaseEntity>, query: string): void {
    const plan = this.buildColumnPlan();
    if (!plan) { this.closeFKDropdown(); this.cdr.markForCheck(); return; }

    this._fkQuery = query;
    const accessor = (r: BaseEntity) => ({ get: (field: string) => r.Get(field) });
    const searchField = this.FKSearchField || plan.NameFieldName;
    const matches = FilterCachedFKRows(
      records,
      query,
      MjFormFieldComponent.FK_FOCUS_SHOW_LIMIT,
      r => r.Get(searchField)
    );

    this.FKLoading = false;
    this.applySuggestions(this.buildSuggestions(matches.map(accessor), plan, query), plan);
  }

  /** Hide dropdown on blur, revert to matched name if user didn't select */
  OnFKBlur(): void {
    // Small delay so mousedown on dropdown items / scope menu fires first
    setTimeout(() => {
      this.closeFKDropdown();
      this.FKShowScopeMenu = false;
      this.FKFocused = false; // hide the scope pill
      // If user was typing but didn't select, revert to display name
      if (!this.FKIsMatched && this._fkInputText !== null) {
        this._fkInputText = null;
      }
      this.cdr.markForCheck();
    }, 200);
  }

  /**
   * Keyboard navigation in the FK input: ArrowDown/ArrowUp move the active row,
   * Enter selects it, Escape closes the dropdown.
   */
  OnFKKeydown(event: KeyboardEvent): void {
    if (!this.ShowFKDropdown || this.FKSuggestions.length === 0) {
      if (event.key === 'Escape') { this.closeFKDropdown(); this.cdr.markForCheck(); }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.FKActiveIndex = Math.min(this.FKActiveIndex + 1, this.FKSuggestions.length - 1);
        this.scrollActiveOptionIntoView();
        this.cdr.markForCheck();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.FKActiveIndex = Math.max(this.FKActiveIndex - 1, 0);
        this.scrollActiveOptionIntoView();
        this.cdr.markForCheck();
        break;
      case 'Enter': {
        const active = this.FKSuggestions[this.FKActiveIndex];
        if (active) {
          event.preventDefault();
          this.selectFKSuggestion(active);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeFKDropdown();
        this.cdr.markForCheck();
        break;
    }
  }

  /** Scroll the keyboard-active option into view inside the (possibly portaled) dropdown. */
  private scrollActiveOptionIntoView(): void {
    Promise.resolve().then(() => {
      const dropdown = this._portaledDropdownEl
        ?? (this.hostRef?.nativeElement?.querySelector('.mj-fk-dropdown') as HTMLElement | null);
      const active = dropdown?.querySelectorAll('.mj-fk-option')[this.FKActiveIndex] as HTMLElement | undefined;
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Select an item from the FK dropdown (mouse) */
  OnFKSelectItem(suggestion: FKSuggestion, event: MouseEvent): void {
    event.preventDefault();
    this.selectFKSuggestion(suggestion);
  }

  /** Shared selection logic for mouse-click and keyboard-Enter. */
  private selectFKSuggestion(suggestion: FKSuggestion): void {
    this._fkInputText = suggestion.DisplayName;
    this.Value = suggestion.PrimaryKeyValue;
    this.FKIsMatched = true;
    this.closeFKDropdown();

    // Update virtual name field for visual consistency after save
    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      this.Record.Set(nameFieldMap, suggestion.DisplayName);
    }
    this.cdr.markForCheck();
  }

  // ---- Inline "create new related record" ----

  /**
   * Whether to show the inline-create affordance: the field opts in (`AllowFKCreate`),
   * the related entity resolves, and the current user can create records of it (entity
   * allows creation + role permits — `GetUserPermisions().CanCreate` folds in `AllowCreateAPI`).
   */
  get CanCreateFK(): boolean {
    if (!this.AllowFKCreate) return false;
    const re = this.getRelatedEntityInfo();
    const user = this.ProviderToUse?.CurrentUser;
    if (!re || !user) return false;
    return re.GetUserPermisions(user)?.CanCreate === true;
  }

  /** Footer label: prefilled with the typed text when present, else generic "create new". */
  get FKCreateLabel(): string {
    const entityLabel = this.getRelatedEntityInfo()?.DisplayName || this.FieldInfo?.RelatedEntity || 'record';
    const query = this._fkQuery.trim();
    return query ? `Create "${query}"` : `Create new ${entityLabel}`;
  }

  /**
   * Ask the host (app layer) to create a new related record, prefilled with the typed
   * text as the name. We only EMIT the request — opening the form is the app's job (the
   * generic forms layer must not depend on the app-level form presenter). The host calls
   * `Complete(record)` when saved and we select it.
   */
  OnFKCreateNew(event: MouseEvent): void {
    event.preventDefault(); // don't blur the input before we capture the query
    const plan = this.buildColumnPlan();
    const relatedEntity = this.FieldInfo?.RelatedEntity;
    if (!plan || !relatedEntity) return;

    const query = this._fkQuery.trim();
    this.FKShowScopeMenu = false;
    this.FKFocused = false;
    this.closeFKDropdown();
    this.cdr.markForCheck();

    const newRecordValues: Record<string, unknown> = {};
    if (query) newRecordValues[plan.NameFieldName] = query;

    this.Navigate.emit({
      Kind: 'create-related',
      EntityName: relatedEntity,
      NewRecordValues: Object.keys(newRecordValues).length ? newRecordValues : undefined,
      Presentation: this.FKCreatePresentation,
      Provider: this.Provider ?? undefined,
      Complete: (created: BaseEntity | null) => { if (created) this.selectCreatedFKRecord(created, plan); },
    });
  }

  /** Select a freshly-created related record as this field's value. */
  private selectCreatedFKRecord(created: BaseEntity, plan: FKColumnPlan): void {
    const pk = created.Get(plan.PkFieldName);
    if (pk == null) return;
    const name = this.formatCell(created.Get(plan.NameFieldName));
    this._fkInputText = name;
    this.Value = pk;
    this.FKIsMatched = true;
    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) this.Record.Set(nameFieldMap, name);
    this.closeFKDropdown();
    this.cdr.markForCheck();
  }

  /** Clear FK value via the X button */
  OnFKClearClick(event: MouseEvent): void {
    // preventDefault keeps focus on the input (the button never steals it), so the
    // freshly-opened dropdown stays open for the user to pick a replacement.
    event.preventDefault();
    this.Value = null;
    this._fkInputText = null;
    this.FKIsMatched = false;
    this._resolvedFKName = undefined;
    this._resolvedFKValue = undefined;

    const nameFieldMap = this.FieldInfo?.RelatedEntityNameFieldMap;
    if (nameFieldMap) {
      this.Record.Set(nameFieldMap, '');
    }

    // Re-open the full list — clearing almost always precedes picking something else.
    this.showInitialFKSuggestions();
    this.cdr.markForCheck();
  }

  /** Close the FK dropdown and reset its transient view state. */
  private closeFKDropdown(): void {
    this.ShowFKDropdown = false;
    this.FKLoading = false;
    this.FKNoMatches = false;
    this.FKActiveIndex = -1;
    this.FKSelectedSuggestion = null;
    this._portaledDropdownEl = null;
    this.stopScrollListener();
  }

  /**
   * Perform a RunView search on the related entity's name field (DB path — used only
   * when no loaded engine caches the related entity unfiltered).
   * Falls back to searching by primary key when no NameField exists (single-field PKs only).
   */
  private async searchRelatedEntity(query: string): Promise<void> {
    const plan = this.buildColumnPlan();
    const fieldInfo = this.FieldInfo;
    if (!plan || !fieldInfo?.RelatedEntity) return;

    this._fkQuery = query;
    const seq = ++this._fkSearchSeq;
    this.FKLoading = true;
    this.FKNoMatches = false;
    this.ShowFKDropdown = true;
    if (this._lastFKInputEl) {
      this.updateDropdownPosition(this._lastFKInputEl);
      this.startScrollListener();
      this.portalDropdownToBody();
    }
    this.cdr.markForCheck();

    // Build Fields: PK + name + extra DefaultInView columns + the searched field +
    // the per-row icon field (when present), deduped via Set.
    const searchField = this.FKSearchField || plan.NameFieldName;
    const fields = Array.from(new Set([
      plan.PkFieldName, plan.NameFieldName, ...plan.ExtraFieldNames, searchField,
      ...(plan.IconFieldName ? [plan.IconFieldName] : [])
    ]));
    const escapedQuery = query.replace(/'/g, "''").trim();

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<Record<string, unknown>>({
      EntityName: fieldInfo.RelatedEntity,
      // Empty query (focus / cleared field) → no filter → first N rows.
      ExtraFilter: escapedQuery ? `[${searchField}] LIKE '%${escapedQuery}%'` : '',
      MaxRows: MjFormFieldComponent.FK_DB_SEARCH_LIMIT,
      ResultType: 'simple',
      Fields: fields
    });

    // Ignore stale responses (a newer keystroke already fired).
    if (seq !== this._fkSearchSeq) return;
    this.FKLoading = false;

    if (result.Success) {
      const accessor = (r: Record<string, unknown>) => ({ get: (field: string) => r[field] });
      this.applySuggestions(this.buildSuggestions(result.Results.map(accessor), plan, query), plan);
    } else {
      this.FKSuggestions = [];
      this.FKNoMatches = true;
      this.ShowFKDropdown = true;
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

  /** Whether the field's varchar(max) - long text that gets the wide read-only style */
  get IsLongText(): boolean {
    return this.FieldInfo?.Length === -1;
  }

  /**
   * Whether this field is large enough to be a candidate for rich-text (markdown/html)
   * auto-detection. Generic & multi-platform: keys off the TS type and character length
   * rather than a specific SQL type, so nvarchar(max)/ntext (MaxLength === 0 means
   * unlimited) and longer fixed fields (nvarchar(400)/varchar(500)/...) all qualify,
   * while short strings, UUIDs, numbers, dates, etc. do not.
   */
  get IsRichTextEligible(): boolean {
    const fi = this.FieldInfo;
    if (!fi || fi.TSType !== EntityFieldTSType.String) return false;
    const maxLen = fi.MaxLength;
    return maxLen === 0 || maxLen >= 255;
  }

  /**
   * Resolved rendering mode for this field. Honors an explicit `ExtendedType` first
   * ('Markdown' | 'HTML' | 'Code'); when `ExtendedType` is null, falls back to lightweight
   * client-side content detection — but only for {@link IsRichTextEligible} long-text fields.
   */
  get RichTextMode(): FieldRichTextMode {
    const fi = this.FieldInfo;
    if (!fi) return 'plain';

    switch (fi.ExtendedType) {
      case 'Markdown': return 'markdown';
      case 'HTML':     return 'html';
      case 'Code':     return 'code';
    }

    // Any other explicit ExtendedType (Email, URL, Geo*, Tel, ...) is not rich text here.
    if (fi.ExtendedType != null) return 'plain';

    // ExtendedType is null → auto-detect, but only on eligible long-text fields.
    if (!this.IsRichTextEligible) return 'plain';

    return this.detectFormat();
  }

  /** Backing snapshot for {@link EditRichTextMode}; null until first computed for the session. */
  private _editRichTextMode: FieldRichTextMode | null = null;

  /**
   * Stable rendering mode for EDIT mode. Unlike {@link RichTextMode} (which re-detects on the
   * live value), this is snapshotted when edit mode is entered so that typing markdown/html into
   * a plain textarea doesn't swap the control out from under the user mid-keystroke. Explicit
   * ExtendedType always wins regardless; only the auto-detect branch is frozen for the session.
   */
  get EditRichTextMode(): FieldRichTextMode {
    if (this._editRichTextMode === null) {
      this._editRichTextMode = this.RichTextMode;
    }
    return this._editRichTextMode;
  }

  /** Cached detection result, keyed by the exact string value it was computed from. */
  private _detectCacheValue: string | null = null;
  private _detectCacheResult: RichTextFormat = 'plain';

  /** Memoized content detection so the getter stays cheap under OnPush change detection. */
  private detectFormat(): RichTextFormat {
    const raw = this.Value;
    const text = raw == null ? '' : String(raw);
    if (text !== this._detectCacheValue) {
      this._detectCacheValue = text;
      this._detectCacheResult = detectRichTextFormat(text);
    }
    return this._detectCacheResult;
  }

  /**
   * Editor language for the code editor. In edit mode it tracks the frozen
   * {@link EditRichTextMode}; in read mode it tracks the live {@link RichTextMode}.
   */
  get CodeEditorLanguage(): string {
    const mode = this.EditMode ? this.EditRichTextMode : this.RichTextMode;
    switch (mode) {
      case 'markdown': return 'markdown';
      case 'html':     return 'html';
      case 'code':     return this.codeTypeToLanguage(this.FieldInfo?.CodeType);
      default:         return '';
    }
  }

  /** Map the field's CodeType metadata value to a CodeMirror language id. */
  private codeTypeToLanguage(codeType: string | null | undefined): string {
    switch (codeType) {
      case 'CSS':        return 'css';
      case 'HTML':       return 'html';
      case 'JavaScript': return 'javascript';
      case 'SQL':        return 'sql';
      case 'TypeScript': return 'typescript';
      default:           return ''; // 'Other' / null → plain code editing
    }
  }

  /** Handle value changes coming from the embedded code editor (emits a plain string). */
  OnCodeEditorChange(value: string): void {
    this.Value = value;
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
        this._fkQuery = '';
        this.FKSuggestions = [];
        this.FKSelectedSuggestion = null;
        this.ShowFKDropdown = false;
        this.FKActiveIndex = -1;
        this.FKLoading = false;
        this.FKNoMatches = false;
        this.FKColumnHeaders = [];
        this.FKColumnFields = [];
        this.FKSortField = null;
        this.FKSortDir = 'asc';
        this._fkSuggestionsNatural = [];
        this.FKSearchableFields = [];
        this.FKShowScopeMenu = false;
        this.FKFocused = false;
        this._fkColWidths = {};
        this._fkPrefKey = null; // force prefs reload for the new field
        this._portaledDropdownEl = null;
        this._fkColumnPlan = null;
        this._resolvedFKName = undefined;
        this._resolvedFKValue = undefined;
        this._fkNameLoading = false;
        // Reset validation state for new record
        this._touched = false;
        this._fieldErrors = [];
        // Invalidate cached rich-text detection (recomputed lazily for the new value)
        this._detectCacheValue = null;
        this._detectCacheResult = 'plain';
        this._editRichTextMode = null;
      }
      // Reset validation state when exiting edit mode
      if (changes['EditMode'] && !this.EditMode) {
        this._touched = false;
        this._fieldErrors = [];
      }
      // Re-snapshot the edit-mode rendering decision whenever edit mode toggles
      if (changes['EditMode']) {
        this._editRichTextMode = null;
      }
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this._fkSearchTimeout) {
      clearTimeout(this._fkSearchTimeout);
    }
    this.teardownFKResizeListeners();
    this.stopScrollListener();
    // If we relocated the dropdown to <body> and Angular tears us down while it's
    // still open, remove the orphaned node ourselves (Angular removes by reference,
    // but guard against a race where the view is destroyed before the @if updates).
    if (this._portaledDropdownEl && this._portaledDropdownEl.parentElement === document.body) {
      this.renderer.removeChild(document.body, this._portaledDropdownEl);
    }
    this._portaledDropdownEl = null;
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
