---
"@memberjunction/search-engine": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-search": patch
---

Resolve record display names in search preview and display entity friendly names instead of full schema names.

- **Search Record Display Name Resolution**:
  - In `SearchEngine.ts`, enable enrichment for preview searches on top results so record display names are resolved before preview autocomplete items render.
  - In `SearchEnricher.ts`, resolve missing record names or sentinel titles (`${EntityName} Record`, `${EntityDisplayName} Record`) via `providerToUse.GetEntityRecordNames()`, setting both `RecordName` and `Title` to the live record name.
  - Pass `SearchEngine.ProviderToUse` to `SearchEnricher` to ensure multi-provider alignment.

- **Entity Display Names**:
  - Add `EntityDisplayName` to search results across `@memberjunction/search-engine`, `@memberjunction/server`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/ng-search`.
  - In `search-suggest.component.html` and `search-results.component.html`, display `EntityDisplayName || EntityName` for both preview results and result cards/detail views.
  - In `SearchService.buildEntityNameFilter`, use entity display names for filter labels and icons while preserving `EntityName` for filtering.
