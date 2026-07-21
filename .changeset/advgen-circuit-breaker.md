---
"@memberjunction/codegen-lib": patch
---

Advanced-generation (AI) CodeGen robustness + CPU hygiene:

- **Credential circuit breaker.** The advanced-generation path had no rate-limit, retry, or circuit-breaker and swallowed per-entity errors, so a keyless / mis-credentialed CodeGen run attempted a doomed LLM call for *every* entity ("Invalid Vertex AI credentials" ×N) before finishing. `AdvancedGeneration` now trips a per-run circuit after 3 consecutive credential/authentication failures: it logs one clear message and the batch driver skips the remaining entities (no further round-trips, no error-log spam). A successful call resets the counter; non-credential errors don't trip it.
- **Field grouping.** The per-entity `allFields.filter(...)` in the advanced-generation batch driver was O(entities × fields) over the full pooled array (and dropped to the slow UUID-compare path on SQL Server upper-case IDs). Fields are now grouped into a `Map` by normalized EntityID once (O(total fields)), turning the per-entity lookup into O(1).

No behavior change on a normally-credentialed run beyond the CPU win; advanced generation is unchanged for entities that succeed.
