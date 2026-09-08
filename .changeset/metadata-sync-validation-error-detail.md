---
"@memberjunction/metadata-sync": patch
---

Surface per-error validation detail in `mj sync push`/`pull` JSON output.

A failed validation in `--ci`/`--format json` mode previously returned only "Validation failed. Cannot proceed with push.", so CI logs named neither the offending entity, field, nor file. The result now carries one error entry per validation failure, with `context` (`Entity.Field`), the message plus its source file, the suggestion, and the `E_VALIDATION_FAILED` code.
