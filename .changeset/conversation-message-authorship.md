---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/integration-test-suite": patch
---

Who a conversation message is from (A19, the rules for people's messages). On the server, for a person's message
(`Role` `User`, compared trimmed and in any case) in `MJ: Conversation Details`, the conversation's owner and grantees
alike post only as themselves: a new message naming another person's `UserID` is refused, and a grantee's message with
no `UserID` is saved with the grantee's (an empty one reads as the owner). Only a message's author changes who wrote it
and what it says (`UserID`, `Message`, `ArtifactID`, `ArtifactVersionID`, `MediaType`, `ParentID`); no one changes a
message's role to or from `User` or moves a person's message to another conversation; only its author or the
conversation's owner deletes it. The system user may write any message. A person who cannot read an existing
conversation can no longer write to it. GraphQL updates of `MJ: Conversation Details` always load the stored row, so a
client's `OldValues___` cannot claim a message's author, role or rating. A conversation message whose values a
TransactionGroup `Use` variable fills in is refused for people, and `ExecuteTransactionGroup` now registers a group's
variables before any item is saved (an invalid `ItemIndex` fails before any write). The chat shows the edit pencil
only on the owner's own messages. Agent replies keep today's rules until MJ's chat stops writing them from the browser.
