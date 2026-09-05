---
"@memberjunction/credentials": patch
---

Fix a lost-update race in CredentialEngine: getCredential()'s fire-and-forget LastUsedAt touch performed a full-row entity save from a stale snapshot, silently reverting any updateCredential() that committed in between (both paths reported success). All writes to a credential row now serialize through a per-credential promise chain, so every save writes a current snapshot; writes remain ordinary entity saves and getCredential latency is unchanged. Closes the race within a process — cross-process full-row clobbering remains the domain of the sparse-update work in #2552.
