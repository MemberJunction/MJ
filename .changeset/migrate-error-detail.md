---
'@memberjunction/cli': patch
---

`mj migrate` now prints the batch context Skyway already collects when a migration fails: the batch number and its line range in the script, how many batches applied before it, and either the lines matched to identifiers named in the error or a preview of the failing batch SQL. Previously only `Error.message` was shown, so a failure in a large generated migration gave a line range with no way to see what was in it.
