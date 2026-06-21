---
"@memberjunction/integration-connectors": minor
---

Make `mj sync push` idempotent for six connectors (SharePoint, Neon CRM, Fonteva, MemberSuite, PheedLoop, Rhythm) by filling their null `BatchMaxRequestCount` / `BatchRequestWaitTime`.

Those columns are NOT NULL but carry a default. `BaseEntity.Validate()` (the client-side check `mj sync push` runs before saving) permits a null on a **new** record — the column default applies — but rejects it on an **existing** record, because a prior non-null value is present (`<field> cannot be null`). So a fresh-DB create silently absorbs the null while any re-push that *updates* an existing connector row fails — i.e. the push is not idempotent for these files.

This surfaced after PR #2916 added SharePoint's baseline `primaryKey`, which flips SharePoint's push from insert to update and tripped the latent null on the very next deploy. Set the unspecified fields to the `-1` "no-batching" sentinel already used by NetForum/Path LMS/PropFuel; SharePoint keeps its baked `BatchRequestWaitTime=250` so its update is a no-op. `NavigationBaseURL` nulls elsewhere (iMIS/NetForum/Nimble) are unaffected — that column is nullable. An audit of all NOT-NULL-with-default columns across every connector confirms these batch fields were the only such nulls.
