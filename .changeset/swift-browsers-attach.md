---
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
---

Propagate external Playwright/CDP attach support up through ComputerUse and MJComputerUse. Adds optional `Connect` / `ConnectType` / `ReuseExistingContext` fields to `BrowserConfig`, threads attach mode through both `PlaywrightBrowserAdapter` and `HeadlessBrowserEngine`, and exposes the same three fields on `ComputerUseTestConfig` so test-driver configs can declare attach mode declaratively. Ownership tracking ensures `Close()`/`Shutdown()` never tear down a browser or context the caller owns. All fields are optional — existing callers are unaffected.
