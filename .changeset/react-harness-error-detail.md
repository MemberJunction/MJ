---
"@memberjunction/react-linter": patch
"@memberjunction/react-test-harness": patch
---

React test harness reports what it knows about a failure instead of collapsing it. Field-access violations carry a structured `Details` object with up to three existing fields that resemble the one the component read (`SimilarFields`, from the new `FindSimilarNames` helper) and the complete list of valid fields (`AvailableFields`). A component that fails to register is reported once per component, naming the component and the phase that failed, instead of as one JSON blob. Harness setup failures and unusable component roots get their own rules (`harness-setup-error`, `component-load-error`). A call to a utility the harness was not given (such as `utilities.ai` with no AI tools) is now a medium `sandbox-utility-unavailable` warning, not a critical error that blames the component.
