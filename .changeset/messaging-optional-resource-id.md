---
"@memberjunction/messaging-adapters": patch
---

Guard deep-link building against an absent `resourceId`

`UICommand.resourceId` is optional now that a Record can be addressed by `keys`
instead, so the Dashboard/Report/View branches no longer assume it is present.
They fall through to "no deep link" the way the Record branch already does,
rather than emitting a `/resource/dashboard/undefined` URL.
