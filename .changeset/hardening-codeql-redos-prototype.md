---
"@memberjunction/computer-use": patch
"@memberjunction/core": patch
---

`ResponseParser` extracts fenced and bare JSON from model replies with linear `indexOf` scans instead of regexes that could backtrack on long malformed replies. `ResourceUrlsEquivalent` collects query keys into a null-prototype object, so `__proto__` and `constructor` are compared as ordinary keys.
