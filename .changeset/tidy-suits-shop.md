---
"@memberjunction/core": minor
---

Drop the SQL Server MS_Description extended property on ConversationDetailAttachment to the DEPRECATED notice text so R\_\_RefreshMetadata propagates it into Entity.Description on every migrate cycle — eliminating the drift that the metadata-sync file alone could not fix.
