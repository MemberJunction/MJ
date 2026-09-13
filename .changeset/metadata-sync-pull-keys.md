---
'@memberjunction/metadata-sync': patch
---

`mj sync pull` no longer loses records when an entity's class isn't registered in the CLI process.

Pull read each record's primary key through the entity's typed property (`record.ID`). When the
entity's generated subclass isn't registered — an Open App whose server package didn't load, or
anything the CLI's class manifest doesn't cover — records arrive as a bare `BaseEntity` with no
typed properties, so every key read `undefined`. All records then shared one key and overwrote each
other in the write batch: a pull of N new records wrote exactly one, with an empty `primaryKey`
that was duplicated on the next pull, and existing records were never refreshed (#3415).

- Keys are now read through `BaseEntity.Get()`, which works with or without the subclass, and a
  record whose key genuinely has no value stops the pull instead of overwriting others.
- `FileWriteBatch` refuses an array update with an incomplete key.
