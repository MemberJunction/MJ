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
  @Output() SearchTriggered = new EventEmitter<void>();

  /**
   * @deprecated Use {@link SearchTriggered}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (searchTriggered) keeps working. Must stay AFTER SearchTriggered: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() searchTriggered = this.SearchTriggered;

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
      this.SearchTriggered.emit();
    }
  }
}
