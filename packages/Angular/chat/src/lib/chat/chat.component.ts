import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MarkdownService } from 'ngx-markdown';

export class ChatMessage {
  public message!: string;
  public sender!: string;
  public senderType: 'user' | 'ai' = 'user';

  constructor(message: string, sender: string, senderType: 'user' | 'ai') {
    this.message = message;
    this.sender = sender;
    this.senderType = senderType;
  }
}

@Component({
  selector: 'mj-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent  {
  @Input() Messages: ChatMessage[] = [];
  @Output() MessageAdded = new EventEmitter<ChatMessage>();

  @ViewChild('messagesContainer', { static: true }) private messagesContainer!: ElementRef;

  currentMessage: string = '';

  constructor(private markdownService: MarkdownService) {}

  public SendCurrentMessage(): void {
    if (this.currentMessage.trim() !== '') {
      this.SendMessage(this.currentMessage);
    }
  }

  public SendMessage(message: string): void {
    const newMessage = new ChatMessage(message, 'User', 'user');
    this.AppendMessage(newMessage);  
    this.currentMessage = ''; // Clear the input field
  }

  protected async AppendMessage(message: ChatMessage) {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = await this.markdownService.parse(message.message);
    messageElement.className = "message";  
    this.Messages.push(message);
    if (this.Messages.length === 1) {
      // clear out the default message
      this.messagesContainer.nativeElement.innerHTML = '';
    }
    this.messagesContainer.nativeElement.appendChild(messageElement);       
    this.MessageAdded.emit(message); 
  }
}
