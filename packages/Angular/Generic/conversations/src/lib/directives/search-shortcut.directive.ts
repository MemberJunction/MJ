import { Directive, HostListener, Output, EventEmitter } from '@angular/core';

/**
 * Directive to handle global search keyboard shortcut (Ctrl+K or Cmd+K)
 * Usage: Add to your main app component or workspace component
 * <div mjSearchShortcut (searchTriggered)="openSearch()">
 */
@Directive({
  standalone: false,
  selector: '[mjSearchShortcut]'
})
export class SearchShortcutDirective {
  @Output() searchTriggered = new EventEmitter<void>();

  /**
   * Listen for Ctrl+K or Cmd+K
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

    // Check for Ctrl+K or Cmd+K
    if (isCtrlOrCmd && event.key === 'k') {
      event.preventDefault();
      event.stopPropagation();
      this.searchTriggered.emit();
    }
  }
}
