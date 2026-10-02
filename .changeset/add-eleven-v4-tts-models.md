---
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/aiengine": minor
---

Adds ElevenLabs **Eleven v4** and **Eleven v4 Turbo** to the AI model catalog. Metadata only, no code change.

- New TTS models **Eleven v4** (`eleven_v4`) and **Eleven v4 Turbo** (`eleven_v4_turbo`), each with Eleven Labs as model developer and as inference provider through the existing `ElevenLabsAudioGenerator` driver. The driver hands `model_id` to the ElevenLabs API unchanged and the SDK types it as a plain string, so text-to-speech needs nothing else.
- No cost rows yet. ElevenLabs bills speech per character, and the catalog's price units (per token, minute, hour, image) have no per-character unit; the launch pricing also could not be confirmed against ElevenLabs' own pricing page.
- Not covered: the `ElevenLabsRealtime` (ElevenAgents) driver never sets a TTS model on its managed agent, so this change does not put v4 into realtime conversations. That needs a driver change.
