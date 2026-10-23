---
"@memberjunction/ai-prompts": patch
---

`Default` model selection now honours `AIPromptModel.VendorID` (#5523). A prompt-model row that names a vendor yields a candidate for that vendor only, as `Specific` selection already did. Before, the row was expanded to every keyed vendor of its model and scored with that vendor's `AIModelVendor.Priority`, so a vendor the prompt never lists could outrank the prompt's own first choice. For example, GPT-OSS-120B on Fireworks.ai (vendor priority 150) beat Gemini on Google in Query Builder. A row with no `VendorID` still offers every active vendor of its model, ranked by vendor priority.
