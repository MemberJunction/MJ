---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
---

`Project.OwnerUserID`: conversation folders can be personal. One additive, nullable column — NULL keeps a folder shared with the environment exactly as today; set, the folder belongs to that user and consumers filter it to its owner. Migration + CodeGen output, the ConversationEngine filter, and a visibility choice in the folder create dialog.
