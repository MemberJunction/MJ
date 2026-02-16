/// <reference lib="webworker" />

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  AutoProcessor,
  AutoModelForSpeechSeq2Seq,
  TextStreamer,
  InterruptableStoppingCriteria,
  env,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers';
import type { AudioWorkerRequest, AudioWorkerResponse, AudioTurn } from './audio-messages';
import type { AudioModelConfig } from './audio-model-registry';

env.allowLocalModels = false;

// Model state
let sttProcessor: any = null;
let sttModel: any = null;
let llmTokenizer: PreTrainedTokenizer | null = null;
let llmModel: PreTrainedModel | null = null;
let ttsProcessor: any = null;
let ttsModel: any = null;
let speakerEmbeddings: Float32Array | null = null;
let stoppingCriteria: InterruptableStoppingCriteria | null = null;

let currentConfig: AudioModelConfig | null = null;
let currentTurn: {
  transcription: string;
  llmResponse: string;
  audioBlob: Blob | null;
} = {
  transcription: '',
  llmResponse: '',
  audioBlob: null,
};

function post(msg: AudioWorkerResponse): void {
  self.postMessage(msg);
}

// ── Model Loading ──────────────────────────────────────
async function loadModels(config: AudioModelConfig): Promise<void> {
  try {
    currentConfig = config;

    // Progress tracking helper
    const progressCallback = (stage: 'stt' | 'llm' | 'tts') => (progress: any) => {
      if (progress.status === 'progress' && progress.progress != null) {
        post({
          Type: 'progress',
          Stage: stage,
          Progress: progress.progress,
          File: progress.file,
        });
      }
    };

    // Load STT (Whisper)
    post({ Type: 'progress', Stage: 'stt', Progress: 0 });
    sttProcessor = await AutoProcessor.from_pretrained(config.STT.HuggingFaceId, {
      progress_callback: progressCallback('stt'),
    });
    sttModel = await AutoModelForSpeechSeq2Seq.from_pretrained(config.STT.HuggingFaceId, {
      dtype: config.STT.DType ?? 'fp32',
      device: 'auto',
      progress_callback: progressCallback('stt'),
    });

    // Load LLM (reuse chat model logic)
    post({ Type: 'progress', Stage: 'llm', Progress: 0 });
    llmTokenizer = await AutoTokenizer.from_pretrained(config.LLM.HuggingFaceId, {
      progress_callback: progressCallback('llm'),
    });
    llmModel = await AutoModelForCausalLM.from_pretrained(config.LLM.HuggingFaceId, {
      dtype: config.LLM.DType ?? 'q4',
      device: 'auto',
      progress_callback: progressCallback('llm'),
    });
    stoppingCriteria = new InterruptableStoppingCriteria();

    // Load TTS (SpeechT5) - using pipeline for simplicity
    post({ Type: 'progress', Stage: 'tts', Progress: 0 });

    // For SpeechT5, we need processor and model
    ttsProcessor = await AutoProcessor.from_pretrained(config.TTS.HuggingFaceId, {
      progress_callback: progressCallback('tts'),
    });

    // Note: SpeechT5 uses AutoModelForTextToWaveform but we'll use a simpler approach
    // Load speaker embeddings
    if (config.TTS.SpeakerEmbeddingUrl) {
      const response = await fetch(config.TTS.SpeakerEmbeddingUrl);
      const buffer = await response.arrayBuffer();
      speakerEmbeddings = new Float32Array(buffer);
    }

    post({ Type: 'ready' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Model loading failed: ${message}`, Stage: 'init' });
  }
}

// ── STT Processing ─────────────────────────────────────
async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!sttProcessor || !sttModel) {
    throw new Error('STT model not loaded');
  }

  try {
    // Convert Blob to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Decode audio using Web Audio API (available in worker context with proper types)
    // For workers, we need to use OfflineAudioContext
    const audioContext = new OfflineAudioContext(1, 16000 * 30, 16000);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Extract mono channel as Float32Array
    let audioData = audioBuffer.getChannelData(0);

    // Whisper expects exactly 30 seconds of audio at 16kHz
    const targetSamples = 16000 * 30; // 480,000 samples
    const currentSamples = audioData.length;

    if (currentSamples < targetSamples) {
      // Pad with silence
      const paddedData = new Float32Array(targetSamples);
      paddedData.set(audioData);
      audioData = paddedData;
    } else if (currentSamples > targetSamples) {
      // Truncate to 30 seconds
      audioData = audioData.slice(0, targetSamples);
    }

    // Process with Whisper
    const inputs = await sttProcessor(audioData);
    const output = await sttModel.generate({
      ...inputs,
      max_new_tokens: 128,
      language: 'english',
      task: 'transcribe',
    });

    const transcription = sttProcessor.batch_decode(output, {
      skip_special_tokens: true,
    })[0];

    return transcription.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Transcription failed: ${message}`);
  }
}

// ── LLM Generation ─────────────────────────────────────
async function generateLLMResponse(userMessage: string): Promise<string> {
  if (!llmTokenizer || !llmModel || !stoppingCriteria) {
    throw new Error('LLM not loaded');
  }

  try {
    stoppingCriteria.reset();

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful voice assistant. Keep responses concise and conversational, under 3 sentences when possible.'
      },
      { role: 'user', content: userMessage },
    ];

    const inputs = llmTokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    });

    let responseText = '';
    const textCallback = (text: string): void => {
      responseText += text;
      post({ Type: 'llm-token', Token: text });
    };

    const streamer = new TextStreamer(llmTokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: textCallback,
    });

    await llmModel.generate({
      ...inputs,
      max_new_tokens: 256,
      do_sample: true,
      temperature: 0.7,
      streamer,
      stopping_criteria: stoppingCriteria,
    });

    return responseText.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM generation failed: ${message}`);
  }
}

// ── TTS Synthesis ──────────────────────────────────────
async function synthesizeSpeech(text: string): Promise<Blob> {
  // For now, create a placeholder WAV with silence
  // Full SpeechT5 integration would require more complex setup

  // Truncate text if too long (TTS works best with shorter text)
  const maxChars = 500;
  let synthesisText = text;
  if (text.length > maxChars) {
    const lastPeriod = text.substring(0, maxChars).lastIndexOf('.');
    synthesisText = lastPeriod > 0 ? text.substring(0, lastPeriod + 1) : text.substring(0, maxChars);
  }

  try {
    // Create a simple beep as placeholder
    // In a full implementation, this would use SpeechT5 model
    const sampleRate = 16000;
    const duration = 1; // 1 second beep
    const numSamples = sampleRate * duration;
    const audioData = new Float32Array(numSamples);

    // Generate a 440Hz beep (placeholder for actual TTS)
    const frequency = 440;
    for (let i = 0; i < numSamples; i++) {
      audioData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
    }

    const wavBlob = createWavBlob(audioData, sampleRate);
    return wavBlob;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`TTS synthesis failed: ${message}`);
  }
}

function createWavBlob(audioData: Float32Array, sampleRate: number): Blob {
  // WAV header creation
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 to Int16 PCM
  const offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset + i * 2, sample * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ── Full Pipeline ──────────────────────────────────────
async function processAudioTurn(audioBlob: Blob): Promise<void> {
  try {
    currentTurn = { transcription: '', llmResponse: '', audioBlob: null };

    // Step 1: Transcribe
    const transcription = await transcribeAudio(audioBlob);
    currentTurn.transcription = transcription;
    post({ Type: 'transcription', Text: transcription });

    // Step 2: Generate LLM response
    const llmResponse = await generateLLMResponse(transcription);
    currentTurn.llmResponse = llmResponse;

    // Step 3: Synthesize speech
    const responseAudioBlob = await synthesizeSpeech(llmResponse);
    currentTurn.audioBlob = responseAudioBlob;
    post({ Type: 'audio-ready', AudioBlob: responseAudioBlob });

    // Complete
    post({
      Type: 'turn-complete',
      Turn: {
        Transcription: currentTurn.transcription,
        LLMResponse: currentTurn.llmResponse,
        AudioBlob: currentTurn.audioBlob!,
        Timestamp: new Date(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ Type: 'error', Message: `Pipeline failed: ${message}`, Stage: 'stt' });
  }
}

// ── Message Handler ────────────────────────────────────
self.onmessage = async (event: MessageEvent<AudioWorkerRequest>): Promise<void> => {
  const msg = event.data;

  switch (msg.Type) {
    case 'audio:load':
      await loadModels(msg.Config);
      break;
    case 'audio:process':
      await processAudioTurn(msg.AudioBlob);
      break;
    case 'audio:abort':
      stoppingCriteria?.interrupt();
      break;
  }
};
