---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-react": patch
"@memberjunction/interactive-component-types": patch
---

Runtime forms substrate — Component-based entity forms swappable at runtime via EntityFormOverride. New form-role contract (FormHostProps, BeforeSave/Delete/EditModeChangeRequested events) in interactive-component-types. InteractiveFormComponent wrapper in ng-base-forms owns BaseEntity lifecycle while React stays pure. componentProps input on mj-react-component for host-supplied data context. FormResolverService + SingleRecordComponent wedge route entities to override Components with User > Role > Global scope precedence; zero behavior change when no override exists.
