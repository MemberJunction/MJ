import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;

  async startRecording(onAudioData: (audioBuffer: ArrayBuffer) => void): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const arrayBuffer = await event.data.arrayBuffer();
          onAudioData(arrayBuffer);
        }
      };

      // Stream in small chunks for low latency
      this.mediaRecorder.start(100); // 100ms chunks
      console.log('[Audio] Recording started');
    } catch (error) {
      console.error('[Audio] Failed to start recording:', error);
      throw error;
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
      console.log('[Audio] Recording stopped');
    }
  }

  async playAudioChunk(base64Audio: string): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Decode base64 to audio buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this.playNextChunk();
      }
    } catch (error) {
      console.error('[Audio] Failed to play audio chunk:', error);
    }
  }

  private playNextChunk(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;

    this.currentSource = this.audioContext!.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext!.destination);

    this.currentSource.onended = () => {
      this.playNextChunk();
    };

    this.currentSource.start();
  }

  stopPlayback(): void {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;

    if (this.audioContext) {
      this.audioContext.suspend();
    }
  }

  cleanup(): void {
    this.stopRecording();
    this.stopPlayback();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  isSpeaking(): boolean {
    return this.isPlaying;
  }
}
