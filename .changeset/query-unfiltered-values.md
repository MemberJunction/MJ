---
"@memberjunction/query-processor": patch
---

A query parameter value written into SQL without a SQL filter (`TOP {{ n }}`, `Status = {{ status }}`) is refused unless it is a number, a boolean, or text that is a plain decimal number or `ASC`/`DESC`, so `1 UNION SELECT …` can no longer ride a string parameter. `number` parameters must be finite, and `array` parameters must be arrays. Values written through `sqlString`, `sqlNumber`, `sqlDate`, `sqlIdentifier`, `sqlIn` and the other SQL filters are unchanged.
