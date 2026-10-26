---
"@memberjunction/db-auto-doc": patch
---

Organic keys are emitted hub-and-spoke instead of as all-pairs cliques (#4538).

Every member of an organic-key cluster used to get every other member as a related entity, so spokes grew with the square of cluster size. On one production deployment, most of those pairs were co-references: two tables that both hold a customer key, many-to-many, which multiply rows when joined.

- **Hubs.** The members whose column is their table's primary key own the value. A hub links to every other member; any other member links only to the hubs. A 10-member cluster now emits 18 spokes instead of 90.
- **Transitive spokes follow the same rule.** Only a hub gets bridge-view spokes, since a non-hub reaching another table through a bridge (orders to registration via the customer key) is a co-reference. A table already linked directly is not added again through a bridge.
- **No owner, no key.** A concept no member owns as a primary key is not emitted, since every pair in it would be a co-reference. The compose step reports these as `SkippedUnanchored`, and the detector summary as `conceptsSkippedUnanchored`.
- **New option:** `TranslateOptions.OnUnanchored`.
