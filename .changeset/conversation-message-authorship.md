---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Who a conversation message is from (A19, the rules for people's messages). On the server, for a `Role='User'`
message in `MJ: Conversation Details`, the conversation's owner and grantees alike post only as themselves: a new
message naming another person's `UserID` is refused, and a grantee's message with no `UserID` is saved with the
grantee's (an empty one reads as the owner). Only a message's author changes who wrote it and what it says (`UserID`,
`Message`, `ArtifactID`, `ArtifactVersionID`, `MediaType`, `ParentID`), no one changes its `Role`, and only its author
or the conversation's owner deletes it. The system user may write any message. A person who cannot read an existing
conversation (a row filter hides it) can no longer write to it; a conversation no one can find still defers to the
foreign key. GraphQL updates of `MJ: Conversation Details` now always load the stored row, so a client's `OldValues___`
cannot claim a message's author, role or rating. Agent replies keep today's rules until MJ's chat stops writing them
from the browser.
