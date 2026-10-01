---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
---

A grant an application writes as plumbing can save without telling the grantee it was "shared with" them.

`EntitySaveOptions.SkipShareNotification` is honored by every share entity's new-grant notice: Resource Permissions, and the Collection, Artifact, Dashboard and Access Control Rule grants through `DispatchShareNotificationAfterSave`, which now takes the save's options. An application that writes Resource Permissions to satisfy a write gate (one per conversation per seat, recreated on every reopen) no longer floods its users with "System shared Conversations with you" notices; it passes the option and sends its own one-per-event notice instead. Access requests and their approvals keep notifying.

The rule for whether a new approved share notifies is in one place, `ShareNotificationWanted`: not when the save said so, not without a grantor, not when the grantor and the grantee are the same person.
