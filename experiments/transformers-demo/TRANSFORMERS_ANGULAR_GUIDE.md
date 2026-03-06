# Client-Side AI with Transformers.js + Angular

A practical guide to running AI models directly in the browser using Transformers.js with Angular. Covers architecture patterns, a pluggable chat interface with Phi-4 Mini, real-time speech-to-text with Whisper, and integration with MemberJunction's AI provider system.

-----

## Table of Contents

1. [Architecture Overview](#architecture)
1. [Project Setup](#setup)
1. [Web Worker Infrastructure](#workers)
1. [Chat Example — Phi-4 Mini (Quantized)](#chat)
1. [Real-Time Audio Transcription — Whisper](#audio)
1. [Model Selection Guide](#models)
1. [MemberJunction Integration](#mj-integration)
1. [Production Considerations](#production)

-----

## 1. Architecture Overview {#architecture}

The key architectural decision is **never run inference on the main thread**. Angular's change detection + model inference = frozen UI. The pattern:

```
┌─────────────────────────────────────────────────────┐
│  Angular App (Main Thread)                           │
│  ┌───────────────┐  ┌─────────────────────────────┐ │
│  │ Chat Component │  │ Audio Component              │ │
│  │  (UI + State)  │  │  (Mic + Waveform)            │ │
│  └───────┬───────┘  └────────────┬──────────────┘   │
│          │                       │                   │
│  ┌───────▼───────────────────────▼────────────────┐ │
│  │       AI Service (Angular Injectable)           │ │
│  │  - postMessage / onmessage bridge               │ │
│  │  - Observable streams for tokens/transcripts    │ │
│  └───────┬───────────────────────┬────────────────┘ │
└──────────┼───────────────────────┼──────────────────┘
           │                       │
┌──────────▼──────────┐ ┌─────────▼───────────────┐
│  Chat Worker         │ │  Audio Worker            │
│  (text-generation    │ │  (automatic-speech-      │
│   pipeline)          │ │   recognition pipeline)  │
│  Phi-4 Mini q4f16    │ │  Whisper tiny.en         │
│  via WebGPU          │ │  via WebGPU/Wasm         │
└─────────────────────┘ └─────────────────────────┘
```

**Why separate workers?** Each model loads its own ONNX session. Isolating them prevents memory contention and lets you load/unload models independently.

-----

## 2. Project Setup {#setup}

### Create the Angular project

```bash
ng new transformers-demo --style=scss --routing=false --ssr=false
cd transformers-demo
```

### Install dependencies

```bash
npm install @huggingface/transformers@3.8.1
```

> **Note on versions:** v3.8.1 is the latest stable release. v4 is in preview (`@next` tag) with a rewritten C++ WebGPU runtime offering 3-10x speedups, but v3 is production-ready today. The API is nearly identical — upgrading later is straightforward.

### Configure Angular for Web Workers

Angular CLI has built-in worker support. Workers need access to `node_modules`, so update `angular.json`:

```json
// angular.json → projects → architect → build → options
{
  "webWorkerTsConfig": "tsconfig.worker.json"
}
```

Create `tsconfig.worker.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/worker",
    "lib": ["es2020", "webworker"],
    "types": []
  },
  "include": ["src/**/*.worker.ts"]
}
```

-----

## 3. Web Worker Infrastructure {#workers}

### Shared Message Protocol

Create a typed message protocol that both workers and services use:

```typescript
// src/app/ai/ai-messages.ts

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

// ── Audio Messages ─────────────────────────────────────
export interface AudioLoadRequest {
  Type: 'audio:load';
  Config: ModelConfig;
}

export interface AudioTranscribeRequest {
  Type: 'audio:transcribe';
  AudioData: Float32Array;
  SampleRate: number;
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

export interface TranscriptionResult {
  Type: 'transcription';
  Text: string;
  Chunks?: Array<{ Text: string; Timestamp: [number, number] }>;
}

export interface ErrorResponse {
  Type: 'error';
  Message: string;
}

export type WorkerRequest =
  | ChatLoadRequest | ChatGenerateRequest | ChatAbortRequest
  | AudioLoadRequest | AudioTranscribeRequest;

export type WorkerResponse =
  | ModelLoadProgress | ModelReady | TokenResponse
  | GenerationComplete | TranscriptionResult | ErrorResponse;
```

-----

## 4. Chat Example — Phi-4 Mini {#chat}

### Model Choice Rationale

Phi-4 Mini is the primary recommendation. It became fully functional for browser inference via Transformers.js + WebGPU after the ONNX external data file loading fix ([huggingface/transformers.js#1460](https://github.com/huggingface/transformers.js/issues/1460), resolved February 2026).

|Model                    |Size (q4f16)|Quality     |WebGPU Required|Notes                                      |
|-------------------------|------------|------------|---------------|--------------------------------------------|
|**Phi-4 Mini Instruct**  |~2.2 GB     |★★★★★       |Yes            |Best quality for size, GQA, 200K vocab      |
|Phi-3.5 Mini Instruct    |~2.1 GB     |★★★★        |Yes            |Proven stable, fallback option              |
|SmolLM2-1.7B-Instruct    |~900 MB     |★★★         |Recommended    |Good middle ground                          |
|Qwen3-0.6B               |~350 MB     |★★★         |Recommended    |Tiny, hybrid thinking mode, proven browser  |
|SmolLM2-360M-Instruct    |~200 MB     |★★          |No (Wasm OK)   |Ultra-fast, low-end device fallback         |

**Why Phi-4 Mini over Phi-3.5 Mini?**
- Grouped Query Attention (GQA) reduces KV-cache to ~1/3 of standard size — better for GPU-constrained browsers
- Shared input/output embeddings reduce memory despite 6x larger vocabulary (200K vs 32K tokens)
- Trained on 5T tokens (vs 3.4T), significantly better reasoning, math, and coding
- Native function calling support
- Same 3.8B parameter count, similar download size

**Phi-4 Multimodal** (`microsoft/Phi-4-multimodal-instruct-onnx`) supports text + image + audio input (5.6B params), but currently requires CUDA/DirectML — no browser support yet. Worth watching for future convergence of the chat and audio workers into a single model.

### Model Registry

Define a pluggable model registry so users can switch models easily:

```typescript
// src/app/ai/model-registry.ts

export interface BrowserModelDefinition {
  Id: string;
  Name: string;
  HuggingFaceId: string;
  DType: string;
  RequiresWebGPU: boolean;
  ApproxSizeMB: number;
  MaxNewTokens: number;
  DefaultTemperature: number;
  Category: 'chat' | 'speech' | 'embeddings';
}

export const BROWSER_CHAT_MODELS: BrowserModelDefinition[] = [
  {
    Id: 'phi-4-mini',
    Name: 'Phi-4 Mini Instruct',
    HuggingFaceId: 'onnx-community/Phi-4-mini-instruct-web-q4f16',
    DType: 'q4f16',
    RequiresWebGPU: true,
    ApproxSizeMB: 2200,
    MaxNewTokens: 2048,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'phi-3.5-mini',
    Name: 'Phi-3.5 Mini Instruct',
    HuggingFaceId: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    DType: 'q4f16',
    RequiresWebGPU: true,
    ApproxSizeMB: 2100,
    MaxNewTokens: 2048,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'qwen3-0.6b',
    Name: 'Qwen3 0.6B',
    HuggingFaceId: 'onnx-community/Qwen3-0.6B-ONNX',
    DType: 'q4f16',
    RequiresWebGPU: false,
    ApproxSizeMB: 350,
    MaxNewTokens: 1024,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'smollm2-1.7b',
    Name: 'SmolLM2 1.7B Instruct',
    HuggingFaceId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    DType: 'q4',
    RequiresWebGPU: false,
    ApproxSizeMB: 900,
    MaxNewTokens: 1024,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'smollm2-360m',
    Name: 'SmolLM2 360M Instruct',
    HuggingFaceId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    DType: 'q4',
    RequiresWebGPU: false,
    ApproxSizeMB: 200,
    MaxNewTokens: 512,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
];

export const BROWSER_SPEECH_MODELS: BrowserModelDefinition[] = [
  {
    Id: 'whisper-tiny-en',
    Name: 'Whisper Tiny (English)',
    HuggingFaceId: 'onnx-community/whisper-tiny.en',
    DType: 'fp32',
    RequiresWebGPU: false,
    ApproxSizeMB: 40,
    MaxNewTokens: 0,
    DefaultTemperature: 0,
    Category: 'speech',
  },
  {
    Id: 'whisper-base-en',
    Name: 'Whisper Base (English)',
    HuggingFaceId: 'onnx-community/whisper-base.en',
    DType: 'fp32',
    RequiresWebGPU: false,
    ApproxSizeMB: 75,
    MaxNewTokens: 0,
    DefaultTemperature: 0,
    Category: 'speech',
  },
  {
    Id: 'moonshine-tiny',
    Name: 'Moonshine Tiny',
    HuggingFaceId: 'onnx-community/moonshine-tiny-ONNX',
    DType: 'fp32',
    RequiresWebGPU: false,
    ApproxSizeMB: 30,
    MaxNewTokens: 0,
    DefaultTemperature: 0,
    Category: 'speech',
  },
];

/** Select the best available chat model based on device capabilities. */
export async function SelectBestChatModel(): Promise<BrowserModelDefinition> {
  const hasWebGPU = await DetectWebGPU();
  if (hasWebGPU) {
    return BROWSER_CHAT_MODELS[0]; // Phi-4 Mini
  }
  // Fall back to first model that doesn't require WebGPU
  return (
    BROWSER_CHAT_MODELS.find((m) => !m.RequiresWebGPU) ??
    BROWSER_CHAT_MODELS[BROWSER_CHAT_MODELS.length - 1]
  );
}

export async function DetectWebGPU(): Promise<boolean> {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}
```

### Chat Worker

Uses the low-level `AutoTokenizer` + `AutoModelForCausalLM` + `TextStreamer` pattern from the official Transformers.js examples. This is the correct streaming approach — the pipeline-level `callback_function` does not provide token-by-token output directly.

```typescript
// src/app/ai/chat.worker.ts

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  env,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers';
import type {
  WorkerRequest,
  WorkerResponse,
  ModelConfig,
  ChatGenerateRequest,
} from './ai-messages';

// Disable local model check — always fetch from HF Hub
env.allowLocalModels = false;

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let stoppingCriteria: InterruptableStoppingCriteria | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

async function loadModel(config: ModelConfig): Promise<void> {
  try {
    const device = await resolveDevice(config.Device);

    const progressCallback = (progress: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
      progress?: number;
    }): void => {
      if (progress.status === 'progress') {
        post({
          Type: 'progress',
          File: progress.file ?? '',
          Loaded: progress.loaded ?? 0,
          Total: progress.total ?? 0,
          Progress: progress.progress ?? 0,
        });
      }
    };

    // Load tokenizer and model separately for streaming control
    tokenizer = await AutoTokenizer.from_pretrained(config.ModelId, {
      progress_callback: progressCallback,
    });

    model = await AutoModelForCausalLM.from_pretrained(config.ModelId, {
      dtype: config.DType as 'q4f16' | 'q4' | 'fp16' | 'fp32',
      device,
      progress_callback: progressCallback,
    });

    stoppingCriteria = new InterruptableStoppingCriteria();

    post({ Type: 'ready', ModelId: config.ModelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Failed to load model: ${message}` });
  }
}

async function generate(request: ChatGenerateRequest): Promise<void> {
  if (!tokenizer || !model || !stoppingCriteria) {
    post({ Type: 'error', Message: 'Model not loaded' });
    return;
  }

  try {
    stoppingCriteria.reset();

    // Apply chat template to convert messages into model input
    const inputs = tokenizer.apply_chat_template(
      request.Messages.map((m) => ({ role: m.Role, content: m.Content })),
      { add_generation_prompt: true, return_dict: true }
    );

    // Track performance metrics
    let startTime: number | null = null;
    let numTokens = 0;
    let tokensPerSecond = 0;

    const tokenCallback = (): void => {
      if (startTime == null) {
        startTime = performance.now();
      }
      numTokens++;
      if (numTokens > 1 && startTime != null) {
        tokensPerSecond = ((numTokens - 1) / (performance.now() - startTime)) * 1000;
      }
    };

    const textCallback = (text: string): void => {
      post({ Type: 'token', Token: text });
    };

    // TextStreamer is the correct streaming mechanism in Transformers.js v3
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: textCallback,
      token_callback_function: tokenCallback,
    });

    const maxTokens = request.MaxTokens ?? 512;

    const output = await model.generate({
      ...inputs,
      max_new_tokens: maxTokens,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    });

    // Decode the full response for the completion message
    const outputTokenIds = output.sequences;
    const decoded = tokenizer.batch_decode(outputTokenIds, {
      skip_special_tokens: true,
    });
    // Extract only the assistant's reply (after the prompt)
    const inputLength = inputs.input_ids.dims?.[1] ?? 0;
    const outputIds = outputTokenIds.slice(null, [inputLength, null]);
    const assistantReply = tokenizer.batch_decode(outputIds, {
      skip_special_tokens: true,
    })[0] ?? '';

    post({
      Type: 'complete',
      Text: assistantReply,
      TokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      TotalTokens: numTokens,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return;
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Generation failed: ${message}` });
  }
}

async function resolveDevice(
  preference: 'webgpu' | 'wasm' | 'auto'
): Promise<'webgpu' | 'wasm'> {
  if (preference === 'wasm') return 'wasm';
  if (preference === 'webgpu') return 'webgpu';

  // Auto-detect
  try {
    if ('gpu' in navigator) {
      const gpu = (navigator as Navigator & { gpu: GPU }).gpu;
      const adapter = await gpu.requestAdapter();
      if (adapter != null) return 'webgpu';
    }
  } catch {
    // Fall through to wasm
  }
  return 'wasm';
}

// ── Message Handler ──────────────────────────────────
self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data;

  switch (msg.Type) {
    case 'chat:load':
      await loadModel(msg.Config);
      break;
    case 'chat:generate':
      await generate(msg);
      break;
    case 'chat:abort':
      stoppingCriteria?.interrupt();
      break;
  }
};
```

### Chat Service

```typescript
// src/app/ai/chat.service.ts

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
```

### Chat Component

Uses `@if`/`@for` block syntax, `inject()` function, PascalCase public members, and `DestroyRef` with `takeUntilDestroyed` for subscription cleanup.

```typescript
// src/app/chat/chat.component.ts

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

    .model-selector {
      display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
      justify-content: center;
    }
    .model-selector select {
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
        this.StreamingText = '';
        this.DisplayMessages = this.chatService
          .GetHistory()
          .filter((m) => m.Role !== 'system');
        this.ScrollToBottom();
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
    this.chatService.Initialize(selected);
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
```

-----

## 5. Real-Time Audio Transcription — Whisper {#audio}

### Audio Worker

```typescript
// src/app/ai/audio.worker.ts

import { pipeline, env } from '@huggingface/transformers';
import type {
  WorkerRequest,
  WorkerResponse,
  ModelConfig,
} from './ai-messages';

env.allowLocalModels = false;

// Type for the speech recognition pipeline
interface SpeechRecognitionPipeline {
  (audio: Float32Array, options?: Record<string, unknown>): Promise<{
    text: string;
    chunks?: Array<{ text: string; timestamp: [number, number] }>;
  }>;
}

let transcriber: SpeechRecognitionPipeline | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

async function loadModel(config: ModelConfig): Promise<void> {
  try {
    const hasWebGPU = 'gpu' in navigator;
    const device = hasWebGPU ? 'webgpu' : 'wasm';

    const progressCallback = (progress: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
      progress?: number;
    }): void => {
      if (progress.status === 'progress') {
        post({
          Type: 'progress',
          File: progress.file ?? '',
          Loaded: progress.loaded ?? 0,
          Total: progress.total ?? 0,
          Progress: progress.progress ?? 0,
        });
      }
    };

    transcriber = (await pipeline(
      'automatic-speech-recognition',
      config.ModelId || 'onnx-community/whisper-tiny.en',
      {
        device,
        progress_callback: progressCallback,
      }
    )) as unknown as SpeechRecognitionPipeline;

    post({ Type: 'ready', ModelId: config.ModelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Failed to load Whisper: ${message}` });
  }
}

async function transcribe(
  audioData: Float32Array,
  sampleRate: number
): Promise<void> {
  if (!transcriber) {
    post({ Type: 'error', Message: 'Whisper model not loaded' });
    return;
  }

  try {
    // Resample to 16kHz if needed (Whisper requires 16kHz)
    const audio = sampleRate !== 16000
      ? resampleAudio(audioData, sampleRate, 16000)
      : audioData;

    const result = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: 'en',
    });

    post({
      Type: 'transcription',
      Text: result.text,
      Chunks: result.chunks?.map((c) => ({
        Text: c.text,
        Timestamp: c.timestamp,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Transcription failed: ${message}` });
  }
}

/** Linear resampling — sufficient for speech. */
function resampleAudio(
  data: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  const ratio = fromRate / toRate;
  const newLength = Math.round(data.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, data.length - 1);
    const frac = srcIndex - low;
    result[i] = data[low] * (1 - frac) + data[high] * frac;
  }
  return result;
}

// ── Message Handler ──────────────────────────────────
self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data;

  switch (msg.Type) {
    case 'audio:load':
      await loadModel(msg.Config);
      break;
    case 'audio:transcribe':
      await transcribe(msg.AudioData, msg.SampleRate);
      break;
  }
};
```

### AudioWorklet Processor (Production Audio Capture)

Use `AudioWorkletProcessor` instead of the deprecated `ScriptProcessorNode`. This runs on the audio rendering thread, preventing main-thread jank:

```typescript
// src/assets/audio-capture.worklet.ts
// This file must be served as a standalone asset — not bundled by Angular.

class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0]?.[0];
    if (input && input.length > 0) {
      // Copy the buffer — the original is reused by the audio system
      this.port.postMessage({ AudioData: new Float32Array(input) });
    }
    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor);
```

### Audio Service

```typescript
// src/app/ai/audio.service.ts

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import type { WorkerResponse } from './ai-messages';
import type { BrowserModelDefinition } from './model-registry';
import { BROWSER_SPEECH_MODELS } from './model-registry';

@Injectable({ providedIn: 'root' })
export class AudioService implements OnDestroy {
  private worker: Worker | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private audioChunks: Float32Array[] = [];
  private isRecordingActive = false;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  /** How often to send accumulated audio to the worker (seconds). */
  private readonly transcriptionIntervalSec = 3;

  // State
  private _IsLoading = new BehaviorSubject<boolean>(false);
  private _IsReady = new BehaviorSubject<boolean>(false);
  private _IsRecording = new BehaviorSubject<boolean>(false);
  private _IsTranscribing = new BehaviorSubject<boolean>(false);
  private _LoadProgress = new BehaviorSubject<number>(0);
  private _Transcription = new Subject<string>();
  private _FullTranscript = new BehaviorSubject<string>('');
  private _Error = new Subject<string>();

  // Public observables
  IsLoading$: Observable<boolean> = this._IsLoading.asObservable();
  IsReady$: Observable<boolean> = this._IsReady.asObservable();
  IsRecording$: Observable<boolean> = this._IsRecording.asObservable();
  IsTranscribing$: Observable<boolean> = this._IsTranscribing.asObservable();
  LoadProgress$: Observable<number> = this._LoadProgress.asObservable();
  Transcription$: Observable<string> = this._Transcription.asObservable();
  FullTranscript$: Observable<string> = this._FullTranscript.asObservable();
  Error$: Observable<string> = this._Error.asObservable();

  async Initialize(
    modelDef?: BrowserModelDefinition
  ): Promise<void> {
    if (this.worker) return;

    const selected = modelDef ?? BROWSER_SPEECH_MODELS[0];
    this._IsLoading.next(true);

    this.worker = new Worker(
      new URL('./audio.worker', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.postMessage({
      Type: 'audio:load',
      Config: {
        ModelId: selected.HuggingFaceId,
        Device: 'auto',
        DType: selected.DType,
        MaxNewTokens: 0,
      },
    });
  }

  async StartRecording(): Promise<void> {
    if (!this.worker || !this._IsReady.value) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Register AudioWorklet processor
      await this.audioContext.audioWorklet.addModule('/assets/audio-capture.worklet.js');
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture');

      this.audioChunks = [];
      this.workletNode.port.onmessage = (event: MessageEvent<{ AudioData: Float32Array }>) => {
        if (this.isRecordingActive) {
          this.audioChunks.push(event.data.AudioData);
        }
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.isRecordingActive = true;
      this._IsRecording.next(true);

      // Periodically send accumulated audio to worker
      this.intervalTimer = setInterval(() => {
        this.sendAccumulatedAudio();
      }, this.transcriptionIntervalSec * 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._Error.next(`Microphone access failed: ${message}`);
    }
  }

  StopRecording(): void {
    this.isRecordingActive = false;
    this._IsRecording.next(false);

    if (this.intervalTimer != null) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    // Send remaining audio
    this.sendAccumulatedAudio();

    // Cleanup
    this.workletNode?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.workletNode = null;
    this.mediaStream = null;
    this.audioContext = null;
  }

  /** Transcribe an audio file (File or Blob). */
  async TranscribeFile(file: File | Blob): Promise<void> {
    if (!this.worker || !this._IsReady.value) return;

    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0); // Mono

    this._IsTranscribing.next(true);

    this.worker.postMessage(
      {
        Type: 'audio:transcribe',
        AudioData: audioData,
        SampleRate: audioBuffer.sampleRate,
      },
      [audioData.buffer] // Transfer ownership for performance
    );

    await audioCtx.close();
  }

  ClearTranscript(): void {
    this._FullTranscript.next('');
  }

  ngOnDestroy(): void {
    this.StopRecording();
    this.worker?.terminate();
    this.worker = null;
  }

  private sendAccumulatedAudio(): void {
    if (this.audioChunks.length === 0 || !this.worker) return;

    const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    this.audioChunks = [];
    this._IsTranscribing.next(true);

    this.worker.postMessage(
      {
        Type: 'audio:transcribe',
        AudioData: combined,
        SampleRate: 16000,
      },
      [combined.buffer]
    );
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
      case 'transcription':
        this._IsTranscribing.next(false);
        this._Transcription.next(msg.Text);
        const current = this._FullTranscript.value;
        this._FullTranscript.next(current ? `${current} ${msg.Text}` : msg.Text);
        break;
      case 'error':
        this._IsLoading.next(false);
        this._IsTranscribing.next(false);
        this._Error.next(msg.Message);
        break;
    }
  }
}
```

### Audio Component

```typescript
// src/app/audio/audio.component.ts

import { Component, OnInit, DestroyRef, inject, ChangeDetectorRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AudioService } from '../ai/audio.service';

@Component({
  selector: 'app-audio',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <!-- Loading -->
    @if (IsLoading) {
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading Whisper model... {{ LoadProgress | number:'1.0-0' }}%</p>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="LoadProgress"></div>
        </div>
      </div>
    }

    <!-- Ready -->
    @if (IsReady) {
      <div class="audio-container">
        <div class="header">
          <h2>Speech to Text</h2>
          <span class="badge">Whisper Tiny &middot; Local</span>
        </div>

        <!-- Controls -->
        <div class="controls">
          <button
            (click)="ToggleRecording()"
            [class.recording]="IsRecording"
            class="mic-btn"
          >
            <span class="mic-icon">{{ IsRecording ? '&#x23F9;' : '&#x1F3A4;' }}</span>
            {{ IsRecording ? 'Stop Recording' : 'Start Recording' }}
          </button>

          <label class="file-upload">
            <input type="file" accept="audio/*" (change)="OnFileSelected($event)" hidden />
            &#x1F4C1; Upload Audio File
          </label>

          @if (Transcript) {
            <button (click)="audioService.ClearTranscript()" class="clear-btn">Clear</button>
          }
        </div>

        <!-- Recording indicator -->
        @if (IsRecording) {
          <div class="recording-indicator">
            <span class="pulse"></span>
            Recording... Transcribing every 3 seconds
          </div>
        }

        <!-- Transcription output -->
        <div class="transcript-area">
          <div class="transcript-label">Transcript</div>
          <div class="transcript-content" [class.empty]="!Transcript">
            {{ Transcript || 'Start recording or upload an audio file...' }}
            @if (IsTranscribing) {
              <span class="transcribing">&#x23F3; Transcribing...</span>
            }
          </div>
        </div>
      </div>
    }

    <!-- Init -->
    @if (!IsLoading && !IsReady) {
      <div class="init-prompt">
        <h2>Client-Side Speech Recognition</h2>
        <p>Transcribe audio entirely in your browser using OpenAI's Whisper model.</p>
        <button (click)="LoadModel()" class="load-btn">Load Whisper</button>
        @if (ErrorMessage) {
          <p class="error">{{ ErrorMessage }}</p>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; padding: 24px; font-family: system-ui, sans-serif; }

    .loading { text-align: center; padding: 60px 0; }
    .spinner {
      width: 40px; height: 40px; border: 3px solid #e0e0e0;
      border-top-color: #10b981; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-bar {
      max-width: 400px; margin: 12px auto; height: 6px;
      background: #e0e0e0; border-radius: 3px; overflow: hidden;
    }
    .progress-fill { height: 100%; background: #10b981; transition: width 0.3s; }

    .audio-container { max-width: 700px; margin: 0 auto; }
    .header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; }
    .header h2 { margin: 0; }
    .badge {
      font-size: 12px; color: #666; background: #f0f0f0;
      padding: 2px 8px; border-radius: 10px;
    }

    .controls { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .mic-btn, .file-upload, .clear-btn, .load-btn {
      padding: 10px 20px; border: none; border-radius: 8px;
      cursor: pointer; font-size: 14px; font-weight: 500;
    }
    .mic-btn { background: #10b981; color: white; }
    .mic-btn.recording { background: #ef4444; animation: pulse-bg 1.5s infinite; }
    @keyframes pulse-bg { 50% { opacity: 0.8; } }
    .file-upload {
      background: #f0f0f0; color: #333; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .clear-btn { background: #f0f0f0; color: #666; }
    .load-btn { background: #10b981; color: white; padding: 12px 32px; font-size: 16px; }

    .recording-indicator {
      display: flex; align-items: center; gap: 8px;
      color: #ef4444; font-size: 14px; margin-bottom: 16px;
    }
    .pulse {
      width: 10px; height: 10px; background: #ef4444; border-radius: 50%;
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    .transcript-area { border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
    .transcript-label {
      padding: 10px 16px; background: #f8f9fa;
      font-size: 13px; font-weight: 600; color: #666;
      border-bottom: 1px solid #e0e0e0;
    }
    .transcript-content {
      padding: 16px; min-height: 120px; line-height: 1.6;
      font-size: 15px; white-space: pre-wrap;
    }
    .transcript-content.empty { color: #aaa; font-style: italic; }
    .transcribing { color: #f59e0b; font-size: 13px; }

    .init-prompt { text-align: center; padding: 80px 20px; }
    .init-prompt p { color: #666; margin-bottom: 24px; }
    .error { color: #ef4444; margin-top: 16px; }
  `],
})
export class AudioComponent implements OnInit {
  protected readonly audioService = inject(AudioService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  IsLoading = false;
  IsReady = false;
  IsRecording = false;
  IsTranscribing = false;
  LoadProgress = 0;
  Transcript = '';
  ErrorMessage = '';

  ngOnInit(): void {
    this.audioService.IsLoading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsLoading = v));

    this.audioService.IsReady$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsReady = v));

    this.audioService.IsRecording$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsRecording = v));

    this.audioService.IsTranscribing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.IsTranscribing = v));

    this.audioService.LoadProgress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.LoadProgress = v));

    this.audioService.FullTranscript$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.Transcript = v));

    this.audioService.Error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((err) => (this.ErrorMessage = err));
  }

  LoadModel(): void {
    this.audioService.Initialize();
  }

  ToggleRecording(): void {
    if (this.IsRecording) {
      this.audioService.StopRecording();
    } else {
      this.audioService.StartRecording();
    }
  }

  OnFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.audioService.TranscribeFile(input.files[0]);
    }
  }
}
```

-----

## 6. Model Selection Guide {#models}

### Text Generation (Chat)

|Model           |ID                                             |Download|Quality |WebGPU      |Best For                         |
|----------------|-----------------------------------------------|--------|--------|------------|---------------------------------|
|**Phi-4 Mini**  |`onnx-community/Phi-4-mini-instruct-web-q4f16` |~2.2 GB |★★★★★   |**Required**|Best quality client-side chat    |
|Phi-3.5 Mini    |`onnx-community/Phi-3.5-mini-instruct-onnx-web`|~2.1 GB |★★★★    |Required    |Proven stable fallback           |
|SmolLM2 1.7B    |`HuggingFaceTB/SmolLM2-1.7B-Instruct`          |~900 MB |★★★     |Recommended |Sweet spot for quality + speed   |
|Qwen3 0.6B      |`onnx-community/Qwen3-0.6B-ONNX`               |~350 MB |★★★     |Recommended |Tiny, hybrid thinking mode       |
|Qwen2.5 0.5B    |`Mozilla/Qwen2.5-0.5B-Instruct`                |~300 MB |★★★     |No          |Multilingual, good reasoning/size|
|SmolLM2 360M    |`HuggingFaceTB/SmolLM2-360M-Instruct`          |~200 MB |★★      |No (Wasm OK)|Ultra-fast, low-end devices      |
|SmolLM2 135M    |`HuggingFaceTB/SmolLM2-135M-Instruct`          |~80 MB  |★       |No          |Ultra-fast simple completions    |

### Speech Recognition

|Model              |ID                                  |Download|Speed  |Quality|Notes                           |
|-------------------|------------------------------------|--------|-------|-------|--------------------------------|
|**Whisper Tiny EN**|`onnx-community/whisper-tiny.en`    |~40 MB  |Fastest|Good   |English only, best for real-time|
|Moonshine Tiny     |`onnx-community/moonshine-tiny-ONNX`|~30 MB  |Fastest|Good   |Optimized for live transcription|
|Whisper Base EN    |`onnx-community/whisper-base.en`    |~75 MB  |Fast   |Better |English only                    |
|Whisper Small EN   |`onnx-community/whisper-small.en`   |~250 MB |Medium |Great  |Best English quality for size   |
|Whisper Tiny       |`onnx-community/whisper-tiny`       |~40 MB  |Fastest|OK     |Multilingual                    |

### Embeddings (for semantic search, similarity)

|Model               |ID                        |Download|Dims|Notes                  |
|--------------------|--------------------------|--------|----|-----------------------|
|**all-MiniLM-L6-v2**|`Xenova/all-MiniLM-L6-v2` |~23 MB  |384 |Best general-purpose   |
|bge-small-en-v1.5   |`Xenova/bge-small-en-v1.5`|~33 MB  |384 |Slightly better quality|
|gte-small           |`Xenova/gte-small`        |~33 MB  |384 |Good alternative       |

### Upcoming: Phi-4 Multimodal

`microsoft/Phi-4-multimodal-instruct-onnx` (5.6B params) supports text + image + audio input via a Mixture-of-LoRAs architecture. Currently GPU-only (CUDA/DirectML), no browser variant exists yet ([request tracked](https://github.com/huggingface/transformers.js/issues/1214)). When browser support arrives, this could unify the chat and audio workers into a single multimodal pipeline.

-----

## 7. MemberJunction Integration {#mj-integration}

MemberJunction's AI architecture already supports Transformers.js for embeddings (`@memberjunction/ai-local-embeddings` using `@xenova/transformers`). Extending this to text-generation follows the same provider pattern.

### Architecture Fit

```
┌─────────────────────────────────────────────────────────────┐
│  MemberJunction AI Layer                                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ AIPromptRunner│  │  AI Agents   │  │  Angular Components│ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼──────────┐ │
│  │              ClassFactory / @RegisterClass                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │ │
│  │  │ OpenAILLM│ │ GroqLLM  │ │LMStudioLLM│ │TransformersLLM│ │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │ │
│  │       ↓            ↓            ↓              ↓        │ │
│  │   Cloud API    Cloud API    Local Server    Local ONNX  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The `TransformersLLM` driver registers via `@RegisterClass(BaseLLM, 'TransformersLLM')` and implements `BaseLLM`. The `AIPromptRunner` discovers it through the `DriverClass` field on the `AI Model Vendors` entity — no framework changes needed.

### Where It Lives

New provider package: `packages/AI/Providers/TransformersJS/`

```
packages/AI/Providers/TransformersJS/
├── src/
│   ├── models/
│   │   ├── transformers-llm.ts        # BaseLLM implementation
│   │   └── pipeline-cache.ts          # Shared pipeline caching
│   ├── __tests__/
│   │   └── transformers-llm.test.ts
│   └── index.ts
├── package.json
├── vitest.config.ts
└── tsconfig.json
```

### Provider Implementation Sketch

```typescript
// packages/AI/Providers/TransformersJS/src/models/transformers-llm.ts

import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ModelUsage,
         ChatMessageRole, ChatCompletionMessage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

// Dynamic ESM import type (same pattern as LocalEmbeddings)
interface TransformersModule {
  AutoTokenizer: typeof import('@huggingface/transformers').AutoTokenizer;
  AutoModelForCausalLM: typeof import('@huggingface/transformers').AutoModelForCausalLM;
  TextStreamer: typeof import('@huggingface/transformers').TextStreamer;
  InterruptableStoppingCriteria: typeof import('@huggingface/transformers').InterruptableStoppingCriteria;
  env: typeof import('@huggingface/transformers').env;
}

@RegisterClass(BaseLLM, 'TransformersLLM')
export class TransformersLLM extends BaseLLM {
  // Static pipeline cache — shared across instances, prevents duplicate loads
  private static TokenizerCache = new Map<string, PreTrainedTokenizer>();
  private static ModelCache = new Map<string, PreTrainedModel>();
  private static LoadingPromises = new Map<string, Promise<void>>();

  private _stoppingCriteria: InterruptableStoppingCriteria | null = null;

  constructor(apiKey?: string) {
    super(apiKey ?? 'local-transformers');
  }

  public override get SupportsStreaming(): boolean {
    return true;
  }

  protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
    const startTime = new Date();
    const { tokenizer, model } = await this.getOrLoadModel(params.model);

    const inputs = tokenizer.apply_chat_template(
      this.convertMessages(params.messages),
      { add_generation_prompt: true, return_dict: true }
    );

    const output = await model.generate({
      ...inputs,
      max_new_tokens: params.maxOutputTokens ?? 512,
      do_sample: (params.temperature ?? 0.7) > 0,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
    });

    const outputTokens = output.sequences;
    const inputLength = inputs.input_ids.dims?.[1] ?? 0;
    const outputIds = outputTokens.slice(null, [inputLength, null]);
    const assistantReply = tokenizer.batch_decode(outputIds, {
      skip_special_tokens: true,
    })[0] ?? '';

    const endTime = new Date();
    const result = new ChatResult(true, startTime, endTime);
    result.data = {
      choices: [{
        message: { role: ChatMessageRole.assistant, content: assistantReply },
        finish_reason: 'stop',
        index: 0,
      }],
      usage: new ModelUsage(inputLength, outputTokens.dims?.[1] - inputLength),
    };
    result.statusText = 'OK';
    return result;
  }

  // Streaming methods follow the BaseLLM contract
  protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<string>> {
    // Implementation creates TextStreamer-based async generator
    // ...
  }

  protected processStreamingChunk(chunk: string): {
    content: string;
    finishReason?: string;
    usage?: ModelUsage | null;
  } {
    return { content: chunk };
  }

  protected finalizeStreamingResponse(
    accumulatedContent: string | null | undefined,
    _lastChunk: string | null | undefined,
    usage: ModelUsage | null | undefined
  ): ChatResult {
    const now = new Date();
    const result = new ChatResult(true, now, now);
    result.data = {
      choices: [{
        message: { role: ChatMessageRole.assistant, content: accumulatedContent ?? '' },
        finish_reason: 'stop',
        index: 0,
      }],
      usage: usage ?? new ModelUsage(0, 0),
    };
    result.statusText = 'success';
    return result;
  }

  public async ClassifyText(/* ... */): Promise<ClassifyResult> { /* ... */ }
  public async SummarizeText(/* ... */): Promise<SummarizeResult> { /* ... */ }

  /** Load Transformers.js via dynamic ESM import (same pattern as LocalEmbeddings). */
  private async loadTransformersModule(): Promise<TransformersModule> {
    return await (eval('import("@huggingface/transformers")') as Promise<TransformersModule>);
  }

  private convertMessages(
    messages: ChatCompletionMessage[]
  ): Array<{ role: string; content: string }> {
    return messages.map((m) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.map((block) => block.content).join('\n')
        : m.content,
    }));
  }

  // Pipeline caching follows the same pattern as LocalEmbeddings
  private async getOrLoadModel(modelId: string): Promise<{
    tokenizer: PreTrainedTokenizer;
    model: PreTrainedModel;
  }> {
    // Check cache, deduplicate concurrent loads, retry with backoff
    // ... (follows LocalEmbeddings.getPipeline() pattern)
  }
}
```

### Metadata Registration

Create the vendor and model entries so AIPromptRunner can discover the driver:

```json
// metadata/ai-vendors/.transformers-js-vendor.json
{
  "entity": "MJ: AI Vendors",
  "fields": {
    "Name": "Transformers.js",
    "Description": "Local inference via Hugging Face Transformers.js (ONNX Runtime Web)"
  }
}
```

```json
// metadata/ai-models/.phi-4-mini-local.json
{
  "entity": "AI Models",
  "fields": {
    "Name": "Phi-4 Mini (Local)",
    "Description": "Microsoft Phi-4 Mini 3.8B running locally via Transformers.js",
    "AIModelTypeID": "@lookup:MJ: AI Model Types.Name=LLM",
    "PowerRank": 8,
    "SpeedRank": 5,
    "CostRank": 0,
    "IsActive": true
  },
  "relatedEntities": {
    "MJ: AI Model Vendors": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=Transformers.js",
          "DriverClass": "TransformersLLM",
          "APIName": "onnx-community/Phi-4-mini-instruct-web-q4f16",
          "MaxInputTokens": 8192,
          "MaxOutputTokens": 2048,
          "SupportedResponseFormats": "Any, JSON, Markdown",
          "SupportsStreaming": true,
          "SupportsEffortLevel": false,
          "Priority": 10,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider"
        }
      }
    ]
  }
}
```

### Cross-Environment Support

The same `TransformersLLM` driver works in both environments:

| Environment | Device | Use Case |
|---|---|---|
| **Node.js (MJAPI)** | CPU/Wasm | Server-side local inference, no API keys needed |
| **Browser (Angular)** | WebGPU/Wasm | Client-side inference via Web Workers |

For browser usage, the Angular components from sections 4-5 handle the worker isolation. For server-side, the `TransformersLLM` driver runs directly in the Node.js process (just like `LocalEmbeddings` does today).

### Relationship to Existing LocalEmbeddings

The existing `@memberjunction/ai-local-embeddings` package uses `@xenova/transformers` v2. The new `TransformersJS` provider should:

1. Use `@huggingface/transformers` v3 (the renamed, actively maintained package)
2. Optionally consolidate embeddings support alongside text-generation
3. Share pipeline caching infrastructure

-----

## 8. Production Considerations {#production}

### Caching Strategy

Transformers.js automatically caches models in the browser using the Cache API. First load downloads from Hugging Face CDN; subsequent loads are instant. You can also host models yourself:

```typescript
import { env } from '@huggingface/transformers';

// Point to your own CDN for model hosting
env.remoteHost = 'https://your-cdn.com/models/';

// Or use local models bundled with your app
env.localModelPath = '/assets/models/';
env.allowRemoteModels = false;
```

### Memory Management

- Monitor `performance.memory` (Chrome only) to avoid OOM
- Unload models when not needed: call `.dispose()` on model and tokenizer
- For mobile, prefer sub-500 MB models (SmolLM2-360M, Whisper Tiny)
- Set `env.backends.onnx.wasm.numThreads` to control CPU thread usage

### Cross-Platform Matrix

|Platform       |WebGPU   |Wasm|Recommended Model          |
|---------------|---------|----|---------------------------|
|Chrome Desktop |Yes      |Yes |Phi-4 Mini q4f16           |
|Edge Desktop   |Yes      |Yes |Phi-4 Mini q4f16           |
|Firefox Desktop|Flag only|Yes |SmolLM2-1.7B q4 (Wasm)    |
|Safari 18.2+   |Partial  |Yes |SmolLM2-360M q4 (Wasm)    |
|Chrome Android |Limited  |Yes |SmolLM2-360M q4            |
|iOS Safari     |No       |Yes |SmolLM2-135M (conservative)|
|Electron       |Yes      |Yes |Phi-4 Mini q4f16           |
|Node.js (MJAPI)|No       |Yes |Phi-4 Mini q4 (Wasm)      |

### Bundle Size Impact

Transformers.js v3 core is ~150 KB gzipped. The ONNX Runtime Wasm backend adds ~5 MB of `.wasm` files (loaded asynchronously, not in your main bundle). WebGPU backend is smaller. Models are downloaded separately and cached — they don't inflate your app bundle.

-----

## Quick Start Checklist

1. `npm install @huggingface/transformers@3.8.1`
2. Create typed message protocol (`ai-messages.ts`)
3. Create model registry with pluggable model definitions
4. Create Web Worker for each AI task using `AutoTokenizer` + `AutoModelForCausalLM` + `TextStreamer`
5. Create Angular service as bridge (`postMessage` to Observable streams)
6. Components subscribe to service observables using `takeUntilDestroyed`
7. Auto-detect WebGPU and fall back to Wasm
8. Show loading progress (model downloads can be large)
9. Test on target devices — mobile needs smaller models
10. For MJ integration: create `TransformersLLM` provider extending `BaseLLM`

-----

## Key Technical References

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [Transformers.js TextStreamer API](https://huggingface.co/docs/transformers.js/en/api/generation/streamers)
- [Phi-4 Mini ONNX Web Model](https://huggingface.co/onnx-community/Phi-4-mini-instruct-web-q4f16)
- [Phi-4 Multimodal ONNX](https://huggingface.co/microsoft/Phi-4-multimodal-instruct-onnx)
- [Official WebGPU Chat Examples](https://github.com/huggingface/transformers.js-examples)
- [ONNX External Data Fix (Issue #1460)](https://github.com/huggingface/transformers.js/issues/1460)
- [MJ LocalEmbeddings Provider](../packages/AI/Providers/LocalEmbeddings/) — existing Transformers.js integration pattern

*Generated February 2026 — Transformers.js v3.8.1 stable, v4 in preview*
