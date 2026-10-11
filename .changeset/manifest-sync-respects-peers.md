---
"@memberjunction/codegen-lib": patch
---

`mj codegen manifest` no longer adds a package to `dependencies` when the app already declares it as a peer. Its dependency sync used to treat only `dependencies` as declared, so every build of an Open App that declares a sibling app or MemberJunction package as a peer pinned that package back into `dependencies` at the version on disk, and hosts on a later release then installed a second copy. Packages missing from both lists are still added as before.
