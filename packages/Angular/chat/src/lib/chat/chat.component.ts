import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MarkdownService } from 'ngx-markdown';

export class ChatMessage {
  public message!: string;
  public senderName!: string;
  public senderType: 'user' | 'ai' = 'user';
  public id?: any;

  constructor(message: string, senderName: string, senderType: 'user' | 'ai', id: any = null) {
    this.message = message;
    this.senderName = senderName;
    this.senderType = senderType;
    this.id = id;
  }
}

@Component({
  selector: 'mj-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent  {
  @Input() Messages: ChatMessage[] = [];
  @Input() ShowWaitingIndicator: boolean = false;
  @Output() MessageAdded = new EventEmitter<ChatMessage>();
  @Output() ClearChatRequested = new EventEmitter<void>();

  @ViewChild('messagesContainer', { static: true }) private messagesContainer!: ElementRef;

  currentMessage: string = '';

  constructor(private markdownService: MarkdownService) {}

  public SendCurrentMessage(): void {
    if (this.currentMessage.trim() !== '') {
      this.SendMessage(this.currentMessage, 'User', 'user', null);
      this.currentMessage = ''; // Clear the input field
    }
  }

  public SendMessage(message: string, senderName: string, senderType: 'user' | 'ai', id: any, fireEvent: boolean = true): void {
    const newMessage = new ChatMessage(message, senderName, senderType, id);
    this.AppendMessage(newMessage, fireEvent);  
  }

  public HandleClearChat() {
    this.ClearChatRequested.emit();
  }

  public ClearAllMessages() {
    this.Messages = [];
    this.messagesContainer.nativeElement.innerHTML = '';
  }

  protected async AppendMessage(message: ChatMessage, fireEvent: boolean = true) {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = await this.markdownService.parse(message.message);
    messageElement.className = "message";  
    if (message.senderType === 'ai') {
      messageElement.classList.add('message-ai');
      messageElement.style.backgroundColor = 'beige'; //temp hack as styles are not applying
    }
    else
      messageElement.style.backgroundColor = 'lightblue'; //temp hack as styles are not applying

    this.Messages.push(message);
    if (this.Messages.length === 1) {
      // clear out the default message
      this.messagesContainer.nativeElement.innerHTML = '';
    }
    this.messagesContainer.nativeElement.appendChild(messageElement);       
    if (fireEvent)
      this.MessageAdded.emit(message); 
  }
}
