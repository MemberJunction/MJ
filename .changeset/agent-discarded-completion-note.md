---
"@memberjunction/ai-agents": minor
---

The note that tells a model its refused completion's payload change was not applied is now right in two cases it got wrong. It is decided from the step the model sent, read before validation, so a subclass that turns a Chat step into a Success in place (to validate a reply as a completion) no longer has an already-applied change reported as discarded, which made the model send it again and duplicated array elements. On the envelope path the note now quotes the discarded change as JSON, since the envelope response is not kept in the history and the model could not otherwise see what it is asked to resend. The native note is unchanged: the `complete_task` call is in the history.
