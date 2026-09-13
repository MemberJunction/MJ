---
"@memberjunction/core-entities": minor
---

Migration `V202609031400__v6.1.x__Conversation_Scoped_Skill_Activation` no longer inserts `EntityField` rows with a literal `Sequence`.

Twelve `EntityField` INSERTs carried literal sequence numbers (1–11 on `MJ: Conversation Skills`, 14 on `MJ: AI Skills`). Each was preceded by the `+100000` sequence park, which is why a from-scratch `mj migrate` still succeeds today — but the park is the mechanism `#4292` removed, and its own changeset records why: it "could be made idempotent within one run but not across two migrations replayed on a fresh database." Its `NOT EXISTS (Sequence >= 100000)` guard makes a *second* migration's park a silent no-op, and the next literal insert then collides on `UQ_EntityField_EntityID_Sequence` — surfacing as an unrelated foreign-key error against `EntityFieldValue`, and only ever on a fresh install.

The literals are replaced with the apply-time expression CodeGen now emits, one per INSERT:

```sql
(SELECT COALESCE(MAX([Sequence]), 0) + 1
   FROM [${flyway:defaultSchema}].[EntityField]
  WHERE [EntityID] = '<entity-id>')
```

The parks are left in place, matching `V202609081111__v6.1.x__Entity_SubtypeSelector`, which already pairs a park with an apply-time expression. Park-plus-expression is safe where park-plus-literal was not: `MAX + 1` avoids a collision whatever the park did.

This migration merged to `next` on 2026-09-03; the CI gate that detects the pattern landed on 2026-09-08, and it diffs against the PR's base — so on PRs into `next` the file is already present and invisible to it. It surfaces for the first time on a release PR into `main`, which is where it was caught.

No behaviour change on a fresh install: verified that the resulting sequences are identical, because the repeatable renumber normalises them either way.
