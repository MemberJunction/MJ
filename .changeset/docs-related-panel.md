---
"@memberjunction/core-entities": patch
"@memberjunction/ng-artifacts": patch
---

Documents show what they are connected to. `LoadRecordRelations` (core-entities) returns a record's links, backlinks and concept relations as one viewer may see them, from every active graph whose edge provider projects `LinksTo` or `SharesConceptWith` edges. The artifact viewer gains a "Related" tab, rendered by the new standalone `<mj-artifact-related-panel>`, shown when such a graph exists. Picking a related artifact emits `OpenArtifactRequested` (or switches the viewer in place when nothing listens); picking any other record emits `OpenEntityRecord`.
