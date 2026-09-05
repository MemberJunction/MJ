---
"@memberjunction/ng-entity-viewer": patch
---

The entity data grid's load-error state now leads with a human message ("The server may be busy or briefly unreachable — retrying usually fixes this") instead of the raw transport error, keeps the technical detail as a de-emphasized parenthetical, and logs every load failure via LogError.
