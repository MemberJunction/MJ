---
"@memberjunction/ng-conversations": patch
"@memberjunction/ai-agents": patch
---

Clears the two Source guards failures on `next` from #5910 and #5912.

- **Saving a chat task graph as a workflow** runs the save operation through the conversation's own provider (`ProviderToUse`), not the global `Metadata.Provider`. With several connections open, the global provider could route the save to the wrong server.
- **Flow agents with several starting steps** check completed steps against a `UUIDSet` built once, instead of scanning the completed list with `UUIDsEqual` for every pending start step and every incoming join edge. Step IDs still match case-insensitively.
