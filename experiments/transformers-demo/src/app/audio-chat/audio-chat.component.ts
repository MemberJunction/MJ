import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  DestroyRef,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AudioService } from '../ai/audio.service';
import type { AudioTurn } from '../ai/audio-messages';
import { ModelConfigComponent } from './model-config/model-config.component';
import type { AudioModelConfig } from '../ai/audio-model-registry';

@Component({
  selector: 'app-audio-chat',
  standalone: true,
  imports: [DecimalPipe, DatePipe, RouterLink, ModelConfigComponent],
  template: `
    <!-- Model configuration screen -->
    @if (!IsReady && !IsLoading) {
      <div class="config-container">
        <div class="back-link">
          <a routerLink="/home">← Back to Home</a>
        </div>
        <app-model-config (StartChat)="OnStartChat($event)"></app-model-config>
      </div>
    }

    <!-- Loading overlay -->
    @if (IsLoading) {
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>Loading models... {{ LoadProgress | number:'1.0-0' }}%</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="LoadProgress"></div>
          </div>
          <p class="loading-hint">
            First load downloads models (~{{ TotalSizeMB }} MB).<br>
            They're cached locally for instant loads afterward.
          </p>
        </div>
      </div>
    }

    <!-- Audio chat interface -->
    @if (IsReady) {
      <div class="audio-chat-container">
        <div class="chat-header">
          <div class="header-content">
            <a routerLink="/home" class="back-btn">← Home</a>
            <h2>Voice Chat</h2>
            <span class="status-badge" [class.recording]="IsRecording" [class.processing]="IsProcessing">
              @if (IsRecording) {
                🎤 Recording...
              } @else if (IsProcessing) {
                ⚙️ {{ CurrentStageLabel }}
              } @else {
                ✓ Ready
              }
            </span>
          </div>
        </div>

        <div class="turns-list" #turnsContainer>
          @for (turn of Turns; track $index) {
            <div class="turn">
              <div class="user-message">
                <div class="label">You said:</div>
                <div class="text">{{ turn.Transcription }}</div>
              </div>
              <div class="ai-message">
                <div class="label">AI responded:</div>
                <div class="text">{{ turn.LLMResponse }}</div>
                @if (turn.AudioBlob) {
                  <audio [src]="GetAudioUrl(turn.AudioBlob)" controls></audio>
                }
              </div>
              <div class="timestamp">{{ turn.Timestamp | date:'short' }}</div>
            </div>
          }

          <!-- Current processing turn -->
          @if (IsProcessing) {
            <div class="turn processing">
              @if (CurrentTranscription) {
                <div class="user-message">
                  <div class="label">You said:</div>
                  <div class="text">{{ CurrentTranscription }}</div>
                </div>
              }
              @if (CurrentLLMResponse) {
                <div class="ai-message">
                  <div class="label">AI is responding:</div>
                  <div class="text">{{ CurrentLLMResponse }}<span class="cursor">&#x2588;</span></div>
                </div>
              }
            </div>
          }

          @if (!IsRecording && !IsProcessing && Turns.length === 0) {
            <div class="empty-state">
              <div class="empty-icon">🎤</div>
              <p>Click "Start Recording" to begin your voice conversation</p>
            </div>
          }
        </div>

        <div class="control-area">
          @if (!IsRecording && !IsProcessing) {
            <button (click)="StartRecording()" class="record-btn">
              🎤 Start Recording
            </button>
            <p class="hint">Speak clearly and keep messages under 30 seconds</p>
          } @else if (IsRecording) {
            <button (click)="StopRecording()" class="stop-btn">
              ⏹ Stop Recording
            </button>
            <p class="hint recording-hint">Recording... Click stop when finished</p>
          } @else {
            <button (click)="Abort()" class="abort-btn">
              🛑 Cancel
            </button>
            <p class="hint">Processing your message...</p>
          }
        </div>
      </div>
    }

    @if (ErrorMessage) {
      <div class="error-overlay">
        <div class="error-box">
          <h3>⚠️ Error</h3>
          <p>{{ ErrorMessage }}</p>
          <button (click)="DismissError()">Dismiss</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: system-ui, sans-serif;
      background: #f5f5f5;
    }

    .config-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }

    .back-link {
      max-width: 700px;
      margin: 0 auto 16px auto;
    }

    .back-link a {
      color: white;
      text-decoration: none;
      font-size: 14px;
      opacity: 0.9;
      transition: opacity 0.2s;
    }

    .back-link a:hover {
      opacity: 1;
    }

    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .loading-content {
      text-align: center;
      max-width: 400px;
      color: white;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.3);
      border-radius: 4px;
      overflow: hidden;
      margin: 16px 0;
    }

    .progress-fill {
      height: 100%;
      background: white;
      transition: width 0.3s;
    }

    .loading-hint {
      font-size: 14px;
      opacity: 0.9;
      margin-top: 16px;
      line-height: 1.6;
    }

    .audio-chat-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: white;
    }

    .chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .back-btn {
      color: white;
      text-decoration: none;
      font-size: 14px;
      opacity: 0.9;
      transition: opacity 0.2s;
    }

    .back-btn:hover {
      opacity: 1;
    }

    .chat-header h2 {
      margin: 0;
      font-size: 20px;
      flex: 1;
    }

    .status-badge {
      background: rgba(255,255,255,0.2);
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
    }

    .status-badge.recording {
      background: #ef4444;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .status-badge.processing {
      background: #3b82f6;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .turns-list {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
    }

    .empty-state {
      text-align: center;
      padding: 80px 20px;
      color: #999;
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .turn {
      margin-bottom: 32px;
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
    }

    .turn.processing {
      border: 2px dashed #667eea;
      background: #f0f4ff;
    }

    .user-message, .ai-message {
      margin-bottom: 16px;
    }

    .user-message:last-child, .ai-message:last-child {
      margin-bottom: 0;
    }

    .label {
      font-size: 12px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #333;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .cursor {
      animation: blink 0.7s step-end infinite;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    audio {
      margin-top: 12px;
      width: 100%;
      max-width: 400px;
    }

    .timestamp {
      font-size: 12px;
      color: #999;
      margin-top: 12px;
      text-align: right;
    }

    .control-area {
      padding: 20px;
      border-top: 1px solid #e0e0e0;
      background: white;
      text-align: center;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.05);
    }

    .record-btn, .stop-btn, .abort-btn {
      padding: 16px 48px;
      border: none;
      border-radius: 50px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .record-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }

    .record-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
    }

    .stop-btn {
      background: #ef4444;
      color: white;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    .stop-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
    }

    .abort-btn {
      background: #6b7280;
      color: white;
      box-shadow: 0 4px 12px rgba(107, 114, 128, 0.3);
    }

    .abort-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(107, 114, 128, 0.4);
    }

    .hint {
      margin: 12px 0 0 0;
      font-size: 13px;
      color: #666;
    }

    .hint.recording-hint {
      color: #ef4444;
      font-weight: 500;
    }

    .error-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .error-box {
      background: white;
      padding: 32px;
      border-radius: 12px;
      max-width: 500px;
      margin: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }

    .error-box h3 {
      margin: 0 0 16px 0;
      color: #ef4444;
    }

    .error-box p {
      margin: 0 0 20px 0;
      color: #333;
      line-height: 1.6;
    }

    .error-box button {
      padding: 10px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    @media (max-width: 768px) {
      .header-content {
        flex-wrap: wrap;
      }

      .chat-header h2 {
        flex-basis: 100%;
        margin-bottom: 8px;
      }
    }
  `]
})
export class AudioChatComponent implements OnInit {
  @ViewChild('turnsContainer') TurnsContainer!: ElementRef;

  protected readonly audioService = inject(AudioService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);

  IsLoading = false;
  IsReady = false;
  IsRecording = false;
  IsProcessing = false;
  LoadProgress = 0;
  CurrentStage: 'idle' | 'transcribing' | 'generating' | 'synthesizing' = 'idle';
  CurrentTranscription = '';
  CurrentLLMResponse = '';
  Turns: AudioTurn[] = [];
  ErrorMessage = '';
  TotalSizeMB = 0;

  // Audio recording
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  get CurrentStageLabel(): string {
    switch (this.CurrentStage) {
      case 'transcribing': return 'Listening...';
      case 'generating': return 'Thinking...';
      case 'synthesizing': return 'Speaking...';
      default: return 'Processing...';
    }
  }

  ngOnInit(): void {
    this.subscribeToAudioService();
  }

  OnStartChat(config: AudioModelConfig): void {
    this.TotalSizeMB = config.STT.ApproxSizeMB + config.LLM.ApproxSizeMB + config.TTS.ApproxSizeMB;
    this.audioService.Initialize(config);
  }

  async StartRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

        try {
          // Process audio in main thread (Web Audio API available here)
          const audioData = await this.processAudioBlob(audioBlob);
          this.audioService.ProcessAudio(audioData);
        } catch (err) {
          console.error('Audio processing failed:', err);
          this.ErrorMessage = 'Failed to process audio. Please try again.';
        }

        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.IsRecording = true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      this.ErrorMessage = 'Microphone access denied. Please allow microphone access in your browser settings and try again.';
    }
  }

  StopRecording(): void {
    if (this.mediaRecorder && this.IsRecording) {
      this.mediaRecorder.stop();
      this.IsRecording = false;
    }
  }

  Abort(): void {
    this.audioService.Abort();
    this.CurrentTranscription = '';
    this.CurrentLLMResponse = '';
  }

  GetAudioUrl(blob: Blob | null): SafeUrl {
    if (!blob) return '';
    return this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
  }

  DismissError(): void {
    this.ErrorMessage = '';
  }

  /**
   * Process audio blob in main thread using Web Audio API
   * Converts to Float32Array for Whisper model
   */
  private async processAudioBlob(audioBlob: Blob): Promise<Float32Array> {
    // Convert Blob to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Decode audio using Web Audio API (only available in main thread)
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Resample to 16kHz mono if needed
    let audioData: Float32Array;

    if (audioBuffer.sampleRate !== 16000 || audioBuffer.numberOfChannels !== 1) {
      // Create offline context for resampling
      const targetSampleRate = 16000;
      const duration = audioBuffer.duration;
      const targetLength = Math.ceil(duration * targetSampleRate);

      const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate);
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();

      const resampledBuffer = await offlineContext.startRendering();
      audioData = resampledBuffer.getChannelData(0);
    } else {
      // Already correct format
      audioData = audioBuffer.getChannelData(0);
    }

    // Whisper expects exactly 30 seconds of audio at 16kHz
    const targetSamples = 16000 * 30; // 480,000 samples
    const currentSamples = audioData.length;

    if (currentSamples < targetSamples) {
      // Pad with silence
      const paddedData = new Float32Array(targetSamples);
      paddedData.set(audioData);
      return paddedData;
    } else if (currentSamples > targetSamples) {
      // Truncate to 30 seconds
      return audioData.slice(0, targetSamples);
    }

    return audioData;
  }

  private subscribeToAudioService(): void {
    this.audioService.IsLoading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.IsLoading = v);

    this.audioService.IsReady$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.IsReady = v);

    this.audioService.IsProcessing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.IsProcessing = v);

    this.audioService.LoadProgress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.LoadProgress = v);

    this.audioService.CurrentStage$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.CurrentStage = v);

    this.audioService.Transcription$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(text => {
        this.CurrentTranscription = text;
        this.cdr.detectChanges();
      });

    this.audioService.LLMToken$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(token => {
        this.CurrentLLMResponse += token;
        this.cdr.detectChanges();
      });

    this.audioService.TurnComplete$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        Promise.resolve().then(() => {
          this.CurrentTranscription = '';
          this.CurrentLLMResponse = '';
          this.Turns = this.audioService.GetHistory();
          this.cdr.detectChanges();
          this.ScrollToBottom();
        });
      });

    this.audioService.Error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(err => {
        this.ErrorMessage = err;
        this.cdr.detectChanges();
      });
  }

  private ScrollToBottom(): void {
    Promise.resolve().then(() => {
      const el = this.TurnsContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
