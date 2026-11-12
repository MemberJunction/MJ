---
"@memberjunction/ai-prompts": patch
---

The native tool-calling decision and the sent-prefix fingerprint that the prompt runner records on a request or result are now kept in the Global Object Store, shared by every physical copy of this package in a process. A pnpm consumer can install more than one copy (one per peer-dependency variant), and since ClassFactory keeps the first registered copy of a class, the Loop agent type that reads the decision could come from a different copy than the runner that recorded it. The lookup then found nothing and native tool results silently stopped going back as tool turns: the model never saw its own calls, repeated them, and nothing was prompt-cached.
