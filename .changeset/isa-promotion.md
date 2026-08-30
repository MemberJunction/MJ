---
"@memberjunction/core": minor
---

IS-A promotion: attach a NEW child to an EXISTING parent.

IS-A supported *discovery* — a loaded parent finds its existing child — but not *promotion*: "this existing `Person` is now also an `Applicant`". `NewRecord()` unconditionally starts a fresh parent chain, so promotion INSERTed a duplicate parent and either collided on the primary key or failed the parent's NOT NULL validation as though it were brand new. A find-or-create driver hitting this creates a second person rather than adding a role to the one that exists.

New public method on `BaseEntity`:

```typescript
const applicant = await md.GetEntityObject<ApplicantEntity>('Applicants', contextUser);
applicant.NewRecord();
if (!await applicant.AttachToExistingParent(CompositeKey.FromID(personId))) {
    // no such parent row — the caller decides: save as a fresh chain, or stop
}
await applicant.Save();   // parent UPDATEd, child INSERTed, one transaction
```

It loads the parent chain by key, and a *loaded* parent saves as an UPDATE — which is the whole mechanism: the existing parent-first chain save updates the existing row and INSERTs only the child. Field routing, permissions, validation, `EnforceDisjointSubtype` and transaction scope are unchanged.

Two contracts worth knowing: a failed attach restores the minted key, so `InnerLoad`'s wipe cannot leave a gutted, unsaveable record and both caller options stay open; and the shared-key mirror iterates the **parent's** primary keys, since a child schema that leaves the key entirely to routing has no mirror to maintain.

Guards: throws on a non-IS-A entity, throws on an already-saved child (promotion is a decision about what a *new* record is), returns `false` with the record untouched when no parent row exists.
