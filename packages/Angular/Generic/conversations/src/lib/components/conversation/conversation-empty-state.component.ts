import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { UserInfo } from '@memberjunction/core';

@Component({
  selector: 'mj-conversation-empty-state',
  templateUrl: './conversation-empty-state.component.html',
  styleUrls: ['./conversation-empty-state.component.scss']
})
export class ConversationEmptyStateComponent implements AfterViewInit {
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;

  @Output() messageSent = new EventEmitter<string>();

  @ViewChild('messageTextarea') messageTextarea?: ElementRef;

  public messageText: string = '';

  public suggestedPrompts: Array<{icon: string; title: string; prompt: string}> = [
    {
      icon: 'fa-lightbulb',
      title: 'Brainstorm ideas',
      prompt: 'Help me brainstorm creative ideas for a new product feature'
    },
    {
      icon: 'fa-code',
      title: 'Write code',
      prompt: 'Write a function that processes user data and generates a report'
    },
    {
      icon: 'fa-chart-line',
      title: 'Analyze data',
      prompt: 'Analyze sales trends from the last quarter and provide insights'
    },
    {
      icon: 'fa-edit',
      title: 'Draft content',
      prompt: 'Draft a professional email to introduce our new service'
    }
  ];

  ngAfterViewInit() {
    // Auto-focus the textarea
    setTimeout(() => {
      this.messageTextarea?.nativeElement?.focus();
    }, 100);
  }

  get canSend(): boolean {
    return !this.disabled && this.messageText.trim().length > 0;
  }

  onKeyDown(event: KeyboardEvent): void {
    // Enter alone: Send message
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendClick();
    }
    // Shift+Enter: Allow default behavior (add newline)
  }

  onSendClick(): void {
    if (this.canSend) {
      this.messageSent.emit(this.messageText.trim());
      this.messageText = ''; // Clear input after sending
    }
  }

  onSuggestedPromptClicked(prompt: string): void {
    if (!this.disabled) {
      this.messageSent.emit(prompt);
    }
  }
}
