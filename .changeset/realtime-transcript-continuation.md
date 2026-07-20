---
"@memberjunction/ai": minor
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
---

Stop a mid-sentence pause from splitting one spoken utterance into several transcript turns.

Providers that stream input transcription (Grok) re-emit the **full accumulated utterance** on every `input_audio_transcription.completed`, and their VAD fires `speech_started` on ordinary mid-sentence breaths. Treating each `speech_started` as a hard turn boundary therefore split one spoken thought into several persisted turns, each a longer copy of the last — observed live as three conversation rows for a single sentence:

```
"...including whiteboarding, uh, remote."
"...including whiteboarding, uh, remote, so just get going."
"...including whiteboarding, uh, remote, so just get going. Show me some cool stuff."
```

Adds `IsTranscriptContinuation` (new, dependency-free module in `@memberjunction/ai`): a caption that **extends** the utterance already in flight is now recognized as a continuation and flagged `ReplacesPrevious`, collapsing the stream into one in-place-updating turn. Crucially the comparison is **normalized** (lowercased, punctuation/whitespace collapsed) because ASR engines re-punctuate as a sentence grows — in the production case above the earlier text is *not* a literal prefix of the later one (`remote.` became `remote,`), so a naive prefix test missed roughly half the occurrences.

The continuation window closes when the model takes the floor (`response.created`), so two genuinely separate utterances that happen to share an opening can never be merged.

Applied identically in the shared server session (`OpenAIRealtimeSession`, inherited by Grok/HuggingFace) and the client-direct xAI driver, so both topologies collapse the stream the same way. A new `onResponseStarted()` hook on the shared client brain gives drivers a seam for per-user-turn state. No behavior change for single-completed providers such as OpenAI, which never produce a continuation to detect.
