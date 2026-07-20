---
"@memberjunction/codegen-lib": patch
---

Advanced-generation resilience: CodeGen's advanced-generation LLM calls now degrade gracefully. A thrown provider/network/credential error during entity-name or entity-description generation is isolated per-entity (warn + fall back to the deterministic name / skip the description) instead of aborting metadata management. CodeGen runs at container start in production, so an AI outage must never block boot. Advanced generation stays default-ON.
