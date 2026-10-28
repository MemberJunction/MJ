---
"@memberjunction/server": patch
---

Test HTTP servers now bind the loopback address explicitly (`app.listen(0, '127.0.0.1')`) instead of the wildcard address, so an ephemeral port already held by an unrelated `127.0.0.1`-only listener cannot silently capture the test's own requests. `@memberjunction/server` publishes `/src`, so its test sources ship in the package.
