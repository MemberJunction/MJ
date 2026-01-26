import { Component, Input, Output, EventEmitter, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { VoiceConversationService, VoiceStreamEvent } from '../../../services/voice-conversation.service';
import { Subscription } from 'rxjs';

/**
 * Component for real-time voice conversations with streaming audio playback.
 *
 * Features:
 * - Real-time audio capture with Web Audio API (PCM 16-bit 16kHz mono)
 * - Streaming audio playback with separate AudioContext
 * - Live transcription display (user and agent)
 * - Interrupt functionality to stop agent mid-response
 * - Status indicators for recording and agent speaking states
 *
 * Audio Format:
 * - Input: PCM 16-bit 16kHz mono (required by Eleven Labs Conversational AI)
 * - Output: Decoded from base64 audio chunks received from server
 *
 * Usage:
 * <mj-voice-streaming
 *   [conversationDetailId]="detailId"
 *   (sessionEnded)="onSessionEnd()">
 * </mj-voice-streaming>
 */
@Component({
  selector: 'mj-voice-streaming',
  templateUrl: './voice-streaming.component.html',
  styleUrls: ['./voice-streaming.component.scss']
})
export class VoiceStreamingComponent implements OnDestroy {
  @Input() conversationDetailId!: string;
  @Output() sessionEnded = new EventEmitter<void>();

  // State flags
  isRecording = false;
  isAgentSpeaking = false;
  isSessionActive = false;

  // Transcripts
  userTranscript = '';
  agentResponse = '';

  // Error message
  errorMessage: string | null = null;

  // Web Audio API for capture (sending PCM to Eleven Labs)
  private inputAudioContext?: AudioContext;
  private scriptProcessor?: ScriptProcessorNode;
  private mediaStream?: MediaStream;

  // Separate AudioContext for playback (receiving from Eleven Labs)
  private playbackAudioContext?: AudioContext;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;

  // Subscription to voice service events
  private streamSubscription?: Subscription;

  constructor(
    private voiceService: VoiceConversationService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Start the voice conversation session.
   * Initializes microphone access and WebSocket connection.
   */
  async startSession(): Promise<void> {
    try {
      this.errorMessage = null;

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      // Set up Web Audio API for PCM capture at 16kHz
      this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

      // Create ScriptProcessorNode with 2048 samples (~128ms at 16kHz)
      // bufferSize must be power of 2: 256, 512, 1024, 2048, 4096, 8192, or 16384
      // bufferSize, numberOfInputChannels, numberOfOutputChannels
      this.scriptProcessor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

      // Process audio chunks and send as PCM
      this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (this.isRecording) {
          const float32Data = event.inputBuffer.getChannelData(0);
          const int16Data = this.convertFloat32ToInt16(float32Data);
          this.sendPCMAudioChunk(int16Data);
        }
      };

      // Connect the audio graph: source -> processor -> destination
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioContext.destination);

      this.isRecording = true;

      // Subscribe to voice service events
      this.streamSubscription = this.voiceService.startSession(this.conversationDetailId).subscribe({
        next: (event: VoiceStreamEvent) => this.handleStreamEvent(event),
        error: (error: Error) => this.handleStreamError(error),
        complete: () => this.handleStreamComplete()
      });

      this.isSessionActive = true;
      this.cdr.detectChanges();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to start session: ${message}`;
      this.cleanup();
      this.cdr.detectChanges();
    }
  }

  /**
   * End the voice conversation session.
   * Stops recording, releases microphone, and closes WebSocket.
   */
  endSession(): void {
    this.voiceService.endSession();
    this.cleanup();
    this.sessionEnded.emit();
  }

  /**
   * Interrupt the agent's current response.
   * Stops playback and sends interrupt signal to server.
   */
  interrupt(): void {
    this.voiceService.interrupt();
    this.stopAudioPlayback();
    this.isAgentSpeaking = false;
    this.cdr.detectChanges();
  }

  /**
   * Handle incoming stream events from the voice service.
   */
  private handleStreamEvent(event: VoiceStreamEvent): void {
    console.log('Voice stream event:', event.type, event.data);

    switch (event.type) {
      case 'ready':
        // Session established and ready
        console.log('Voice session ready:', event.data['sessionId']);
        break;

      case 'transcript':
        // User speech transcribed
        const transcript = event.data['text'] as string || '';
        this.userTranscript = transcript;
        this.cdr.detectChanges();
        break;

      case 'agent_response':
        // Agent text response (streaming or complete)
        const responseText = event.data['text'] as string || '';
        const isComplete = event.data['complete'] as boolean || false;

        if (isComplete) {
          this.agentResponse = responseText;
        } else {
          // Append streaming text
          this.agentResponse += responseText;
        }
        this.cdr.detectChanges();
        break;

      case 'audio_chunk':
        // Agent audio chunk for playback
        const audioData = event.data['audio'] as string;
        if (audioData) {
          this.isAgentSpeaking = true;
          this.queueAudioChunk(audioData).catch(error => {
            console.error('Failed to queue audio chunk:', error);
          });
          this.cdr.detectChanges();
        }
        break;

      case 'tool_call':
        // Agent is calling a MemberJunction Action
        const toolName = event.data['tool'] as string || 'unknown';
        console.log('Agent calling tool:', toolName);
        // Could show a status indicator in UI
        break;

      case 'error':
        // Error occurred during conversation
        const errorMsg = event.data['message'] as string || 'Unknown error';
        this.errorMessage = errorMsg;
        this.cdr.detectChanges();
        break;

      case 'complete':
        // Session ended normally
        this.handleStreamComplete();
        break;
    }
  }

  /**
   * Handle stream error.
   */
  private handleStreamError(error: Error): void {
    console.error('Voice stream error:', error);
    this.errorMessage = `Stream error: ${error.message}`;
    this.cleanup();
    this.cdr.detectChanges();
  }

  /**
   * Handle stream completion.
   */
  private handleStreamComplete(): void {
    console.log('Voice stream completed');
    this.cleanup();
    this.cdr.detectChanges();
  }

  /**
   * Convert Float32 audio samples to Int16 PCM format.
   * Eleven Labs requires PCM 16-bit samples.
   */
  private convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range and convert to 16-bit integer
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Send PCM audio chunk to the server via voice service.
   * Sends Int16 PCM data as ArrayBuffer.
   */
  private sendPCMAudioChunk(pcmData: Int16Array): void {
    try {
      // Int16Array.buffer gives us the underlying ArrayBuffer
      this.voiceService.sendAudio(pcmData.buffer);
    } catch (error) {
      console.error('Failed to send PCM audio chunk:', error);
    }
  }

  /**
   * Queue audio chunk for playback.
   * Converts base64 audio to AudioBuffer and adds to playback queue.
   */
  private async queueAudioChunk(base64Audio: string): Promise<void> {
    try {
      // Initialize playback AudioContext on first use
      if (!this.playbackAudioContext) {
        this.playbackAudioContext = new AudioContext();
      }

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data to AudioBuffer
      const audioBuffer = await this.playbackAudioContext.decodeAudioData(bytes.buffer);

      // Add to queue
      this.audioQueue.push(audioBuffer);

      // Start playback if not already playing
      if (!this.isPlaying) {
        this.playNextChunk();
      }

    } catch (error) {
      console.error('Failed to queue audio chunk:', error);
    }
  }

  /**
   * Play next audio chunk from queue.
   * Creates BufferSource and chains playback for smooth streaming.
   */
  private playNextChunk(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.isAgentSpeaking = false;
      this.cdr.detectChanges();
      return;
    }

    if (!this.playbackAudioContext) {
      console.error('Playback AudioContext not initialized');
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;

    // Create buffer source
    const source = this.playbackAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackAudioContext.destination);

    // Chain to next chunk when this one ends
    source.onended = () => {
      this.playNextChunk();
    };

    source.start();
  }

  /**
   * Stop audio playback immediately.
   * Clears the audio queue and stops current playback.
   */
  private stopAudioPlayback(): void {
    this.audioQueue = [];
    this.isPlaying = false;

    // AudioContext sources stop automatically when disconnected
    // We just need to clear the queue to prevent further playback
  }


  /**
   * Clean up resources.
   * Stops recording, releases microphone, closes audio contexts.
   */
  private cleanup(): void {
    // Disconnect and clean up ScriptProcessorNode
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = undefined;
    }

    // Close input audio context (for recording)
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      this.inputAudioContext.close().catch((error: Error) => {
        console.error('Failed to close input AudioContext:', error);
      });
      this.inputAudioContext = undefined;
    }

    // Release microphone
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = undefined;
    }

    // Stop audio playback
    this.stopAudioPlayback();

    // Close playback audio context
    if (this.playbackAudioContext && this.playbackAudioContext.state !== 'closed') {
      this.playbackAudioContext.close().catch((error: Error) => {
        console.error('Failed to close playback AudioContext:', error);
      });
      this.playbackAudioContext = undefined;
    }

    // Unsubscribe from stream
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
      this.streamSubscription = undefined;
    }

    this.isRecording = false;
    this.isAgentSpeaking = false;
    this.isSessionActive = false;
  }

  /**
   * Lifecycle hook - cleanup on component destruction.
   */
  ngOnDestroy(): void {
    this.cleanup();
  }
}

/**
 * Prevent tree-shaking of this component.
 */
export function LoadVoiceStreamingComponent() {
  // Empty function for tree-shaking prevention
}
