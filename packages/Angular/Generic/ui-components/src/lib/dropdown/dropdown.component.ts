import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  HostBinding,
  ElementRef,
  ViewChild,
  ContentChild,
  TemplateRef,
  OnDestroy,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';

/**
 * mj-dropdown — Dropdown select component using CDK Overlay.
 *
 * Replaces `<kendo-dropdownlist>`.
 *
 * Every dropdown needs an ACCESSIBLE NAME, or it announces as "combobox, collapsed" with no hint of
 * what it selects (WCAG 2.1 4.1.2). Use {@link AriaLabelledBy} when a visible label already exists —
 * `<label for>` cannot name a `div[role=combobox]` — and {@link AriaLabel} when none does.
 *
 * @example With a visible label (preferred)
 * ```html
 * <span id="persona-label">Interview persona</span>
 * <mj-dropdown
 *   AriaLabelledBy="persona-label"
 *   [Data]="items"
 *   TextField="name"
 *   ValueField="id"
 *   [(ngModel)]="selectedId"
 *   [ValuePrimitive]="true">
 * </mj-dropdown>
 * ```
 *
 * @example With no visible label
 * ```html
 * <mj-dropdown
 *   AriaLabel="Interview persona"
 *   [Data]="items"
 *   TextField="name"
 *   ValueField="id"
 *   AriaLabel="Status"
 *   [(ngModel)]="selectedId"
 *   [ValuePrimitive]="true"
 *   [Filterable]="true"
 *   (FilterChange)="onFilter($event)">
 * </mj-dropdown>
 * ```
 *
 * ## Accessibility
 *
 * The trigger is the focusable element and its only text is the selected value, so it has no
 * accessible name of its own. Give every dropdown one of:
 *
 * - `AriaLabel="Status"` — when the control has no visible label; or
 * - `[AriaLabelledBy]="'status-label-id'"` — when a visible label element exists (preferred:
 *   the name then follows that element's text).
 *
 * `Placeholder` is NOT a name: it is replaced by the value the moment one is selected.
 */
@Component({
  selector: 'mj-dropdown',
  standalone: true,
  imports: [NgTemplateOutlet, OverlayModule],
  template: `
    <div
      class="mj-dropdown"
      #trigger
      cdkOverlayOrigin
      #overlayOrigin="cdkOverlayOrigin"
      [class.mj-dropdown--open]="IsOpen"
      [class.mj-dropdown--disabled]="IsDisabled"
      role="combobox"
      [attr.id]="InputId || null"
      [attr.aria-label]="AriaLabel || null"
      [attr.aria-labelledby]="AriaLabelledBy || null"
      [attr.aria-describedby]="AriaDescribedBy || null"
      [attr.aria-expanded]="IsOpen"
      [attr.aria-label]="AriaLabel || null"
      [attr.aria-labelledby]="AriaLabelledBy || null"
      aria-haspopup="listbox"
      [attr.aria-controls]="IsOpen ? ListboxId : null"
      [attr.aria-disabled]="IsDisabled ? 'true' : null"
      [attr.tabindex]="IsDisabled ? -1 : 0"
      (click)="Toggle()"
      (keydown)="OnKeyDown($event)"
      (blur)="OnBlur()">
      <span class="mj-dropdown-value" [class.mj-dropdown-placeholder]="!HasValue">
        {{ DisplayText }}
      </span>
      <i class="fa-solid fa-chevron-down mj-dropdown-arrow"></i>
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="overlayOrigin"
      [cdkConnectedOverlayOpen]="IsOpen"
      [cdkConnectedOverlayPositions]="Positions"
      [cdkConnectedOverlayWidth]="TriggerWidth"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="mj-dropdown-backdrop"
      (backdropClick)="Close()"
      (detach)="Close()">
      <div class="mj-dropdown-panel" role="listbox"
        [attr.id]="ListboxId"
        [attr.aria-label]="AriaLabel || null"
        [attr.aria-labelledby]="AriaLabelledBy || null">
        @if (Filterable) {
          <div class="mj-dropdown-filter-wrap">
            <!--
              The word "Filter" lives in a hidden span rather than in a concatenated string so the
              AriaLabelledBy path can NAME this box from the same visible label that names the
              dropdown: aria-labelledby takes an ID LIST, so "Filter" plus the label's own text is
              composed by the accessibility tree without this component ever seeing that text.
              Without it, every filterable dropdown on a form named this way announces as an
              identical "Filter options".
            -->
            <span class="mj-dropdown-sr-only" [attr.id]="FilterWordId">Filter</span>
            <input
              #filterInput
              class="mj-input mj-dropdown-filter"
              type="text"
              placeholder="Filter..."
              [attr.aria-labelledby]="FilterLabelledBy"
              [attr.aria-label]="FilterLabelledBy ? null : FilterLabel"
              [value]="filterText"
              (input)="OnFilterInput($event)"
              (keydown)="OnKeyDown($event)" />
          </div>
        }
        @if (DefaultItem != null) {
          <div
            class="mj-dropdown-option mj-dropdown-option--default"
            [class.mj-dropdown-option--selected]="SelectedValue == null"
            [class.mj-dropdown-option--highlighted]="HighlightedIndex === -1"
            role="option"
            [attr.aria-selected]="SelectedValue == null"
            (click)="SelectItem(null, $event)">
            {{ GetItemText(DefaultItem) }}
          </div>
        }
        @for (item of FilteredItems; track TrackByIndex($index)) {
          <div
            class="mj-dropdown-option"
            [class.mj-dropdown-option--selected]="IsItemSelected(item)"
            [class.mj-dropdown-option--highlighted]="HighlightedIndex === $index"
            role="option"
            [attr.aria-selected]="IsItemSelected(item)"
            (click)="SelectItem(item, $event)">
            @if (itemTemplate) {
              <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: item }"></ng-container>
            } @else {
              {{ GetItemText(item) }}
            }
          </div>
        }
        @if (FilteredItems.length === 0) {
          <div class="mj-dropdown-no-data">No data found</div>
        }
      </div>
    </ng-template>
  `,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MJDropdownComponent),
    multi: true
  }]
})
export class MJDropdownComponent implements ControlValueAccessor, OnDestroy {
  /**
   * Accessible name for the combobox (#3860). Without one — and with no visible label wired via
   * {@link AriaLabelledBy} — the control announces as an UNNAMED combobox, which fails WCAG 2.1
   * 4.1.2 (Name, Role, Value): "combobox, collapsed" with no hint of what it selects. Applied as
   * `aria-label` on the trigger AND on the popup listbox, so both halves announce the same name.
   */
  @Input() AriaLabel = '';

  /**
   * The id of a VISIBLE label element that names this control — the preferred wiring when a label
   * already exists on screen (an `aria-label` would duplicate its text and drift on rename). This,
   * not `<label for>`, is the visible-label path: the trigger is a `div[role=combobox]`, and the
   * label-for association only names labelable form elements. `aria-labelledby` beats `AriaLabel`
   * in the accessible-name computation where both are present. Applied to trigger AND listbox.
   */
  @Input() AriaLabelledBy = '';

  /**
   * `id` for the combobox trigger, so other markup can REFERENCE it — `aria-controls`, hint text,
   * test hooks. It is deliberately not documented as a `<label for>` target: the trigger is a div,
   * which `label[for]` neither names nor focuses. To name the control from a visible label, put an
   * id on the LABEL and pass it as {@link AriaLabelledBy}.
   */
  @Input() InputId = '';

  /** `aria-describedby` passthrough for hint/error text — same shape of gap as the name. */
  @Input() AriaDescribedBy = '';

  @Input() Data: Record<string, unknown>[] | string[] | readonly unknown[] | null = [];
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() Filterable = false;
  @Input() ValuePrimitive = false;
  @Input() Disabled = false;
  @Input() Placeholder = 'Select...';
  @Input() DefaultItem: Record<string, unknown> | string | null = null;
  /**
   * Accessible name for the dropdown, applied as `aria-label` on the focusable trigger.
   *
   * The trigger is a `role="combobox"` div whose only text content is the CURRENT VALUE, so
   * without this a screen reader announces the selected item as though it were the control's
   * name ("Active, combobox") and the user never learns what the control is for. Set this
   * whenever the dropdown is not already named by a visible `<label>`-style element; prefer
   * {@link AriaLabelledBy} when such an element exists, so the name stays in sync with it.
   */
  @Input() AriaLabel = '';
  /**
   * Id of the element that labels this dropdown, applied as `aria-labelledby` on the trigger.
   * Takes precedence over {@link AriaLabel} per the accname spec when both are set.
   */
  @Input() AriaLabelledBy = '';

  @Output() FilterChange = new EventEmitter<string>();
  @Output() ValueChange = new EventEmitter<unknown>();

  @ContentChild('mjDropdownItem') itemTemplate: TemplateRef<{ $implicit: unknown }> | null = null;

  @ViewChild('trigger') private triggerEl!: ElementRef<HTMLElement>;
  @ViewChild('filterInput') private filterInputEl: ElementRef<HTMLInputElement> | undefined;

  @HostBinding('class.mj-dropdown-host') readonly hostClass = true;

  private cdr = inject(ChangeDetectorRef);
  private static nextId = 0;

  DropdownId = MJDropdownComponent.nextId++;

  /**
   * Id of the popup listbox, so the trigger can point `aria-controls` at it while open — the half of
   * the combobox pattern that makes "collapsed/expanded" refer to something a screen reader can
   * find. Generated per instance from the same `static nextId` counter `dialog`, `window` and
   * `accordion` use in this package.
   */
  get ListboxId(): string { return `mj-dropdown-listbox-${this.DropdownId}`; }

  /** Id of the hidden "Filter" word, composed into the filter box's name via an id list. */
  get FilterWordId(): string { return `mj-dropdown-filter-word-${this.DropdownId}`; }

  /**
   * `aria-labelledby` for the filter box when the dropdown is named by a VISIBLE label: "Filter"
   * plus that label's own text, composed by the accessibility tree. Empty when there is no such
   * label, in which case {@link FilterLabel} supplies a string instead.
   */
  get FilterLabelledBy(): string { return this.AriaLabelledBy ? `${this.FilterWordId} ${this.AriaLabelledBy}` : ''; }

  /**
   * `aria-label` for the filter box in the no-visible-label case.
   *
   * The "filter" guard is not cosmetic: this repo's house habit is `AriaLabel="Filter roles"`, and
   * an unconditional prefix announces that box as "Filter Filter roles". A name that already begins
   * with the word is used as-is.
   */
  get FilterLabel(): string {
    const name = this.AriaLabel.trim();
    if (!name) return 'Filter options';
    return /^filter\b/i.test(name) ? name : `Filter ${name}`;
  }
  IsOpen = false;
  IsDisabled = false;
  HighlightedIndex = -1;
  SelectedValue: unknown = null;
  TriggerWidth = 0;

  filterText = '';

  Positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
  ];

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  get FilteredItems(): unknown[] {
    const data = (this.Data ?? []) as unknown[];
    if (!this.Filterable || !this.filterText) return data;
    const search = this.filterText.toLowerCase();
    return data.filter(item => this.GetItemText(item).toLowerCase().includes(search));
  }

  get HasValue(): boolean { return this.SelectedValue != null; }

  get DisplayText(): string {
    if (this.SelectedValue == null) {
      if (this.DefaultItem != null) return this.GetItemText(this.DefaultItem);
      return this.Placeholder;
    }
    if (this.ValuePrimitive && this.ValueField) {
      const found = ((this.Data ?? []) as unknown[]).find(item => this.GetItemValue(item) === this.SelectedValue);
      return found ? this.GetItemText(found) : String(this.SelectedValue);
    }
    return this.GetItemText(this.SelectedValue as Record<string, unknown> | string);
  }

  Toggle(): void {
    if (this.IsDisabled) return;
    this.IsOpen ? this.Close() : this.Open();
  }

  Open(): void {
    if (this.IsDisabled || this.IsOpen) return;
    this.TriggerWidth = this.triggerEl?.nativeElement.offsetWidth ?? 200;
    this.IsOpen = true;
    this.HighlightedIndex = this.getSelectedIndex();
    this.cdr.detectChanges();
    if (this.Filterable) setTimeout(() => this.filterInputEl?.nativeElement.focus(), 0);
  }

  Close(): void {
    if (!this.IsOpen) return;
    this.IsOpen = false;
    this.filterText = '';
    this.HighlightedIndex = -1;
    this.cdr.detectChanges();
  }

  SelectItem(item: unknown | null, event?: Event): void {
    event?.stopPropagation();
    if (item == null) {
      this.SelectedValue = null;
      this.onChange(null);
      this.ValueChange.emit(null);
    } else if (this.ValuePrimitive && this.ValueField) {
      const value = this.GetItemValue(item);
      this.SelectedValue = value;
      this.onChange(value);
      this.ValueChange.emit(value);
    } else {
      this.SelectedValue = item;
      this.onChange(item);
      this.ValueChange.emit(item);
    }
    this.Close();
  }

  IsItemSelected(item: unknown): boolean {
    if (this.SelectedValue == null) return false;
    if (this.ValuePrimitive && this.ValueField) return this.GetItemValue(item) === this.SelectedValue;
    if (this.ValueField && typeof item === 'object' && typeof this.SelectedValue === 'object')
      return this.GetItemValue(item) === this.GetItemValue(this.SelectedValue);
    return item === this.SelectedValue;
  }

  OnFilterInput(event: Event): void {
    this.filterText = (event.target as HTMLInputElement).value;
    this.HighlightedIndex = 0;
    this.FilterChange.emit(this.filterText);
  }

  OnKeyDown(event: KeyboardEvent): void {
    const items = this.FilteredItems;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.IsOpen) this.Open();
        else this.HighlightedIndex = Math.min(this.HighlightedIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.IsOpen) this.HighlightedIndex = Math.max(this.HighlightedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.IsOpen && this.HighlightedIndex >= 0 && this.HighlightedIndex < items.length)
          this.SelectItem(items[this.HighlightedIndex]);
        else if (!this.IsOpen) this.Open();
        break;
      case 'Escape': event.preventDefault(); this.Close(); break;
      case 'Home': if (this.IsOpen) { event.preventDefault(); this.HighlightedIndex = 0; } break;
      case 'End': if (this.IsOpen) { event.preventDefault(); this.HighlightedIndex = items.length - 1; } break;
    }
  }

  OnBlur(): void { this.onTouched(); }

  GetItemText(item: unknown): string {
    if (item == null) return '';
    if (typeof item === 'string') return item;
    if (this.TextField && typeof item === 'object') return String((item as Record<string, unknown>)[this.TextField] ?? '');
    return String(item);
  }

  GetItemValue(item: unknown): unknown {
    if (typeof item === 'string') return item;
    if (this.ValueField && typeof item === 'object' && item != null) return (item as Record<string, unknown>)[this.ValueField];
    return item;
  }

  TrackByIndex(index: number): number { return index; }

  writeValue(value: unknown): void { this.SelectedValue = value; }
  registerOnChange(fn: (value: unknown) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.IsDisabled = isDisabled || this.Disabled; }
  ngOnDestroy(): void { this.Close(); }

  private getSelectedIndex(): number {
    if (this.SelectedValue == null) return -1;
    return this.FilteredItems.findIndex(item => this.IsItemSelected(item));
  }
}
