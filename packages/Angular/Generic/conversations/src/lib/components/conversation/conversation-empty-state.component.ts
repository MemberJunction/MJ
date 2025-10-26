import { Component, Input, Output, EventEmitter } from '@angular/core';
import { UserInfo } from '@memberjunction/core';

@Component({
  selector: 'mj-conversation-empty-state',
  templateUrl: './conversation-empty-state.component.html',
  styleUrls: ['./conversation-empty-state.component.scss']
})
export class ConversationEmptyStateComponent {
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;

  @Output() messageSent = new EventEmitter<string>();

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

  onTextSubmitted(text: string): void {
    this.messageSent.emit(text);
  }

  onSuggestedPromptClicked(prompt: string): void {
    if (!this.disabled) {
      this.messageSent.emit(prompt);
    }
  }
}
