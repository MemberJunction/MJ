---
"@memberjunction/metadata-sync": patch
---

`mj sync push --dry-run` labels its output as a dry run (#5053). The changes recap header, the `--change-detail` report file and the completion line now say "DRY RUN" / "Dry run" and state that nothing was written. A dry run also records the records it would create, so the recap counts creates alongside updates and deletes.
