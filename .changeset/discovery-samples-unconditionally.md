---
"@memberjunction/integration-engine": patch
---

Discovery samples the source for every declared object, and merges what it sees without overriding what was declared.

Streaming records at introspect time used to happen only for an object that arrived with no fields. That is a gate on the wrong question: sampling answers three, and a declaration can only pre-answer one of them.

| question | can a declaration answer it? |
|---|---|
| what is the primary key? | **yes** — a declared key is authoritative |
| which fields does the source actually send? | no — a catalog lists what the vendor documents |
| how wide are the values? | no — only the data knows |

So an object declared with fields and a key was never sampled. Its undeclared columns arrived later through the custom-overflow path, one sync at a time, and its widths were whatever the catalog guessed — a column declared 100 wide against 900-wide data is not slow discovery, it is a truncation or a migration written by hand afterwards.

Sampling is now unconditional, and the merge is deliberately one-directional — it fills gaps and widens, never overrides:

- **Primary key** — a declared key wins outright, even when the sample nominates a different column. Overriding it is how a child table ends up keyed on its parent's foreign key. An observed key is adopted only when none was declared.
- **New fields** — an observed field absent from the declaration is added, so its column exists at RSU time instead of appearing in overflow after a sync.
- **Widths** — effective length is `max(declared, observed)`, and an unbounded declaration beats any measured number. Never shrink: shrinking is the one outcome that loses data.
- **Everything else** — labels, descriptions, types, nullability, relationships — the declaration stands. A sampled type is inferred from a handful of values; a declared one was written down.

A fetch failure leaves the declaration exactly as it was, so the worst case is the behaviour that shipped before, and the error now says which of the two losses occurred — an object with no fields at all cannot sync until sampling succeeds, whereas one with a declaration merely runs with unknown widths for that run.

This supersedes the narrower fix that widened the gate to "no fields, or no key": the gate is gone, and the key rule it introduced is preserved as the primary-key rule above.
