---
"@memberjunction/core": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/integration-test-suite": patch
---

Fix Embedded Record save-graph follow-ups from the #3874 review. SkipRelatedCollections persists embeds while leaving collections to the caller (the booking path no longer needs a persist-outside-graph workaround). Result serialize ships a clean saved peer so the browser does not re-INSERT it. Two embeds targeting the same entity no longer throw a false cycle. Ensure calls NewRecord, Load resets a leftover cleared peer, and NewRecord does not clobber a caller-supplied FK. IT85 mutation config is under config so EE1–EE5 actually run; EE5 now fails validation with a too-long Name.
