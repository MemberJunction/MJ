---
"@memberjunction/ai": minor
"@memberjunction/ai-groq": minor
---

Speech-to-text: `GroqAudioGenerator`, and the model type it needed.

**`GroqAudioGenerator`** transcribes audio via Groq's Whisper models, and is the first `BaseAudioGenerator` subclass in MJ that actually implements `SpeechToText` — the OpenAI and ElevenLabs audio generators both throw for it, so the abstract method existed with no working implementation behind it. It uses the `groq-sdk` already depended on; no new dependencies.

Groq exposes no text-to-speech API, so `CreateSpeech` throws and `GetSupportedMethods` reports only what works. Whisper on Groq cannot do speaker diarization at all — there is no parameter for it and nothing in the response to derive it from — so that is documented rather than approximated; speaker labels need AssemblyAI or Deepgram.

An empty transcript is reported as a **failure**, not a success with empty content: Whisper returns an empty string both for silence and for audio it could not decode, and a caller that stores the result would otherwise store nothing as if it were the transcript.

**`SpeechToTextParams`** gains four optional fields, all additive: `audioData` (a `Buffer`, avoiding the 33% memory cost of base 64 encoding an hour of audio into a string the implementation immediately decodes again), `fileName` (some providers infer the container format from the extension), `language` and `prompt`. `audioFile` is unchanged and still accepted.

**`AudioSplitter`** is a new port in `@memberjunction/ai`, for providers that cap upload size. Groq rejects requests over 25MB; assign an `AudioSplitter` to `GroqAudioGenerator.Splitter` and longer audio is split, transcribed piece by piece **sequentially** (Groq rate limits by audio-seconds per minute, so overlapping uploads buy 429s) and joined. Without one, oversized audio fails with a message naming the option rather than silently transcribing a truncated prefix.

The splitter is injected rather than bundled on purpose: splitting audio without re-encoding it means an ffmpeg binary, and a ~70MB platform-specific binary is not a dependency an AI provider package should force on every consumer, most of which transcribe short clips.

**New `Speech to Text` AI model type**, with `Whisper Large v3` and `Whisper Large v3 Turbo` on Groq. The model-type catalog covered LLM, Embeddings, Image Generator, Video, Reranker, TTS and Realtime — nothing described audio to text, so a transcription model could only be filed under TTS, which inverts its modalities. MJ's own catalog had already flagged this: the notes on GPT-Realtime-2 record that GPT-Realtime-Whisper is "flagged for human review pending Per-Minute PriceUnitType + Speech-to-Text AIModelType additions to MJ schema". This is the second half of that note; the per-minute price unit is not addressed here, which is also why no cost rows are seeded — Groq bills Whisper by audio-hour, and a per-token cost row would be wrong where a missing one is merely absent.

68 tests across the Groq package, 37 of them new.
