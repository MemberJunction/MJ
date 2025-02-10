---
"@memberjunction/cli": minor
---

Added some better handling of the tag argument for `mj migrate` so semver strings like `2.22.2` work as well as properly formatted tags like `v2.22.2`.


#### Unrelated tweak that triggers a minor version

Also added a flyway variable to the repeatable metadata maintenance migration to ensure it runs every time (not just every time its checksum changes).
