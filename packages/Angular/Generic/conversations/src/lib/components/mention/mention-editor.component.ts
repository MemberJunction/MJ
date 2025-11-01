import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  forwardRef,
  OnInit,
  ViewEncapsulation
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';
import { UserInfo } from '@memberjunction/core';

/**
 * ContentEditable-based mention editor with visual chips/pills
 * Provides Slack/Teams-style mention UX with immutable mention tokens
 */
@Component({
  selector: 'mj-mention-editor',
  templateUrl: './mention-editor.component.html',
  styleUrls: ['./mention-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MentionEditorComponent),
      multi: true
    }
  ]
})
export class MentionEditorComponent implements OnInit, AfterViewInit, ControlValueAccessor {
  @ViewChild('editor', { static: false }) editorRef!: ElementRef<HTMLDivElement>;

  @Input() placeholder: string = 'Type @ to mention agents or users...';
  @Input() disabled: boolean = false;
  @Input() currentUser?: UserInfo;
  @Input() enableMentions: boolean = true;

  @Output() valueChange = new EventEmitter<string>();
  @Output() mentionSelected = new EventEmitter<MentionSuggestion>();
  @Output() enterPressed = new EventEmitter<string>();

  // Mention dropdown state
  public showMentionDropdown: boolean = false;
  public mentionSuggestions: MentionSuggestion[] = [];
  public mentionDropdownPosition: { top: number; left: number } = { top: 0, left: 0 };
  public mentionDropdownShowAbove: boolean = false;

  private mentionStartIndex: number = -1;
  private mentionQuery: string = '';
  private onChange: (value: string) => void = () => {};
  public onTouched: () => void = () => {};

  constructor(private mentionAutocomplete: MentionAutocompleteService) {}

  async ngOnInit(): Promise<void> {
    if (this.enableMentions && this.currentUser) {
      await this.mentionAutocomplete.initialize(this.currentUser);
    }
  }

  ngAfterViewInit(): void {
    // Auto-focus the editor
    setTimeout(() => {
      this.editorRef?.nativeElement?.focus();
    }, 100);
  }

  /**
   * Handle clicks on the container - focus the editor if clicking outside the contentEditable
   */
  onContainerClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // If click is on the container itself (not the editor or dropdown), focus the editor
    if (target.classList.contains('mention-editor-container')) {
      this.editorRef?.nativeElement?.focus();

      // Move cursor to end of content
      const selection = window.getSelection();
      const range = document.createRange();
      const editor = this.editorRef?.nativeElement;

      if (editor && selection) {
        range.selectNodeContents(editor);
        range.collapse(false); // Collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  /**
   * Handle input changes in contentEditable
   */
  onInput(): void {
    const plainText = this.getPlainText();
    this.onChange(plainText);
    this.valueChange.emit(plainText);

    // Handle @mention autocomplete
    if (this.enableMentions && this.currentUser) {
      this.handleMentionInput();
    }
  }

  /**
   * Handle keydown events
   */
  onKeyDown(event: KeyboardEvent): void {
    // Enter alone: Send message (if dropdown not showing)
    if (event.key === 'Enter' && !event.shiftKey && !this.showMentionDropdown) {
      event.preventDefault();
      const plainText = this.getPlainText();
      this.enterPressed.emit(plainText);
      return;
    }

    // Backspace: Check if deleting a mention chip
    if (event.key === 'Backspace') {
      this.handleBackspace(event);
    }

    // Handle mention dropdown navigation
    if (this.showMentionDropdown) {
      // Let the dropdown handle arrow keys, enter, escape
      // (We'll pass these through to mention-dropdown component)
    }
  }

  /**
   * Handle @mention input detection
   */
  private handleMentionInput(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textBeforeCursor = this.getTextBeforeCursor(range);

    // Find the last @ before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      this.closeMentionDropdown();
      return;
    }

    // Check if there's a space between @ and cursor (means mention was completed)
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
    if (textAfterAt.includes(' ')) {
      this.closeMentionDropdown();
      return;
    }

    // Extract query
    this.mentionQuery = textAfterAt;
    this.mentionStartIndex = lastAtIndex;

    // Get suggestions
    this.mentionSuggestions = this.mentionAutocomplete.getSuggestions(this.mentionQuery, !!this.currentUser);

    if (this.mentionSuggestions.length > 0) {
      this.showMentionDropdown = true;
      this.positionMentionDropdown();
    } else {
      this.closeMentionDropdown();
    }
  }

  /**
   * Get text before cursor position
   */
  private getTextBeforeCursor(range: Range): string {
    const tempRange = range.cloneRange();
    tempRange.selectNodeContents(this.editorRef.nativeElement);
    tempRange.setEnd(range.startContainer, range.startOffset);
    return tempRange.toString();
  }

  /**
   * Position the mention dropdown
   */
  private positionMentionDropdown(): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;

    // Get the parent container (message-input-box-container) for alignment
    const container = editor.closest('.message-input-box-container');
    const containerRect = container?.getBoundingClientRect();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const cursorRect = range.getBoundingClientRect();

    // Check space below vs above
    const spaceBelow = window.innerHeight - cursorRect.bottom;
    const spaceAbove = cursorRect.top;
    const dropdownHeight = Math.min(this.mentionSuggestions.length * 56, 300);

    this.mentionDropdownShowAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    if (this.mentionDropdownShowAbove) {
      // Position above, aligning with container top if possible
      this.mentionDropdownPosition = {
        top: containerRect ? containerRect.top + window.scrollY : cursorRect.top + window.scrollY - 4,
        left: cursorRect.left + window.scrollX
      };
    } else {
      // Position below cursor, but align bottom edge with container top
      this.mentionDropdownPosition = {
        top: containerRect ? containerRect.top + window.scrollY : cursorRect.bottom + window.scrollY + 4,
        left: cursorRect.left + window.scrollX
      };
    }
  }

  /**
   * Handle mention selection from dropdown
   */
  onMentionSelected(suggestion: MentionSuggestion): void {
    console.log('[MentionEditor] Mention selected:', suggestion);
    this.insertMentionChip(suggestion);
    this.closeMentionDropdown();
    this.mentionSelected.emit(suggestion);

    // Refocus the editor after selection
    setTimeout(() => {
      this.editorRef?.nativeElement?.focus();
    }, 50);
  }

  /**
   * Insert a mention chip at the current cursor position
   */
  private insertMentionChip(suggestion: MentionSuggestion): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    // Delete the @query text
    const textBeforeCursor = this.getTextBeforeCursor(range);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const deleteLength = textBeforeCursor.length - lastAtIndex;

    range.setStart(range.startContainer, range.startOffset - deleteLength);
    range.deleteContents();

    // Create mention chip element
    const chip = this.createMentionChip(suggestion);

    // Insert chip
    range.insertNode(chip);

    // Add space after chip
    const space = document.createTextNode(' ');
    range.collapse(false);
    range.insertNode(space);

    // Move cursor after the space
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger change detection
    this.onInput();
  }

  /**
   * Create a mention chip DOM element
   */
  private createMentionChip(suggestion: MentionSuggestion): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.contentEditable = 'false'; // Make chip non-editable
    chip.setAttribute('data-mention-id', suggestion.id);
    chip.setAttribute('data-mention-type', suggestion.type);
    chip.setAttribute('data-mention-name', suggestion.name);

    // Apply inline styles directly
    const isUser = suggestion.type === 'user';
    chip.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      margin: 0 3px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: default;
      user-select: none;
      vertical-align: middle;
      white-space: nowrap;
      pointer-events: all;
      background: ${isUser ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
      color: white;
      border: 2px solid ${isUser ? 'rgba(240, 147, 251, 0.4)' : 'rgba(102, 126, 234, 0.4)'};
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1);
    `;

    // Add icon
    const icon = document.createElement('i');
    icon.style.cssText = 'font-size: 12px; opacity: 0.95;';
    if (suggestion.type === 'agent' && suggestion.icon) {
      icon.className = this.getIconClasses(suggestion.icon);
    } else if (suggestion.type === 'user') {
      icon.className = 'fa-solid fa-user';
    } else {
      icon.className = 'fa-solid fa-robot';
    }
    chip.appendChild(icon);

    // Add space between icon and text
    const space = document.createTextNode(' ');
    chip.appendChild(space);

    // Add text
    const text = document.createTextNode(suggestion.displayName);
    chip.appendChild(text);

    console.log('[MentionEditor] Created chip:', chip.outerHTML);

    return chip;
  }

  /**
   * Get icon classes with proper FA prefix
   */
  private getIconClasses(iconClass: string): string {
    if (!iconClass) return 'fa-solid fa-robot';
    if (iconClass.includes('fa-')) {
      if (iconClass.match(/\b(fa-solid|fa-regular|fa-light|fa-brands)\b/)) {
        return iconClass;
      }
      return `fa-solid ${iconClass}`;
    }
    return iconClass;
  }

  /**
   * Handle backspace key - delete entire chip if cursor is right after one
   */
  private handleBackspace(event: KeyboardEvent): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    // Check if cursor is right after a mention chip
    if (range.collapsed && range.startOffset > 0) {
      const prevNode = range.startContainer.childNodes[range.startOffset - 1];

      if (prevNode && (prevNode as HTMLElement).classList?.contains('mention-chip')) {
        event.preventDefault();
        prevNode.remove();
        this.onInput();
      }
    }
  }

  /**
   * Close mention dropdown
   */
  closeMentionDropdown(): void {
    this.showMentionDropdown = false;
    this.mentionSuggestions = [];
    this.mentionStartIndex = -1;
    this.mentionQuery = '';
  }

  /**
   * Convert editor HTML to plain text with @mentions
   */
  private getPlainText(): string {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return '';

    let text = '';
    const nodes = editor.childNodes;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;

        if (element.classList.contains('mention-chip')) {
          const name = element.getAttribute('data-mention-name') || '';
          // Use quoted format if name has spaces
          text += name.includes(' ') ? `@"${name}"` : `@${name}`;
        } else if (element.tagName === 'BR') {
          text += '\n';
        } else if (element.tagName === 'DIV') {
          // Handle line breaks from contentEditable
          if (i > 0) text += '\n';
          text += this.getNodeText(element);
        } else {
          text += element.textContent || '';
        }
      }
    }

    return text;
  }

  /**
   * Get text from a node recursively
   */
  private getNodeText(node: Node): string {
    let text = '';
    const children = node.childNodes;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;

        if (element.classList.contains('mention-chip')) {
          const name = element.getAttribute('data-mention-name') || '';
          text += name.includes(' ') ? `@"${name}"` : `@${name}`;
        } else {
          text += this.getNodeText(element);
        }
      }
    }

    return text;
  }

  /**
   * Set editor content from plain text (for programmatic updates)
   */
  private setEditorContent(text: string): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;

    // For now, just set as plain text
    // TODO: Parse @mentions and render as chips
    editor.textContent = text;
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    if (value) {
      this.setEditorContent(value);
    } else if (this.editorRef?.nativeElement) {
      this.editorRef.nativeElement.textContent = '';
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.editorRef?.nativeElement) {
      this.editorRef.nativeElement.contentEditable = (!isDisabled).toString();
    }
  }

  /**
   * Focus the editor
   */
  public focus(): void {
    this.editorRef?.nativeElement?.focus();
  }

  /**
   * Clear the editor content
   */
  public clear(): void {
    if (this.editorRef?.nativeElement) {
      this.editorRef.nativeElement.textContent = '';
      this.onInput();
    }
  }
}
