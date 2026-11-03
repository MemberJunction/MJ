import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MJBottomSheetComponent } from '../bottom-sheet/bottom-sheet.component';

/** One selectable section in an {@link MJSectionPickerComponent}. */
export interface SectionPickerItem {
  /** Stable identity, emitted on selection. */
  Key: string;
  /** Visible label on the button and in the sheet. */
  Title: string;
  /** Font Awesome class string, e.g. `fa-solid fa-table-columns`. */
  Icon?: string;
  /** Row count shown as a trailing pill when positive. */
  Count?: number | null;
  /** Validation errors in this section; shown as a red pill when positive. */
  ErrorCount?: number;
  /** Warnings in this section; shown as an amber pill when positive and there are no errors. */
  WarningCount?: number;
  /** Unsaved edits in this section; shown as a dot when positive. */
  DirtyCount?: number;
}

/** A headed group of sections listed after the first-class items (a form's "More" folder, say). */
export interface SectionPickerGroup {
  Title: string;
  Items: SectionPickerItem[];
}

/**
 * The phone replacement for a section rail, tab strip or icon rail: one full-width button that
 * names the current section and opens a searchable "Sections" bottom sheet listing every
 * section, first-class items first, then each {@link SectionPickerGroup} under its heading.
 *
 * Pure chrome with no breakpoint logic: the caller decides when a picker is the right
 * presentation (`@if (IsPhone) { <mj-section-picker …> } @else { <the rail> }`). Selection is
 * emitted, never applied; the caller sets `ActiveKey` back.
 *
 * ```html
 * <mj-section-picker [Items]="sections" [Groups]="[{ Title: 'More', Items: more }]"
 *                    [ActiveKey]="active" (ActiveKeyChange)="activate($event)">
 * </mj-section-picker>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-section-picker',
  imports: [NgTemplateOutlet, MJBottomSheetComponent],
  templateUrl: './section-picker.component.html',
  styleUrls: ['./section-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJSectionPickerComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  /** First-class sections, in display order. */
  @Input() Items: SectionPickerItem[] = [];
  /** Headed groups listed after {@link Items}. */
  @Input() Groups: SectionPickerGroup[] = [];
  /** Key of the current section. Falls back to the first item when it matches nothing. */
  @Input() ActiveKey = '';
  /** Sheet header. */
  @Input() SheetTitle = 'Sections';
  /** Whether the sheet shows a search box. */
  @Input() Searchable = true;
  @Input() SearchPlaceholder = 'Search sections...';

  /** Emitted with the chosen section's key; the sheet closes and the search clears. */
  @Output() ActiveKeyChange = new EventEmitter<string>();

  /** Whether the sheet is open. */
  public SheetOpen = false;
  /** The current search text; a way to find a row, cleared on every selection. */
  public Query = '';

  /** The section the button names. */
  public get ActiveItem(): SectionPickerItem | null {
    const all = this.allItems();
    return all.find((i) => i.Key === this.ActiveKey) ?? all[0] ?? null;
  }

  public get FilteredItems(): SectionPickerItem[] {
    return this.Items.filter((i) => this.matches(i));
  }

  /** Groups with their matching items; a group whose items all drop out is left out. */
  public get FilteredGroups(): SectionPickerGroup[] {
    return this.Groups
      .map((g) => ({ Title: g.Title, Items: g.Items.filter((i) => this.matches(i)) }))
      .filter((g) => g.Items.length > 0);
  }

  public get HasMatches(): boolean {
    return this.FilteredItems.length > 0 || this.FilteredGroups.length > 0;
  }

  public OpenSheet(): void {
    this.SheetOpen = true;
    this.cdr.markForCheck();
  }

  public OnSheetVisibleChange(visible: boolean): void {
    this.SheetOpen = visible;
    if (!visible) this.Query = '';
    this.cdr.markForCheck();
  }

  public OnSearch(value: string): void {
    this.Query = value;
    this.cdr.markForCheck();
  }

  public OnSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.OnSearch(input?.value ?? '');
  }

  public Select(key: string): void {
    this.SheetOpen = false;
    this.Query = '';
    this.ActiveKeyChange.emit(key);
    this.cdr.markForCheck();
  }

  public IsActive(item: SectionPickerItem): boolean {
    return item.Key === this.ActiveKey;
  }

  public ErrorLabel(item: SectionPickerItem): string {
    const n = item.ErrorCount ?? 0;
    return `${n} ${n === 1 ? 'error' : 'errors'} in ${item.Title}`;
  }

  public WarningLabel(item: SectionPickerItem): string {
    const n = item.WarningCount ?? 0;
    return `${n} ${n === 1 ? 'warning' : 'warnings'} in ${item.Title}`;
  }

  public DirtyLabel(item: SectionPickerItem): string {
    const n = item.DirtyCount ?? 0;
    return `${n} unsaved ${n === 1 ? 'change' : 'changes'} in ${item.Title}`;
  }

  private allItems(): SectionPickerItem[] {
    return [...this.Items, ...this.Groups.flatMap((g) => g.Items)];
  }

  private matches(item: SectionPickerItem): boolean {
    const q = this.Query.trim().toLowerCase();
    return q === '' || item.Title.toLowerCase().includes(q);
  }
}
