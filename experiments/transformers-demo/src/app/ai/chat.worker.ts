/// <reference lib="webworker" />

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
