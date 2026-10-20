---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

Pair user speech onset (`input_audio_buffer.speech_started`) with the completed user transcript (`conversation.item.input_audio_transcription.completed`) by the OpenAI-protocol `item_id` so late user transcripts keep their own utterance start offset in recorded calls.
