---
"@memberjunction/ng-base-forms": patch
---

Entity form embeds honor the parent's EditMode after mount (so an unsaved IS-A child no longer self-opens edit). HideInheritedSections stays a runtime visibility flag — it does not edit the CodeGen form template.
