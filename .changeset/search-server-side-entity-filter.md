---
'@memberjunction/ng-explorer-core': patch
---

Search results: ticking an Entity facet keeps the loaded results on screen (narrowed at once) and fetches the top results within that entity type from the server in the background, appending the new ones and skipping duplicates. Selecting "Content Items" after a broad search now shows every content item the server finds, not only the few that made the broad top 50. Unticking needs no new request; the other facets still filter client-side.
