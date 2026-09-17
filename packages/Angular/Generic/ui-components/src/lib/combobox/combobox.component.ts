import {
  AfterViewInit,
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
import { MJNamedControlBase } from '../a11y/named-control.base';
import { warnIfUnnamed } from '../a11y/unnamed-control-guard';

/**
 * mj-combobox — Editable dropdown with filtering and optional custom values.
 *
 * Replaces `<kendo-combobox>`. Unlike mj-dropdown, the trigger is a text input
 * that filters the list as you type. When AllowCustom is true, typed text that
 * doesn't match any item is emitted as the value.
 *
 * Every combobox needs an ACCESSIBLE NAME, or it announces as "combobox, collapsed" with no hint of
 * what it selects (WCAG 2.1 4.1.2). Use {@link MJNamedControlBase.AriaLabelledBy} when a visible
 * label already exists and {@link MJNamedControlBase.AriaLabel} when none does. Here the trigger is
 * a real `<input>`, so {@link MJNamedControlBase.InputId} IS a valid `<label for>` target — unlike
 * `mj-dropdown`, whose trigger is a div.
 *
 * @example With a visible label (preferred)
 * ```html
 * <span id="category-label">Category</span>
 * <mj-combobox AriaLabelledBy="category-label" [Data]="categories" TextField="text"
 *   ValueField="value" [(ngModel)]="selectedCategory" [ValuePrimitive]="true">
 * </mj-combobox>
 * ```
 *
 * @example
 * ```html
 * <mj-combobox
 *   [Data]="categories"
 *   TextField="text"
 *   ValueField="value"
 *   [(ngModel)]="selectedCategory"
 *   [ValuePrimitive]="true"
 *   [AllowCustom]="true"
 *   [Filterable]="true"
 *   Placeholder="Select or enter new...">
 * </mj-combobox>
 * ```
 */
@Component({
  selector: 'mj-combobox',
  standalone: true,
  imports: [NgTemplateOutlet, OverlayModule],
  template: `
    <div
      class="mj-combobox"
      #trigger
      cdkOverlayOrigin
      #overlayOrigin="cdkOverlayOrigin"
      [class.mj-combobox--open]="IsOpen"
      [class.mj-combobox--disabled]="IsDisabled">
      <!--
        role="combobox" belongs on the INPUT, not on this wrapper. The wrapper is not focusable, so
        a screen reader never lands on it: its role, its name and its expanded state all went
        unannounced while the element the user actually focused announced as a plain textbox.
      -->
      <input
        #comboInput
        class="mj-input mj-combobox-input"
        type="text"
        role="combobox"
        [attr.id]="InputId || null"
        [attr.aria-label]="AriaLabel || null"
        [attr.aria-labelledby]="AriaLabelledBy || null"
        [attr.aria-describedby]="AriaDescribedBy || null"
        [attr.aria-expanded]="IsOpen"
        aria-haspopup="listbox"
        [attr.aria-autocomplete]="Filterable ? 'list' : 'none'"
        [attr.aria-controls]="IsOpen ? ListboxId : null"
        [attr.aria-activedescendant]="ActiveDescendantId"
        [placeholder]="Placeholder"
        [value]="InputText"
        [disabled]="IsDisabled"
        (input)="OnInput($event)"
        (focus)="OnFocus()"
        (keydown)="OnKeyDown($event)"
        (blur)="OnInputBlur()"
        autocomplete="off" />
      <!--
        The fixed words live in hidden spans rather than in concatenated strings so the
        AriaLabelledBy path can name these two buttons from the same visible label that names the
        combobox: aria-labelledby takes an ID LIST, so the word plus the label's own text is
        composed by the accessibility tree without this component ever seeing that text.
        A hidden node that is DIRECTLY referenced by aria-labelledby is still included in the name
        (accname §4.1), so aria-hidden keeps the word out of the reading order without costing the
        composed name.
      -->
      <span class="mj-combobox-sr-only" aria-hidden="true" [attr.id]="SecondaryWordId('clear-word')">Clear</span>
      <span class="mj-combobox-sr-only" aria-hidden="true" [attr.id]="SecondaryWordId('toggle-word')">Show options for</span>
      @if (InputText && !IsDisabled) {
        <button
          class="mj-combobox-clear"
          type="button"
          tabindex="-1"
          (mousedown)="OnClear($event)"
          [attr.aria-labelledby]="ClearLabelledBy || null"
          [attr.aria-label]="ClearLabelledBy ? null : ClearLabel">
          <i class="fa-solid fa-times"></i>
        </button>
      }
      <button
        class="mj-combobox-toggle"
        type="button"
        tabindex="-1"
        [disabled]="IsDisabled"
        (mousedown)="OnToggleMouseDown($event)"
        [attr.aria-labelledby]="ToggleLabelledBy || null"
        [attr.aria-label]="ToggleLabelledBy ? null : ToggleLabel">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
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
        @for (item of FilteredItems; track TrackByIndex($index)) {
          <div
            class="mj-dropdown-option"
            [class.mj-dropdown-option--selected]="IsItemSelected(item)"
            [class.mj-dropdown-option--highlighted]="HighlightedIndex === $index"
            role="option"
            [attr.id]="OptionId($index)"
            [attr.aria-selected]="IsItemSelected(item)"
            (mousedown)="SelectItem(item, $event)">
            @if (ItemTemplate) {
              <ng-container *ngTemplateOutlet="ItemTemplate; context: { $implicit: item }"></ng-container>
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
  styles: [`
  /*
   * Component-scoped ON PURPOSE, unlike the rest of this control's styling, which ships as a global
   * stylesheet the host application imports. A host that skips that import gets unstyled chrome —
   * survivable — but a hidden-word span that is not hidden renders its word as literal text in the
   * middle of the field. The rule that hides it therefore has to travel with the component.
   *
   * Not display:none or visibility:hidden — both remove the element from the accessibility tree,
   * which is the one thing this element exists to be in.
   */
  .mj-combobox-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  `],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MJComboboxComponent),
    multi: true
  }]
})
export class MJComboboxComponent extends MJNamedControlBase implements ControlValueAccessor, AfterViewInit, OnDestroy {
  @Input()
  set Data(value: Record<string, unknown>[] | string[] | readonly unknown[] | null) {
    this._data = value;
    // Re-resolve display text when data arrives after writeValue
    if (this.SelectedValue != null && !this.InputText) {
      this.InputText = this.getDisplayText();
    }
  }
  get Data(): Record<string, unknown>[] | string[] | readonly unknown[] | null { return this._data; }
  private _data: Record<string, unknown>[] | string[] | readonly unknown[] | null = [];
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() Filterable = true;
  @Input() ValuePrimitive = false;
  /**
   * Host-driven disable. Composed with Angular Forms' `setDisabledState()` into `IsDisabled`
   * (the actual gate) — see `syncDisabled`. A setter, not a bare field, because this input is
   * routinely bound to an expression that changes over the control's lifetime, and the gate has
   * to follow it every time.
   */
  @Input()
  set Disabled(value: boolean) {
    this.disabledInput = value;
    this.syncDisabled();
  }
  get Disabled(): boolean {
    return this.disabledInput;
  }
  @Input() Placeholder = '';
  @Input() AllowCustom = false;

  @Output() ValueChange = new EventEmitter<unknown>();
  @Output() FilterChange = new EventEmitter<string>();

  @ContentChild('mjComboboxItem') ItemTemplate: TemplateRef<{ $implicit: unknown }> | null = null;

  @ViewChild('trigger') private triggerEl!: ElementRef<HTMLElement>;
  @ViewChild('comboInput') ComboInput!: ElementRef<HTMLInputElement>;

  @HostBinding('class.mj-combobox-host') readonly hostClass = true;

  private cdr = inject(ChangeDetectorRef);

  IsOpen = false;
  /**
   * The single gate on `Toggle()` / `Open()` — true when EITHER the `Disabled` input or Angular
   * Forms says so. Never assign it directly; go through `syncDisabled()`.
   */
  IsDisabled = false;
  HighlightedIndex = -1;
  SelectedValue: unknown = null;
  TriggerWidth = 0;
  InputText = '';

  Positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
  ];

  /**
   * Id of the popup listbox, so the input can point `aria-controls` at it while open — the half of
   * the combobox pattern that makes "collapsed/expanded" refer to something a screen reader can
   * find.
   */
  get ListboxId(): string { return `mj-combobox-listbox-${this.NamedControlId}`; }

  /** Id of one rendered option, referenced by {@link ActiveDescendantId}. */
  OptionId(index: number): string { return `mj-combobox-option-${this.NamedControlId}-${index}`; }

  /**
   * `aria-activedescendant` for the input: the option the arrow keys have moved to. Focus stays in
   * the input the whole time, so without this the highlight is a CSS class and nothing else — a
   * screen-reader user arrowing through the list hears no change at all.
   */
  get ActiveDescendantId(): string | null {
    const active = this.IsOpen && this.HighlightedIndex >= 0 && this.HighlightedIndex < this.FilteredItems.length;
    return active ? this.OptionId(this.HighlightedIndex) : null;
  }

  /** `aria-labelledby` id list for the clear button when a VISIBLE label names the combobox. */
  get ClearLabelledBy(): string { return this.SecondaryLabelledBy('clear-word'); }

  /** `aria-label` for the clear button in the no-visible-label case. */
  get ClearLabel(): string { return this.SecondaryLabel('Clear', 'Clear'); }

  /** `aria-labelledby` id list for the toggle button when a VISIBLE label names the combobox. */
  get ToggleLabelledBy(): string { return this.SecondaryLabelledBy('toggle-word'); }

  /**
   * `aria-label` for the toggle button in the no-visible-label case. It had no name at all before
   * #4116 — an unnamed button next to a named input, which announces as "button".
   */
  get ToggleLabel(): string { return this.SecondaryLabel('Show options for', 'Show options'); }

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private isBlurring = false;

  get FilteredItems(): unknown[] {
    const data = (this.Data ?? []) as unknown[];
    if (!this.Filterable || !this.InputText) return data;
    const search = this.InputText.toLowerCase();
    return data.filter(item => this.GetItemText(item).toLowerCase().includes(search));
  }

  OnInput(event: Event): void {
    this.InputText = (event.target as HTMLInputElement).value;
    this.HighlightedIndex = 0;
    this.FilterChange.emit(this.InputText);
    if (!this.IsOpen) this.Open();
    this.cdr.detectChanges();
  }

  OnFocus(): void {
    if (!this.IsOpen) this.Open();
  }

  OnToggleMouseDown(event: Event): void {
    event.preventDefault(); // Prevent blur on the input
    this.Toggle();
  }

  OnClear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isBlurring = false;
    this.InputText = '';
    this.SelectedValue = null;
    this.onChange(null);
    this.ValueChange.emit(null);
    this.Close();
    this.cdr.detectChanges();
  }

  OnInputBlur(): void {
    this.isBlurring = true;
    setTimeout(() => {
      if (!this.isBlurring) return;
      this.isBlurring = false;
      this.CommitValue();
      this.Close();
      this.onTouched();
    }, 150);
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
    this.HighlightedIndex = -1;
  }

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
   */
  private syncDisabled(): void {
    const disabled = this.disabledInput || this.formDisabled;
    if (disabled === this.IsDisabled) return;
    this.IsDisabled = disabled;
    if (disabled) this.resetPanelState();
    this.cdr.markForCheck();
  }

  SelectItem(item: unknown, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.isBlurring = false;

    const value = this.ValuePrimitive && this.ValueField ? this.GetItemValue(item) : item;
    this.SelectedValue = value;
    this.InputText = this.GetItemText(item);
    this.onChange(value);
    this.ValueChange.emit(value);
    this.Close();
    this.cdr.detectChanges();
  }

  /** Commit the current input text as a value (for AllowCustom or matching item) */
  private CommitValue(): void {
    if (!this.InputText.trim()) {
      // Empty input — clear the value
      if (this.SelectedValue != null) {
        this.SelectedValue = null;
        this.onChange(null);
        this.ValueChange.emit(null);
      }
      return;
    }

    // Try to find a matching item
    const data = (this.Data ?? []) as unknown[];
    const match = data.find(item => this.GetItemText(item).toLowerCase() === this.InputText.toLowerCase());
    if (match) {
      const value = this.ValuePrimitive && this.ValueField ? this.GetItemValue(match) : match;
      if (value !== this.SelectedValue) {
        this.SelectedValue = value;
        this.InputText = this.GetItemText(match);
        this.onChange(value);
        this.ValueChange.emit(value);
      }
    } else if (this.AllowCustom) {
      // No match but custom values allowed — emit the typed text
      this.SelectedValue = this.InputText;
      this.onChange(this.InputText);
      this.ValueChange.emit(this.InputText);
    } else {
      // No match and no custom — revert to previous display
      this.InputText = this.getDisplayText();
    }
  }

  IsItemSelected(item: unknown): boolean {
    if (this.SelectedValue == null) return false;
    if (this.ValuePrimitive && this.ValueField) return this.GetItemValue(item) === this.SelectedValue;
    if (this.ValueField && typeof item === 'object' && typeof this.SelectedValue === 'object')
      return this.GetItemValue(item) === this.GetItemValue(this.SelectedValue);
    return item === this.SelectedValue;
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
        if (this.IsOpen && this.HighlightedIndex >= 0 && this.HighlightedIndex < items.length) {
          this.SelectItem(items[this.HighlightedIndex]);
        } else {
          this.CommitValue();
          this.Close();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.InputText = this.getDisplayText();
        this.Close();
        break;
    }
  }

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

  writeValue(value: unknown): void {
    this.SelectedValue = value;
    this.InputText = this.getDisplayText();
  }

  registerOnChange(fn: (value: unknown) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
  ngAfterViewInit(): void { warnIfUnnamed(this.ComboInput?.nativeElement, 'mj-combobox'); }
  ngOnDestroy(): void { this.Close(); }

  private getDisplayText(): string {
    if (this.SelectedValue == null) return '';
    if (this.ValuePrimitive && this.ValueField) {
      const found = ((this.Data ?? []) as unknown[]).find(item => this.GetItemValue(item) === this.SelectedValue);
      return found ? this.GetItemText(found) : String(this.SelectedValue);
    }
    if (typeof this.SelectedValue === 'string') return this.SelectedValue;
    return this.GetItemText(this.SelectedValue as Record<string, unknown>);
  }

  private getSelectedIndex(): number {
    if (this.SelectedValue == null) return -1;
    return this.FilteredItems.findIndex(item => this.IsItemSelected(item));
  }
}
