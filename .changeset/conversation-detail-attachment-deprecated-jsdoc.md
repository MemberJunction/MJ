---
"@memberjunction/core-entities": patch
---

Add the missing `@deprecated` JSDoc tag to the generated `MJConversationDetailAttachmentEntity` class. This is a CodeGen catch from the attachment-unification work — the entity is deprecated in metadata but the generated class was not regenerated with the corresponding JSDoc. Comment-only change, no runtime impact.
