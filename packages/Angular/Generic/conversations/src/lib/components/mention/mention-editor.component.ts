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
    const editor = this.editorRef?.nativeElement;

    // Don't handle clicks on the dropdown or its children
    if (target.closest('mj-mention-dropdown')) {
      return;
    }

    // If clicking on container or any element that's not the editor itself, focus the editor
    if (target !== editor && !editor?.contains(target)) {
      editor?.focus();

      // Move cursor to end of content
      const selection = window.getSelection();
      const range = document.createRange();

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
   * Handle blur event - close dropdown when editor loses focus
   */
  onBlur(): void {
    // Call form control touched callback
    this.onTouched();

    // Close dropdown when editor loses focus
    // Use setTimeout to allow mousedown events on dropdown to fire first
    setTimeout(() => {
      if (this.showMentionDropdown) {
        console.log('[MentionEditor] Closing dropdown on blur');
        this.closeMentionDropdown();
      }
    }, 200);
  }

  /**
   * Handle paste event - strip HTML and paste as plain text only
   */
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();

    // Get plain text from clipboard
    const text = event.clipboardData?.getData('text/plain') || '';

    if (!text) return;

    // Insert plain text at cursor position
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    // Insert text as text node (not HTML)
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger input event to update model
    this.onInput();
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

    // Add icon or image
    if (suggestion.type === 'agent' && suggestion.imageUrl) {
      // Use image if available (LogoURL from agent)
      const img = document.createElement('img');
      img.src = suggestion.imageUrl;
      img.alt = suggestion.displayName;
      img.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; object-fit: cover;';
      chip.appendChild(img);
    } else if (suggestion.type === 'agent' && suggestion.icon === 'mj-icon-skip') {
      // Special handling for mj-icon-skip: use the SVG data URI as an image
      const img = document.createElement('img');
      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 101.89918457031249 96.83947368421053'%3E%3Cg transform='translate(-0.1288232421875,-0.0)'%3E%3Cpath d='M93.85,41.56c-.84,0-1.62.2-2.37.55-3-4.35-7.49-8.12-13.04-11.04l.04-7.18v-14.44h-10.24v17.6c-1.52-.43-3.07-.8-4.67-1.11V0h-10.24v24.72s-.09,0-.14,0h-4.38s-.1,0-.14,0V7.3h-10.24v18.62c-1.6.32-3.15.69-4.67,1.11v-11.67h-10.24v6.09l.04,9.6c-5.55,2.92-10.04,6.7-13.04,11.04-.75-.35-1.53-.55-2.37-.55-4.5,0-8.14,5.61-8.14,12.51s3.64,12.53,8.14,12.53c.58,0,1.14-.12,1.67-.29,4.1,6.62,11.54,12.06,20.98,15.28l.79.13v7.05c0,2.97,1.45,5.58,3.87,6.99,1.18.69,2.5,1.04,3.85,1.03,1.4,0,2.83-.37,4.15-1.12l7.54-4.29,7.56,4.3c1.31.74,2.73,1.12,4.13,1.12s2.67-.35,3.85-1.04c2.42-1.41,3.86-4.02,3.86-6.98v-7.05l.79-.13c9.44-3.22,16.89-8.66,20.98-15.28.54.17,1.09.29,1.68.29,4.5,0,8.14-5.61,8.14-12.53s-3.63-12.51-8.14-12.51' fill='%23AAAAAA'/%3E%3Cpath d='M86.69,50.87c0-12.22-13.6-19.1-28.94-20.66-4.48-.47-9.19-.54-13.52,0-15.34,1.53-28.93,8.41-28.93,20.66,0,8.55,5.7,15.55,12.68,15.55h7.94c3.05,2.5,6.93,4.1,11.08,4.71,2.65.4,5.44.46,8.01,0,4.15-.6,8.05-2.2,11.1-4.71h7.92c6.97,0,12.68-7,12.68-15.55' fill='white' opacity='0.9'/%3E%3Cpath d='M57.83,55.82c-1.19,2.58-3.8,4.35-6.84,4.35s-5.65-1.77-6.84-4.35h13.68Z' fill='%23AAAAAA'/%3E%3Cpath d='M32.52,41.14c1.74,0,3.18,2.13,3.18,4.76s-1.44,4.74-3.18,4.74-3.16-2.13-3.16-4.74,1.41-4.76,3.16-4.76' fill='%23AAAAAA'/%3E%3Cpath d='M69.46,41.14c1.74,0,3.16,2.13,3.16,4.76s-1.41,4.74-3.16,4.74-3.18-2.13-3.18-4.74,1.41-4.76,3.18-4.76' fill='%23AAAAAA'/%3E%3Cpath d='M63.91,76.15c-.82-.48-1.84-.43-2.8.12l-10.13,5.75-10.11-5.75c-.96-.55-1.98-.59-2.8-.12-.82.47-1.29,1.38-1.29,2.49v10.12c0,1.11.47,2.02,1.28,2.49.38.22.8.33,1.24.33.51,0,1.05-.15,1.57-.44l10.12-5.75,10.11,5.75c.52.29,1.05.44,1.56.44.44,0,.86-.11,1.24-.33.81-.48,1.28-1.38,1.28-2.49v-10.12c0-1.11-.47-2.02-1.28-2.49' fill='white' opacity='0.9'/%3E%3C/g%3E%3C/svg%3E";
      img.alt = suggestion.displayName;
      img.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; object-fit: cover;';
      chip.appendChild(img);
    } else {
      // Use icon for users or agents without images
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
    }

    // Add space between icon/image and text
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
