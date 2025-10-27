import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { UserInfo } from '@memberjunction/global';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';

/**
 * Reusable message input box component (presentational)
 * Handles:
 * - Text input with keyboard shortcuts
 * - @mention autocomplete (optional)
 * - Send button
 * - Character count (optional)
 *
 * Does NOT handle:
 * - Saving messages to database
 * - Agent invocation
 * - Artifact creation
 * - Conversation management
 */
@Component({
  selector: 'mj-message-input-box',
  templateUrl: './message-input-box.component.html',
  styleUrls: ['./message-input-box.component.scss'],
})
export class MessageInputBoxComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() placeholder: string = 'Type your message to start a new conversation...';
  @Input() disabled: boolean = false;
  @Input() value: string = '';
  @Input() showCharacterCount: boolean = false;
  @Input() enableMentions: boolean = true;
  @Input() currentUser?: UserInfo;
  @Input() rows: number = 3;

  @Output() textSubmitted = new EventEmitter<string>();
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('messageTextarea') messageTextarea?: ElementRef;

  // Mention autocomplete state
  public showMentionDropdown: boolean = false;
  public mentionSuggestions: MentionSuggestion[] = [];
  public mentionDropdownPosition: { top: number; left: number } = { top: 0, left: 0 };
  public mentionDropdownShowAbove: boolean = false;
  private mentionStartIndex: number = -1;
  private mentionQuery: string = '';

  constructor(private mentionAutocomplete: MentionAutocompleteService) {}

  async ngOnInit() {
    // Initialize mention autocomplete if enabled and currentUser is available
    console.log('[MessageInputBox] ngOnInit - enableMentions:', this.enableMentions, 'currentUser:', !!this.currentUser);
    if (this.enableMentions && this.currentUser) {
      await this.mentionAutocomplete.initialize(this.currentUser);
      console.log('[MessageInputBox] Mention autocomplete initialized');
    }
  }

  ngAfterViewInit() {
    // Auto-focus the textarea
    setTimeout(() => {
      this.messageTextarea?.nativeElement?.focus();
    }, 100);
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  get canSend(): boolean {
    return !this.disabled && this.value.trim().length > 0;
  }

  onKeyDown(event: KeyboardEvent): void {
    // Handle mention dropdown navigation
    if (this.showMentionDropdown) {
      // Implement arrow key navigation if needed in future
      // For now, just let the dropdown handle it
    }

    // Enter alone: Send message
    if (event.key === 'Enter' && !event.shiftKey && !this.showMentionDropdown) {
      event.preventDefault();
      this.onSendClick();
    }
    // Shift+Enter: Allow default behavior (add newline)
  }

  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.value = textarea.value;
    this.valueChange.emit(this.value);

    console.log(
      '[MessageInputBox] onInput - value:',
      this.value,
      'enableMentions:',
      this.enableMentions,
      'currentUser:',
      !!this.currentUser
    );

    // Handle @mention autocomplete
    if (this.enableMentions && this.currentUser) {
      this.handleMentionInput();
    }
  }

  onSendClick(): void {
    if (this.canSend) {
      const textToSend = this.value.trim();
      console.log('[MessageInputBox] onSendClick - emitting text:', textToSend);
      this.textSubmitted.emit(textToSend);
      this.value = ''; // Clear input after sending
      this.valueChange.emit(this.value);
      this.closeMentionDropdown();
    }
  }

  /**
   * Handle @mention autocomplete
   */
  private handleMentionInput(): void {
    const textarea = this.messageTextarea?.nativeElement;
    if (!textarea) {
      console.log('[MessageInputBox] No textarea element');
      return;
    }

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = this.value.substring(0, cursorPos);

    console.log('[MessageInputBox] handleMentionInput - textBeforeCursor:', textBeforeCursor);

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

    console.log('[MessageInputBox] Mention detected - query:', this.mentionQuery);

    // Get suggestions (include users if we have currentUser)
    this.mentionSuggestions = this.mentionAutocomplete.getSuggestions(this.mentionQuery, !!this.currentUser);

    console.log('[MessageInputBox] Got suggestions:', this.mentionSuggestions.length, this.mentionSuggestions);

    if (this.mentionSuggestions.length > 0) {
      this.showMentionDropdown = true;
      this.positionMentionDropdown();
      console.log('[MessageInputBox] Showing dropdown at position:', this.mentionDropdownPosition);
    } else {
      this.closeMentionDropdown();
    }
  }

  /**
   * Position the mention dropdown near the textarea
   * Uses viewport-relative positioning (fixed) to avoid clipping by parent containers
   */
  private positionMentionDropdown(): void {
    const textarea = this.messageTextarea?.nativeElement;
    if (!textarea) return;

    const textareaRect = textarea.getBoundingClientRect();

    // Check if there's enough space below the textarea
    const spaceBelow = window.innerHeight - textareaRect.bottom;
    const spaceAbove = textareaRect.top;
    const dropdownHeight = Math.min(this.mentionSuggestions.length * 48, 240);

    this.mentionDropdownShowAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    // Use viewport-relative coordinates (dropdown will be positioned fixed to viewport)
    if (this.mentionDropdownShowAbove) {
      // Show above the textarea - anchor to top of textarea
      this.mentionDropdownPosition = {
        top: textareaRect.top + window.scrollY - 4,
        left: textareaRect.left + window.scrollX,
      };
    } else {
      // Show below the textarea (default) - anchor to bottom of textarea
      this.mentionDropdownPosition = {
        top: textareaRect.bottom + window.scrollY + 4,
        left: textareaRect.left + window.scrollX,
      };
    }

    console.log(
      '[MessageInputBox] Dropdown position calculated (viewport coords):',
      this.mentionDropdownPosition,
      'showAbove:',
      this.mentionDropdownShowAbove
    );
  }

  /**
   * Insert selected mention into text
   */
  onMentionSelected(suggestion: MentionSuggestion): void {
    const textarea = this.messageTextarea?.nativeElement;
    if (!textarea) return;

    const beforeMention = this.value.substring(0, this.mentionStartIndex);
    const afterCursor = this.value.substring(textarea.selectionStart);

    // Insert mention with @ prefix and space after
    this.value = `${beforeMention}@${suggestion.name} ${afterCursor}`;
    this.valueChange.emit(this.value);

    // Close dropdown
    this.closeMentionDropdown();

    // Restore focus and set cursor position
    setTimeout(() => {
      const newCursorPos = this.mentionStartIndex + suggestion.name.length + 2; // +2 for @ and space
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
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
   * Focus the input
   */
  public focus(): void {
    this.messageTextarea?.nativeElement?.focus();
  }
}
