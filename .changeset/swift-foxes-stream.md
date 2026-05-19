---
"@memberjunction/ai-gemini": patch
---

Fix Gemini streaming: parse chunks using the new @google/genai shape (content.parts) instead of the legacy content[0].parts, and split thought parts from visible answer parts so reasoning summaries no longer leak into the user-visible stream.
