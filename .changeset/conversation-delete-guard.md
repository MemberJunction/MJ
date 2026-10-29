---
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-conversations": patch
---

Only a conversation's owner, a user with an Owner-level grant, or a user in the Developer or Integration role can delete a conversation. The server refuses everyone else (`MJConversationEntityServer.Delete`), `ConversationEngine` refuses before removing the conversation from the list and reports refused conversations by name, and the conversation list disables Delete with the reason. Previously any user who could load a conversation could delete it for everyone.
