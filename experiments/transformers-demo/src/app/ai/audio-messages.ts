import type { AudioModelConfig } from './audio-model-registry';

// ── Audio Turn Data ────────────────────────────────────
export interface AudioTurn {
  Transcription: string;
  LLMResponse: string;
  AudioBlob: Blob;
  Timestamp: Date;
}

// ── Requests (main → worker) ───────────────────────────
export interface AudioLoadRequest {
  Type: 'audio:load';
  Config: AudioModelConfig;
}

export interface AudioProcessRequest {
  Type: 'audio:process';
  AudioBlob: Blob;
}

export interface AudioAbortRequest {
  Type: 'audio:abort';
}

// ── Responses (worker → main) ──────────────────────────
export interface AudioLoadProgress {
  Type: 'progress';
  Stage: 'stt' | 'llm' | 'tts';
  Progress: number;
  File?: string;
}

export interface AudioReady {
  Type: 'ready';
}

export interface TranscriptionResponse {
  Type: 'transcription';
  Text: string;
}

export interface LLMTokenResponse {
  Type: 'llm-token';
  Token: string;
}

export interface AudioReadyResponse {
  Type: 'audio-ready';
  AudioBlob: Blob;
}

export interface TurnCompleteResponse {
  Type: 'turn-complete';
  Turn: AudioTurn;
}

export interface AudioErrorResponse {
  Type: 'error';
  Message: string;
  Stage: 'stt' | 'llm' | 'tts' | 'audio-capture' | 'init';
}

// ── Union Types ────────────────────────────────────────
export type AudioWorkerRequest =
  | AudioLoadRequest
  | AudioProcessRequest
  | AudioAbortRequest;

export type AudioWorkerResponse =
  | AudioLoadProgress
  | AudioReady
  | TranscriptionResponse
  | LLMTokenResponse
  | AudioReadyResponse
  | TurnCompleteResponse
  | AudioErrorResponse;
