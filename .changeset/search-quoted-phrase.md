---
"@memberjunction/global": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/search-engine": patch
---

Searching for a phrase in double quotes now finds it on entities searched with LIKE. Agents quote their searches (`"Executive Steering Review"`), and the LIKE path matched the quote marks as text, so it returned nothing. A new `UnwrapPhraseQuotes` helper in `@memberjunction/global` drops one pair of straight or curly double quotes wrapping the whole term; a quote inside the term stays literal, and quotes around nothing but whitespace are left as typed. The built-in predicates (Contains, BeginsWith, EndsWith, Exact) search the unquoted term, a `UserSearchParamFormatAPI` format still gets the term as typed, and the full-text path is unchanged. Entity search scores and length-checks the term the same way, so a quoted one-word query no longer drops every row it fetched, and `"a"` counts as one character.
