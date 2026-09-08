---
'@memberjunction/sql-converter': patch
'@memberjunction/cli': patch
---

A statement the converter could not parse now fails the run.

Two rules write a marker comment into their own output at the point where they knowingly could not produce SQL — `DeclareDmlBlockRule` emits `-- Could not parse: …` and `BatchConverter` emits `-- ERROR converting batch …` — and then return normally. On the legacy `migrate convert` path the batch was therefore counted as `Converted`, so a file that PostgreSQL rejects was reported as `Files: 1 (1 OK, 0 errors)` and the command exited 0. The unusable `.pg.sql` was then committed like any other.

The markers now live in one place (`CONVERSION_GAP_MARKERS`), the assembled output is scanned for exactly those strings, and matches are counted as `Gaps`. Adding a marker to that list is all a new rule needs to have its gaps reported — an emitter and the scan cannot drift apart, which is the failure mode that made this invisible in the first place.

`Gaps` is deliberately distinct from `Errors`: an error is a throw the converter CAUGHT and already counted as a failure, while a gap is output it knowingly could not produce, where the rule returned normally and nothing downstream ever learned the file was unusable. An errored batch leaves a marker too, so it is counted in both channels — the scan reports what is actually in the file.

`decideLegacyConvertExit` fails the run on gaps unless `--allow-gaps` is passed, which finally gives that flag meaning on the legacy path. It never suppresses a caught error, and when both are present the message names both.
