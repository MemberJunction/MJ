---
"@memberjunction/cli": patch
---

`mj agent init` scaffolds a `.env` again: the template's `.env.example` was matched by the repo-wide `.env.*` ignore rule, so the copy the command actually resolves shipped without it on a clean checkout.
