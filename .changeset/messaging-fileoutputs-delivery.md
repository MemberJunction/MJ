---
"@memberjunction/messaging-adapters": patch
---

Deliver the run's `fileOutputs` as chat attachments

`collectInlineFileAttachments` depends on the model choosing to emit a `data:` URI on an actionable command — it does so only sometimes, so a generated document reached chat on one run and not the next. `fileOutputs` is the canonical source (it is what MJ turns into file artifacts) and carries the real filename and MIME type rather than leaving them to be guessed. Entries already saved to storage (`fileId`, no `fileData`) are skipped: those have a durable location and an artifact link.
