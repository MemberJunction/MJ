import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import type { AudioWorkerResponse, AudioTurn, AudioProcessRequest } from './audio-messages';
import type { AudioModelConfig } from './audio-model-registry';

@Injectable({ providedIn: 'root' })
export class AudioService implements OnDestroy {
  private worker: Worker | null = null;

  // State - mirrors ChatService pattern
  private _IsLoading = new BehaviorSubject<boolean>(false);
  private _IsReady = new BehaviorSubject<boolean>(false);
  private _IsProcessing = new BehaviorSubject<boolean>(false);
  private _LoadProgress = new BehaviorSubject<number>(0);
  private _CurrentStage = new BehaviorSubject<'idle' | 'transcribing' | 'generating' | 'synthesizing'>('idle');
  private _Transcription = new Subject<string>();
  private _LLMToken = new Subject<string>();
  private _AudioReady = new Subject<Blob>();
  private _TurnComplete = new Subject<AudioTurn>();
  private _Error = new Subject<string>();
  private _ActiveConfig = new BehaviorSubject<AudioModelConfig | null>(null);

  // Public observables
  IsLoading$: Observable<boolean> = this._IsLoading.asObservable();
  IsReady$: Observable<boolean> = this._IsReady.asObservable();
  IsProcessing$: Observable<boolean> = this._IsProcessing.asObservable();
  LoadProgress$: Observable<number> = this._LoadProgress.asObservable();
  CurrentStage$: Observable<'idle' | 'transcribing' | 'generating' | 'synthesizing'> =
    this._CurrentStage.asObservable();
  Transcription$: Observable<string> = this._Transcription.asObservable();
  LLMToken$: Observable<string> = this._LLMToken.asObservable();
  AudioReady$: Observable<Blob> = this._AudioReady.asObservable();
  TurnComplete$: Observable<AudioTurn> = this._TurnComplete.asObservable();
  Error$: Observable<string> = this._Error.asObservable();
  ActiveConfig$: Observable<AudioModelConfig | null> = this._ActiveConfig.asObservable();

  // History
  private Turns: AudioTurn[] = [];

  async Initialize(config: AudioModelConfig): Promise<void> {
    if (this.worker) {
      console.warn('Audio worker already initialized');
      return;
    }

    this._ActiveConfig.next(config);
    this._IsLoading.next(true);
    this._LoadProgress.next(0);

    this.worker = new Worker(
      new URL('./audio.worker', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<AudioWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (error) => {
      console.error('Audio worker error:', error);
      this._Error.next(`Worker error: ${error.message}`);
      this._IsLoading.next(false);
    };

    this.worker.postMessage({
      Type: 'audio:load',
      Config: config,
    });
  }

  ProcessAudio(audioData: Float32Array): void {
    if (!this.worker || !this._IsReady.value) {
      console.error('Audio worker not ready');
      return;
    }

    this._IsProcessing.next(true);
    this._CurrentStage.next('transcribing');

    this.worker.postMessage({
      Type: 'audio:process',
      AudioData: audioData,
    } satisfies AudioProcessRequest);
  }

  Abort(): void {
    this.worker?.postMessage({ Type: 'audio:abort' });
    this._IsProcessing.next(false);
    this._CurrentStage.next('idle');
  }

  GetHistory(): AudioTurn[] {
    return [...this.Turns];
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private handleWorkerMessage(msg: AudioWorkerResponse): void {
    switch (msg.Type) {
      case 'progress':
        // Calculate overall progress (0-100) across 3 models
        // STT: 0-33%, LLM: 33-66%, TTS: 66-100%
        let baseProgress = 0;
        if (msg.Stage === 'stt') baseProgress = 0;
        else if (msg.Stage === 'llm') baseProgress = 33;
        else if (msg.Stage === 'tts') baseProgress = 66;

        const stageProgress = (msg.Progress / 100) * 33;
        this._LoadProgress.next(baseProgress + stageProgress);
        break;

      case 'ready':
        this._IsLoading.next(false);
        this._IsReady.next(true);
        this._LoadProgress.next(100);
        break;

      case 'transcription':
        this._CurrentStage.next('generating');
        this._Transcription.next(msg.Text);
        break;

      case 'llm-token':
        this._LLMToken.next(msg.Token);
        break;

      case 'audio-ready':
        this._CurrentStage.next('idle');
        this._AudioReady.next(msg.AudioBlob);
        break;

      case 'turn-complete':
        this._IsProcessing.next(false);
        this._CurrentStage.next('idle');
        this._TurnComplete.next(msg.Turn);
        this.Turns.push(msg.Turn);
        break;

      case 'error':
        this._IsLoading.next(false);
        this._IsProcessing.next(false);
        this._CurrentStage.next('idle');
        this._Error.next(msg.Message);
        break;
    }
  }
}
