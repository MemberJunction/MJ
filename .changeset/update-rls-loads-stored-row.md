---
"@memberjunction/server": patch
---

An update from a caller under an Update row filter (a role's Update RLS filter or an API-key row filter) now always loads the stored row instead of hydrating from the client's `OldValues___` (#4919). The save's post-image RLS check skips its query when no column the filter reads is dirty, and against client-supplied old values a caller could make a changed filter column look clean. Today the skip never applies to a real filter (the effective clause is wrapped in parentheses the skip logic doesn't parse), so this closes a latent bypass before the skip logic is improved. Entities that track record changes or use field-level security already loaded the stored row and are unaffected.
