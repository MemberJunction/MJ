---
'@memberjunction/core': minor
'@memberjunction/ai-engine-base': minor
---

The OpenAI embedding models (text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002) and mistral-embed now name their model on the Inference Provider row (`APIName`) (#5237). Before this, the OpenAI driver fell back to text-embedding-3-small for all three, so indexes built "with" ada-002 or 3-large hold 3-small vectors. **Re-vectorize any index built with text-embedding-ada-002 or text-embedding-3-large**; queries against an existing index now embed with the named model, and a vector-width mismatch fails with a clear error. A catalog test now requires an `APIName` on every active Inference Provider row, apart from three allowlisted media and realtime rows.
