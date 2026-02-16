import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import type { WorkerResponse } from './ai-messages';
import {
  type BrowserModelDefinition,
  SelectBestChatModel,
} from './model-registry';

export interface ChatMessage {
  Role: 'system' | 'user' | 'assistant';
  Content: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private worker: Worker | null = null;

  // State
  private _IsLoading = new BehaviorSubject<boolean>(false);
  private _IsReady = new BehaviorSubject<boolean>(false);
  private _IsGenerating = new BehaviorSubject<boolean>(false);
  private _LoadProgress = new BehaviorSubject<number>(0);
  private _CurrentToken = new Subject<string>();
  private _GenerationComplete = new Subject<string>();
  private _Error = new Subject<string>();
  private _ActiveModel = new BehaviorSubject<BrowserModelDefinition | null>(null);
  private _TokensPerSecond = new BehaviorSubject<number>(0);

  // Public observables
  IsLoading$: Observable<boolean> = this._IsLoading.asObservable();
  IsReady$: Observable<boolean> = this._IsReady.asObservable();
  IsGenerating$: Observable<boolean> = this._IsGenerating.asObservable();
  LoadProgress$: Observable<number> = this._LoadProgress.asObservable();
  CurrentToken$: Observable<string> = this._CurrentToken.asObservable();
  GenerationComplete$: Observable<string> = this._GenerationComplete.asObservable();
  Error$: Observable<string> = this._Error.asObservable();
  ActiveModel$: Observable<BrowserModelDefinition | null> = this._ActiveModel.asObservable();
  TokensPerSecond$: Observable<number> = this._TokensPerSecond.asObservable();

  // Conversation history
  private Messages: ChatMessage[] = [
    {
      Role: 'system',
      Content: 'You are a helpful assistant. Keep responses concise and clear.',
    },
  ];

  async Initialize(modelDef?: BrowserModelDefinition): Promise<void> {
    if (this.worker) return;

    const selectedModel = modelDef ?? (await SelectBestChatModel());
    this._ActiveModel.next(selectedModel);
    this._IsLoading.next(true);

    this.worker = new Worker(
      new URL('./chat.worker', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.postMessage({
      Type: 'chat:load',
      Config: {
        ModelId: selectedModel.HuggingFaceId,
        Device: 'auto',
        DType: selectedModel.DType,
        MaxNewTokens: selectedModel.MaxNewTokens,
      },
    });
  }

  SendMessage(userMessage: string): void {
    if (!this.worker || !this._IsReady.value) return;

    this.Messages.push({ Role: 'user', Content: userMessage });
    this._IsGenerating.next(true);

    this.worker.postMessage({
      Type: 'chat:generate',
      Messages: [...this.Messages],
      MaxTokens: this._ActiveModel.value?.MaxNewTokens ?? 512,
    });
  }

  Abort(): void {
    this.worker?.postMessage({ Type: 'chat:abort' });
    this._IsGenerating.next(false);
  }

  ClearHistory(): void {
    this.Messages = [this.Messages[0]]; // Keep system prompt
  }

  GetHistory(): ChatMessage[] {
    return [...this.Messages];
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.Type) {
      case 'progress':
        this._LoadProgress.next(msg.Progress);
        break;
      case 'ready':
        this._IsLoading.next(false);
        this._IsReady.next(true);
        break;
      case 'token':
        this._CurrentToken.next(msg.Token);
        break;
      case 'complete':
        this._IsGenerating.next(false);
        this._GenerationComplete.next(msg.Text);
        this._TokensPerSecond.next(msg.TokensPerSecond);
        this.Messages.push({ Role: 'assistant', Content: msg.Text });
        break;
      case 'error':
        this._IsLoading.next(false);
        this._IsGenerating.next(false);
        this._Error.next(msg.Message);
        break;
    }
  }
}
