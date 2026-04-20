# Transformers.js AI Demo

**Experimental prototype** for testing client-side AI inference using Transformers.js with Angular.

## 🎯 Purpose

This standalone Angular app demonstrates running AI models entirely in the browser using Hugging Face Transformers.js. Based on [PR #1970](https://github.com/MemberJunction/MJ/pull/1970), this prototype validates the architecture before integrating into MemberJunction.

## 🚀 Quick Start

```bash
# From the experiments/transformers-demo directory
npm install   # Already done if you see this
npm start     # Start dev server on http://localhost:4200
```

Navigate to `http://localhost:4200` and choose your experience:
- **💬 Text Chat** - Interactive text conversation with LLMs
- **🎤 Audio Chat** - Full voice-to-voice AI assistant (STT → LLM → TTS)

## 🧪 What It Does

### Text Chat Mode
- **Chat with Phi-4 Mini** (3.8B params) or smaller models running in your browser
- **Token streaming** - see responses generate in real-time
- **WebGPU acceleration** (3-10x faster than Wasm) when available
- **Automatic fallback** to Wasm if WebGPU unavailable

### Audio Chat Mode (NEW)
- **Speech-to-Text** - Whisper models transcribe your voice
- **Language Model** - Same LLMs as text chat generate responses
- **Text-to-Speech** - SpeechT5 converts responses back to audio
- **Full offline** - Complete voice assistant running locally
- **Privacy-first** - no data ever leaves your device

## 🏗️ Architecture

### Text Chat
```
┌─────────────────────────────────────┐
│  Angular App (Main Thread)          │
│  ┌──────────────┐                   │
│  │ ChatComponent │                  │
│  └──────┬───────┘                   │
│         │                            │
│  ┌──────▼────────┐                  │
│  │  ChatService  │ (Observable API) │
│  └──────┬────────┘                  │
└─────────┼─────────────────────────────┘
          │ postMessage
┌─────────▼─────────────────────────────┐
│  Chat Worker (Web Worker)             │
│  - AutoTokenizer                      │
│  - AutoModelForCausalLM               │
│  - TextStreamer (token-by-token)      │
│  - WebGPU/Wasm inference              │
└───────────────────────────────────────┘
```

### Audio Chat (NEW)
```
┌─────────────────────────────────────────┐
│  Angular App (Main Thread)              │
│  ┌────────────────────┐                 │
│  │ AudioChatComponent │                 │
│  │ - MediaRecorder    │                 │
│  │ - Audio Playback   │                 │
│  └─────────┬──────────┘                 │
│            │                             │
│  ┌─────────▼──────────┐                 │
│  │   AudioService     │ (Observable API)│
│  └─────────┬──────────┘                 │
└────────────┼──────────────────────────────┘
             │ postMessage (audio Blob)
┌────────────▼──────────────────────────────┐
│  Audio Worker (Web Worker)                │
│  ┌────────────────────────────┐           │
│  │ STT (Whisper)              │           │
│  │ - AutoProcessor            │           │
│  │ - AutoModelForSpeechSeq2Seq│           │
│  └────────────┬───────────────┘           │
│               ▼                            │
│  ┌────────────────────────────┐           │
│  │ LLM (SmolLM2/Phi)          │           │
│  │ - AutoTokenizer            │           │
│  │ - AutoModelForCausalLM     │           │
│  └────────────┬───────────────┘           │
│               ▼                            │
│  ┌────────────────────────────┐           │
│  │ TTS (SpeechT5)             │           │
│  │ - Text to WAV conversion   │           │
│  └────────────────────────────┘           │
└───────────────────────────────────────────┘
```

## 📦 Available Models

### Text Chat Models (LLM Only)

1. **Phi-4 Mini** (2.2 GB) - Best quality, requires WebGPU
2. **Phi-3.5 Mini** (2.1 GB) - Proven stable, requires WebGPU
3. **SmolLM2 1.7B** (900 MB) - Good balance, recommended for Wasm
4. **SmolLM2 360M** (200 MB) - Ultra-fast, works anywhere

### Audio Chat Models (Configurable Pipeline)

**Speech-to-Text (STT):**
- **Whisper Tiny** (75 MB) - Fast, good for testing
- **Whisper Base** (140 MB) - Better accuracy
- **Whisper Small** (500 MB) - Best accuracy, requires WebGPU

**Language Models (same as text chat):**
- SmolLM2 360M, SmolLM2 1.7B, Phi-3.5 Mini, Phi-4 Mini

**Text-to-Speech (TTS):**
- **SpeechT5** (120 MB) - Natural-sounding speech synthesis

**Recommended Combinations:**
- **Fast/Testing**: Whisper Tiny + SmolLM2-360M + SpeechT5 (~395 MB)
- **Balanced**: Whisper Base + SmolLM2-1.7B + SpeechT5 (~1160 MB)
- **Best Quality**: Whisper Small + Phi-4 Mini + SpeechT5 (~2820 MB)

## 🔍 Testing Focus

### Text Chat Testing

1. **Model Loading** - First load downloads model, subsequent loads are instant (Cache API)
2. **WebGPU Detection** - Check console for device selection (webgpu vs wasm)
3. **Streaming Performance** - Measure tokens/second during generation
4. **Browser Compatibility** - Test in Chrome (best), Firefox, Safari, Edge
5. **Memory Usage** - Monitor browser memory, especially with larger models
6. **Error Handling** - Try interrupting generation, switching models

### Audio Chat Testing (NEW)

1. **Model Selection** - Configure STT, LLM, TTS models before starting
2. **Microphone Access** - Grant permission when prompted
3. **Recording** - Speak clearly, keep messages under 30 seconds
4. **Pipeline Stages** - Observe: Transcription → LLM Generation → TTS Synthesis
5. **Audio Playback** - Verify synthesized responses play correctly
6. **Turn History** - Check completed turns appear with replay controls
7. **Error Recovery** - Test denying microphone, recording too short/long

### Performance Expectations

**Text Chat:**

| Device | Model | Backend | Speed |
|--------|-------|---------|-------|
| M1 Mac + Chrome | Phi-4 Mini | WebGPU | ~30-50 tok/s |
| M1 Mac + Chrome | SmolLM2-360M | WebGPU | ~100+ tok/s |
| Intel + Chrome | Phi-4 Mini | WebGPU | ~15-25 tok/s |
| Any + Wasm | SmolLM2-360M | Wasm | ~5-10 tok/s |

**Audio Chat:**

| Stage | Model | Time (typical) |
|-------|-------|----------------|
| STT | Whisper Tiny | 3-5 seconds |
| STT | Whisper Base | 5-10 seconds |
| LLM | SmolLM2-360M | 2-5 seconds (response) |
| LLM | Phi-4 Mini | 5-10 seconds (response) |
| TTS | SpeechT5 | 1-2 seconds |

**Total latency** (recording stop → audio playback): ~10-25 seconds depending on model combination.

## 📝 Implementation Notes

### Key Files

**Shared/Navigation:**
- `src/app/app.routes.ts` - Lazy-loaded routing
- `src/app/home/home.component.ts` - Home page with mode selection

**Text Chat:**
- `src/app/ai/ai-messages.ts` - Typed message protocol
- `src/app/ai/model-registry.ts` - LLM model definitions
- `src/app/ai/chat.worker.ts` - Web Worker (LLM inference)
- `src/app/ai/chat.service.ts` - Angular service (worker bridge)
- `src/app/chat/chat.component.ts` - Text chat UI

**Audio Chat (NEW):**
- `src/app/ai/audio-messages.ts` - Audio pipeline message protocol
- `src/app/ai/audio-model-registry.ts` - STT/LLM/TTS model definitions
- `src/app/ai/audio.worker.ts` - Web Worker (STT → LLM → TTS pipeline)
- `src/app/ai/audio.service.ts` - Angular service (audio worker bridge)
- `src/app/audio-chat/audio-chat.component.ts` - Voice chat UI
- `src/app/audio-chat/model-config/model-config.component.ts` - Model selection

### Modern Angular Patterns

- ✅ Standalone components (no NgModule)
- ✅ Lazy-loaded routes for code splitting
- ✅ `@if`/`@for` control flow syntax
- ✅ `inject()` function instead of constructor DI
- ✅ `takeUntilDestroyed` for subscription cleanup
- ✅ `DestroyRef` for lifecycle management

### Transformers.js Patterns

- Uses **low-level APIs** (`AutoTokenizer` + `AutoModelForCausalLM` + `TextStreamer`) for proper streaming
- **Audio models**: `AutoProcessor` + `AutoModelForSpeechSeq2Seq` (Whisper)
- **Batch processing**: Whisper requires exactly 30 seconds of audio (padded with silence if shorter)
- **NOT using** pipeline-level `callback_function` (doesn't provide token-by-token output)
- `env.allowLocalModels = false` ensures models fetch from Hugging Face Hub

### Web Audio API Integration

- **MediaRecorder** for microphone capture (16kHz mono, with noise suppression)
- **OfflineAudioContext** in worker for audio decoding
- **WAV format** for TTS output (universal browser support)
- **Blob URLs** for audio playback with automatic cleanup

## 🧩 Next Steps for MJ Integration

Once validated, this will be integrated into MJ as:

1. **New Provider Package**: `packages/AI/Providers/TransformersJS/`
2. **BaseLLM Implementation**: `TransformersLLM` extending `BaseLLM`
3. **Metadata Registration**: New vendor "Transformers.js" with model definitions
4. **Cross-Environment**: Works in both Node.js (MJAPI) and Browser (Angular)

## 🐛 Known Issues / Limitations

### General
- **First Load**: Models are large (200 MB - 2.8 GB for full audio pipeline), expect download time
- **WebGPU Support**: Limited on Firefox (requires flag), Safari (partial), mobile
- **Memory**: Large models may cause issues on low-RAM devices (recommend 8GB+ RAM)
- **Bundle Size**: ONNX Runtime Wasm adds ~5 MB (loaded async, not in main bundle)

### Audio Chat Specific
- **Whisper Constraints**: Processes in 30-second chunks (no true streaming transcription)
- **Recording Limits**: Keep messages under 30 seconds for best results
- **TTS Placeholder**: Currently uses simple beep placeholder (full SpeechT5 integration pending)
- **Microphone Access**: Requires browser permission and HTTPS (or localhost)
- **Latency**: Total pipeline takes 10-25 seconds depending on model selection
- **Browser Support**: Best in Chrome/Edge; Firefox and Safari may have audio API limitations

## 📚 Resources

- [PR #1970 - Full Implementation Guide](https://github.com/MemberJunction/MJ/pull/1970)
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [Phi-4 Mini Model Card](https://huggingface.co/onnx-community/Phi-4-mini-instruct-web-q4f16)

---

**Status**: 🧪 Experimental - Not part of main MJ build
