import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener
} from '@angular/core';
import {
  ComposerPopulationFilter,
  ComposerSearchField,
  MentionSuggestion
} from '../../composer-trigger-provider';

export interface HighlightSegment {
  Text: string;
  Matched: boolean;
}

export interface PopulationFilterOption {
  Value: ComposerPopulationFilter;
  Label: string;
}

export interface SearchFieldOption {
  Value: ComposerSearchField;
  Label: string;
  ShortLabel: string;
}

const POPULATION_FILTER_OPTIONS: readonly PopulationFilterOption[] = [
  { Value: 'all', Label: 'All' },
  { Value: 'my-agents', Label: 'My Agents' },
  { Value: 'shared', Label: 'Shared' },
  { Value: 'people', Label: 'People' },
];

const SEARCH_FIELD_OPTIONS: readonly SearchFieldOption[] = [
  { Value: 'all', Label: 'All Fields', ShortLabel: 'All Fields' },
  { Value: 'name', Label: 'Name Only', ShortLabel: 'Name' },
  { Value: 'capabilities', Label: 'Capabilities & Description', ShortLabel: 'Capabilities' },
  { Value: 'lineage', Label: 'Base Template / Lineage', ShortLabel: 'Template' },
];

/**
 * Splits `text` into matched / unmatched segments for safe `<mark>` rendering without `innerHTML`.
 */
export function SplitHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  if (!text) {
    return [];
  }
  const query = rawQuery.trim();
  if (!query) {
    return [{ Text: text, Matched: false }];
  }
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);
  if (tokens.length === 0) {
    return [{ Text: text, Matched: false }];
  }
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  const lowerTokens = new Set(tokens.map((t) => t.toLowerCase()));
  const segments: HighlightSegment[] = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }
    segments.push({
      Text: part,
      Matched: lowerTokens.has(part.toLowerCase()),
    });
  }
  return segments;
}

/**
 * Dropdown component for `@mention`, `#record`, and `/skill` autocomplete.
 * For `'@'` triggers, renders an FK-inspired filter/search-field header bar,
 * group headers (`Frequent & Recent`, `My Agents`, `Shared`, `People`),
 * provenance/status badges (`Chat Default`, `In Thread`, `My Agent`), and safe query highlighting.
 */
@Component({
  standalone: false,
  selector: 'mj-mention-dropdown',
  templateUrl: './mention-dropdown.component.html',
  styleUrls: [
    './mention-dropdown.component.css',
    './custom-agent-icons.css'
  ]
})
export class MentionDropdownComponent implements OnInit, OnDestroy {
  private _suggestions: MentionSuggestion[] = [];

  public readonly PopulationFilterOptions = POPULATION_FILTER_OPTIONS;
  public readonly SearchFieldOptions = SEARCH_FIELD_OPTIONS;
  public ScopeMenuOpen = false;

  @Input()
  set Suggestions(value: MentionSuggestion[]) {
    this._suggestions = value;
    // Always reset selection to first item when suggestions change
    // so there's never a state where nothing is selected
    this.SelectedIndex = 0;
  }
  get Suggestions(): MentionSuggestion[] {
    return this._suggestions;
  }

  /** @deprecated Use {@link Suggestions}. */
  get suggestions(): MentionSuggestion[] {
    return this.Suggestions;
  }
  /** @deprecated Use {@link Suggestions}. */
  @Input() set suggestions(value: MentionSuggestion[]) {
    this.Suggestions = value;
  }

  /** Active trigger character (`'@'`, `'#'`, `'/'`). Smart filter bar renders for `'@'`. */
  @Input() ActiveTrigger: string = '';

  /** Current typed query after the trigger character, used for safe highlight rendering. */
  @Input() SearchQuery: string = '';

  /** Active population filter for `'@'` suggestions. */
  @Input() PopulationFilter: ComposerPopulationFilter = 'all';

  /** Active search-field scope for `'@'` suggestions. */
  @Input() SearchField: ComposerSearchField = 'all';

  @Output() PopulationFilterChange = new EventEmitter<ComposerPopulationFilter>();
  @Output() SearchFieldChange = new EventEmitter<ComposerSearchField>();

  @Input() Position: { top: number; left: number } = { top: 0, left: 0 };

  /** @deprecated Use {@link Position}. */
  @Input() set position(value: { top: number; left: number }) {
    this.Position = value;
  }
  /** @deprecated Use {@link Position}. */
  get position(): { top: number; left: number } {
    return this.Position;
  }
  @Input() Visible: boolean = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: boolean) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): boolean {
    return this.Visible;
  }
  /** Right-align against the anchor (button-opened triggers). Composes with showAbove in CSS. */
  @Input() AlignRight = false;

  /** @deprecated Use {@link AlignRight}. */
  @Input() set alignRight(value: MentionDropdownComponent['AlignRight']) {
    this.AlignRight = value;
  }
  /** @deprecated Use {@link AlignRight}. */
  get alignRight(): MentionDropdownComponent['AlignRight'] {
    return this.AlignRight;
  }
  @Input() ShowAbove: boolean = false;

  /** @deprecated Use {@link ShowAbove}. */
  @Input() set showAbove(value: boolean) {
    this.ShowAbove = value;
  }
  /** @deprecated Use {@link ShowAbove}. */
  get showAbove(): boolean {
    return this.ShowAbove;
  }
  @Input() UseFixedPositioning: boolean = false;

  /** @deprecated Use {@link UseFixedPositioning}. */
  @Input() set useFixedPositioning(value: boolean) {
    this.UseFixedPositioning = value;
  }
  /** @deprecated Use {@link UseFixedPositioning}. */
  get useFixedPositioning(): boolean {
    return this.UseFixedPositioning;
  }

  @Output() SuggestionSelected = new EventEmitter<MentionSuggestion>();

  /** @deprecated Use {@link SuggestionSelected}. */
  @Output() suggestionSelected = this.SuggestionSelected;
  @Output() Closed = new EventEmitter<void>();

  /** @deprecated Use {@link Closed}. */
  @Output() closed = this.Closed;

  public SelectedIndex: number = 0;

  /** @deprecated Use {@link SelectedIndex}. */
  public get selectedIndex(): number {
    return this.SelectedIndex;
  }
  /** @deprecated Use {@link SelectedIndex}. */
  public set selectedIndex(value: number) {
    this.SelectedIndex = value;
  }

  public get ShowSmartFilterBar(): boolean {
    return this.ActiveTrigger === '@';
  }

  public get ActiveSearchFieldLabel(): string {
    return (
      this.SearchFieldOptions.find((o) => o.Value === this.SearchField)?.ShortLabel ?? 'All Fields'
    );
  }

  constructor() {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  /**
   * Handle keyboard navigation
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.Visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.ScopeMenuOpen) {
        this.ScopeMenuOpen = false;
        return;
      }
      this.close();
      return;
    }
    if (this.Suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.SelectedIndex = Math.min(this.SelectedIndex + 1, this.Suggestions.length - 1);
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.SelectedIndex = Math.max(this.SelectedIndex - 1, 0);
        this.scrollToSelected();
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (this.Suggestions[this.SelectedIndex]) {
          this.SelectSuggestion(this.Suggestions[this.SelectedIndex]);
        }
        break;
    }
  }

  public SelectPopulationFilter(filter: ComposerPopulationFilter, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.ScopeMenuOpen = false;
    if (this.PopulationFilter !== filter) {
      this.PopulationFilter = filter;
      this.PopulationFilterChange.emit(filter);
    }
  }

  public ToggleScopeMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.ScopeMenuOpen = !this.ScopeMenuOpen;
  }

  public SelectSearchField(field: ComposerSearchField, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.ScopeMenuOpen = false;
    if (this.SearchField !== field) {
      this.SearchField = field;
      this.SearchFieldChange.emit(field);
    }
  }

  public ShouldShowGroupHeader(index: number): boolean {
    const current = this.Suggestions[index];
    if (!current?.groupLabel) {
      return false;
    }
    if (index === 0) {
      return true;
    }
    return this.Suggestions[index - 1]?.groupLabel !== current.groupLabel;
  }

  public GroupCountFor(groupLabel: string): number {
    let count = 0;
    for (const s of this.Suggestions) {
      if (s.groupLabel === groupLabel) {
        count++;
      }
    }
    return count;
  }

  public SecondaryLineFor(suggestion: MentionSuggestion): string | null {
    const lineage = suggestion.lineage?.trim() ?? '';
    const desc = suggestion.description?.trim() ?? '';
    if (lineage && desc) {
      return `${lineage} — ${desc}`;
    }
    if (lineage) {
      return lineage;
    }
    if (desc) {
      return desc;
    }
    return null;
  }

  public HighlightSegments(text: string): HighlightSegment[] {
    return SplitHighlightSegments(text, this.SearchQuery);
  }

  /**
   * Select a suggestion
   */
  SelectSuggestion(suggestion: MentionSuggestion): void {
    this.ScopeMenuOpen = false;
    this.SuggestionSelected.emit(suggestion);
  }

  /** @deprecated Use {@link SelectSuggestion}. */
  selectSuggestion(suggestion: MentionSuggestion): void {
    return this.SelectSuggestion(suggestion);
  }

  /**
   * close the dropdown
   */
  close(): void {
    this.ScopeMenuOpen = false;
    this.Closed.emit();
  }

  /**
   * Scroll to selected item
   */
  private scrollToSelected(): void {
    setTimeout(() => {
      const selected = document.querySelector('.mention-suggestion.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  /**
   * Track by function for ngFor
   */
  TrackBySuggestion(index: number, item: MentionSuggestion): string {
    return `${item.type}:${item.id}:${index}`;
  }

  /** @deprecated Use {@link TrackBySuggestion}. */
  trackBySuggestion(index: number, item: MentionSuggestion): string {
    return this.TrackBySuggestion(index, item);
  }

  /**
   * Get icon classes - supports both Font Awesome and custom CSS classes
   * Font Awesome icons start with 'fa-' (e.g., 'fa-solid fa-robot')
   * Custom icons use their own prefix (e.g., 'mj-icon-skip', 'acme-icon-custom')
   */
  GetIconClasses(iconClass: string): string | string[] {
    if (!iconClass) {
      return 'fa-solid fa-robot';
    }

    if (iconClass.includes('fa-')) {
      if (iconClass.match(/\b(fa-solid|fa-regular|fa-light|fa-brands)\b/)) {
        return iconClass;
      }
      return `fa-solid ${iconClass}`;
    }

    return iconClass;
  }

  /** @deprecated Use {@link GetIconClasses}. */
  getIconClasses(iconClass: string): string | string[] {
    return this.GetIconClasses(iconClass);
  }
}
