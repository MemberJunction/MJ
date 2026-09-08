---
"@memberjunction/core-entities": patch
---

Remove the 11 `Orders*` remote-operation classes and their 36 input/output types from
`remote_operations.ts`. They come from a developer's local `bizapps_orders` install, not
from anything this repo ships — a core-only database generates 31 operations, not 42. No
MJ package imports them. The generator remains unscoped (see #3981); this only removes the
app-specific classes that reached the core artifact.
