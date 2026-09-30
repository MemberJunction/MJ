---
"@memberjunction/ai": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-groq": minor
"@memberjunction/ai-heygen": minor
---

Text-to-speech, speech-to-text and video now have runners, like chat, embeddings and images.

- **`AITextToSpeechRunner`** (`TTS` models), **`AISpeechToTextRunner`** (`Speech to Text` models) and **`AIVideoRunner`** (`Video` models) select a model from a carrier prompt's bindings, or a pinned `ModelID`, resolve its credential, fail over, and record every call as an AI Prompt Run. The run row never holds audio or video. Text-to-speech records the characters sent in the `Characters` measure unless the driver reports its own quantity; speech-to-text records the audio's seconds when the provider reports them; video records seconds only when a driver reports them, which HeyGen's does not. They share their lifecycle through a new `BaseMediaRunner`.
- New metadata: the `Default Text To Speech`, `Default Speech To Text` and `Default Video Generation` prompts, which the runners use when no prompt is named.
- **`BaseAudioGenerator` is split** into `BaseTextToSpeech` and `BaseSpeechToText`. `BaseAudioGenerator` is deprecated but keeps working: it implements both, and every driver still extends it and stays registered against it under the same key. `OpenAIAudioGenerator` also registers against both new classes, `ElevenLabsAudioGenerator` against `BaseTextToSpeech`, and `GroqAudioGenerator` against `BaseSpeechToText`. The split-and-join transcription loop is also exported as `TranscribeAudioWithSplitting`.
- `VideoResult` gains an optional `usage`, for a driver that reports the video's length.
- `SpeechResult` and `VideoResult` gain an optional `errorInfo`. The OpenAI, ElevenLabs, Groq and HeyGen audio and video drivers now fill it from the error their SDK threw, keeping its HTTP status, so a caller can tell a rejected request from an outage. The runners fail over on it: a 400 or 422 no longer fails over to every other candidate.
- `BaseModelRunner` gains `ResolveUsageToRecord` and `ApplyUsageToRunRecord`, which the image runner now uses too, so every non-chat runner records units the same way.

Nothing called the audio or video drivers before, so no existing caller changes behavior.
