---
'@memberjunction/postgresql-dataprovider': patch
---

PostgreSQL no longer rejects a call to a function written in ALL-CAPS, such as `PERCENTILE_CONT(0.5)` or `DATE_TRUNC('day', d)`.

The provider quoted any capitalized word it did not recognize, so `PERCENTILE_CONT(0.5)` became `"PERCENTILE_CONT"(0.5)` and PostgreSQL looked for a function literally named in upper case, which never exists. An ALL-CAPS word immediately followed by `(` is now left as written, unless it is qualified with a `.` (MJ's own procedures such as `__mj.spCreate…` are unaffected). Mixed-case words followed by `(` are quoted exactly as before.
