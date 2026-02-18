// Typed message protocol for worker communication

// ── Model Configuration ───────────────────────────────
export interface ModelConfig {
  ModelId: string;
  Device: 'webgpu' | 'wasm' | 'auto';
  DType: string;           // e.g., 'q4f16', 'q4', 'fp16'
  MaxNewTokens: number;
}

// ── Chat Messages ──────────────────────────────────────
export interface ChatLoadRequest {
  Type: 'chat:load';
  Config: ModelConfig;
}

export interface ChatGenerateRequest {
  Type: 'chat:generate';
  Messages: Array<{ Role: 'system' | 'user' | 'assistant'; Content: string }>;
  MaxTokens?: number;
}

export interface ChatAbortRequest {
  Type: 'chat:abort';
}

// ── Responses (from worker → main) ────────────────────
export interface ModelLoadProgress {
  Type: 'progress';
  File: string;
  Loaded: number;
  Total: number;
  Progress: number; // 0-100
}

export interface ModelReady {
  Type: 'ready';
  ModelId: string;
}

export interface TokenResponse {
  Type: 'token';
  Token: string;
}

export interface GenerationComplete {
  Type: 'complete';
  Text: string;
  TokensPerSecond: number;
  TotalTokens: number;
}

export interface ErrorResponse {
  Type: 'error';
  Message: string;
}

export type WorkerRequest =
  | ChatLoadRequest | ChatGenerateRequest | ChatAbortRequest;

export type WorkerResponse =
  | ModelLoadProgress | ModelReady | TokenResponse
  | GenerationComplete | ErrorResponse;
