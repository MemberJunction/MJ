---
"@memberjunction/credentials": patch
---

Fix a lost-update race in CredentialEngine: getCredential()'s fire-and-forget LastUsedAt touch performed a full-row entity save from a stale snapshot, silently reverting any updateCredential() that committed in between (both paths reported success). Every write that goes through CredentialEngine — updateCredential and both timestamp touches — now serializes through a per-credential promise chain, so each save writes a current snapshot; writes remain ordinary entity saves and getCredential latency is unchanged. Two limits worth knowing: code that loads and saves the MJ: Credentials entity directly rather than calling the engine is not part of that chain, and separate processes can still clobber each other's columns — the latter is a property of MJ's write-all-columns spUpdate semantics affecting every entity, tracked by the sparse-update work in #2552.
