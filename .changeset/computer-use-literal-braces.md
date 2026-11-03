---
"@memberjunction/computer-use-engine": patch
---

Computer Use tests: an escaped `\{{…}}` in a test definition is literal text. The unresolved-variable guard skips it, and substitution turns it into `{{…}}`, so a goal can describe template syntax.
