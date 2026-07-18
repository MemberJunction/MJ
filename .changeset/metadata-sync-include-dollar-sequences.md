---
"@memberjunction/metadata-sync": patch
---

Fix `{@include}` composition corrupting included content that contains `$`-sequences. The include reference was replaced via `String.prototype.replace(fullMatch, processedInclude)`, which interprets the four string-search special sequences `$$`, `$&`, `` $` ``, and `$'` in the replacement string as special patterns — so an included file containing any of those had its content mangled (e.g. `$&` re-inserted the matched `{@include ...}` text, `` $` ``/`$'` spliced in surrounding text). The replacement now uses a function (`() => processedInclude`) so included content is emitted verbatim.
