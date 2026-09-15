import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener
} from '@angular/core';
import { MentionSuggestion } from '../../composer-trigger-provider';

/**
 * Dropdown component for @mention autocomplete
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

  @Input()
  set suggestions(value: MentionSuggestion[]) {
    this._suggestions = value;
    // Always reset selection to first item when suggestions change
    // so there's never a state where nothing is selected
    this.SelectedIndex = 0;
  }
  get suggestions(): MentionSuggestion[] {
    return this._suggestions;
  }

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
  } // Controls whether dropdown grows upward
  @Input() UseFixedPositioning: boolean = false;

  /** @deprecated Use {@link UseFixedPositioning}. */
  @Input() set useFixedPositioning(value: boolean) {
    this.UseFixedPositioning = value;
  }
  /** @deprecated Use {@link UseFixedPositioning}. */
  get useFixedPositioning(): boolean {
    return this.UseFixedPositioning;
  } // Use fixed positioning to escape parent containers

  @Output() SuggestionSelected = new EventEmitter<MentionSuggestion>();

  /**
   * @deprecated Use {@link SuggestionSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (suggestionSelected) keeps working. Must stay AFTER SuggestionSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() suggestionSelected = this.SuggestionSelected;
  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
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

  constructor() {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  /**
   * Handle keyboard navigation
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.Visible) return;
    // Escape is handled before the emptiness guard. A button-opened dropdown stays open on an empty
    // result set, and in that state every key below was dead — leaving the button press or a click
    // away as the only exits, neither of which a user has reason to guess.
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (this.suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.SelectedIndex = Math.min(this.SelectedIndex + 1, this.suggestions.length - 1);
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
        if (this.suggestions[this.SelectedIndex]) {
          this.SelectSuggestion(this.suggestions[this.SelectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  /**
   * Select a suggestion
   */
  SelectSuggestion(suggestion: MentionSuggestion): void {
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
    return item.id;
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
      return 'fa-solid fa-robot'; // Default fallback
    }

    // If it's a Font Awesome icon (contains 'fa-'), add fa-solid if not present
    if (iconClass.includes('fa-')) {
      // If it already has fa-solid, fa-regular, etc., use as-is
      if (iconClass.match(/\b(fa-solid|fa-regular|fa-light|fa-brands)\b/)) {
        return iconClass;
      }
      // Otherwise add fa-solid prefix
      return `fa-solid ${iconClass}`;
    }

    // For custom icons (mj-icon-*, acme-icon-*, etc.), use as-is
    return iconClass;
  }

  /** @deprecated Use {@link GetIconClasses}. */
  getIconClasses(iconClass: string): string | string[] {
    return this.GetIconClasses(iconClass);
  }
}
