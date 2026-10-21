---
"@memberjunction/aiengine": patch
---

`AIEngine.EmbedText` and `AIEngine.EmbedContent` now resolve the embedding driver's API key with `GetAIAPIKey(model.DriverClass)` when the caller passes none, the same fallback `PrepareLLMInstance` already applies to chat models. Semantic `SearchEntity` embeds the query with the Entity Document's model and no key, so an index built with a keyed model (Gemini, OpenAI, ...) could be written but not queried, which broke Sage's Find Candidate Agents. A caller-supplied key still wins, and local drivers are unaffected.
