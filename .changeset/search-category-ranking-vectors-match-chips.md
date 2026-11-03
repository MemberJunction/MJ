---
"@memberjunction/search-engine": minor
"@memberjunction/core": minor
"@memberjunction/ai-vectors-memory": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/server": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-search": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-dashboards": minor
---

Search fixes. Keyword ranking puts exact matches above prefix and substring matches, and FolderPath checks ignore zero-width characters. Semantic search always uses the oldest active Search document, with a warning in the Vectors tab when a second is saved, and the vector index loads past the RunView cache. Vector sync removes orphaned vectors and duplicate Entity Record Documents, and deleting a record removes its vectors. Duplicate runs can scan a saved view (new `DuplicateRun.SourceViewID` column) and reuse stored vectors instead of embedding every record again. Search results say how each one matched ("Name match", "Text match · field", "Similar meaning") instead of showing a percentage, filter by match type, and start the similar-meaning cutoff at the `Search.DefaultMinScore` setting (now 0.30).
