---
"@memberjunction/metadata-sync": patch
---

Load dynamicPackages.server (Open App server packages) during provider initialization so non-MJ-namespace entity subclasses are registered before sync operations run. Fixes silent data loss in `mj sync pull` for BizApps/BCSaaS entities (#3415): bare BaseEntity fallback made primary-key reads return undefined, collapsing every record onto one key and duplicating it on later pulls.
