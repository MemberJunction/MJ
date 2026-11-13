---
'@memberjunction/metadata-sync': patch
---

`mj sync push` and `mj sync pull` keep a record file's trailing newline and its `\uXXXX` escape style when they rewrite it, so an unchanged record writes the same bytes. Pull now includes the content of every `@file` reference in a record's checksum, at any depth, as push does, so a nested reference such as `Configuration.ReplayScript` no longer changes `sync.lastModified` on every pull.
