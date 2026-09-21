---
'@memberjunction/core': patch
---

`BaseEntity.DetachISAChild()` releases an IS-A subtype that was attached but never written, so a
different subtype can be chosen in its place.

`EnsureISAChild` refuses a second subtype on a disjoint parent, and nothing could release the first
— so once a record had been told "you are a Dog" there was no supported way to say "no, a Cat", even
on a record that had never been saved. Any UI that lets someone pick a subtype dead-ended on the
first correction.

The method deliberately refuses two cases: a child that has been **saved** (detaching a real row is
a demotion with real data loss, and deserves an explicit delete rather than a side effect of
changing a dropdown), and an **overlapping** parent, where subtypes are tracked as a list rather
than a single attached child.
