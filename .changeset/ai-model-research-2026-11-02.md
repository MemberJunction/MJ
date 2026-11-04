---
"@memberjunction/core": minor
---

AI model research, 2026-11-02 — two changes to `metadata/ai-models/.ai-models.json`.

**Gemini 4 Argon's scheduled price step-up is now encoded.** The Google and Vertex AI introductory rows ($2.00/$10.00, $0.10 cached) keep `Status: "Active"` and gain `EndedAt: 2026-12-01`, and two new `Active` rows start at `2026-12-01` with $4.00/$20.00 and $0.20 cached. `BaseAIEngine.GetModelCost` selects on `Status='Active'` plus the `StartedAt`/`EndedAt` window, so the cutover happens on its own with no further edit and no gap in coverage. Confirmed against the Gemini Developer API pricing page; the Vertex AI figure is mirrored at the parity MJ has carried on this pair since launch.

**Qwen 3.8 27B added**, with an Alibaba Cloud Model Developer row and a Groq Inference Provider row (`qwen/qwen3.8-27b`, 131,072 / 16,384 tokens) seeded at `Status: "Preview"` so it is never selected automatically. Groq's deprecations page names it as the replacement for `qwen/qwen3.6-27b`, a route MJ carries that shut down 2026-09-14. No cost row is seeded: the reported $0.80/$4.00 rate is third-party only and Groq's pricing page was unreachable.

No deprecation recipe was applied and nothing was deleted. The week's other findings — Gemini 4 Carbon (no published API id), Nemotron 3.5 Transcribe (no registered speech-to-text driver), six Groq routes past shutdown, and a new 2027-02-26 OpenAI transcription retirement affecting `whisper-1` — are flagged for review in `reports/ai-model-research/2026-11-02-weekly-report.md`.
