---
"@memberjunction/conversations-runtime": patch
---

`MentionParser` parses a chat message in linear time. Two of its patterns backtracked quadratically on crafted input (CodeQL `js/polynomial-redos` #228 and #231): a message with 80,000 `!` in a mention name, or 60,000 unclosed `@{`, took about 2.5 s to parse.

- **JSON mentions** match `@\{[^{}]+\}` instead of `@\{[^}]+\}`, so a match can no longer start at one `@{` and run on through later ones. This also fixes a real miss: an unclosed `@{` earlier in a message no longer swallows a valid JSON mention after it.
- **Agent names** lose their trailing punctuation through a loop from the end instead of `/[.,;!?]+$/`, with the same result.

A JSON mention whose name contains `{` no longer matches. One containing `}` already didn't.
