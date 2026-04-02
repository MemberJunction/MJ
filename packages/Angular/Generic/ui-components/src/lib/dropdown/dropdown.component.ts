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
 * @example
 * ```html
 * <mj-dropdown
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
      [attr.aria-expanded]="IsOpen"
      aria-haspopup="listbox"
      tabindex="0"
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
      <div class="mj-dropdown-panel" role="listbox">
        @if (Filterable) {
          <div class="mj-dropdown-filter-wrap">
            <input
              #filterInput
              class="mj-input mj-dropdown-filter"
              type="text"
              placeholder="Search..."
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
  @Input() Data: Record<string, unknown>[] | string[] | readonly unknown[] | null = [];
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() Filterable = false;
  @Input() ValuePrimitive = false;
  @Input() Disabled = false;
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
