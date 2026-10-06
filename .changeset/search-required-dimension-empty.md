---
"@memberjunction/search-engine": patch
---

A `required` scope dimension that resolves to nothing — an expansion query with no rows, an empty caller set, a blank string — now refuses the search with a `ScopeDimensionError`, the same way a narrowing that meets to nothing already did. Previously only an *unresolved* (`undefined`) required dimension was refused, so an empty bound passed through to the lane templates; under the `{% if x | length %}` idiom an empty set removes the clause, and a template without an `{% else %}` then ran unbounded. Dimensions declared `inheritanceMode: 'cascading'` (where empty is meaningful) and dimensions that are not `required` are unaffected. Behaviour change to note: a user whose bound is legitimately empty now gets a refused search (an error result) rather than an empty success, and in a multi-scope search that refusal fails the whole call, as every `ScopeDimensionError` already does.
