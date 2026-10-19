---
"@memberjunction/db-auto-doc": patch
---

A composite foreign key is no longer split into soft FKs whose targets repeat (#4534).

MJ models a foreign key as one column, so `additionalSchemaInfo.json` wrote a composite key as one soft FK per column pair. Usually only one of those targets is unique on its own. For the others, a join on that column alone multiplies the rows of the generated base view. Now:

- The constraint name is kept on each introspected foreign key column (`ForeignKeyReference.constraintName`), so the columns of a composite key stay grouped.
- A column pair of a composite key is written only when its target is the target table's only primary key column, or has a unique, unfiltered single-column index. The other pairs are left out rather than guessed.
- The rule applies whichever source proposed a pair: introspection, a discovery pass, or the LLM confirming the constraint, which it does. A foreign key from one of those columns to a different, real target is kept.
- A constraint whose pairs repeat a source column is the N × N cross product that the PostgreSQL driver read before #5872, and none of its pairs is written: the right pairing is unknown, and pairs to the unique target would otherwise pass. Re-introspect such a state file with a fresh `dbdoc analyze`; re-exporting it does not recover the key.
- Single-column foreign keys, and state files written before constraint names were recorded, are unchanged.
