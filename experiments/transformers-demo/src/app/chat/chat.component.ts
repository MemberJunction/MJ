import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  DestroyRef,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatService, ChatMessage } from '../ai/chat.service';
import { BROWSER_CHAT_MODELS, type BrowserModelDefinition } from '../ai/model-registry';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <!-- Loading state -->
    @if (IsLoading) {
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>Loading {{ ActiveModelName }}... {{ LoadProgress | number:'1.0-0' }}%</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="LoadProgress"></div>
          </div>
          <p class="loading-hint">
            First load downloads the model (~{{ ActiveModelSizeMB }} MB).<br>
            It's cached locally for instant loads afterward.
          </p>
        </div>
      </div>
    }

    <!-- Chat interface -->
    @if (IsReady) {
      <div class="chat-container">
        <div class="chat-header">
          <h2>Local AI Chat</h2>
          <span class="model-badge">
            {{ ActiveModelName }} · {{ TokensPerSecond }} tok/s · Running in your browser
          </span>
        </div>

        <div class="messages" #messagesContainer>
          @for (msg of DisplayMessages; track $index) {
            <div class="message" [class.user]="msg.Role === 'user'"
                 [class.assistant]="msg.Role === 'assistant'">
              <div class="message-role">{{ msg.Role === 'user' ? 'You' : 'AI' }}</div>
              <div class="message-content">{{ msg.Content }}</div>
            </div>
          }

          <!-- Streaming indicator -->
          @if (IsGenerating) {
            <div class="message assistant">
              <div class="message-role">AI</div>
              <div class="message-content">
                {{ StreamingText }}<span class="cursor">&#x2588;</span>
              </div>
            </div>
          }
        </div>

        <div class="input-area">
          <textarea
            [(ngModel)]="UserInput"
            (keydown.enter)="OnEnter($event)"
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            [disabled]="IsGenerating"
            rows="2"
          ></textarea>
          @if (!IsGenerating) {
            <button (click)="Send()" [disabled]="!UserInput.trim()" class="send-btn">
              Send
            </button>
          } @else {
            <button (click)="chatService.Abort()" class="abort-btn">
              Stop
            </button>
          }
        </div>
      </div>
    }

    <!-- Init state (not loading and not ready) -->
    @if (!IsLoading && !IsReady) {
      <div class="init-prompt">
        <h2>Client-Side AI Chat</h2>
        <p>Run a language model entirely in your browser. No data leaves your device.</p>

        <div class="model-selector">
          <label for="model-select">Model:</label>
          <select id="model-select" [(ngModel)]="SelectedModelId">
            @for (model of AvailableModels; track model.Id) {
              <option [value]="model.Id">
                {{ model.Name }} (~{{ model.ApproxSizeMB }} MB)
                @if (model.RequiresWebGPU) { · WebGPU }
              </option>
            }
          </select>
        </div>

        <div class="device-selector">
          <label for="device-select">Device:</label>
          <select id="device-select" [(ngModel)]="SelectedDevice">
            <option value="auto">Auto-detect</option>
            <option value="webgpu">WebGPU (GPU - Fastest)</option>
            <option value="wasm">WASM (CPU - Compatible)</option>
          </select>
        </div>

        <button (click)="LoadModel()" class="load-btn">Load Model</button>
        @if (ErrorMessage) {
          <p class="error">{{ ErrorMessage }}</p>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; font-family: system-ui, sans-serif; }

    .loading-overlay {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; background: #f8f9fa;
    }
    .loading-content { text-align: center; max-width: 400px; }
    .spinner {
      width: 40px; height: 40px; border: 3px solid #e0e0e0;
      border-top-color: #3b82f6; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-bar {
      height: 6px; background: #e0e0e0; border-radius: 3px;
      overflow: hidden; margin: 12px 0;
    }
    .progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s; }
    .loading-hint { font-size: 13px; color: #888; margin-top: 12px; }

    .chat-container { display: flex; flex-direction: column; height: 100vh; }
    .chat-header {
      padding: 16px 20px; border-bottom: 1px solid #e0e0e0;
      display: flex; align-items: baseline; gap: 12px;
    }
    .chat-header h2 { margin: 0; font-size: 18px; }
    .model-badge {
      font-size: 12px; color: #666; background: #f0f0f0;
      padding: 2px 8px; border-radius: 10px;
    }

    .messages { flex: 1; overflow-y: auto; padding: 20px; }
    .message { margin-bottom: 16px; max-width: 80%; }
    .message.user { margin-left: auto; }
    .message.assistant { margin-right: auto; }
    .message-role { font-size: 12px; font-weight: 600; color: #888; margin-bottom: 4px; }
    .message.user .message-role { text-align: right; }
    .message-content {
      padding: 10px 14px; border-radius: 12px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .message.user .message-content { background: #3b82f6; color: white; }
    .message.assistant .message-content { background: #f0f0f0; color: #333; }

    .cursor { animation: blink 0.7s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }

    .input-area {
      display: flex; gap: 8px; padding: 16px 20px;
      border-top: 1px solid #e0e0e0; background: #fafafa;
    }
    textarea {
      flex: 1; padding: 10px 14px; border: 1px solid #d0d0d0;
      border-radius: 8px; resize: none; font-family: inherit; font-size: 14px;
      outline: none;
    }
    textarea:focus { border-color: #3b82f6; }
    .send-btn, .abort-btn, .load-btn {
      padding: 10px 20px; border: none; border-radius: 8px;
      font-size: 14px; cursor: pointer; font-weight: 500;
    }
    .send-btn { background: #3b82f6; color: white; }
    .send-btn:disabled { opacity: 0.5; cursor: default; }
    .abort-btn { background: #ef4444; color: white; }
    .load-btn { background: #3b82f6; color: white; padding: 12px 32px; font-size: 16px; }

    .model-selector, .device-selector {
      display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
      justify-content: center;
    }
    .model-selector select, .device-selector select {
      padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 6px;
      font-size: 14px;
    }

    .init-prompt { text-align: center; padding: 80px 20px; }
    .init-prompt h2 { font-size: 24px; margin-bottom: 8px; }
    .init-prompt p { color: #666; margin-bottom: 24px; }
    .error { color: #ef4444; margin-top: 16px; }
  `],
})
export class ChatComponent implements OnInit {
  @ViewChild('messagesContainer') MessagesContainer!: ElementRef;

  protected readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  IsLoading = false;
  IsReady = false;
  IsGenerating = false;
  LoadProgress = 0;
  UserInput = '';
  StreamingText = '';
  ErrorMessage = '';
  TokensPerSecond = 0;
  DisplayMessages: ChatMessage[] = [];
  ActiveModelName = '';
  ActiveModelSizeMB = 0;
  SelectedModelId = BROWSER_CHAT_MODELS[0].Id;
  SelectedDevice: 'auto' | 'webgpu' | 'wasm' = 'webgpu'; // Default to WebGPU for best performance
  AvailableModels = BROWSER_CHAT_MODELS;

  ngOnInit(): void {
    this.chatService.IsLoading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsLoading = v));

    this.chatService.IsReady$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsReady = v));

    this.chatService.IsGenerating$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsGenerating = v));

    this.chatService.LoadProgress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.LoadProgress = v));

    this.chatService.CurrentToken$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((token) => {
        // TextStreamer sends incremental text chunks, accumulate them
        this.StreamingText += token;
        this.ScrollToBottom();
      });

    this.chatService.GenerationComplete$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Clear streaming text and update display in a microtask
        // This ensures IsGenerating has been set to false first
        Promise.resolve().then(() => {
          this.StreamingText = '';
          this.DisplayMessages = this.chatService
            .GetHistory()
            .filter((m) => m.Role !== 'system');
          this.cdr.detectChanges();
          this.ScrollToBottom();
        });
      });

    this.chatService.TokensPerSecond$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.TokensPerSecond = v));

    this.chatService.ActiveModel$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((model) => {
        if (model) {
          this.ActiveModelName = model.Name;
          this.ActiveModelSizeMB = model.ApproxSizeMB;
        }
      });

    this.chatService.Error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((err) => (this.ErrorMessage = err));
  }

  LoadModel(): void {
    const selected = BROWSER_CHAT_MODELS.find((m) => m.Id === this.SelectedModelId);
    this.chatService.Initialize(selected, this.SelectedDevice);
  }

  Send(): void {
    const text = this.UserInput.trim();
    if (!text) return;
    this.UserInput = '';
    this.StreamingText = '';

    this.DisplayMessages = [
      ...this.chatService.GetHistory().filter((m) => m.Role !== 'system'),
      { Role: 'user', Content: text },
    ];

    this.chatService.SendMessage(text);
    this.ScrollToBottom();
  }

  OnEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.Send();
    }
  }

  private ScrollToBottom(): void {
    // Use microtask instead of setTimeout for proper Angular timing
    Promise.resolve().then(() => {
      const el = this.MessagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
      this.cdr.detectChanges();
    });
  }
}
