---
"@memberjunction/ai-mistral": patch
---

Declare axios as a direct dependency. axios-retry peers on axios ("0.x || 1.x") and ai-mistral used it without declaring it, which fails strict peer resolution in consuming workspaces and is a phantom dependency under any non-hoisted layout.
