---
"@memberjunction/ai-gemini": minor
---

The AI model catalog learns Google's current image models, and the Gemini image generator defaults to the Stable Nano Banana Pro ID.

- **Three new `MJ: AI Models` rows (Image Generator, vendor Google, driver `GeminiImageGenerator`)** with their inference-vendor and cost rows: **Nano Banana 2** (`gemini-3.1-flash-image`, 2026-02-26; $0.067 per 1K image), **Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`, 2026-06-30; $0.0336 per 1K image) and **Nano Banana 2.1** (`gemini-nano-banana-2.1`, 2026-10-06, Stable; $0.0336 per 1K image). Prices from Google's pricing page as of 2026-10-13, per-resolution tiers in each cost row's Comments.
- **Nano Banana Pro** gets its Stable endpoint: its existing Google inference-vendor row is updated in place to `gemini-3-pro-image` with `Status: Active` (a model holds one inference row per vendor, so the `-preview` ID lives on only in the driver's `GetModels()` list), a current cost row ($0.134 per 1K/2K image, $0.24 at 4K), the model re-activated, and its description no longer claims the preview endpoint shut down on 2026-06-25 — Google lists `gemini-3-pro-image` as Stable and the preview ID still answers.
- **`GeminiImageGenerator`** defaults to `gemini-3-pro-image` when no model is pinned (callers on the catalog pin one and never see the default) and `GetModels()` lists all five IDs with their sizes and editing support.

New records carry CLI-generated UUIDs and no `sync` blocks (the release-time push writes them); no Metadata_Sync migration is authored, per the metadata rules.
