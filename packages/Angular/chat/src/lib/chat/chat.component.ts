import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
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
  @Input() InitialMessage: string = 'How can I help today?';
  @Input() Messages: ChatMessage[] = [];

  private _ShowWaitingIndicator: boolean = false;
  @Input() public get ShowWaitingIndicator(): boolean {
    return this._ShowWaitingIndicator;
  }
  public set ShowWaitingIndicator(value: boolean) {
    this._ShowWaitingIndicator = value;
    this.cd?.detectChanges(); // Manually trigger change detection
  }

  @Output() MessageAdded = new EventEmitter<ChatMessage>();
  @Output() ClearChatRequested = new EventEmitter<void>();

  @ViewChild('messagesContainer', { static: true }) private messagesContainer!: ElementRef;

  currentMessage: string = '';

  constructor(private markdownService: MarkdownService, private cd: ChangeDetectorRef) {}

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
    this.messagesContainer.nativeElement.innerHTML = `<span>${this.InitialMessage}</span>`;

    this.ScrollMessagesToBottom();

    this.cd.detectChanges(); // Manually trigger change detection
  }

  protected async AppendMessage(message: ChatMessage, fireEvent: boolean = true) {
    const messageWrapElement = document.createElement('div');
    messageWrapElement.className = "message-wrap";
    const imageElement = document.createElement('span');
    if (message.senderType === 'ai') {
      imageElement.classList.add('fa-solid', 'fa-robot');
    }
    else {
      imageElement.classList.add('fa-solid', 'fa-user');
    }
    imageElement.classList.add("message-image");

    messageWrapElement.appendChild(imageElement);
    const messageElement = document.createElement('div');
    messageElement.innerHTML = await this.markdownService.parse(message.message);
    messageElement.className = "message";  
    if (message.senderType === 'ai') {
      messageElement.classList.add('message-ai');
    }
    messageWrapElement.appendChild(messageElement);

    this.Messages.push(message);
    if (this.Messages.length === 1) {
      // clear out the default message
      this.messagesContainer.nativeElement.innerHTML = '';
    }
    this.messagesContainer.nativeElement.appendChild(messageWrapElement);       
    if (fireEvent)
      this.MessageAdded.emit(message); 

    this.ScrollMessagesToBottom(false);

    this.cd.detectChanges(); // Manually trigger change detection
  }

  protected ScrollMessagesToBottom(animate: boolean = true): void {
    try {
      if (animate) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'smooth'  // This enables the smooth scrolling
        });      
      }
      else {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch(err) {}
  }


  public ShowScrollToBottomButton: boolean = false;

  handleCheckScroll(): void {
    const element = this.messagesContainer.nativeElement;
    if (element.scrollHeight - element.scrollTop > element.clientHeight) {
      this.ShowScrollToBottomButton = true;
    } else {
      this.ShowScrollToBottomButton = false;
    }
  }
}
