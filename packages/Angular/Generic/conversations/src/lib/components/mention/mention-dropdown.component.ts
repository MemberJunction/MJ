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
  selector: 'mj-mention-dropdown',
  templateUrl: './mention-dropdown.component.html',
  styleUrls: ['./mention-dropdown.component.css']
})
export class MentionDropdownComponent implements OnInit, OnDestroy {
  @Input() suggestions: MentionSuggestion[] = [];
  @Input() position: { top: number; left: number } = { top: 0, left: 0 };
  @Input() visible: boolean = false;
  @Input() showAbove: boolean = false; // Controls whether dropdown grows upward

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
}
