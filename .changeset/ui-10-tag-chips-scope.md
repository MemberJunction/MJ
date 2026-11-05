---
"@memberjunction/ng-list-management": patch
---

`mj-tag-chips` suggests active tags only, and takes a `ScopeContext` input that limits suggestions to global tags plus tags scoped to the given records; a tag created inline under a scope is saved non-global with one `MJ: Tag Scopes` row per scope entry. A new `AllowCreate` input hides the "Create" option for hosts that curate tags elsewhere.
