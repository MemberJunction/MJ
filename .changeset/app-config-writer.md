---
"@memberjunction/open-app-engine": patch
---

Open App config writer: key and section searches skip comments (the stock MJAPI header's example `module.exports` no longer receives writes) and edits stay inside their target array/object; the app schema goes to `excludeSchemas_append` when the host uses it; appending after a trailing comma no longer leaves an array hole, and a write that adds a hole is rejected; bare `entityPackageName` keys are recognized so installs stop adding quoted duplicates; upgrades add the schema to `excludeSchemas` only when the schema was renamed; the install summary no longer tells the operator to run CodeGen.
