---
"@memberjunction/ng-conversations": patch
---

Saving a chat task graph as a workflow runs the save operation through the conversation's own provider (`ProviderToUse`), not the global `Metadata.Provider`. With several connections open, the global provider could route the save to the wrong server. This clears the Source guards failure on `next` from #5910.
