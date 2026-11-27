---
"@memberjunction/ng-base-forms": patch
---

A section hidden by a Form Chrome Rule `None` no longer mounts or loads. The chrome coordinator gains `RulesResolved` and `IsSuppressed(sectionKey)`; the form container pushes that state to the form (`BaseFormComponent.SetChromeSuppression`), and `IsSectionExpanded` reports a suppressed section collapsed, and a lazily loaded section collapsed while the rules are still loading, so stock related grids and `BaseFormPanel` contributions do not run their RunView. A suppressed panel renders no body, and is hidden in accordion layout too.
