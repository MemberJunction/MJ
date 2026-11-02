---
"@memberjunction/sql-parser": patch
---

Raise the absolute ceiling in the SQL parser's linear-time tests from 1 s to 4 s. The per-doubling growth check, which is what proves linear time, is unchanged; the 1 s ceiling failed the v6.2.0-edge.7 publish gate on a slow CI runner while growth stayed at about 2x per doubling.
