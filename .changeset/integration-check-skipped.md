---
"@memberjunction/testing-integration": patch
---

A check can now report that it cannot run on this host by throwing `CheckSkipped(reason)`. The `IntegrationTestDriver` records it as Skipped, through the same path as the mutation and live-model gates, instead of as a failure.

The tier gates only cover conditions the driver knows about. A condition only the check's own package knows, such as an optional sibling app that is not installed, had no gate: the check either failed as if the product were broken or returned early and was counted as Passed. `IsCheckSkipped` recognises the error by a `Symbol.for` marker rather than `instanceof`, because a check module in another repo can resolve its own copy of this package.

Any other thrown error is still a failure. A bundle whose every check skips reports Skipped, not Passed.
