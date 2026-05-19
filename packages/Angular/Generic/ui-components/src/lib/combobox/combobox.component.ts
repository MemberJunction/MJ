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
 * mj-combobox — Editable dropdown with filtering and optional custom values.
 *
 * Replaces `<kendo-combobox>`. Unlike mj-dropdown, the trigger is a text input
 * that filters the list as you type. When AllowCustom is true, typed text that
 * doesn't match any item is emitted as the value.
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
      [class.mj-combobox--disabled]="IsDisabled"
      role="combobox"
      [attr.aria-expanded]="IsOpen"
      aria-haspopup="listbox">
      <input
        #comboInput
        class="mj-input mj-combobox-input"
        type="text"
        [placeholder]="Placeholder"
        [value]="InputText"
        [disabled]="IsDisabled"
        (input)="OnInput($event)"
        (focus)="OnFocus()"
        (keydown)="OnKeyDown($event)"
        (blur)="OnInputBlur()"
        autocomplete="off" />
      @if (InputText && !IsDisabled) {
        <button
          class="mj-combobox-clear"
          type="button"
          tabindex="-1"
          (mousedown)="OnClear($event)"
          aria-label="Clear">
          <i class="fa-solid fa-times"></i>
        </button>
      }
      <button
        class="mj-combobox-toggle"
        type="button"
        tabindex="-1"
        [disabled]="IsDisabled"
        (mousedown)="OnToggleMouseDown($event)">
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
      <div class="mj-dropdown-panel" role="listbox">
        @for (item of FilteredItems; track TrackByIndex($index)) {
          <div
            class="mj-dropdown-option"
            [class.mj-dropdown-option--selected]="IsItemSelected(item)"
            [class.mj-dropdown-option--highlighted]="HighlightedIndex === $index"
            role="option"
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
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MJComboboxComponent),
    multi: true
  }]
})
export class MJComboboxComponent implements ControlValueAccessor, OnDestroy {
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
  @Input() Disabled = false;
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
  IsDisabled = false;
  HighlightedIndex = -1;
  SelectedValue: unknown = null;
  TriggerWidth = 0;
  InputText = '';

  Positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
  ];

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
    this.IsOpen = false;
    this.HighlightedIndex = -1;
    this.cdr.detectChanges();
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
  setDisabledState(isDisabled: boolean): void { this.IsDisabled = isDisabled || this.Disabled; }
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
