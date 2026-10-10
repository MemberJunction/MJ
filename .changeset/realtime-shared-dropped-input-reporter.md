---
"@memberjunction/ai-openai": patch
"@memberjunction/ai-gemini": patch
---

The server OpenAI Live driver logs the video frames it drops from `SendInput`, once per kind and type, through `RealtimeDroppedInputReporter`, as the other audio-only drivers do: `[OpenAILiveRealtime] Dropped video input of type image/jpeg: this session sends audio only.` It used to drop them without a line. The server Gemini Live driver reports its dropped input through the same class instead of its own copy. Its line keeps its wording, with three differences: an audio type in another letter case is no longer a second line (video types already compared that way), a blank type reads `(no type)`, and a video type is shown as the frame gave it rather than lowercased.
