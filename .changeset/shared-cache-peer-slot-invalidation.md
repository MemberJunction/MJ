---
"@memberjunction/core": patch
---

Saves now reach cached RunView slots that other processes wrote on a shared cache (Redis). Previously a process only invalidated the slots in its own index, so an engine slot it had read warm at boot was never updated and peers kept serving the old rows until restart. On a shared store the entity's slots are now listed on every save and merged with the local index; process-local stores (IndexedDB, in-memory) are unchanged.
