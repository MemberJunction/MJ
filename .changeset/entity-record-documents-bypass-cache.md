---
"@memberjunction/clustering-engine": patch
"@memberjunction/ai-recommendations-rex": patch
"@memberjunction/content-autotagging": patch
---

fix: Entity Record Documents reads in clustering, Rex and content autotagging bypass the server RunView cache and name only the columns they use, so DocumentText and VectorJSON are no longer loaded and cached for one-off reads
