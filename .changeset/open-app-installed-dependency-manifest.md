---
"@memberjunction/open-app-engine": patch
---

`mj app install` and `mj app upgrade` check an already-installed dependency against the dependencies of its installed version, read from the manifest recorded for it, instead of the `mj-app.json` on its default branch. An app whose default branch asks for an unreleased version of another app no longer blocks installs and upgrades that pass through it (#6877).
