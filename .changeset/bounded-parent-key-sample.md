---
"@memberjunction/integration-engine": patch
---

Discovery: bound the keyless-parent sample to the classifier's significance floor.

When a REST template-var child is sampled, its parent chain is walked lazily — the leaf's record target is the only bound, and it propagates all the way up. The one exception is a parent that declares no primary key: it cannot be descended into until its key is classified from its own rows, so some rows must be read up front.

That read was sized to the leaf's target (default 500). The value-statistic classifier's significance floor is 50 rows, and above it more rows buy no additional verdict — so up to 10x the needed parents were fetched before a single child record was yielded. Because a parent may itself be a template-var child, each of those rows is a fetch that recurses up every level above it, multiplying the over-pull by the chain's depth.

The buffer is now `min(target, 50)`. The resolved key is a local addressing decision used only to build child URLs — it is never persisted as the parent's primary key, which comes from that parent's own first-class discovery pass — so the extra rows were being spent on a throwaway verdict. Sampling accuracy is unchanged (50 is the floor the classifier itself applies, and the same floor every top-level object's key decision uses), and the declared-key path is untouched.
