import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener
} from '@angular/core';
import { MentionSuggestion } from '../../services/mention-autocomplete.service';

/**
 * Dropdown component for @mention autocomplete
 */
@Component({
  standalone: false,
  selector: 'mj-mention-dropdown',
  templateUrl: './mention-dropdown.component.html',
  styleUrls: [
    './mention-dropdown.component.css',
    '../../styles/custom-agent-icons.css'
  ]
})
export class MentionDropdownComponent implements OnInit, OnDestroy {
  @Input() suggestions: MentionSuggestion[] = [];
  @Input() position: { top: number; left: number } = { top: 0, left: 0 };
  @Input() visible: boolean = false;
  @Input() showAbove: boolean = false; // Controls whether dropdown grows upward
  @Input() useFixedPositioning: boolean = false; // Use fixed positioning to escape parent containers

  @Output() suggestionSelected = new EventEmitter<MentionSuggestion>();
  @Output() closed = new EventEmitter<void>();

  public selectedIndex: number = 0;

  constructor() {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  /**
   * Handle keyboard navigation
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.visible || this.suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.scrollToSelected();
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (this.suggestions[this.selectedIndex]) {
          this.selectSuggestion(this.suggestions[this.selectedIndex]);
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
  selectSuggestion(suggestion: MentionSuggestion): void {
    this.suggestionSelected.emit(suggestion);
  }

  /**
   * Close the dropdown
   */
  close(): void {
    this.closed.emit();
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
  trackBySuggestion(index: number, item: MentionSuggestion): string {
    return item.id;
  }

  /**
   * Get icon classes - supports both Font Awesome and custom CSS classes
   * Font Awesome icons start with 'fa-' (e.g., 'fa-solid fa-robot')
   * Custom icons use their own prefix (e.g., 'mj-icon-skip', 'acme-icon-custom')
   */
  getIconClasses(iconClass: string): string | string[] {
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
}
