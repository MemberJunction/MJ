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
 *   [(ngModel)]="selectedId"
 *   [ValuePrimitive]="true"
 *   [Filterable]="true"
 *   (FilterChange)="onFilter($event)">
 * </mj-dropdown>
 * ```
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
  /**
   * Host-driven disable. Composed with Angular Forms' `setDisabledState()` into `IsDisabled`
   * (the actual gate) — see `syncDisabled`. A setter, not a bare field, because this input is
   * routinely bound to an expression that changes over the control's lifetime
   * (`[Disabled]="!draft.CompanyID"`), and the gate has to follow it every time.
   */
  @Input()
  set Disabled(value: boolean) {
    this.disabledInput = value;
    this.syncDisabled();
  }
  get Disabled(): boolean {
    return this.disabledInput;
  }
  @Input() Placeholder = 'Select...';
  @Input() DefaultItem: Record<string, unknown> | string | null = null;

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
  /**
   * The single gate on `Toggle()` / `Open()` — true when EITHER the `Disabled` input or Angular
   * Forms says so. Never assign it directly; go through `syncDisabled()` so both sources are
   * always composed and a lock closes an open panel.
   */
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

  /** Backing field for the `Disabled` input. */
  private disabledInput = false;
  /** The forms-driven disabled state, kept SEPARATE so neither source can stomp the other. */
  private formDisabled = false;

  /**
   * Recompute the gate from both of its sources. Called whenever either changes.
   *
   * `IsDisabled` is derived state, and the only thing that assigned it was `setDisabledState()`.
   * The forms-driven half was in fact fine — `setUpControl` also wires `registerOnDisabledChange`,
   * so that hook fires on every `control.disable()`/`enable()`, not just at registration. What had
   * no recompute path at all was the `Disabled` @Input: a plain field, so the gate froze at
   * whatever the first compose produced and every later change to the input was dropped.
   *
   * That is how a `[Disabled]="!draft.CompanyID"` picker stayed dead for the life of the
   * component after the company was finally chosen.
   */
  private syncDisabled(): void {
    const disabled = this.disabledInput || this.formDisabled;
    if (disabled === this.IsDisabled) return;
    this.IsDisabled = disabled;
    // Becoming disabled while the panel is open would otherwise leave an interactive list
    // hanging off a control the user can no longer operate.
    if (disabled) this.resetPanelState();
    this.cdr.markForCheck();
  }

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
    this.resetPanelState();
    this.cdr.detectChanges();
  }

  /**
   * Panel state only — no change detection. Split out of `Close()` because `syncDisabled()` can
   * run from an @Input setter, i.e. DURING the parent's change-detection pass, where a nested
   * `detectChanges()` re-enters CD and trips NG0100 on the parent's own bindings.
   */
  private resetPanelState(): void {
    this.IsOpen = false;
    this.filterText = '';
    this.HighlightedIndex = -1;
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
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
  ngOnDestroy(): void { this.Close(); }

  private getSelectedIndex(): number {
    if (this.SelectedValue == null) return -1;
    return this.FilteredItems.findIndex(item => this.IsItemSelected(item));
  }
}
