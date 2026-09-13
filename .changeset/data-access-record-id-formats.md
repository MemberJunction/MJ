---
"@memberjunction/core": patch
---

Correct `.claude/rules/data-access.md` on how many record-id encodings actually exist.

The rule said "two persisted formats already exist and must not be unified", naming five columns. Those five are accurate — but the sentence reads as a claim about the whole estate, and the estate is not two formats. An audit in #4321 found 90 write sites setting a polymorphic `EntityID`/`RecordID` column, of which 2 use the canonical encoding; the rest write bare values, joined lists, `Field=Value AND …`, or strings that are not record pointers at all. One column can carry several.

The rule now separates the two *sanctioned* formats from what the estate *contains*, and warns against assuming an arbitrary `*RecordID` column holds either — the assumption behind the soft-link defect #4321 fixes and the annotations #4330 audits. Fixes #4331.
