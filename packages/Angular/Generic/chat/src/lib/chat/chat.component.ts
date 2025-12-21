import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MarkdownService } from '@memberjunction/ng-markdown';
import { LogError } from '@memberjunction/core'


export class ChatWelcomeQuestion {
  public topLine: string="";
  public bottomLine: string="";
  public prompt: string="";
}
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
  standalone: false,
  selector: 'mj-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements AfterViewInit {
  @Input() InitialMessage: string = '';
  @Input() Messages: ChatMessage[] = [];
  /**
   * Optional, provide this to show an image for the AI. If not provided, a default robot icon will be shown.
   */
  @Input() AIImageURL: string = '';
  @Input() AILargeImageURL: string = '';

  /**
   * Optional, provide up to 4 welcome questions with example prompts. 
   * These will be shown to the user when the chat is first opened and there are no messages.
   */
  @Input() WelcomeQuestions: ChatWelcomeQuestion[] = [];

  /**
   * Optional, provide a prompt for the user when they click the clear all messages button.
   */
  @Input() ClearAllMessagesPrompt: string = 'Are you sure you want to clear all messages?';

  /**
   * Set this to enable/disable sending of a message. Whenever the input is empty, this field will be
   * ignored and the send button will be disabled.
   */
  @Input() AllowSend: boolean = true;
  public InternalAllowSend: boolean = true;
  /**
   * The placeholder text for the input field
   */
  @Input() public Placeholder: string = 'Type a message...';

  private _ShowWaitingIndicator: boolean = false;
  @Input() public get ShowWaitingIndicator(): boolean {
    return this._ShowWaitingIndicator;
  }
  public set ShowWaitingIndicator(value: boolean) {
    this._ShowWaitingIndicator = value;
    this.cd?.detectChanges(); // Manually trigger change detection
    if (!value)  {
      this.FocusTextArea();
    }
  }

  ngAfterViewInit(): void {
    this.FocusTextArea();
  }

  @Output() MessageAdded = new EventEmitter<ChatMessage>();
  @Output() ClearChatRequested = new EventEmitter<void>();

  @ViewChild('messagesContainer', { static: true }) private messagesContainer!: ElementRef;
  @ViewChild('theInput') theInput: ElementRef | undefined;

  public currentMessage: string = '';
  public showingClearAllDialog: boolean = false;
  constructor(private markdownService: MarkdownService, private cd: ChangeDetectorRef) {}

  public SendCurrentMessage(): void {
    if (this.currentMessage.trim() !== '') {
      this.SendMessage(this.currentMessage, 'User', 'user', null);
      this.currentMessage = ''; // Clear the input field
    }
  }

  public handleInputChange(event: any) {
    const val = this.theInput?.nativeElement.value;
    this.InternalAllowSend = this.AllowSend && (val ? val.length > 0 : false);
    this.resizeTextInput();
  }

  protected resizeTextInput() {
    try {
      const textarea = this.theInput?.nativeElement;
      if (textarea) {
        textarea.style.height = 'auto'; // Reset height to recalculate
        textarea.style.height = `${textarea.scrollHeight}px`; // Set to scrollHeight    
      }
    }
    catch (e) {
      LogError(e);
    }
  }


  public SendMessage(message: string, senderName: string, senderType: 'user' | 'ai', id: any, fireEvent: boolean = true): void {
    const newMessage = new ChatMessage(message, senderName, senderType, id);
    this.AppendMessage(newMessage, fireEvent);  
  }

  public SendUserMessage(message: string) {
    this.SendMessage(message, 'User', 'user', null);
  }

  public HandleClearChat() {
    this.ClearChatRequested.emit();
  }

  public ClearAllMessages() {
    this.Messages = [];
    this.messagesContainer.nativeElement.innerHTML = `<span>${this.InitialMessage}</span>`;

    this.ScrollMessagesToBottom();

    this.cd.detectChanges(); // Manually trigger change detection

    this.FocusTextArea();
    this.showingClearAllDialog = false;
  }

  protected FocusTextArea() {
    setTimeout(() => this.theInput?.nativeElement.focus(), 0); // use a timeout to ensure that angular has updated the DOM
  }

  protected async AppendMessage(message: ChatMessage, fireEvent: boolean = true) {
    const messageWrapElement = document.createElement('div');
    messageWrapElement.className = "chat-message-wrap";
    const imageElement = document.createElement('span');
    if (message.senderType === 'ai') {
      if (this.AIImageURL) {
        const img = document.createElement('img');
        img.src = this.AIImageURL;
        img.style.maxWidth = '24px';
        imageElement.appendChild(img);
      }
      else
        imageElement.classList.add('fa-solid', 'fa-robot');
    }
    else {
      imageElement.classList.add('fa-solid', 'fa-user');
    }
    imageElement.classList.add("chat-message-image");

    messageWrapElement.appendChild(imageElement);
    const messageElement = document.createElement('div');
    messageElement.innerHTML = await this.markdownService.parse(message.message);
    messageElement.className = "chat-message";  
    if (message.senderType === 'ai') {
      messageElement.classList.add('chat-message-ai');
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
