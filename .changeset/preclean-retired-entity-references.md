---
"@memberjunction/core": patch
---

Add a data-only migration, versioned one minute before the legacy retirement migration, that clears every inbound foreign-key reference to the 11 retired Workflow, Report and Scheduled Action entities before `spDeleteEntityWithCoreDependencies` runs (MemberJunction/MJ#4483). On a database that has used Reports, rows such as `ResourceType.CategoryEntityID` still point at the retired entities through foreign keys the proc does not clear, and the upgrade stops there. Databases that have not reached the retirement migration run this first, in order; databases already past it ignore it. The changeset is `patch` on purpose: the 6.2 Edge seed already carries the stream's `minor`, and a `minor` here would version the 6.1 line to 6.2.0 when this is backported.
