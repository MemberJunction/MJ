---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

Pair user speech onset (`input_audio_buffer.speech_started`) with the completed user transcript (`conversation.item.input_audio_transcription.completed`) by the OpenAI-protocol `item_id` so late user transcripts keep their own utterance start offset in recorded calls. The xAI client also stops flagging the next item's first user transcript as `ReplacesPrevious` when an earlier item's transcript arrived late, so it no longer overwrites the earlier turn.
