---
"@memberjunction/ai-agents": patch
---

Payload change requests can now address nested values by path, and `allowedPaths` (`PayloadSelfWritePaths`) can now permit writes inside array elements.

- **Path keys.** A bucket key such as `"meta.title"`, `"dependencies[2].code"` or `"dependencies.2.code"` used to be written as a literal top-level key named after the whole path, with no error, leaving the target unchanged. `ApplyAgentChangeRequest` now resolves these keys against the payload.
  - In `updateElements`, `newElements` and `removeElements`, a path key changes only the value it names. A `newElements` path that already holds a value is treated as an update, with a warning.
  - In `replaceElements`, a path key replaces exactly the value it names, not the whole top-level property. Missing parent objects are created.
  - A path that can't be written (an index out of range, or a step through a string) is refused as a blocked operation with a warning.
  - A key the payload already holds as a literal property name keeps its literal meaning.
  - This also makes the dot-paths that `TransformChangeRequestPaths` produces apply to the right place.
- **Permissions inside arrays.** An element merge used to check `allowedPaths` against the bare field name (`code`), and an update into an existing object or array first required `update` permission on the container itself. Together these meant no pattern could permit writing one field of an array element.
  - Permissions are now checked against the full path (`dependencies.2.code`), on each value actually written.
  - `allowedPaths: ["dependencies.*.code"]` lets a change write each element's code and nothing else.
  - Deleting or replacing an element still accepts `update` permission on the array, as before.
  - A delete that is refused keeps the element unchanged.
  - A `"__DELETE__"` value in `updateElements` is now checked too: it needs `delete` or `update` on the key, or `update` on the object holding it.
- **Pattern fixes.** `[*]` / `[n]` in a pattern (`dependencies[*].code`) now match as documented; they never matched before. A `**` pattern (`dependencies.**`) now spans nested segments; its `.*` was rewritten by the single-`*` rule. No shipped agent metadata uses either form.
- Appends through `newElements` are still not checked against `allowedPaths`, as before.
