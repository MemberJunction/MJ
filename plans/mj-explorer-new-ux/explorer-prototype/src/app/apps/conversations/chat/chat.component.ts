import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConversationsApp } from '../conversations.app';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chat-container">
      <div class="chat-header">
        <h2>Chat</h2>
        <button class="new-tab-btn" (click)="OpenInNewTab()">
          <i class="fa-solid fa-external-link"></i>
          Open Thread in New Tab
        </button>
      </div>

      <div class="chat-content">
        <div class="message-list">
          <div class="message" *ngFor="let msg of messages">
            <div class="message-header">
              <strong>{{ msg.sender }}</strong>
              <span class="timestamp">{{ msg.time }}</span>
            </div>
            <p>{{ msg.text }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      padding: 24px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      h2 {
        margin: 0;
        color: #424242;
      }
    }

    .new-tab-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.15s;

      &:hover {
        background: #1565c0;
      }
    }

    .chat-content {
      flex: 1;
      overflow: auto;
    }

    .message-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 8px;

      .message-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;

        strong {
          color: #1976d2;
        }

        .timestamp {
          color: #9e9e9e;
          font-size: 12px;
        }
      }

      p {
        margin: 0;
        color: #424242;
        line-height: 1.5;
      }
    }
  `]
})
export class ChatComponent {
  messages = [
    { sender: 'Alice', time: '10:30 AM', text: 'Hey, how is the project going?' },
    { sender: 'You', time: '10:32 AM', text: 'Making good progress! Just finishing up the prototype.' },
    { sender: 'Alice', time: '10:33 AM', text: 'Great! Can you show me a demo later?' }
  ];

  constructor(private conversationsApp: ConversationsApp) {}

  OpenInNewTab(): void {
    this.conversationsApp.RequestNewTab(
      'Chat Thread: Project Discussion',
      '/conversations/chat/thread-123',
      { threadId: '123' }
    );
  }
}
