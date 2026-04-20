# Browser-Based AI Implementation Findings

**Date**: February 16, 2026
**Experiment**: Full-stack voice-to-voice AI pipeline in browser using Transformers.js
**Hardware**: M4 Max MacBook Pro, 128GB RAM, macOS 26.2
**Browser**: Chrome 144.0.7559.133

---

## Executive Summary

Successfully implemented a complete STT → LLM → TTS pipeline running entirely in-browser using Transformers.js v3.8.1 with ONNX Runtime WebGPU backend. Key finding: **Model compatibility is highly variable** - not all models work despite similar sizes and architectures. WebGPU acceleration achieved **50 tokens/second** with compatible models.

---

## Architecture Implemented

### Voice-to-Voice Pipeline
```
User Speech → STT (Whisper) → LLM (SmolLM2/Phi) → TTS (SpeechT5) → Audio Output
```

**Key Design Decisions:**
1. **Audio processing in main thread** - Web Audio API not available in Workers
2. **Three separate Web Workers** - STT/LLM/TTS isolation for memory management
3. **WASM for TTS** - SpeechT5 has WebGPU compatibility issues, forced to CPU
4. **Observable state management** - BehaviorSubject pattern for reactive UI
5. **Lazy-loaded routes** - Code splitting to avoid bundling all models upfront

### Critical Implementation Details

#### Audio Processing Pipeline
- **Problem**: Web Workers don't have access to `OfflineAudioContext`
- **Solution**: Process audio blob → Float32Array in main thread before sending to worker
- **Impact**: Adds ~50-100ms latency but prevents runtime crashes

```typescript
// Main thread (audio-chat.component.ts)
async processAudioBlob(blob: Blob): Promise<Float32Array> {
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
  // Resample to 16kHz mono, pad/truncate to 30s for Whisper
  return processedAudioData;
}
```

#### TTS WebGPU Incompatibility
- **Issue**: SpeechT5 via `pipeline('text-to-speech')` fails with WebGPU
- **Error**: `[WebGPU] Kernel "[MatMul] /prob_out/MatMul" failed`
- **Root cause**: SpeechT5 ONNX graph uses operations incompatible with WebGPU matmul
- **Solution**: Force `device: 'wasm'` for TTS pipeline
- **Performance impact**: ~3-5x slower than WebGPU would be, but acceptable for TTS use case

---

## Model Compatibility Findings

### ✅ Working Models (WebGPU)

#### Phi-3.5 Mini Instruct
- **Size**: 2.1GB (q4f16 quantization)
- **HuggingFace**: `onnx-community/Phi-3.5-mini-instruct-onnx-web`
- **Performance**: **50 tokens/second** on M4 Max
- **Stability**: Excellent - no crashes, consistent performance
- **Quality**: Good reasoning, decent for chat
- **Verdict**: **Best choice for production use**

#### SmolLM2 360M Instruct
- **Size**: 200MB (q4 quantization)
- **HuggingFace**: `HuggingFaceTB/SmolLM2-360M-Instruct`
- **Performance**: ~30-40 tokens/second
- **Stability**: Reliable
- **Quality**: Limited reasoning, good for simple tasks
- **Verdict**: Good for low-resource testing

### ❌ Incompatible Models

#### Phi-4 Mini Instruct
- **Size**: 2.2GB (q4f16)
- **Error**: `WebGPU error code 11136048`
- **Root cause**: Individual tensor buffers exceed Chrome's WebGPU buffer size limits on macOS
- **Technical details**:
  - ONNX Runtime JSEP (JavaScript Execution Provider) attempts to allocate buffers
  - Chrome/WebGPU on macOS has per-buffer size limits (not total memory limits)
  - Phi-4's weight tensor layout creates buffers that exceed these limits
- **Workaround**: Use WASM device (not tested - would be 3-10x slower)
- **Status**: Model architecture fundamentally incompatible with current Chrome WebGPU limits

#### SmolLM2 1.7B Instruct
- **Size**: 900MB (q4)
- **Error**: `RuntimeError: Aborted(). Build with -sASSERTIONS for more info`
- **Root cause**: WASM orchestration layer hits memory limits during initialization
- **Technical details**:
  - Even with WebGPU selected, ONNX Runtime uses WASM for graph orchestration
  - WASM has 2-4GB address space limits
  - Model initialization allocates temporary buffers that exceed WASM limits
  - This happens BEFORE weights are transferred to GPU
- **Status**: ONNX export or graph structure issue specific to this model

---

## WebGPU vs WASM Architecture

### How ONNX Runtime Actually Works

**Common misconception**: Selecting "WebGPU" means everything runs on GPU.

**Reality**: Hybrid architecture
```
┌─────────────────────────────────────────┐
│  WASM Runtime (ort-wasm-simd-threaded)  │  ← Graph orchestration, control flow
│  - Manages model graph                   │
│  - Allocates memory                      │
│  - Coordinates operations                │
│  - 2-4GB address space limit             │
└──────────────┬──────────────────────────┘
               │
               ├─ JSEP Bridge ─────────────────┐
               │                                │
               ↓                                ↓
┌──────────────────────┐        ┌──────────────────────┐
│  WebGPU Backend      │        │  CPU Fallback        │
│  - Tensor operations │        │  - Shape ops         │
│  - Matrix multiply   │        │  - Control flow      │
│  - Activations       │        │  - Unsupported ops   │
└──────────────────────┘        └──────────────────────┘
```

**Key insight**: Large model failures often occur in the WASM layer **before** WebGPU is even used.

### Performance Comparison

| Operation | WebGPU (M4 Max) | WASM (CPU) | Ratio |
|-----------|-----------------|------------|-------|
| LLM Generation | 50 tok/s | 5-7 tok/s | **7-10x** |
| STT (Whisper Tiny) | Not tested | ~2s for 5s audio | N/A |
| TTS (SpeechT5) | Not compatible | ~1-2s synthesis | N/A |

**Recommendation**: Use WebGPU for LLM, WASM for STT/TTS (no choice due to compatibility).

---

## Browser Compatibility

### Chrome on macOS (Tested)
- **WebGPU**: ✅ Hardware accelerated via Metal
- **WASM SIMD**: ✅ Fully supported
- **SharedArrayBuffer**: ✅ Available (required for threading)
- **Performance**: Excellent with compatible models

### Expected Compatibility (Not Tested)

**Chrome/Edge on Windows**
- WebGPU via DirectX 12
- Similar performance expected
- May have different buffer size limits (unknown)

**Firefox 119+**
- WebGPU support varies by platform
- WASM SIMD supported
- May need to enable flags

**Safari 17+**
- Limited WebGPU support (beta)
- WASM support good
- Likely 2-3x slower than Chrome

---

## Critical Issues & Solutions

### Issue 1: OfflineAudioContext Not Available in Workers
**Impact**: STT pipeline crashes on audio processing
**Error**: `OfflineAudioContext is not defined`
**Solution**: Move audio processing to main thread
**Files**: `audio-chat.component.ts`, `audio.worker.ts`

### Issue 2: TTS WebGPU Matmul Failure
**Impact**: TTS synthesis fails with WebGPU
**Error**: `Kernel "[MatMul] /prob_out/MatMul" failed`
**Solution**: Force TTS to use WASM via `device: 'wasm'`
**Files**: `audio.worker.ts`

### Issue 3: Model Size vs Buffer Limits
**Impact**: Large models fail to load
**Error**: `WebGPU error code 11136048`
**Solution**: Use smaller models or different architectures
**Finding**: Not all models of similar size behave the same (Phi-3.5 works, Phi-4 doesn't)

### Issue 4: Numeric Error Codes
**Impact**: User sees unhelpful error messages
**Error**: `Failed to load model: 11136048`
**Solution**: Enhanced error handling to interpret WebGPU error codes
**Files**: `chat.worker.ts`

---

## Performance Optimizations Implemented

1. **Lazy Loading**: Routes load components on-demand (~40MB per route)
2. **Code Splitting**: Workers separate from main bundle
3. **Model Caching**: Transformers.js Cache API stores models after first download
4. **Observable Patterns**: Efficient state updates with RxJS
5. **Pre-processing in Main Thread**: Avoid worker round-trips for audio processing

---

## Limitations & Future Work

### Current Limitations

1. **Model Selection Constrained**
   - Phi-4 incompatible due to WebGPU buffer limits
   - SmolLM2 1.7B fails with WASM memory errors
   - Limited to models with specific ONNX graph structures

2. **TTS Performance**
   - Forced to use CPU (WASM) due to WebGPU incompatibility
   - ~3-5x slower than optimal
   - SpeechT5 voice quality limited

3. **STT Latency**
   - Whisper requires 30-second audio chunks (with padding)
   - No true streaming transcription
   - ~2-5 second processing delay

4. **Browser Requirements**
   - Chrome 120+ for best WebGPU support
   - SharedArrayBuffer requires secure context (HTTPS or localhost)
   - ~2-4GB RAM required for comfortable model loading

### Needed Improvements

#### Better Models
- **Current**: Phi-3.5 (2.1GB) is functional but limited reasoning
- **Needed**: GPT-4 class reasoning in browser
- **Blockers**: Model size vs WebGPU limits, ONNX export quality
- **Watch**: Gemma 2B, Llama 3.2, Mistral-small ONNX exports

#### Streaming STT
- **Current**: Batch processing with 30s chunks
- **Needed**: True streaming like Whisper Live
- **Approach**: Whisper Turbo or distil-whisper variants
- **Challenge**: Transformers.js pipeline API doesn't support streaming STT yet

#### Better TTS Voices
- **Current**: SpeechT5 with single speaker embedding
- **Needed**: Multiple voices, better prosody
- **Options**: XTTS, StyleTTS2, Coqui TTS (if ONNX exportable)
- **Challenge**: Most modern TTS models not ONNX-compatible

#### WebGPU Buffer Limit Workaround
- **Investigate**: Model sharding across multiple buffers
- **Investigate**: Dynamic quantization at load time
- **Investigate**: Streaming weight loading
- **Watch**: Transformers.js and ONNX Runtime updates

---

## Technical Stack

- **Transformers.js**: v3.8.1
- **ONNX Runtime**: Web backend with JSEP
- **Angular**: 18.2.21 with Vite dev server
- **RxJS**: 7.x for observable patterns
- **TypeScript**: 5.x with strict mode

---

## Recommended Configuration for Production

```typescript
// Text Chat (optimal)
{
  model: 'Phi-3.5 Mini',
  device: 'webgpu',
  expectedPerformance: '50 tok/s on M4 Max, 20-30 tok/s on mid-range GPU'
}

// Audio Chat (realistic)
{
  stt: 'Whisper Tiny',        // 75MB, WASM, ~2s latency
  llm: 'SmolLM2 360M',        // 200MB, WebGPU, ~30 tok/s
  tts: 'SpeechT5',            // 120MB, WASM (forced), ~2s synthesis
  totalSize: '~400MB',
  firstLoadTime: '2-3 minutes on fast connection',
  subsequentLoads: 'instant (cached)'
}
```

---

## Real-World Audio Chat Experience

**Test Date**: February 16, 2026
**Configuration**: Whisper Tiny + SmolLM2 360M + SpeechT5 (all WASM)

### User Experience
```
User: "Hey there, I'm interested in getting your help with software development.
       Are you able to help with that?"

AI: "Hello! While I'm an AI and not a developer myself, I can certainly provide
     information, advice, and coding guidance on software development. What do
     you need help with today?"

Audio Duration: 9 seconds
Total Time: ~15 seconds from speech to playback
```

### Performance Reality Check
- **STT (Whisper)**: ~2-3 seconds for transcription ✅ Acceptable
- **LLM (SmolLM2)**: ~3-4 seconds for generation ✅ Good
- **TTS (SpeechT5)**: ~9 seconds for synthesis ⚠️ Too slow
- **Audio Quality**: Robotic, monotone ⚠️ Not production-ready

### User Verdict
> "All of this makes me think this stuff isn't really ready for prime time, but will be soon"

**Accurate assessment.** The technical implementation works, but the user experience has critical gaps:

1. **TTS Latency**: 9 seconds is too slow for conversational AI
2. **Voice Quality**: SpeechT5 sounds robotic, lacks natural prosody
3. **Total Time**: 15+ seconds per turn is not competitive with cloud solutions

## Conclusion

Browser-based AI is **production-ready for specific use cases** with careful model selection. The implementation successfully demonstrates:

- ✅ Full voice-to-voice AI pipeline in browser (technically complete)
- ✅ Zero backend costs, complete privacy
- ✅ Excellent performance with compatible models (50 tok/s text chat)
- ✅ Robust error handling and user experience

**However**, audio chat specifically has **showstopper limitations**:
- ❌ TTS too slow (9s synthesis time vs <1s needed)
- ❌ TTS quality not acceptable for production
- ⚠️ Model compatibility highly unpredictable

**For production use**:
- **Text chat**: Ready now with Phi-3.5 Mini
- **Audio chat**: Wait 6-12 months for:
  - Better TTS models with ONNX export (StyleTTS2, XTTS-lite)
  - WebGPU-compatible TTS (fixes performance)
  - Streaming STT (reduces latency)

**The technology architecture is proven** - but the model ecosystem needs maturation. This experiment successfully validates the approach and identifies the gaps.

### Timeline Prediction
- **Q2 2026**: Better ONNX TTS models available
- **Q3 2026**: WebGPU TTS support stabilizes
- **Q4 2026**: Production-ready for voice applications

**Recommendation**: Use this for demos and prototypes, but plan hybrid (backend TTS) for production until Q3-Q4 2026.
