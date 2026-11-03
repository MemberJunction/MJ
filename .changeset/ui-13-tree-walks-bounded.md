---
"@memberjunction/ng-hierarchy-tree": patch
"@memberjunction/ng-trees": patch
---

Tree parent walks stop at a parent cycle instead of looping forever: `mj-hierarchy-tree` no longer hangs when two rows name each other as parent and one is the active record, and `mj-tree`'s `ExpandToNode` is guarded the same way. `mj-tree` gains `ExpandToNodes(ids)`, and `mj-tree-dropdown` search expands all matches with one change-detection pass instead of one per match.
