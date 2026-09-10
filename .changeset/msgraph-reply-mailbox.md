---
"@memberjunction/communication-ms-graph": patch
---

MS Graph: Reply can resolve its mailbox from the request, not only from the credential.

Thirteen of fifteen operations pass a request-level candidate to `resolveMailbox`. Reply passed none,
so it could only resolve `accountEmail` on the credential — a property the `Azure Service Principal`
type declares nowhere, and whose environment source `disableEnvironmentFallback` removes. Reply was
therefore unreachable on exactly the stored credential the mailbox rework exists to support.

`ReplyToMessageParams` already carries `ContextData`, the same field eleven sibling operations read,
so Reply now reads it first and falls back to the credential default as everything else does.

Forward is untouched and still has the gap: `ForwardMessageParams` carries no `ContextData` and no
identifier, so it cannot name a mailbox without a change to that params type.
