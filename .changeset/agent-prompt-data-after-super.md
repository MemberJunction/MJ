---
"@memberjunction/ai-agents": minor
---

Template data an agent subclass adds to the prompt params after calling `super.preparePromptParams()` reaches the prompt again. Since the trailing runtime-state layout (6.2), `preparePromptParams` built the trailing `<mj-runtime-state>` message itself, and when the specialization was relocated it pre-rendered the child prompt there and cached the render for the prompt runner. Data a subclass added afterwards was never rendered, with no error. The trailing message is now built after the hook returns, from the final params, so the rendered text is the same when nothing changed and the cache layout is unaffected. A subclass's own changes to the outgoing messages are kept, with the trailing message still last.
