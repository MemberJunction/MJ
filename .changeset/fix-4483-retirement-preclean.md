---
"@memberjunction/core": patch
---

Fix the 5.51.2 → 6.1.0 upgrade failing in the Phase-0 retirement migration on databases where Reports were used (#4483), and harden `spDeleteEntityWithCoreDependencies` so a blocked entity delete fails loudly instead of leaving metadata half-pruned (#3546).
